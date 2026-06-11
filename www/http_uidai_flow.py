"""Pure HTTP UIDAI flow — script-aligned 2 OTP (EID retrieve → download PDF)."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
from typing import Any, Callable, Awaitable

import requests

from audio_captcha import (
    audio_to_wav_bytes,
    decode_audio_captcha,
    normalize_captcha_text,
    parse_captcha_generation,
    whisper_enabled,
)
from captcha_solver import captcha_attempt_values, captcha_bypass_enabled, ocr_captcha_png
from uidai_cookie_session import (
    apply_isolated_baked_cookies,
    baked_session_ready,
    bootstrap_uidai_session,
    cookie_jar_ready,
    cookie_summary,
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
    build_audio_captcha_payload,
    build_download_otp_payload,
    build_download_pdf_payload,
    build_eid_download_otp_payload,
    build_eid_download_pdf_payload,
    build_eid_otp_payload,
    build_eid_verify_payload,
    build_otp_payload,
    build_retrieve_payload,
    extract_aadhaar_number,
    extract_eid_number,
    get_header,
    new_request_id,
    parse_download_response,
    parse_uidai_response,
)

log = logging.getLogger('http-uidai')

StepCb = Callable[[int, int, str], Awaitable[None]]


def http_mode_preferred() -> bool:
    """Use HTTP flow when enabled (Indian VPS direct)."""
    mode = os.getenv('UIDAI_HTTP_MODE', 'auto').strip().lower()
    if mode in ('1', 'true', 'yes', 'http', 'on'):
        return True
    if mode in ('0', 'false', 'no', 'playwright', 'browser', 'off'):
        return False
    return True


def pdf_flow_pure_http() -> bool:
    """`/pdf` uses script-aligned HTTP session (default on)."""
    return os.getenv('UIDAI_PDF_HTTP', '1').strip().lower() in ('1', 'true', 'yes', 'on')


# Backward compat — purane bot.py / mixed VPS imports
pdf_flow_pure = pdf_flow_pure_http


class UidaiHttpSession:
    """Per-user requests.Session — shared baked cookies, isolated jar."""

    def __init__(
        self,
        *,
        on_step: StepCb | None = None,
    ) -> None:
        self._on_step = on_step
        self._session = requests.Session()
        self.name = ''
        self.mobile = ''
        self.dob: str | None = None
        self.option = 'EID'
        self.captcha_txn_id = ''
        self.captcha_text = ''
        self.otp_txn_id = ''
        self.download_otp_txn_id = ''
        self.uid = ''
        self.eid = ''
        self._phase_req_id = ''
        self.flow = 'download'
        self._cookie_pages: set[str] = set()
        self.cookie_info: dict[str, Any] = {}
        if baked_session_ready():
            apply_isolated_baked_cookies(self._session)

    async def _step(self, n: int, total: int, msg: str) -> None:
        if self._on_step:
            await self._on_step(n, total, msg)

    def route_label(self) -> str:
        cc = self.cookie_info.get('count', 0)
        line = 'Direct HTTP — UIDAI gateway'
        if cc:
            return f'{line} · cookies:{cc}'
        return line

    def _ensure_cookies(self, page_url: str, logs: list[dict[str, Any]] | None = None) -> None:
        key = page_url.split('?')[0].rstrip('/')
        if key in self._cookie_pages:
            return
        info = bootstrap_uidai_session(
            self._session,
            None,
            page_url=page_url,
        )
        self.cookie_info = info
        self._cookie_pages.add(key)
        if logs is not None:
            append_log(logs, 'info', 'Cookie seed', info)

    def _post_json(
        self,
        url: str,
        payload: dict[str, Any] | None,
        *,
        referer: str,
        logs: list[dict[str, Any]],
        label: str,
        req_id: str | None = None,
    ) -> tuple[int, str]:
        self._ensure_cookies(referer, logs)
        rid = (req_id or '').strip() or new_request_id()
        headers = get_header(rid)
        headers['Referer'] = referer
        headers['Origin'] = 'https://myaadhaar.uidai.gov.in'
        body = payload if payload is not None else {}
        append_log(logs, 'info', label, {
            'url': url,
            'transactionId': rid,
            'payload_keys': list(body.keys()),
            'cookies': cookie_summary(self._session),
        })
        try:
            r = self._session.post(
                url,
                headers=headers,
                json=body,
                proxies=None,
                timeout=int(os.getenv('UIDAI_HTTP_TIMEOUT', '45')),
            )
            text = r.text or ''
            append_log(logs, 'info', f'{label} HTTP {r.status_code}', {'body': text[:400]})
            return r.status_code, text
        except requests.RequestException as e:
            append_log(logs, 'error', f'{label} network', {'err': str(e)})
            raise RuntimeError(f'{label} network error: {e}') from e

    def _fetch_audio_captcha_http(
        self,
        logs: list[dict[str, Any]],
        *,
        referer: str,
    ) -> dict[str, Any]:
        payload = build_audio_captcha_payload()
        status, text = self._post_json(
            AUDIO_CAPTCHA_API_URL,
            payload,
            referer=referer,
            logs=logs,
            label='Audio captcha',
        )
        try:
            data = __import__('json').loads(text)
        except Exception:
            raise RuntimeError(f'Audio captcha invalid JSON (HTTP {status})')
        parsed = parse_captcha_generation(data if isinstance(data, dict) else {})
        txn = parsed.get('captchaTxnId') or ''
        if not txn:
            raise RuntimeError('Audio captcha — captchaTxnId missing')
        return parsed

    async def solve_audio_captcha(
        self,
        *,
        referer: str | None = None,
        logs: list[dict[str, Any]] | None = None,
    ) -> str:
        """Fetch audio captcha + Whisper decode (script flow)."""
        ref = referer or RETRIEVE_PAGE_URL
        log_list = logs if logs is not None else []
        await self._step(2, 6, 'Audio captcha fetch')
        parsed = await asyncio.to_thread(self._fetch_audio_captcha_http, log_list, referer=ref)
        self.captcha_txn_id = parsed.get('captchaTxnId') or ''
        audio_bytes = parsed.get('audio_bytes') or b''
        mime = parsed.get('audio_mime') or 'audio/wav'
        if not audio_bytes:
            raise RuntimeError('Audio captcha — no audio data')

        await self._step(3, 6, 'Whisper decode')
        wav = audio_to_wav_bytes(audio_bytes, mime)
        cap = decode_audio_captcha(wav or audio_bytes, mime='audio/wav')
        if not cap:
            raise RuntimeError('Whisper could not decode captcha — set UIDAI_WHISPER=1')
        self.captcha_text = cap
        return cap

    async def start_phase1_auto(self) -> dict[str, Any]:
        """Phase 1 — audio captcha + OTP request (fully automated captcha)."""
        logs: list[dict[str, Any]] = []
        self._phase_req_id = new_request_id()
        await self._step(1, 5, self.route_label())
        try:
            cap = await self.solve_audio_captcha(referer=RETRIEVE_PAGE_URL, logs=logs)
        except Exception as e:
            return {'otp_ok': False, 'needs_captcha': True, 'logs': logs, 'msg': str(e)}

        await self._step(4, 5, f'Phase 1 OTP — captcha {cap[:4]}…')
        result = await self.send_retrieve_otp(cap, logs=logs, script_mode=True)
        return result

    async def send_retrieve_otp(
        self,
        captcha: str | None = '',
        *,
        captcha_txn_id: str | None = None,
        captcha_bypass: bool = False,
        logs: list[dict[str, Any]] | None = None,
        script_mode: bool | None = None,
    ) -> dict[str, Any]:
        log_list = logs if logs is not None else []
        txn = (captcha_txn_id or self.captcha_txn_id or '').strip()
        cap = normalize_captcha_text(captcha or self.captcha_text or '')
        if cap:
            self.captcha_text = cap
        if txn:
            self.captcha_txn_id = txn

        use_script = script_mode if script_mode is not None else pdf_flow_pure_http()
        if use_script and cap and txn:
            payload = build_eid_otp_payload(
                name=self.name,
                mobile=self.mobile,
                dob=self.dob,
                captcha=cap,
                captcha_txn_id=txn,
                option=self.option,
            )
        else:
            payload = build_otp_payload(
                name=self.name,
                mobile=self.mobile,
                captcha=cap,
                captcha_txn_id=txn,
                option=self.option,
                captcha_bypass=captcha_bypass or (captcha_bypass_enabled() and not cap),
            )

        status, text = self._post_json(
            OTP_API_URL, payload, referer=RETRIEVE_PAGE_URL, logs=log_list, label='Retrieve OTP',
        )
        ok, msg, extra = parse_uidai_response(status, text)
        if extra.get('otpTxnId'):
            self.otp_txn_id = extra['otpTxnId']
        return {
            'otp_ok': ok and extra.get('reason') == 'otp_sent',
            'logs': log_list,
            'msg': msg,
            'extra': extra,
        }

    async def verify_retrieve_otp(self, otp: str) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        await self._step(4, 6, 'Phase 1 — EID verify')

        if pdf_flow_pure_http() and self.captcha_text and self.captcha_txn_id:
            payload = build_eid_verify_payload(
                name=self.name,
                mobile=self.mobile,
                dob=self.dob,
                captcha=self.captcha_text,
                captcha_txn_id=self.captcha_txn_id,
                otp=otp,
                otp_txn_id=self.otp_txn_id,
                option=self.option,
            )
        else:
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
        j = extra.get('json') or {}
        eid = extract_eid_number(j) or extra.get('eidNumber') or ''
        uid = extract_aadhaar_number(j)
        if eid:
            self.eid = eid
        if uid:
            self.uid = uid
        return {
            'retrieve_ok': ok and extra.get('reason') == 'retrieve_ok',
            'logs': logs,
            'msg': msg,
            'extra': extra,
            'uid': self.uid,
            'eid': self.eid,
        }

    async def send_download_otp(self, uid: str | None = None) -> dict[str, Any]:
        """Phase 2 — fresh audio captcha + download OTP."""
        logs: list[dict[str, Any]] = []
        if uid:
            self.uid = uid.strip()
        if self.eid:
            return await self._send_download_otp_eid(logs)

        if not re.fullmatch(r'\d{12}', self.uid or ''):
            raise RuntimeError('EID/Aadhaar missing — complete Phase 1 OTP first')

        await self._step(1, 5, 'Phase 2 — fresh captcha')
        cap_data = await self.fetch_captcha(prefer_audio=whisper_enabled(), referer=DOWNLOAD_PAGE_URL)
        png = cap_data.get('image_png') or b''

        for label, cap, try_txn in captcha_attempt_values(png, self.captcha_txn_id):
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

    async def _send_download_otp_eid(self, logs: list[dict[str, Any]]) -> dict[str, Any]:
        if not self.eid:
            raise RuntimeError('EID missing — complete Phase 1 first')

        self._phase_req_id = new_request_id()
        await self._step(1, 5, 'Phase 2 — audio captcha')
        try:
            cap = await self.solve_audio_captcha(referer=DOWNLOAD_PAGE_URL, logs=logs)
        except Exception as e:
            return {'otp_ok': False, 'needs_captcha': True, 'logs': logs, 'msg': str(e)}

        await self._step(3, 5, f'Phase 2 OTP — captcha {cap[:4]}…')
        payload = build_eid_download_otp_payload(
            eid=self.eid,
            captcha=cap,
            captcha_txn_id=self.captcha_txn_id,
            transaction_id=self._phase_req_id,
        )
        status, text = self._post_json(
            DOWNLOAD_OTP_API_URL,
            payload,
            referer=DOWNLOAD_PAGE_URL,
            logs=logs,
            label='Download OTP',
            req_id=self._phase_req_id,
        )
        ok, msg, extra = parse_download_response(status, text)
        if extra.get('otpTxnId'):
            self.download_otp_txn_id = extra['otpTxnId']
        return {
            'otp_ok': ok and extra.get('reason') in ('otp_sent', 'download_otp_sent'),
            'logs': logs,
            'msg': msg,
            'extra': extra,
            'auto_captcha': 'whisper',
        }

    async def send_download_otp_with_captcha(self, captcha: str) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        cap = normalize_captcha_text(captcha)
        self.captcha_text = cap

        if self.eid:
            self._phase_req_id = new_request_id()
            payload = build_eid_download_otp_payload(
                eid=self.eid,
                captcha=cap,
                captcha_txn_id=self.captcha_txn_id,
                transaction_id=self._phase_req_id,
            )
        else:
            if not re.fullmatch(r'\d{12}', self.uid):
                raise RuntimeError('EID/Aadhaar missing')
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
            req_id=self._phase_req_id or None,
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

        if self.eid:
            payload = build_eid_download_pdf_payload(
                eid=self.eid,
                otp=otp,
                otp_txn_id=self.download_otp_txn_id,
            )
        else:
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

    async def _fetch_captcha_via_browser(self, page_url: str) -> tuple[bytes, str]:
        from browser_session import fetch_captcha_from_page

        await self._step(2, 6, 'Browser captcha (live page)')
        self._ensure_cookies(page_url)
        return await fetch_captcha_from_page(
            page_url,
            name=self.name,
            mobile=self.mobile,
            option=self.option,
            on_step=self._on_step,
            requests_session=self._session,
        )

    async def fetch_captcha(
        self,
        *,
        prefer_audio: bool | None = None,
        referer: str | None = None,
    ) -> dict[str, Any]:
        logs: list[dict[str, Any]] = []
        ref = referer or (DOWNLOAD_PAGE_URL if self.flow == 'download' else RETRIEVE_PAGE_URL)
        is_download_page = 'genricDownloadAadhaar' in ref or 'download' in ref.lower()
        page_url = DOWNLOAD_PAGE_URL if is_download_page else RETRIEVE_PAGE_URL
        await self._step(1, 4, self.route_label())

        use_audio = prefer_audio if prefer_audio is not None else whisper_enabled()
        if use_audio and pdf_flow_pure_http():
            try:
                cap = await self.solve_audio_captcha(referer=ref, logs=logs)
                return {
                    'captchaTxnId': self.captcha_txn_id,
                    'image_png': b'',
                    'captcha_auto': cap,
                    'logs': logs,
                    'audio_bytes': b'',
                }
            except Exception as e:
                log.warning('HTTP audio captcha fail: %s', e)

        from browser_session import get_standby_captcha_pair

        png, txn = b'', ''
        pair = get_standby_captcha_pair() if not is_download_page else None
        if pair:
            png, txn = pair
            append_log(logs, 'info', 'Standby captcha', {'txn': txn[:8], 'bytes': len(png)})

        if not txn:
            png, txn = await self._fetch_captcha_via_browser(page_url)
            append_log(logs, 'info', 'Browser captcha', {'txn': txn[:8], 'bytes': len(png)})

        self.captcha_txn_id = txn
        if not self.captcha_txn_id:
            raise RuntimeError('captchaTxnId missing — try /pdf again')

        auto = ocr_captcha_png(png) if png else ''
        if auto:
            self.captcha_text = auto

        return {
            'captchaTxnId': self.captcha_txn_id,
            'image_png': png,
            'captcha_auto': auto,
            'logs': logs,
            'audio_bytes': b'',
        }

    async def auto_send_retrieve_otp(self, png: bytes) -> dict[str, Any]:
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


HTTP_SESSIONS: dict[int, UidaiHttpSession] = {}


def get_http_session(chat_id: int) -> UidaiHttpSession | None:
    return HTTP_SESSIONS.get(chat_id)


async def sync_from_browser(http_sess: UidaiHttpSession, browser: Any) -> None:
    from uidai_cookie_session import merge_browser_cookies_into_session

    http_sess.name = browser.name
    http_sess.mobile = browser.mobile
    http_sess.captcha_txn_id = browser.captcha_txn_id
    http_sess.captcha_text = browser.last_captcha
    http_sess.otp_txn_id = browser.otp_txn_id
    http_sess.option = getattr(browser, 'option', 'EID')
    ctx = getattr(browser, '_context', None)
    if ctx:
        try:
            pw_cookies = await ctx.cookies()
            merge_browser_cookies_into_session(http_sess._session, pw_cookies)
        except Exception as e:
            log.debug('cookie sync skip: %s', e)


async def run_in_thread(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(fn, *args, **kwargs)
