#!/usr/bin/env python3
"""
Aadhaar downloader — standalone CLI + Telegram bot engine.

No cookies, no proxy — plain requests.Session() per user.
Bypass: dob:null, captcha:null, name Mr/skip.
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


def ensure_whisper_loaded() -> None:
    """Startup pe load — worker thread me torch/event-loop error avoid."""
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


class AadharSession:
    """Per-user requests.Session — Telegram /pdf engine."""

    def __init__(self) -> None:
        self._session = requests.Session()
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

    def setup(self, name: str, mobile: str, dob: str | None = None) -> None:
        self.name = normalize_name(name)
        self.mobile = mobile.strip()
        self.dob_raw = (dob or '').strip() or None
        self.dob = resolve_dob(self.dob_raw)

    def _fetch_audio_captcha(self, headers: dict[str, str]) -> tuple[str | None, str | None]:
        url = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation'
        payload = {'captchaLength': '6', 'captchaType': '2', 'audioCaptchaRequired': True}
        try:
            r = self._session.post(url, headers=headers, json=payload, timeout=45)
            if r.status_code == 200:
                data = r.json()
                audio = data.get('audioBase64') or data.get('audioCaptcha') or data.get('audio')
                txn = data.get('transactionId') or data.get('captchaTxnId') or data.get('txnId')
                if audio and txn:
                    return str(audio), str(txn)
        except Exception as e:
            log.warning('audio captcha fail: %s', e)
        return None, None

    def _decode_audio(self, b64: str, path: str) -> str:
        """Save audio — mp3 direct (ffmpeg/pydub optional, sudo not needed)."""
        b64 = b64.strip()
        pad = len(b64) % 4
        if pad:
            b64 += '=' * (4 - pad)
        mp3_path = path if path.endswith('.mp3') else path.rsplit('.', 1)[0] + '.mp3'
        with open(mp3_path, 'wb') as f:
            f.write(base64.b64decode(b64))
        if AudioSegment is not None:
            try:
                AudioSegment.from_file(mp3_path).export(path, format='wav')
                if os.path.exists(mp3_path) and path != mp3_path:
                    os.remove(mp3_path)
                return path
            except Exception as e:
                log.debug('pydub convert skip: %s', e)
        return mp3_path

    def _whisper(self, audio_path: str) -> str:
        global _WHISPER_MODEL
        if whisper is None:
            return ''
        if _WHISPER_MODEL is None:
            _WHISPER_MODEL = whisper.load_model(os.getenv('WHISPER_MODEL', 'base'))
        result = _WHISPER_MODEL.transcribe(audio_path, language='en', fp16=False)
        text = str(result.get('text') or '')
        return text.replace(' ', '').replace('.', '').replace(',', '').strip().lower()

    def _captcha_pair(self, text: str, txn: str) -> tuple[str | None, str | None]:
        if captcha_bypass_on() and not text:
            return None, txn or None
        cap = normalize_captcha(text) if text else None
        return cap, txn or None

    def _solve_captcha_auto(self, headers: dict[str, str], tag: str) -> tuple[str, str]:
        audio_b64, txn = self._fetch_audio_captcha(headers)
        if not txn:
            return '', ''
        self.captcha_txn_id = txn
        if captcha_bypass_on():
            return '', txn
        if audio_b64:
            audio_path = self._decode_audio(audio_b64, f'audio_{tag}.wav')
            solved = self._whisper(audio_path)
            if solved and 'error' not in solved:
                return solved, txn
            if os.path.exists(audio_path):
                shutil.copy(audio_path, f'failed_{tag}_{txn}.mp3')
        return '', txn

    def _whisper_retry(self, headers: dict[str, str], tag: str) -> str:
        audio_b64, _ = self._fetch_audio_captcha(headers)
        if not audio_b64:
            return ''
        audio_path = self._decode_audio(audio_b64, f'audio_{tag}_retry.wav')
        return self._whisper(audio_path)

    def _request_eid_otp(self, cap: str, txn: str, headers: dict[str, str]) -> dict | None:
        c, t = self._captcha_pair(cap, txn)
        url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
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
        try:
            return self._session.post(url, headers=headers, json=payload, timeout=45).json()
        except Exception as e:
            log.warning('eid otp fail: %s', e)
            return None

    def phase1_start(self) -> dict[str, Any]:
        """Auto captcha + OTP 1 request."""
        rid = str(uuid.uuid4())
        self.phase1_headers = get_headers(rid)
        cap, txn = self._solve_captcha_auto(self.phase1_headers, 'phase1')
        self.captcha_text = cap
        self.captcha_txn_id = txn

        if not txn:
            return {'otp_ok': False, 'needs_captcha': True, 'msg': 'Captcha txn missing'}

        resp = self._request_eid_otp(cap, txn, self.phase1_headers)
        if invalid_captcha(resp) and captcha_bypass_on():
            cap = self._whisper_retry(self.phase1_headers, 'phase1')
            if cap:
                self.captcha_text = cap
                resp = self._request_eid_otp(cap, txn, self.phase1_headers)

        if not is_success(resp):
            err = str(resp)[:200] if resp else 'no response'
            if invalid_captcha(resp):
                return {'otp_ok': False, 'needs_captcha': True, 'msg': err}
            return {'otp_ok': False, 'msg': err}

        self.otp_txn_id = (resp.get('responseData') or {}).get('otpTxnId') or ''
        return {'otp_ok': True, 'msg': 'OTP 1 sent to mobile'}

    def phase1_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        if not self.phase1_headers:
            rid = str(uuid.uuid4())
            self.phase1_headers = get_headers(rid)
        resp = self._request_eid_otp(cap, self.captcha_txn_id, self.phase1_headers)
        if not is_success(resp):
            return {'otp_ok': False, 'msg': str(resp)[:200]}
        self.otp_txn_id = (resp.get('responseData') or {}).get('otpTxnId') or ''
        return {'otp_ok': True, 'msg': 'OTP 1 sent'}

    def phase1_verify(self, otp: str) -> dict[str, Any]:
        c, t = self._captcha_pair(self.captcha_text, self.captcha_txn_id)
        url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
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
        try:
            resp = self._session.post(
                url, headers=self.phase1_headers, json=payload, timeout=45,
            ).json()
        except Exception as e:
            return {'retrieve_ok': False, 'msg': str(e)}

        if not is_success(resp):
            return {'retrieve_ok': False, 'msg': str(resp)[:200]}

        self.eid = str((resp.get('responseData') or {}).get('eidNumber') or '')
        return {'retrieve_ok': bool(self.eid), 'eid': self.eid, 'msg': 'EID retrieved'}

    def _request_download_otp(self, cap: str, txn: str) -> dict | None:
        c, t = self._captcha_pair(cap, txn)
        url = 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp'
        payload = {
            'eidNumber': self.eid,
            'idType': 'eid',
            'captchaTxnId': t,
            'captchaValue': c,
            'transactionId': self.phase2_req_id,
            'resendOTP': False,
        }
        try:
            return self._session.post(
                url, headers=self.phase2_headers, json=payload, timeout=45,
            ).json()
        except Exception as e:
            log.warning('download otp fail: %s', e)
            return None

    def phase2_start(self) -> dict[str, Any]:
        if not self.eid:
            return {'otp_ok': False, 'msg': 'EID missing — complete Phase 1'}

        self.phase2_req_id = str(uuid.uuid4())
        self.phase2_headers = get_headers(self.phase2_req_id)
        cap, txn = self._solve_captcha_auto(self.phase2_headers, 'phase2')
        self.captcha_text = cap
        self.captcha_txn_id = txn

        if not txn:
            return {'otp_ok': False, 'needs_captcha': True, 'msg': 'Phase 2 captcha failed'}

        resp = self._request_download_otp(cap, txn)
        if invalid_captcha(resp) and captcha_bypass_on():
            cap = self._whisper_retry(self.phase2_headers, 'phase2')
            if cap:
                self.captcha_text = cap
                resp = self._request_download_otp(cap, txn)

        if not is_success(resp):
            err = str(resp)[:200] if resp else 'no response'
            if invalid_captcha(resp):
                return {'otp_ok': False, 'needs_captcha': True, 'msg': err}
            return {'otp_ok': False, 'msg': err}

        self.download_otp_txn_id = str(resp.get('txnId') or '')
        return {'otp_ok': True, 'msg': 'OTP 2 sent for PDF download'}

    def phase2_otp_manual(self, captcha: str) -> dict[str, Any]:
        cap = normalize_captcha(captcha)
        self.captcha_text = cap
        if not self.phase2_headers:
            self.phase2_req_id = str(uuid.uuid4())
            self.phase2_headers = get_headers(self.phase2_req_id)
        resp = self._request_download_otp(cap, self.captcha_txn_id)
        if not is_success(resp):
            return {'otp_ok': False, 'msg': str(resp)[:200]}
        self.download_otp_txn_id = str(resp.get('txnId') or '')
        return {'otp_ok': True, 'msg': 'OTP 2 sent'}

    def phase2_download(self, otp: str) -> dict[str, Any]:
        url = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'
        payload = {
            'eid': self.eid,
            'mask': False,
            'otp': otp.strip(),
            'otpTxnId': self.download_otp_txn_id,
        }
        try:
            resp = self._session.post(
                url, headers=self.phase2_headers, json=payload, timeout=45,
            ).json()
        except Exception as e:
            return {'download_ok': False, 'msg': str(e)}

        if not is_success(resp):
            return {'download_ok': False, 'msg': str(resp)[:200]}

        b64 = (resp.get('data') or {}).get('aadhaarPdf')
        if not b64:
            return {'download_ok': False, 'msg': 'aadhaarPdf missing in response'}

        try:
            pdf_bytes = base64.b64decode(b64)
        except Exception:
            return {'download_ok': False, 'msg': 'PDF decode failed'}

        return {'download_ok': True, 'pdf_bytes': pdf_bytes, 'msg': 'PDF ready'}


AADHAR_SESSIONS: dict[int, AadharSession] = {}


def get_aadhar_session(chat_id: int) -> AadharSession | None:
    return AADHAR_SESSIONS.get(chat_id)


def clear_aadhar_session(chat_id: int) -> None:
    AADHAR_SESSIONS.pop(chat_id, None)


async def run_aadhar(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Run sync aadhar code off the asyncio loop (fixed thread pool)."""
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

    sess = AadharSession()
    sess.setup(raw_name, u_mobile, u_dob_input)
    pwd = pdf_password(sess.name, sess.dob_raw if not dob_bypass_on() else None)
    print(f'[+] PDF password hint: {pwd}\n')

    print('PHASE 1')
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
    print(f'[+] EID: {sess.eid}')

    print('\nPHASE 2')
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
