#!/usr/bin/env python3
"""
Aadhaar downloader — standalone CLI + Telegram bot engine.

No cookies, no proxy — plain requests.Session() per user.
Bypass: dob:null, captcha:null, name Mr/skip.
Detailed logs + captcha audio/image for Telegram loading screen.
"""

from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import json
import logging
import os
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import requests
from uidai_api import uidai_fast
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    import whisper
except ImportError:
    whisper = None  # type: ignore

try:
    from pydub import AudioSegment
except ImportError:
    AudioSegment = None  # type: ignore

log = logging.getLogger('aadhar')

SKIP_NAME_TOKENS = frozenset({
    'mr', 'mister', 'skip', 'unknown', 'unk', 'na', 'n/a', 'no', 'none', '?', '-', 'x', 'naam',
})

_WHISPER_MODEL = None
_AADHAR_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix='aadhar',
)

AUDIO_CAPTCHA_URL = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation'
IMAGE_CAPTCHA_URL = 'https://tathya.uidai.gov.in/captchaService/api/captcha/v3/generation'
EID_OTP_URL = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
DOWNLOAD_OTP_URL = 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp'
DOWNLOAD_PDF_URL = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'

LogCb = Callable[[str], None]


def ensure_whisper_loaded() -> None:
    global _WHISPER_MODEL
    if whisper is None or _WHISPER_MODEL is not None:
        return
    try:
        model_name = os.getenv('WHISPER_MODEL', 'base').strip() or 'base'
        log.info('Loading Whisper %s…', model_name)
        _WHISPER_MODEL = whisper.load_model(model_name)
    except Exception as e:
        log.warning('Whisper preload skip: %s', e)


def _env_on(primary: str, secondary: str = '', default: str = '1') -> bool:
    val = os.getenv(primary, os.getenv(secondary, default) if secondary else default)
    return str(val).strip().lower() in ('1', 'true', 'yes', 'on')


def dob_bypass_on() -> bool:
    return _env_on('DOB_BYPASS', 'UIDAI_DOB_BYPASS', '1')


def captcha_bypass_on() -> bool:
    return _env_on('CAPTCHA_BYPASS', 'UIDAI_CAPTCHA_BYPASS', '0')


def get_headers(req_id: str) -> dict[str, str]:
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'https://myaadhaar.uidai.gov.in',
        'Referer': 'https://myaadhaar.uidai.gov.in/',
        'User-Agent': (
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
        ),
        'X-Request-ID': req_id,
        'transactionId': req_id,
        'appid': 'MYAADHAAR',
    }


def normalize_name(name: str) -> str:
    t = (name or '').strip().lower().rstrip('.')
    if not t or t in SKIP_NAME_TOKENS:
        return 'Mr'
    return ' '.join(str(name).split()).upper()


def resolve_dob(dob: str | None) -> str | None:
    if dob_bypass_on():
        return None
    dob = (dob or '').strip()
    if re.fullmatch(r'\d{2}/\d{2}/\d{4}', dob):
        return dob
    return None


def normalize_captcha(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', (text or '').strip().lower())[:8]


def pdf_password(name: str, dob: str | None) -> str:
    from uidai_api import generate_pdf_password

    return generate_pdf_password(name, dob)


def is_success(resp: dict | None) -> bool:
    return bool(resp) and str(resp.get('status', '')).lower() == 'success'


def _uidai_error_message(resp: dict) -> str:
    return str(
        (resp.get('errorDetails') or {}).get('messageEnglish')
        or resp.get('messageEnglish')
        or resp.get('message')
        or '',
    )


def captcha_expired(resp: dict | None) -> bool:
    if not resp:
        return False
    msg = _uidai_error_message(resp)
    if re.search(r'timed?\s*out|refresh the captcha', msg, re.I):
        return True
    code = str(resp.get('errorCode') or '').upper()
    return 'VCS_INF' in code or code == 'UAS_NET_VCS_INF_004'


def invalid_captcha(resp: dict | None) -> bool:
    if not resp:
        return False
    s = str(resp)
    if 'invalid Captcha' in s or 'REU_VAL_CAP_INF' in s:
        return True
    msg = _uidai_error_message(resp)
    if re.search(r'invalid.*captcha', msg, re.I):
        return True
    if captcha_expired(resp):
        return True
    code = str(resp.get('errorCode') or '')
    return 'CAP' in code.upper()


def whisper_auto_enabled() -> bool:
    """Auto-submit Whisper guess — off by default (often wrong). Image manual is primary."""
    return os.getenv('UIDAI_WHISPER_AUTO', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def _b64_bytes(val: Any) -> bytes:
    if isinstance(val, bytes):
        return val
    s = str(val or '').strip()
    if s.startswith('data:'):
        s = s.split(',', 1)[-1]
    pad = len(s) % 4
    if pad:
        s += '=' * (4 - pad)
    try:
        return base64.b64decode(s)
    except Exception:
        return b''


def _short_json(obj: Any, limit: int = 280) -> str:
    try:
        s = json.dumps(obj, ensure_ascii=False)
    except Exception:
        s = str(obj)
    return s[:limit] + ('…' if len(s) > limit else '')


def request_timeout() -> tuple[int, int]:
    """(connect, read) seconds — hang avoid."""
    if uidai_fast():
        t = int(os.getenv('AADHAR_TIMEOUT', '12'))
        c = int(os.getenv('AADHAR_CONNECT_TIMEOUT', '6'))
    else:
        t = int(os.getenv('AADHAR_TIMEOUT', '30'))
        c = int(os.getenv('AADHAR_CONNECT_TIMEOUT', '15'))
    return (c, t)


def post_retry_count() -> int:
    default = '3' if uidai_fast() else '4'
    return max(1, int(os.getenv('AADHAR_POST_RETRIES', default)))


def _retry_backoff(attempt: int) -> float:
    if uidai_fast():
        return min(0.4 * attempt, 2.0)
    return min(2 ** attempt, 10)


def _retryable_status(code: int) -> bool:
    return code in (408, 429, 500, 502, 503, 504)


def _is_network_error(exc: BaseException) -> bool:
    if isinstance(exc, requests.RequestException):
        return True
    msg = str(exc).lower()
    return any(
        k in msg
        for k in (
            'connection', 'timeout', 'timed out', 'network', 'refused',
            'reset', 'broken pipe', 'ssl', 'httpsconnectionpool',
        )
    )


class AadharSession:
    """Per-user requests.Session — Telegram /pdf engine with live logs."""

    def __init__(self, on_log: LogCb | None = None) -> None:
        self._session = requests.Session()
        retry_total = 1 if uidai_fast() else 2
        retry = Retry(
            total=retry_total,
            connect=retry_total,
            read=retry_total,
            backoff_factor=0.4 if uidai_fast() else 0.8,
            status_forcelist=[502, 503, 504],
            allowed_methods=frozenset(['POST']),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
        self._session.mount('https://', adapter)
        self._session.mount('http://', adapter)
        proxy = (os.getenv('UIDAI_PROXY') or '').strip()
        if proxy.lower() in ('auto', 'india'):
            try:
                from proxy_india import _load_cache, fastest_proxy_url

                proxy = _load_cache() or fastest_proxy_url() or ''
                if proxy:
                    os.environ['UIDAI_PROXY'] = proxy
            except Exception as e:
                log.warning('auto proxy pick fail: %s', e)
                proxy = ''
        if proxy and proxy.lower() not in ('auto', 'india', 'none', 'no', 'off', 'direct', ''):
            self._session.proxies = {'http': proxy, 'https': proxy}
            log.info('AadharSession proxy: %s', proxy.split('@')[-1][:40])
        self.on_log = on_log
        self.logs: list[str] = []
        self.name = ''
        self.mobile = ''
        self.dob_raw: str | None = None
        self.dob: str | None = None
        self.captcha_text = ''
        self.captcha_txn_id = ''
        self.otp_txn_id = ''
        self.download_otp_txn_id = ''
        self.eid = ''
        self.aadhaar_name = ''
        self.aadhaar_dob: str | None = None
        self.phase1_headers: dict[str, str] = {}
        self.phase2_headers: dict[str, str] = {}
        self.phase2_req_id = ''
        self.last_audio_bytes: bytes = b''
        self.last_captcha_image: bytes = b''
        self.last_phase = ''
        self._browser_captcha_primed = False
        self.phase2_captcha_image: bytes = b''
        self.phase2_captcha_txn_id = ''
        self.phase2_captcha_at: float = 0.0
        self.phase2_stash_eid = ''
        self.captcha_primed_at: float = 0.0

    def _log(self, msg: str) -> None:
        line = (msg or '').strip()
        if not line:
            return
        self.logs.append(line)
        log.info(line)
        if self.on_log:
            try:
                self.on_log(line)
            except Exception:
                pass

    def setup(self, name: str, mobile: str, dob: str | None = None) -> None:
        self.name = normalize_name(name)
        self.mobile = mobile.strip()
        self.dob_raw = (dob or '').strip() or None
        self.dob = resolve_dob(self.dob_raw)
        self._log('=' * 40)
        self._log(f'[+] Setup: name={self.name} mobile={self.mobile}')
        if dob_bypass_on():
            self._log('[*] DOB bypass ON — dob:null')
        elif self.dob:
            self._log(f'[*] DOB: {self.dob}')
        else:
            self._log('[!] DOB missing — null')
        self._log('[*] Captcha: browser image (same as /open)')
        self._log('[*] Direct connection — Indian VPS')

    def captcha_is_stale(self) -> bool:
        from uidai_api import captcha_max_age_sec

        if not self.captcha_primed_at or not self.captcha_txn_id:
            return True
        return (time.monotonic() - self.captcha_primed_at) > captcha_max_age_sec()

    def prime_browser_captcha(self, png: bytes, txn: str) -> None:
        """Load captcha from Playwright — paired PNG + captchaTxnId like /open."""
        self.last_captcha_image = png or b''
        self.captcha_txn_id = str(txn or '').strip()
        self.captcha_text = ''
        if self.captcha_txn_id and self._image_captcha_ok(self.last_captcha_image):
            self.captcha_primed_at = time.monotonic()
        else:
            self.captcha_primed_at = 0.0
        self._browser_captcha_primed = bool(
            self.captcha_txn_id and self._image_captcha_ok(self.last_captcha_image),
        )
        if self._browser_captcha_primed:
            self._log(
                f'[+] Browser captcha primed — {len(self.last_captcha_image)} bytes '
                f'txn:{self.captcha_txn_id[:12]}…',
            )
        else:
            self._log('[-] Browser captcha prime failed — image or txn missing')

    def clear_browser_captcha(self) -> None:
        self.captcha_text = ''
        self.captcha_txn_id = ''
        self.last_captcha_image = b''
        self.captcha_primed_at = 0.0
        self._browser_captcha_primed = False

    def _apply_resident_profile(self, resp: dict[str, Any] | None, *, tag: str) -> None:
        from pdf_unlock import extract_resident_profile

        profile = extract_resident_profile(resp if isinstance(resp, dict) else {})
        name = profile.get('name') or ''
        dob = profile.get('dob')
        if name:
            self.aadhaar_name = name
            self._log(f'[+] [{tag}] Aadhaar name: {name}')
        if dob:
            self.aadhaar_dob = dob
            self._log(f'[+] [{tag}] Aadhaar DOB: {dob}')

    def resolved_identity(
        self,
        *,
        env_name: str = '',
    ) -> dict[str, str | None]:
        from pdf_unlock import resolve_aadhaar_dob, resolve_aadhaar_name

        name = resolve_aadhaar_name(
            api_name=self.aadhaar_name or None,
            form_name=self.name,
            env_name=env_name,
        )
        dob = resolve_aadhaar_dob(api_dob=self.aadhaar_dob, form_dob=self.dob_raw)
        return {'name': name, 'dob': dob}

    def resolved_pdf_password(self, *, env_name: str = '') -> str:
        ident = self.resolved_identity(env_name=env_name)
        return pdf_password(ident['name'] or self.name, ident.get('dob'))

    def _ensure_phase2_headers(self) -> dict[str, str]:
        if not self.phase2_headers:
            self.phase2_req_id = str(uuid.uuid4())
            self.phase2_headers = get_headers(self.phase2_req_id)
        return self.phase2_headers

    def stash_phase2_captcha(self) -> None:
        """Cache phase-2 captcha for instant reuse after prefetch."""
        if self.captcha_txn_id and self._image_captcha_ok(self.last_captcha_image):
            self.phase2_captcha_image = self.last_captcha_image
            self.phase2_captcha_txn_id = self.captcha_txn_id
            self.phase2_captcha_at = self.captcha_primed_at
            self.phase2_stash_eid = (self.eid or '').strip()

    def clear_phase2_stash(self) -> None:
        self.phase2_captcha_image = b''
        self.phase2_captcha_txn_id = ''
        self.phase2_captcha_at = 0.0
        self.phase2_stash_eid = ''

    def apply_phase2_captcha_stash(self) -> bool:
        if not self.eid or self.phase2_stash_eid != self.eid:
            return False
        if not self.phase2_captcha_txn_id or not self._image_captcha_ok(self.phase2_captcha_image):
            return False
        if self.phase2_captcha_at:
            from uidai_api import captcha_max_age_sec
            if (time.monotonic() - self.phase2_captcha_at) > captcha_max_age_sec():
                return False
        self.prime_browser_captcha(self.phase2_captcha_image, self.phase2_captcha_txn_id)
        if self.phase2_captcha_at:
            self.captcha_primed_at = self.phase2_captcha_at
        return True

    def prime_http_captcha(self, phase: str = 'phase2') -> bool:
        """HTTP captcha image+txn — primary fast path for /pdf."""
        tag = (phase or 'phase2').split('-')[0]
        if tag.startswith('phase2'):
            headers = self._ensure_phase2_headers()
        elif tag.startswith('phase1'):
            if not self.phase1_headers:
                rid = str(uuid.uuid4())
                self.phase1_headers = get_headers(rid)
            headers = self.phase1_headers
        else:
            headers = get_headers(str(uuid.uuid4()))
        self._log(f'[*] [{tag}] HTTP captcha…')
        bundle = self._fetch_captcha_bundle(
            headers, tag=f'{tag}-http', image_only=uidai_fast(),
        )
        txn = str(bundle.get('txn') or '').strip()
        png = bundle.get('image_png') or b''
        if txn and self._image_captcha_ok(png):
            self.prime_browser_captcha(png, txn)
            self._log(f'[+] [{tag}] HTTP captcha ready — {len(png)} bytes')
            return True
        self._log(f'[-] [{tag}] HTTP captcha failed')
        return False

    def _post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        payload: dict[str, Any] | None = None,
        timeout: int | tuple[int, int] | None = None,
    ) -> requests.Response:
        """POST with auto-retry on timeout / connection errors."""
        body = payload if payload is not None else {}
        tmo = timeout if timeout is not None else request_timeout()
        tag = url.split('/')[-1][:24]
        retries = post_retry_count()
        last_exc: Exception | None = None
        for attempt in range(1, retries + 1):
            if not uidai_fast() or attempt == 1 or attempt == retries:
                self._log(f'[*] POST {tag}… try {attempt}/{retries} timeout={tmo}')
            try:
                r = self._session.post(url, headers=headers, json=body, timeout=tmo)
                if _retryable_status(r.status_code) and attempt < retries:
                    self._log(f'[!] HTTP {r.status_code} — retry {attempt}/{retries}')
                    time.sleep(_retry_backoff(attempt))
                    continue
                return r
            except requests.RequestException as e:
                last_exc = e
                self._log(f'[!] Request failed ({attempt}/{retries}): {str(e)[:90]}')
                if attempt < retries:
                    time.sleep(_retry_backoff(attempt))
        raise RuntimeError(
            f'UIDAI network failed after {retries} tries — check VPS / proxy'
        ) from last_exc

    def _network_error_result(self, tag: str, err: str = '') -> dict[str, Any]:
        self._log(f'[-] [{tag}] network error — auto-retry exhausted')
        msg = (err or 'UIDAI network error').strip()[:120]
        return {
            **self._result_base(),
            'otp_ok': False,
            'retrieve_ok': False,
            'download_ok': False,
            'network_error': True,
            'msg': f'🔄 {msg} — try again',
        }

    @staticmethod
    def _image_captcha_ok(png: bytes) -> bool:
        return bool(png) and len(png) >= 80

    def _parse_captcha_api_json(self, data: Any, *, tag: str) -> tuple[bytes, str, bytes]:
        """Normalize UIDAI captcha JSON — image + txn + audio bytes."""
        from audio_captcha import parse_captcha_generation

        parsed = parse_captcha_generation(data if isinstance(data, dict) else {})
        png = parsed.get('image_png') or b''
        txn = str(parsed.get('captchaTxnId') or '').strip()
        audio = parsed.get('audio_bytes') or b''
        if png:
            self.last_captcha_image = png
            self._log(f'[+] [{tag}] Image parsed — {len(png)} bytes')
        if audio:
            self.last_audio_bytes = audio
            self._log(f'[+] [{tag}] Audio parsed — {len(audio)} bytes')
        if txn:
            self._log(f'[+] [{tag}] Captcha txn: {txn[:16]}…')
        return png, txn, audio

    def _fetch_captcha_bundle(
        self, headers: dict[str, str], *, tag: str, image_only: bool = False,
    ) -> dict[str, Any]:
        """
        UIDAI captcha APIs — image-only is fastest (one POST).
        Audio API used when image_only=False (legacy / Whisper path).
        """
        from uidai_api import build_audio_captcha_payload

        out: dict[str, Any] = {'audio_b64': '', 'txn': '', 'image_png': b'', 'raw': {}}

        if not image_only:
            self._log(f'[*] [{tag}] Requesting captcha (audio API — includes image)…')
            try:
                r = self._post(
                    AUDIO_CAPTCHA_URL,
                    headers=headers,
                    payload=build_audio_captcha_payload(),
                )
                self._log(f'[*] [{tag}] Audio API HTTP {r.status_code}')
                if r.status_code == 200:
                    data = r.json()
                    out['raw'] = data
                    png, txn, audio = self._parse_captcha_api_json(data, tag=tag)
                    out['image_png'] = png
                    out['txn'] = txn
                    if audio:
                        out['audio_b64'] = base64.b64encode(audio).decode()
                else:
                    self._log(f'[-] [{tag}] Body: {(r.text or "")[:200]}')
            except Exception as e:
                self._log(f'[-] [{tag}] Audio captcha fail: {e}')

        if not self._image_captcha_ok(out['image_png']) or not out['txn']:
            self._log(f'[*] [{tag}] Trying image captcha API fallback…')
            try:
                r2 = self._post(
                    IMAGE_CAPTCHA_URL,
                    headers=headers,
                    payload={'captchaLength': '6', 'captchaType': '2'},
                )
                self._log(f'[*] [{tag}] Image API HTTP {r2.status_code}')
                if r2.status_code == 200:
                    png2, txn2, _ = self._parse_captcha_api_json(r2.json(), tag=f'{tag}-img')
                    if png2 and not self._image_captcha_ok(out['image_png']):
                        out['image_png'] = png2
                    if txn2 and not out['txn']:
                        out['txn'] = txn2
            except Exception as e:
                self._log(f'[-] [{tag}] Image API fail: {e}')
        return out

    def _decode_audio(self, b64: str, path: str) -> str:
        b64 = b64.strip()
        mp3_path = path if path.endswith('.mp3') else path.rsplit('.', 1)[0] + '.mp3'
        self.last_audio_bytes = _b64_bytes(b64)
        with open(mp3_path, 'wb') as f:
            f.write(self.last_audio_bytes)
        if AudioSegment is not None:
            try:
                AudioSegment.from_file(mp3_path).export(path, format='wav')
                if os.path.exists(mp3_path) and path != mp3_path:
                    os.remove(mp3_path)
                return path
            except Exception as e:
                self._log(f'[!] pydub skip: {e}')
        return mp3_path

    def _whisper(self, audio_path: str, *, tag: str) -> str:
        global _WHISPER_MODEL
        if whisper is None:
            self._log(f'[-] [{tag}] Whisper not installed')
            return ''
        self._log(f'[*] [{tag}] Whisper transcribe…')
        if _WHISPER_MODEL is None:
            _WHISPER_MODEL = whisper.load_model(os.getenv('WHISPER_MODEL', 'base'))
        result = _WHISPER_MODEL.transcribe(audio_path, language='en', fp16=False)
        text = str(result.get('text') or '')
        cap = text.replace(' ', '').replace('.', '').replace(',', '').strip().lower()
        self._log(f'[====> [{tag}] Whisper raw: {text[:60]}')
        self._log(f'[====> [{tag}] Captcha solved: {cap or "(empty)"} <====]')
        return cap

    def _captcha_pair(self, text: str, txn: str) -> tuple[str | None, str | None]:
        cap = normalize_captcha(text) if text else None
        return cap, txn or None

    def _auto_captcha_from_audio(self, bundle: dict[str, Any], *, tag: str) -> str:
        """Whisper audio captcha when image did not load (not shown to user)."""
        audio_b64 = bundle.get('audio_b64') or ''
        if audio_b64:
            self.last_audio_bytes = _b64_bytes(audio_b64)
        if not self.last_audio_bytes or len(self.last_audio_bytes) < 100:
            return ''

        try:
            from audio_captcha import decode_audio_captcha

            os.environ.setdefault('UIDAI_WHISPER', '1')
            cap = decode_audio_captcha(self.last_audio_bytes)
            if cap:
                return normalize_captcha(cap)
        except Exception as e:
            self._log(f'[!] [{tag}] audio_captcha skip: {e}')

        wav_path = ''
        try:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                wav_path = tmp.name
            b64 = base64.b64encode(self.last_audio_bytes).decode()
            audio_path = self._decode_audio(b64, wav_path)
            cap = self._whisper(audio_path, tag=tag)
            return normalize_captcha(cap) if cap else ''
        finally:
            if wav_path:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass
            mp3 = wav_path.replace('.wav', '.mp3') if wav_path else ''
            if mp3 and os.path.exists(mp3):
                try:
                    os.remove(mp3)
                except OSError:
                    pass

    def _acquire_captcha(self, headers: dict[str, str], tag: str) -> dict[str, Any]:
        """Browser-primed captcha only — same manual image flow as /open."""
        self.last_phase = tag
        txn = str(self.captcha_txn_id or '').strip()
        png = self.last_captcha_image or b''
        out: dict[str, Any] = {
            'txn': txn,
            'image_png': png,
            'needs_manual': False,
            'captcha_text': '',
            'auto_solved': False,
        }
        if txn and self._image_captcha_ok(png):
            out['needs_manual'] = True
            self._log(f'[+] [{tag}] Browser captcha ready — manual entry')
            return out
        self._log(f'[-] [{tag}] Browser captcha not primed — fetch from live page')
        out['needs_browser_captcha'] = True
        return out

    def _captcha_rejected_result(
        self, resp: dict | None, headers: dict[str, str], tag: str,
    ) -> dict[str, Any]:
        if invalid_captcha(resp):
            expired = captcha_expired(resp)
            self._log(
                f'[-] [{tag}] {"Captcha expired" if expired else "Invalid captcha"} '
                '— need fresh browser image',
            )
            self.clear_browser_captcha()
            return {
                **self._result_base(),
                'otp_ok': False,
                'needs_captcha': True,
                'needs_browser_captcha': True,
                'invalid_captcha': True,
                'captcha_expired': expired,
                'msg': (
                    '⏱ Captcha expire ho gaya — naya image bharo'
                    if expired
                    else '❌ Galat captcha — naya image bharo'
                ),
            }
        return {**self._result_base(), 'otp_ok': False, 'msg': _short_json(resp) or 'Request failed'}

    def _request_eid_otp(self, cap: str, txn: str, headers: dict[str, str], *, tag: str) -> dict | None:
        c, t = self._captcha_pair(cap, txn)
        cap_label = 'null' if c is None else c
        self._log(f"[*] [{tag}] EID OTP request — captcha:'{cap_label}' txn:{(txn or '')[:12]}")
        payload = {
            'mobileNumber': self.mobile,
            'dob': self.dob,
            'email': None,
            'name': self.name,
            'option': 'EID',
            'otp': None,
            'otpTxnId': None,
            'captchaTxnId': t,
            'captcha': c,
            'resendOtp': False,
        }
        self._log(f'[*] [{tag}] POST {EID_OTP_URL}')
        self._log(f'[*] [{tag}] Payload: {_short_json(payload)}')
        try:
            r = self._post(EID_OTP_URL, headers=headers, payload=payload)
            self._log(f'[*] [{tag}] Response HTTP {r.status_code}')
            data = r.json()
            self._log(f'[*] [{tag}] Response: {_short_json(data)}')
            return data
        except Exception as e:
            self._log(f'[-] [{tag}] EID OTP network fail: {e}')
            return None

    def _result_base(self) -> dict[str, Any]:
        return {
            'logs': list(self.logs),
            'captcha_text': self.captcha_text,
            'captcha_txn_id': self.captcha_txn_id,
            'audio_bytes': self.last_audio_bytes,
            'image_png': self.last_captcha_image,
        }

    def phase1_start(self) -> dict[str, Any]:
        self._log('PHASE 1 — EID RETRIEVAL START')
        if not self.phase1_headers:
            rid = str(uuid.uuid4())
            self.phase1_headers = get_headers(rid)
        rid = str(self.phase1_headers.get('X-Request-ID') or uuid.uuid4())
        self._log(f'[*] Phase1 req_id: {rid[:8]}…')

        acq = self._acquire_captcha(self.phase1_headers, 'phase1')
        txn = acq.get('txn') or ''
        if acq.get('needs_browser_captcha') or not txn:
            return {
                **self._result_base(),
                'otp_ok': False,
                'needs_captcha': True,
                'needs_browser_captcha': True,
                'msg': 'Captcha loading failed — retry /pdf',
            }

        return {
            **self._result_base(),
            'otp_ok': False,
            'needs_captcha': True,
            'msg': 'Enter captcha from image above (4–8 characters)',
        }

    def phase1_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        self._log(f'[*] Manual captcha phase1: {cap}')
        if not self.phase1_headers:
            rid = str(uuid.uuid4())
            self.phase1_headers = get_headers(rid)
        resp = self._request_eid_otp(cap, self.captcha_txn_id, self.phase1_headers, tag='phase1-manual')
        if resp is None:
            return self._network_error_result('phase1-manual')
        if not is_success(resp):
            return self._captcha_rejected_result(resp, self.phase1_headers, 'phase1')
        self.otp_txn_id = (resp.get('responseData') or {}).get('otpTxnId') or ''
        return {**self._result_base(), 'otp_ok': True, 'msg': 'OTP 1 sent'}

    def phase1_verify(self, otp: str) -> dict[str, Any]:
        self._log(f'[*] Phase1 verify OTP: {otp[:2]}****')
        c, t = self._captcha_pair(self.captcha_text, self.captcha_txn_id)
        payload = {
            'mobileNumber': self.mobile,
            'email': None,
            'dob': self.dob,
            'name': self.name,
            'option': 'EID',
            'otp': otp.strip(),
            'otpTxnId': self.otp_txn_id,
            'captchaTxnId': t,
            'captcha': c,
            'resendOtp': False,
        }
        self._log(f'[*] POST {EID_OTP_URL} (verify)')
        try:
            r = self._post(EID_OTP_URL, headers=self.phase1_headers, payload=payload)
            resp = r.json()
            self._log(f'[*] Verify HTTP {r.status_code}: {_short_json(resp)}')
        except Exception as e:
            if _is_network_error(e):
                return self._network_error_result('phase1-verify', str(e))
            return {**self._result_base(), 'retrieve_ok': False, 'msg': str(e)[:120]}

        if not is_success(resp):
            return {**self._result_base(), 'retrieve_ok': False, 'msg': _short_json(resp)}

        self.eid = str((resp.get('responseData') or {}).get('eidNumber') or '')
        self._apply_resident_profile(resp, tag='phase1-verify')
        self._log(f'[+] EID Retrieved: {self.eid}')
        ident = self.resolved_identity()
        return {
            **self._result_base(),
            'retrieve_ok': bool(self.eid),
            'eid': self.eid,
            'aadhaar_name': ident['name'],
            'aadhaar_dob': ident.get('dob'),
            'msg': 'EID retrieved',
        }

    def _request_download_otp(self, cap: str, txn: str, *, tag: str) -> dict | None:
        c, t = self._captcha_pair(cap, txn)
        cap_label = 'null' if c is None else c
        self._log(f"[*] [{tag}] Download OTP — captcha:'{cap_label}'")
        payload = {
            'eidNumber': self.eid,
            'idType': 'eid',
            'captchaTxnId': t,
            'captchaValue': c,
            'transactionId': self.phase2_req_id,
            'resendOTP': False,
        }
        self._log(f'[*] POST {DOWNLOAD_OTP_URL}')
        self._log(f'[*] Payload: {_short_json(payload)}')
        try:
            r = self._post(DOWNLOAD_OTP_URL, headers=self.phase2_headers, payload=payload)
            data = r.json()
            self._log(f'[*] [{tag}] HTTP {r.status_code}: {_short_json(data)}')
            return data
        except Exception as e:
            self._log(f'[-] [{tag}] Download OTP fail: {e}')
            return None

    def phase2_start(self) -> dict[str, Any]:
        self._log('PHASE 2 — AADHAAR DOWNLOAD START')
        if not self.eid:
            return {**self._result_base(), 'otp_ok': False, 'msg': 'EID missing'}

        if not self.phase2_headers:
            self.phase2_req_id = str(uuid.uuid4())
            self.phase2_headers = get_headers(self.phase2_req_id)
        else:
            self.phase2_req_id = self.phase2_headers.get('X-Request-ID', self.phase2_req_id) or str(
                uuid.uuid4(),
            )
        self._log(f'[*] Phase2 req_id: {str(self.phase2_req_id)[:8]}…')

        acq = self._acquire_captcha(self.phase2_headers, 'phase2')
        txn = acq.get('txn') or ''
        if acq.get('needs_browser_captcha') or not txn:
            return {
                **self._result_base(),
                'otp_ok': False,
                'needs_captcha': True,
                'needs_browser_captcha': True,
                'msg': 'Phase 2 captcha failed — retry',
            }

        return {
            **self._result_base(),
            'otp_ok': False,
            'needs_captcha': True,
            'msg': 'Enter Phase 2 captcha from image above',
        }

    def phase2_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        self._log(f'[*] Manual captcha phase2: {cap}')
        if not self.phase2_headers:
            self.phase2_req_id = str(uuid.uuid4())
            self.phase2_headers = get_headers(self.phase2_req_id)
        resp = self._request_download_otp(cap, self.captcha_txn_id, tag='phase2-manual')
        if resp is None:
            return self._network_error_result('phase2-manual')
        if not is_success(resp):
            return self._captcha_rejected_result(resp, self.phase2_headers, 'phase2')
        self.download_otp_txn_id = str(resp.get('txnId') or '')
        return {**self._result_base(), 'otp_ok': True, 'msg': 'OTP 2 sent'}

    def phase2_download(self, otp: str) -> dict[str, Any]:
        self._log(f'[*] Phase2 PDF download OTP: {otp[:2]}****')
        payload = {
            'eid': self.eid,
            'mask': False,
            'otp': otp.strip(),
            'otpTxnId': self.download_otp_txn_id,
        }
        self._log(f'[*] POST {DOWNLOAD_PDF_URL}')
        connect, read = request_timeout()
        pdf_timeout = (connect, max(read, 25))
        try:
            r = self._post(
                DOWNLOAD_PDF_URL,
                headers=self.phase2_headers,
                payload=payload,
                timeout=pdf_timeout,
            )
            resp = r.json()
            self._log(f'[*] Download HTTP {r.status_code}: {_short_json(resp)}')
        except Exception as e:
            if _is_network_error(e):
                return self._network_error_result('phase2-download', str(e))
            return {**self._result_base(), 'download_ok': False, 'msg': str(e)[:120]}

        if not is_success(resp):
            return {**self._result_base(), 'download_ok': False, 'msg': _short_json(resp)}

        b64 = (resp.get('data') or {}).get('aadhaarPdf')
        if not b64:
            return {**self._result_base(), 'download_ok': False, 'msg': 'aadhaarPdf missing'}

        try:
            pdf_bytes = base64.b64decode(b64)
        except Exception:
            return {**self._result_base(), 'download_ok': False, 'msg': 'PDF decode failed'}

        self._apply_resident_profile(resp, tag='phase2-download')
        ident = self.resolved_identity()
        self._log(f'[+] PDF OK — {len(pdf_bytes)} bytes')
        return {
            **self._result_base(),
            'download_ok': True,
            'pdf_bytes': pdf_bytes,
            'aadhaar_name': ident['name'],
            'aadhaar_dob': ident.get('dob'),
            'msg': 'PDF ready',
        }


AADHAR_SESSIONS: dict[int, AadharSession] = {}


def get_aadhar_session(chat_id: int) -> AadharSession | None:
    return AADHAR_SESSIONS.get(chat_id)


def clear_aadhar_session(chat_id: int) -> None:
    AADHAR_SESSIONS.pop(chat_id, None)


def attach_log_callback(sess: AadharSession, loop: asyncio.AbstractEventLoop, progress: Any) -> None:
    """Thread-safe log → Telegram loading screen."""

    def on_log(line: str) -> None:
        asyncio.run_coroutine_threadsafe(progress.log_detail(line), loop)

    sess.on_log = on_log


async def send_captcha_to_bot(update: Any, result: dict[str, Any], *, phase: str) -> None:
    """Send image captcha only — audio is used internally for auto-solve when image fails."""
    if not update or not update.message:
        return
    if result.get('auto_captcha'):
        return
    png = result.get('image_png') or b''
    cap_line = f'🔐 {phase} Captcha\nReply with 4–8 characters from the image'

    if png and len(png) >= 80:
        import io

        try:
            from telegram import InputFile

            photo = InputFile(io.BytesIO(png), filename='captcha.png')
            await update.message.reply_photo(photo=photo, caption=cap_line)
            return
        except Exception:
            try:
                await update.message.reply_photo(photo=png, caption=cap_line)
                return
            except Exception:
                try:
                    await update.message.reply_document(
                        document=png,
                        filename='captcha.png',
                        caption=cap_line,
                    )
                    return
                except Exception:
                    pass
    if result.get('needs_captcha'):
        await update.message.reply_text(
            f'⚠ {phase} image captcha failed to load.\n'
            'Try /pdf again.',
        )


async def run_aadhar(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _AADHAR_EXECUTOR,
        lambda: fn(*args, **kwargs),
    )


async def run_aadhar_retry(
    fn: Callable[..., Any],
    *args: Any,
    progress: Any = None,
    max_attempts: int | None = None,
    **kwargs: Any,
) -> Any:
    """Run UIDAI step — retry whole step on network_error."""
    default_steps = '2' if uidai_fast() else '3'
    attempts = max_attempts or max(2, int(os.getenv('AADHAR_STEP_RETRIES', default_steps)))
    last: dict[str, Any] = {}
    for attempt in range(1, attempts + 1):
        last = await run_aadhar(fn, *args, **kwargs)
        if not isinstance(last, dict) or not last.get('network_error'):
            return last
        if progress and hasattr(progress, 'log_detail'):
            await progress.log_detail(f'Network retry {attempt}/{attempts}…')
        if attempt < attempts:
            await asyncio.sleep(_retry_backoff(attempt))
    return last


def main() -> None:
    print('=' * 60)
    print('AUTOMATED AADHAAR DOWNLOADER (bypass edition)')
    print(f'DOB bypass: {"ON" if dob_bypass_on() else "OFF"}')
    print(f'Captcha bypass: {"ON" if captcha_bypass_on() else "OFF"}')
    print('=' * 60)

    raw_name = input('[>>>] Full Name (or Mr/skip): ').strip()
    u_dob_input = input('[>>>] DOB DD/MM/YYYY: ').strip()
    u_mobile = input('[>>>] Mobile: ').strip()

    sess = AadharSession(on_log=print)
    sess.setup(raw_name, u_mobile, u_dob_input)
    pwd = pdf_password(sess.name, sess.dob_raw if not dob_bypass_on() else None)
    print(f'[+] PDF password hint: {pwd}\n')

    r1 = sess.phase1_start()
    if not r1.get('otp_ok'):
        if r1.get('needs_captcha'):
            cap = input('[>>>] Phase 1 captcha: ').strip()
            r1 = sess.phase1_otp_manual(cap)
        if not r1.get('otp_ok'):
            print('[-] Phase 1 OTP fail:', r1.get('msg'))
            return

    otp1 = input('[>>>] Phase 1 OTP: ').strip()
    v1 = sess.phase1_verify(otp1)
    if not v1.get('retrieve_ok'):
        print('[-] EID fail:', v1.get('msg'))
        return

    r2 = sess.phase2_start()
    if not r2.get('otp_ok'):
        if r2.get('needs_captcha'):
            cap2 = input('[>>>] Phase 2 captcha: ').strip()
            r2 = sess.phase2_otp_manual(cap2)
        if not r2.get('otp_ok'):
            print('[-] Phase 2 OTP fail:', r2.get('msg'))
            return

    otp2 = input('[>>>] Phase 2 OTP: ').strip()
    dl = sess.phase2_download(otp2)
    if not dl.get('download_ok'):
        print('[-] Download fail:', dl.get('msg'))
        return

    fn = f'{pwd[:4]}_Aadhaar.pdf'
    with open(fn, 'wb') as f:
        f.write(dl['pdf_bytes'])
    print(f'[✔] Saved {fn} — password: {pwd}')


if __name__ == '__main__':
    main()
