"""Pure HTTP UIDAI flow — 2 OTP (retrieve EID → download PDF), foreign VPS + proxy."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
from typing import Any, Callable, Awaitable

import requests

from audio_captcha import (
    decode_audio_captcha,
    normalize_captcha_text,
    parse_captcha_generation,
    whisper_enabled,
)
from captcha_solver import captcha_attempt_values, captcha_bypass_enabled
from proxy_india import (
    check_direct_india,
    format_direct_line,
    format_proxy_line,
    pick_indian_proxy,
    proxy_list_from_env,
)
from uidai_api import (
    AUDIO_CAPTCHA_API_URL,
    CAPTCHA_API_URL,
    DOWNLOAD_OTP_API_URL,
    DOWNLOAD_PAGE_URL,
    DOWNLOAD_PDF_API_URL,
    OTP_API_URL,
    RETRIEVE_PAGE_URL,
    append_log,
    build_download_otp_payload,
    build_download_pdf_payload,
    build_otp_payload,
    build_retrieve_payload,
    extract_aadhaar_number,
    new_request_id,
    parse_download_response,
    parse_uidai_response,
    uidai_headers,
)

log = logging.getLogger('http-uidai')

StepCb = Callable[[int, int, str], Awaitable[None]]


def http_mode_preferred() -> bool:
    """Foreign VPS / explicit HTTP — skip Playwright when possible."""
    mode = os.getenv('UIDAI_HTTP_MODE', 'auto').strip().lower()
    if mode in ('1', 'true', 'yes', 'http', 'on'):
        return True
    if mode in ('0', 'false', 'no', 'playwright', 'browser', 'off'):
        return False
    # auto: India direct → browser ok; foreign → HTTP
    return check_direct_india(timeout=4) is None


class UidaiHttpSession:
    """requests.Session wrapper — Indian proxy, audio/image captcha, 2-OTP pipeline."""

    def __init__(
        self,
        *,
        proxy: str | None = None,
        auto_proxy: bool = True,
        on_step: StepCb | None = None,
    ) -> None:
        self.proxy_url = proxy
        self.auto_proxy = auto_proxy
        self._on_step = on_step
        self._session = requests.Session()
        self._session.headers.update({
            'User-Agent': (
                'Mozilla/5.0 (Linux; Android 13; Pixel 7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            ),
        })
        self.proxy_info: dict[str, Any] = {}
        self.name = ''
        self.mobile = ''
        self.option = 'EID'
        self.captcha_txn_id = ''
        self.captcha_text = ''
        self.otp_txn_id = ''
        self.download_otp_txn_id = ''
        self.uid = ''
        self.flow = 'download'  # retrieve | download

    @property
    def proxies(self) -> dict[str, str] | None:
        if not self.proxy_url:
            return None
        return {'http': self.proxy_url, 'https': self.proxy_url}

    async def _step(self, n: int, total: int, msg: str) -> None:
        if self._on_step:
            await self._on_step(n, total, msg)

    def _ensure_proxy(self) -> None:
        if self.proxy_url:
            return
        if not self.auto_proxy:
            india = check_direct_india(timeout=5)
            if india:
                self.proxy_info = india
            return
        try:
            proxy, info = pick_indian_proxy(proxy_list_from_env())
            self.proxy_url = proxy
            self.proxy_info = info
            log.info('HTTP proxy %s', proxy)
        except Exception as e:
            india = check_direct_india(timeout=5)
            if india:
                self.proxy_info = india
                log.info('HTTP direct India fallback')
                return
            raise RuntimeError(f'No working India route: {e}') from e

    def proxy_label(self) -> str:
        if self.proxy_url and self.proxy_info:
            return format_proxy_line(self.proxy_info, self.proxy_url)
        if self.proxy_info:
            return format_direct_line(self.proxy_info)
        return 'HTTP — UIDAI gateway'

    def _post_json(
        self,
        url: str,
        payload: dict[str, Any] | None,
        *,
        referer: str,
        logs: list[dict[str, Any]],
        label: str,
    ) -> tuple[int, str]:
        self._ensure_proxy()
        headers = uidai_headers(new_request_id())
        headers['Referer'] = referer
        body = payload if payload is not None else {}
        append_log(logs, 'info', label, {'url': url, 'payload_keys': list(body.keys())})
        try:
            r = self._session.post(
                url,
                json=body,
                headers=headers,
                proxies=self.proxies,
                timeout=int(os.getenv('UIDAI_HTTP_TIMEOUT', '45')),
            )
            text = r.text or ''
            append_log(logs, 'info', f'{label} HTTP {r.status_code}', {'body': text[:400]})
            return r.status_code, text
        except requests.RequestException as e:
            append_log(logs, 'error', f'{label} network', {'err': str(e)})
            raise RuntimeError(f'{label} network error: {e}') from e

    def _fetch_captcha_raw(
        self,
        *,
        audio: bool,
        logs: list[dict[str, Any]],
        referer: str,
    ) -> dict[str, Any]:
        url = AUDIO_CAPTCHA_API_URL if audio else CAPTCHA_API_URL
        label = 'Audio captcha' if audio else 'Image captcha'
        status, text = self._post_json(url, {}, referer=referer, logs=logs, label=label)
        try:
            data = __import__('json').loads(text)
        except Exception:
            raise RuntimeError(f'{label} invalid JSON (HTTP {status})')
        parsed = parse_captcha_generation(data if isinstance(data, dict) else {})
        if not parsed.get('captchaTxnId'):
            raise RuntimeError(f'{label} — captchaTxnId missing')
        return parsed

    async def _fetch_captcha_via_browser(self, page_url: str) -> tuple[bytes, str]:
        """UIDAI captcha HTTP API often 500 — live page snapshot works."""
        from browser_session import fetch_captcha_from_page

        await self._step(2, 6, 'Browser captcha (live page)')
        if not self.proxy_url and self.auto_proxy:
            try:
                self._ensure_proxy()
            except Exception:
                pass
        return await fetch_captcha_from_page(
            page_url,
            proxy=self.proxy_url,
            auto_india_proxy=self.auto_proxy,
            name=self.name,
            mobile=self.mobile,
            option=self.option,
            on_step=self._on_step,
        )

    async def fetch_captcha(
        self,
        *,
        prefer_audio: bool | None = None,
        referer: str | None = None,
    ) -> dict[str, Any]:
        """Captcha PNG + txn — browser page (HTTP captcha API unreliable)."""
        logs: list[dict[str, Any]] = []
        ref = referer or (DOWNLOAD_PAGE_URL if self.flow == 'download' else RETRIEVE_PAGE_URL)
        is_download_page = 'genricDownloadAadhaar' in ref or 'download' in ref.lower()
        page_url = DOWNLOAD_PAGE_URL if is_download_page else RETRIEVE_PAGE_URL
        await self._step(1, 6, self.proxy_label())

        captcha_text = ''
        png = b''
        txn = ''

        use_audio = prefer_audio if prefer_audio is not None else whisper_enabled()
        if use_audio and not is_download_page:
            await self._step(2, 6, 'Audio captcha try')
            try:
                parsed = self._fetch_captcha_raw(audio=True, logs=logs, referer=ref)
                captcha_text = decode_audio_captcha(
                    parsed.get('audio_bytes') or b'',
                    mime=str(parsed.get('audio_mime') or 'audio/wav'),
                ) or ''
                txn = str(parsed.get('captchaTxnId') or '')
                png = parsed.get('image_png') or b''
            except Exception as e:
                log.warning('Audio captcha API skip: %s', e)

        if not txn or len(png) < 500:
            try:
                png, txn = await self._fetch_captcha_via_browser(page_url)
                append_log(logs, 'info', 'Browser captcha OK', {'txn': txn[:8], 'bytes': len(png)})
            except Exception as browser_err:
                log.warning('Browser captcha fail: %s — trying HTTP image API', browser_err)
                try:
                    parsed = self._fetch_captcha_raw(audio=False, logs=logs, referer=ref)
                    txn = str(parsed.get('captchaTxnId') or '')
                    png = parsed.get('image_png') or b''
                except Exception as http_err:
                    raise RuntimeError(
                        f'Captcha fail — browser: {browser_err}; API: {http_err}'
                    ) from http_err

        self.captcha_txn_id = txn
        if captcha_text:
            self.captcha_text = normalize_captcha_text(captcha_text)

        if not self.captcha_txn_id:
            raise RuntimeError('captchaTxnId missing — try /pdf again')

        return {
            'captchaTxnId': self.captcha_txn_id,
            'image_png': png,
            'captcha_auto': self.captcha_text,
            'logs': logs,
            'audio_bytes': b'',
        }

    async def send_retrieve_otp(
        self,
        captcha: str | None = '',
        *,
        captcha_txn_id: str | None = None,
        captcha_bypass: bool = False,
    ) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        txn = (captcha_txn_id or self.captcha_txn_id or '').strip()
        cap = normalize_captcha_text(captcha or self.captcha_text or '')
        if cap:
            self.captcha_text = cap
        if txn:
            self.captcha_txn_id = txn
        await self._step(3, 6, 'Phase 1 — OTP request (EID)')
        payload = build_otp_payload(
            name=self.name,
            mobile=self.mobile,
            captcha=cap,
            captcha_txn_id=txn,
            option=self.option,
            captcha_bypass=captcha_bypass or (captcha_bypass_enabled() and not cap),
        )
        status, text = self._post_json(
            OTP_API_URL, payload, referer=RETRIEVE_PAGE_URL, logs=logs, label='Retrieve OTP',
        )
        ok, msg, extra = parse_uidai_response(status, text)
        if extra.get('otpTxnId'):
            self.otp_txn_id = extra['otpTxnId']
        return {
            'otp_ok': ok and extra.get('reason') == 'otp_sent',
            'logs': logs,
            'msg': msg,
            'extra': extra,
        }

    async def auto_send_retrieve_otp(self, png: bytes) -> dict[str, Any]:
        """Captcha bypass — null payload, then OCR, no user typing."""
        txn = self.captcha_txn_id
        result: dict[str, Any] = {'otp_ok': False}
        for label, cap, try_txn in captcha_attempt_values(png, txn):
            use_txn = try_txn or txn
            await self._step(3, 6, f'Auto captcha — {label}')
            result = await self.send_retrieve_otp(
                cap,
                captcha_txn_id=use_txn,
                captcha_bypass=label.startswith('null'),
            )
            if result.get('otp_ok'):
                result['auto_captcha'] = label
                return result
            reason = (result.get('extra') or {}).get('reason')
            if reason not in ('invalid_captcha', 'captcha_expired', None):
                return result
        return result

    async def verify_retrieve_otp(self, otp: str) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        await self._step(4, 6, 'Phase 1 — EID verify')
        payload = build_retrieve_payload(
            name=self.name,
            mobile=self.mobile,
            captcha=self.captcha_text,
            captcha_txn_id=self.captcha_txn_id,
            otp=otp,
            otp_txn_id=self.otp_txn_id,
            option=self.option,
        )
        status, text = self._post_json(
            OTP_API_URL, payload, referer=RETRIEVE_PAGE_URL, logs=logs, label='Retrieve verify',
        )
        ok, msg, extra = parse_uidai_response(status, text)
        uid = extract_aadhaar_number(extra.get('json') or {})
        if uid:
            self.uid = uid
        return {
            'retrieve_ok': ok and extra.get('reason') == 'retrieve_ok',
            'logs': logs,
            'msg': msg,
            'extra': extra,
            'uid': self.uid,
        }

    async def send_download_otp(self, uid: str | None = None) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        self.uid = (uid or self.uid or '').strip()
        if not re.fullmatch(r'\d{12}', self.uid):
            raise RuntimeError('Aadhaar number missing — complete Phase 1 OTP first')

        await self._step(1, 5, 'Phase 2 — fresh captcha')
        cap_data = await self.fetch_captcha(prefer_audio=whisper_enabled(), referer=DOWNLOAD_PAGE_URL)
        png = cap_data.get('image_png') or b''
        auto = cap_data.get('captcha_auto') or ''

        for label, cap, try_txn in captcha_attempt_values(png, self.captcha_txn_id):
            if auto and label == 'ocr':
                cap = auto
            await self._step(3, 5, f'Phase 2 auto — {label}')
            payload = build_download_otp_payload(
                uid=self.uid,
                captcha=cap,
                captcha_txn_id=try_txn or self.captcha_txn_id,
                captcha_bypass=label.startswith('null'),
            )
            status, text = self._post_json(
                DOWNLOAD_OTP_API_URL,
                payload,
                referer=DOWNLOAD_PAGE_URL,
                logs=logs,
                label='Download OTP',
            )
            ok, msg, extra = parse_download_response(status, text)
            if extra.get('otpTxnId'):
                self.download_otp_txn_id = extra['otpTxnId']
            if ok and extra.get('reason') in ('otp_sent', 'download_otp_sent'):
                self.captcha_text = cap
                return {
                    'otp_ok': True,
                    'logs': logs,
                    'msg': msg,
                    'extra': extra,
                    'auto_captcha': label,
                }
            if extra.get('reason') not in ('invalid_captcha', 'captcha_expired', None):
                break

        return {
            'otp_ok': False,
            'needs_captcha': True,
            'image_png': png,
            'logs': logs + cap_data.get('logs', []),
        }

    async def send_download_otp_with_captcha(self, captcha: str) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        if not re.fullmatch(r'\d{12}', self.uid):
            raise RuntimeError('Aadhaar number missing')
        cap = normalize_captcha_text(captcha)
        self.captcha_text = cap
        payload = build_download_otp_payload(
            uid=self.uid,
            captcha=cap,
            captcha_txn_id=self.captcha_txn_id,
        )
        status, text = self._post_json(
            DOWNLOAD_OTP_API_URL,
            payload,
            referer=DOWNLOAD_PAGE_URL,
            logs=logs,
            label='Download OTP',
        )
        ok, msg, extra = parse_download_response(status, text)
        if extra.get('otpTxnId'):
            self.download_otp_txn_id = extra['otpTxnId']
        return {
            'otp_ok': ok and extra.get('reason') in ('otp_sent', 'download_otp_sent'),
            'logs': logs,
            'msg': msg,
            'extra': extra,
        }

    async def download_pdf(self, otp: str) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        await self._step(4, 5, 'Phase 2 — PDF download')
        payload = build_download_pdf_payload(
            uid=self.uid,
            captcha=self.captcha_text,
            captcha_txn_id=self.captcha_txn_id,
            otp=otp,
            otp_txn_id=self.download_otp_txn_id,
        )
        status, text = self._post_json(
            DOWNLOAD_PDF_API_URL,
            payload,
            referer=DOWNLOAD_PAGE_URL,
            logs=logs,
            label='Download PDF',
        )
        ok, msg, extra = parse_download_response(status, text)
        pdf_bytes = b''
        b64 = extra.get('pdf_b64')
        if b64:
            try:
                pdf_bytes = base64.b64decode(b64)
            except Exception:
                pdf_bytes = b''
        return {
            'download_ok': ok and bool(pdf_bytes),
            'pdf_bytes': pdf_bytes,
            'logs': logs,
            'msg': msg,
            'extra': extra,
        }


HTTP_SESSIONS: dict[int, UidaiHttpSession] = {}


def get_http_session(chat_id: int) -> UidaiHttpSession | None:
    return HTTP_SESSIONS.get(chat_id)


async def run_in_thread(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(fn, *args, **kwargs)
