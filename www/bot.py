#!/usr/bin/env python3
"""
Rebel UIDAI Telegram Bot — single file, API-only (no Playwright / browser).

Usage:
  cd www
  pip install -r requirements.txt
  python bot.py
"""

from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import io
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from telegram import InputFile, Update
from telegram.error import Conflict
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from urllib3.util.retry import Retry

load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('uidai-bot')

# ---------------------------------------------------------------------------
# Version & config
# ---------------------------------------------------------------------------

BOT_ENGINE_VERSION = '3.0.0-api'

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
ALLOWED = {x.strip() for x in os.getenv('TELEGRAM_ALLOWED_CHAT_IDS', '').split(',') if x.strip()}
OWNER_ID = os.getenv('TELEGRAM_OWNER_ID', '8432393497').strip()
if not OWNER_ID and len(ALLOWED) == 1:
    OWNER_ID = next(iter(ALLOWED))

DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
DEFAULT_MOBILE = os.getenv('UIDAI_MOBILE', '7651892956').strip()

ACCESS_STATE_FILE = Path(__file__).parent / 'access_state.json'

UIDAI_PAGE_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
DOWNLOAD_PAGE_URL = 'https://myaadhaar.uidai.gov.in/genricDownloadAadhaar/en'
OTP_API_URL = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
IMAGE_CAPTCHA_URL = 'https://tathya.uidai.gov.in/captchaService/api/captcha/v3/generation'
AUDIO_CAPTCHA_URL = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation'
EID_OTP_URL = OTP_API_URL
DOWNLOAD_OTP_URL = 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp'
DOWNLOAD_PDF_URL = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'

SCRIPT_USER_AGENT = (
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
)

PLACEHOLDER_NAME = 'Mr'
SKIP_NAME_TOKENS = frozenset({
    'mr', 'mister', 'skip', 'unknown', 'unk', 'na', 'n/a', 'no', 'none', '?', '-', 'x', 'naam',
})

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')
OTP_RE = re.compile(r'^\d{6}$')
DOB_RE = re.compile(r'^(\d{2})/(\d{2})/(\d{4})$')

STEP_NAME = 'name'
STEP_MOBILE = 'mobile'
STEP_DOB = 'dob'
STEP_CAPTCHA = 'captcha'
STEP_OTP = 'otp'
STEP_OTP_1 = 'otp1'
STEP_OTP_2 = 'otp2'
STEP_CAPTCHA_2 = 'captcha2'

FLOW_MODE_RETRIEVE = 'retrieve'
FLOW_MODE_DOWNLOAD = 'download'

_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix='uidai')
SESSIONS: dict[int, 'UidaiSession'] = {}
FLOW: dict[int, dict] = {}


def _env_on(key: str, default: str = '1') -> bool:
    return os.getenv(key, default).strip().lower() in ('1', 'true', 'yes', 'on')


def uidai_fast() -> bool:
    return _env_on('UIDAI_FAST', '1')


def dob_bypass_on() -> bool:
    return _env_on('DOB_BYPASS', '1') or _env_on('UIDAI_DOB_BYPASS', '1')


def captcha_bypass_on() -> bool:
    return _env_on('CAPTCHA_BYPASS', '0') or _env_on('UIDAI_CAPTCHA_BYPASS', '0')


# ---------------------------------------------------------------------------
# Access control (was bot_access.py)
# ---------------------------------------------------------------------------

class AccessControl:
    def __init__(self, owner_id: str, env_approved: set[str]) -> None:
        self.owner_id = (owner_id or '').strip()
        self._approved: set[str] = {x.strip() for x in env_approved if x.strip()}
        self._mode = 'locked' if self._approved else 'free'
        self._load()

    def _load(self) -> None:
        if not ACCESS_STATE_FILE.exists():
            return
        try:
            data = json.loads(ACCESS_STATE_FILE.read_text(encoding='utf-8'))
            if data.get('mode') in ('free', 'locked'):
                self._mode = data['mode']
            for uid in data.get('approved') or []:
                if uid:
                    self._approved.add(str(uid).strip())
        except Exception as e:
            log.warning('access_state load: %s', e)

    def _save(self) -> None:
        try:
            ACCESS_STATE_FILE.write_text(
                json.dumps({'mode': self._mode, 'approved': sorted(self._approved)}, indent=2),
                encoding='utf-8',
            )
        except Exception as e:
            log.warning('access_state save: %s', e)

    def is_owner(self, user_id: str | None, chat_id: str | None) -> bool:
        if not self.owner_id:
            return False
        return user_id == self.owner_id or chat_id == self.owner_id

    def allowed(self, user_id: str | None, chat_id: str | None) -> bool:
        if self.is_owner(user_id, chat_id):
            return True
        if self._mode == 'free':
            return True
        return (chat_id in self._approved) or (user_id in self._approved)

    def set_free(self) -> None:
        self._mode = 'free'
        self._save()

    def set_locked(self) -> None:
        self._mode = 'locked'
        self._save()

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def approved_count(self) -> int:
        return len(self._approved)

    def approve(self, uid: str) -> None:
        self._approved.add(uid.strip())
        self._save()

    def deny(self, uid: str) -> None:
        self._approved.discard(uid.strip())
        self._save()

    def status_lines(self, active: int = 0) -> list[str]:
        mode = '🌍 OPEN — all users' if self._mode == 'free' else '🔒 LOCKED — approved only'
        lines = [mode, f'Approved users: {self.approved_count}', f'Active sessions: {active}']
        if self.owner_id:
            lines.append(f'Owner ID: {self.owner_id}')
        return lines


ACCESS = AccessControl(OWNER_ID, ALLOWED)

# ---------------------------------------------------------------------------
# Telegram UI (was bot_ui.py)
# ---------------------------------------------------------------------------

SPINNERS = ('◐', '◓', '◑', '◒')
WAVE = ('▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂')


def humanize_step(raw: str) -> str:
    t = (raw or '').strip().lower()
    if 'captcha' in t:
        return 'Loading captcha' if 'refresh' not in t else 'Refreshing captcha'
    if 'otp' in t:
        return 'OTP verification'
    if 'pdf' in t or 'download' in t:
        return 'Downloading e-Aadhaar PDF'
    if 'eid' in t:
        return 'EID retrieve'
    if 'network' in t:
        return 'Network check'
    return (raw or 'Processing')[:42]


def uidai_user_message(result: dict[str, Any], *, kind: str) -> str:
    if kind == 'otp' and result.get('otp_ok'):
        return '📱 OTP sent to your mobile. Reply with the 6-digit code here.'
    if kind == 'download_otp' and result.get('otp_ok'):
        return '📱 OTP 2 sent — reply with the 6-digit code for PDF download.'
    if kind == 'download' and result.get('download_ok'):
        return '✅ e-Aadhaar PDF ready — check the document below.'
    if kind == 'retrieve' and result.get('retrieve_ok'):
        return '📲 Check SMS on your registered mobile for Aadhaar/EID details.'
    msg = str(result.get('msg') or '')
    if re.search(r'invalid.*captcha', msg, re.I):
        return '❌ Invalid captcha. Use /refresh and try again.'
    if re.search(r'invalid.*otp', msg, re.I):
        return '❌ Invalid OTP. Send the correct 6-digit code.'
    if kind == 'otp':
        return '❌ Could not send OTP. Verify captcha or use /refresh.'
    return msg or '❌ Request failed. Try again.'


class LoadingScreen:
    def __init__(self, msg, name: str, mobile: str, *, title: str = 'Rebel Aadhaar', subtitle: str = 'API Gateway') -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.subtitle = subtitle
        self._steps: list[str] = []
        self._logs: list[str] = []
        self._current = 0
        self._total = 6
        self._status = 'loading'
        self._footer = ''
        self._frame = 0
        self._started = time.monotonic()

    def _spinner(self) -> str:
        self._frame += 1
        return SPINNERS[self._frame % len(SPINNERS)]

    def _wave(self, pct: int) -> str:
        pct = max(0, min(100, pct))
        idx = (int(pct / 100 * (len(WAVE) - 1)) + self._frame) % len(WAVE)
        return ''.join(WAVE[(idx + i) % len(WAVE)] for i in range(10))

    async def log_detail(self, line: str) -> None:
        if line.strip():
            self._logs.append(line.strip()[:220])
            self._logs = self._logs[-18:]
        await self._render()

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = max(total, 1)
        self._current = n
        self._logs.append(text[:220])
        self._logs = self._logs[-18:]
        await self._render()

    async def done(self, final: str = '') -> None:
        self._status = 'done'
        self._footer = final
        await self._render()

    async def fail(self, err: str) -> None:
        self._status = 'fail'
        self._footer = err
        await self._render()

    async def _render(self) -> None:
        pct = 100 if self._status == 'done' else int((self._current / self._total) * 100)
        head = f'{self._spinner()} {self.title}' if self._status == 'loading' else (
            f'✓ {self.title}' if self._status == 'done' else f'⚠ {self.title}'
        )
        lines = [
            '╔══════════════════════════╗',
            f'║  {head[:24]:<24}║',
            f'║  {self.subtitle[:24]:<24}║',
            '╠══════════════════════════╣',
            f'  {self._wave(pct)}  {pct}%',
            f'  Name   {self.name}',
            f'  Mobile {self.mobile}',
        ]
        for lg in self._logs[-8:]:
            lines.append(f'  {lg[:58]}')
        if self._footer:
            lines.append(f'  {self._footer[:200]}')
        lines.append('╚══════════════════════════╝')
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception:
            pass


# ---------------------------------------------------------------------------
# UIDAI API helpers (was uidai_api.py + captcha_solver.py)
# ---------------------------------------------------------------------------

def is_skip_name(name: str) -> bool:
    t = (name or '').strip().lower().rstrip('.')
    return not t or t in SKIP_NAME_TOKENS


def normalize_name(name: str) -> str:
    if is_skip_name(name):
        return PLACEHOLDER_NAME
    return ' '.join(str(name).split()).upper()


def normalize_dob(dob: str | None) -> str | None:
    if not dob:
        return None
    m = DOB_RE.match(str(dob).strip())
    return f'{m.group(1)}/{m.group(2)}/{m.group(3)}' if m else None


def normalize_captcha(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', (text or '').strip().lower())[:8]


def generate_pdf_password(name: str, dob: str | None) -> str:
    name_clean = re.sub(r'\s+', '', (name or '').strip())
    first_4 = (name_clean[:4].upper() + 'AAAA')[:4]
    year = dob.strip().split('/')[-1] if dob and DOB_RE.match(dob.strip()) else ''
    return first_4 + year if year else first_4


def new_request_id() -> str:
    return str(uuid.uuid4())


def get_headers(req_id: str | None = None) -> dict[str, str]:
    rid = (req_id or '').strip() or new_request_id()
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'https://myaadhaar.uidai.gov.in',
        'Referer': 'https://myaadhaar.uidai.gov.in/',
        'User-Agent': SCRIPT_USER_AGENT,
        'X-Request-ID': rid,
        'transactionId': rid,
        'appid': 'MYAADHAAR',
    }


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


def parse_captcha_json(data: dict[str, Any]) -> tuple[bytes, str]:
    txn = (
        data.get('captchaTxnId') or data.get('captchaTxnID')
        or data.get('transactionId') or data.get('txnId')
        or (data.get('data') or {}).get('captchaTxnId')
    )
    img = (
        data.get('captchaImage') or data.get('image') or data.get('captcha')
        or (data.get('data') or {}).get('captchaImage')
    )
    return _b64_bytes(img), str(txn or '').strip()


def apply_captcha_fields(payload: dict[str, Any], captcha: str, txn: str) -> dict[str, Any]:
    cap = normalize_captcha(captcha)
    if captcha_bypass_on() and not cap:
        payload['captcha'] = None
        payload['captchaTxnId'] = txn or None
    else:
        payload['captcha'] = cap or None
        payload['captchaTxnId'] = txn or None
    return payload


def build_retrieve_otp_payload(name: str, mobile: str, captcha: str, txn: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': normalize_name(name),
        'option': 'UID',
        'otp': None,
        'otpTxnId': None,
        'resendOtp': False,
    }
    return apply_captcha_fields(payload, captcha, txn)


def build_retrieve_verify_payload(
    name: str, mobile: str, captcha: str, txn: str, otp: str, otp_txn: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': normalize_name(name),
        'option': 'UID',
        'otp': otp.strip(),
        'otpTxnId': otp_txn.strip(),
        'resendOtp': False,
    }
    return apply_captcha_fields(payload, captcha, txn)


def build_eid_otp_payload(name: str, mobile: str, dob: str | None, captcha: str, txn: str) -> dict[str, Any]:
    return {
        'mobileNumber': mobile.strip(),
        'dob': None if dob_bypass_on() else dob,
        'email': None,
        'name': normalize_name(name),
        'option': 'EID',
        'otp': None,
        'otpTxnId': None,
        'captchaTxnId': txn or None,
        'captcha': normalize_captcha(captcha) or None,
        'resendOtp': False,
    }


def build_eid_verify_payload(
    name: str, mobile: str, dob: str | None, captcha: str, txn: str, otp: str, otp_txn: str,
) -> dict[str, Any]:
    return {
        'mobileNumber': mobile.strip(),
        'email': None,
        'dob': None if dob_bypass_on() else dob,
        'name': normalize_name(name),
        'option': 'EID',
        'otp': otp.strip(),
        'otpTxnId': otp_txn.strip(),
        'captchaTxnId': txn or None,
        'captcha': normalize_captcha(captcha) or None,
        'resendOtp': False,
    }


def build_download_otp_payload(eid: str, captcha: str, txn: str, transaction_id: str) -> dict[str, Any]:
    return {
        'eidNumber': eid.strip(),
        'idType': 'eid',
        'captchaTxnId': txn or None,
        'captchaValue': normalize_captcha(captcha) or None,
        'transactionId': transaction_id.strip(),
        'resendOTP': False,
    }


def build_download_pdf_payload(eid: str, otp: str, otp_txn: str) -> dict[str, Any]:
    return {
        'eid': eid.strip(),
        'mask': False,
        'otp': otp.strip(),
        'otpTxnId': otp_txn.strip(),
    }


def parse_uidai_response(status: int, text: str) -> tuple[bool, str, dict[str, Any]]:
    extra: dict[str, Any] = {'status': status}
    if not text:
        ok = 200 <= status < 300
        return ok, '' if ok else f'HTTP {status}', extra
    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        return 200 <= status < 300, text[:160], extra

    msg = (
        (j.get('errorDetails') or {}).get('messageEnglish')
        or j.get('messageEnglish') or j.get('message') or j.get('status') or ''
    )
    msg_s = str(msg)
    extra['json'] = j
    extra['msg'] = msg_s[:200]

    for key in ('otpTxnId', 'otpTxnID', 'otpTransactionId'):
        if j.get(key):
            extra['otpTxnId'] = str(j[key]).strip()
            break
    rd = j.get('responseData') or {}
    if isinstance(rd, dict) and rd.get('otpTxnId'):
        extra['otpTxnId'] = str(rd['otpTxnId']).strip()
    if isinstance(rd, dict) and rd.get('eidNumber'):
        extra['eidNumber'] = str(rd['eidNumber']).strip()

    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'invalid.*otp|incorrect.*otp', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_otp'}
    if str(j.get('status', '')).lower() == 'success' and extra.get('eidNumber'):
        return True, msg_s or 'EID retrieved', {**extra, 'reason': 'retrieve_ok'}
    if re.search(r'aadhaar.*sent|uid.*sent|sent to.*mobile|otp.*sent|success', msg_s, re.I):
        reason = 'retrieve_ok' if re.search(r'sent to', msg_s, re.I) else 'otp_sent'
        return True, msg_s, {**extra, 'reason': reason}
    if j.get('errorCode'):
        return False, msg_s, extra
    return 200 <= status < 300, msg_s, extra


def parse_download_response(status: int, text: str) -> tuple[bool, str, dict[str, Any]]:
    extra: dict[str, Any] = {'status': status}
    if not text:
        ok = 200 <= status < 300
        return ok, '' if ok else f'HTTP {status}', extra
    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        return 200 <= status < 300, text[:160], extra

    msg = (
        (j.get('errorDetails') or {}).get('messageEnglish')
        or j.get('messageEnglish') or j.get('message') or j.get('status') or ''
    )
    msg_s = str(msg)
    extra['json'] = j
    extra['msg'] = msg_s[:200]

    if j.get('txnId'):
        extra['otpTxnId'] = str(j['txnId']).strip()
    nested = j.get('data') or {}
    if isinstance(nested, dict) and nested.get('aadhaarPdf'):
        extra['pdf_b64'] = nested['aadhaarPdf']

    if str(j.get('status', '')).lower() == 'success' and extra.get('pdf_b64'):
        return True, msg_s or 'PDF ready', {**extra, 'reason': 'pdf_ok'}
    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'invalid.*otp', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_otp'}
    if re.search(r'otp.*sent|sent to.*mobile|success', msg_s, re.I):
        return True, msg_s, {**extra, 'reason': 'download_otp_sent'}
    return 200 <= status < 300, msg_s, extra


# ---------------------------------------------------------------------------
# HTTP session engine (was aadhar.py + browser_session.py + http_uidai_flow.py)
# ---------------------------------------------------------------------------

class UidaiSession:
    """Pure HTTP UIDAI session — retrieve SMS + 2-OTP PDF."""

    def __init__(self, on_log: Callable[[str], None] | None = None) -> None:
        self._http = requests.Session()
        retry = Retry(total=2, connect=2, read=2, backoff_factor=0.5, status_forcelist=[502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
        self._http.mount('https://', adapter)
        self._http.mount('http://', adapter)
        proxy = (os.getenv('UIDAI_PROXY') or '').strip()
        if proxy and proxy.lower() not in ('auto', 'none', 'no', 'off', 'direct', ''):
            self._http.proxies = {'http': proxy, 'https': proxy}

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
        self.last_captcha_image = b''
        self.phase1_headers: dict[str, str] = {}
        self.phase2_headers: dict[str, str] = {}
        self.phase2_req_id = ''
        self.mode = FLOW_MODE_RETRIEVE

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

    def _timeout(self) -> tuple[int, int]:
        t = int(os.getenv('AADHAR_TIMEOUT', '12' if uidai_fast() else '30'))
        c = int(os.getenv('AADHAR_CONNECT_TIMEOUT', '6' if uidai_fast() else '15'))
        return (c, t)

    def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any]) -> requests.Response:
        self._log(f'POST {url.split("/")[-1][:28]}…')
        return self._http.post(url, headers=headers, json=payload, timeout=self._timeout())

    def setup(self, name: str, mobile: str, dob: str | None = None, *, mode: str = FLOW_MODE_RETRIEVE) -> None:
        self.name = normalize_name(name)
        self.mobile = mobile.strip()
        self.dob_raw = (dob or '').strip() or None
        self.dob = normalize_dob(self.dob_raw) if not dob_bypass_on() else None
        self.mode = mode
        self._log(f'Session: {self.name} / {self.mobile} [{mode}] API-only')

    def fetch_captcha(self, *, phase: str = 'retrieve') -> dict[str, Any]:
        headers = get_headers(new_request_id())
        if phase.startswith('phase2'):
            self.phase2_req_id = headers['X-Request-ID']
            self.phase2_headers = headers
        elif phase.startswith('phase1') or phase == 'pdf':
            self.phase1_headers = headers
        else:
            self.phase1_headers = headers

        self._log(f'[{phase}] Fetch captcha (HTTP image API)…')
        r = self._post(IMAGE_CAPTCHA_URL, headers, {'captchaLength': '6', 'captchaType': '2'})
        if r.status_code != 200:
            return {'ok': False, 'msg': f'Captcha HTTP {r.status_code}'}

        png, txn = parse_captcha_json(r.json())
        if not txn or len(png) < 80:
            self._log(f'[{phase}] Image API empty — trying audio API…')
            r2 = self._post(
                AUDIO_CAPTCHA_URL, headers,
                {'captchaLength': '6', 'captchaType': '2', 'audioCaptchaRequired': True},
            )
            if r2.status_code == 200:
                png, txn = parse_captcha_json(r2.json())

        if not txn:
            return {'ok': False, 'msg': 'captchaTxnId missing'}

        self.captcha_txn_id = txn
        self.last_captcha_image = png
        self.captcha_text = ''
        self._log(f'[{phase}] Captcha ready — {len(png)} bytes txn:{txn[:12]}…')
        return {'ok': True, 'image_png': png, 'txn': txn}

    # --- Retrieve (/open) ---

    def retrieve_start(self) -> dict[str, Any]:
        cap = self.fetch_captcha(phase='retrieve')
        if not cap.get('ok'):
            return {'needs_captcha': False, 'msg': cap.get('msg', 'Captcha failed')}
        return {
            'needs_captcha': True,
            'image_png': cap.get('image_png') or b'',
            'msg': 'Enter captcha from image (4–8 characters)',
        }

    def retrieve_send_otp(self, captcha: str) -> dict[str, Any]:
        self.captcha_text = normalize_captcha(captcha)
        headers = self.phase1_headers or get_headers(new_request_id())
        payload = build_retrieve_otp_payload(self.name, self.mobile, self.captcha_text, self.captcha_txn_id)
        r = self._post(OTP_API_URL, headers, payload)
        ok, msg, extra = parse_uidai_response(r.status_code, r.text or '')
        if extra.get('otpTxnId'):
            self.otp_txn_id = extra['otpTxnId']
        otp_ok = ok and extra.get('reason') == 'otp_sent'
        return {'otp_ok': otp_ok, 'msg': msg, 'extra': extra}

    def retrieve_verify_otp(self, otp: str) -> dict[str, Any]:
        headers = self.phase1_headers or get_headers(new_request_id())
        payload = build_retrieve_verify_payload(
            self.name, self.mobile, self.captcha_text, self.captcha_txn_id, otp, self.otp_txn_id,
        )
        r = self._post(OTP_API_URL, headers, payload)
        ok, msg, extra = parse_uidai_response(r.status_code, r.text or '')
        retrieve_ok = ok and extra.get('reason') in ('retrieve_ok', 'otp_sent')
        return {'retrieve_ok': retrieve_ok, 'msg': msg, 'extra': extra}

    # --- PDF 2-OTP ---

    def pdf_phase1_start(self) -> dict[str, Any]:
        if not self.phase1_headers:
            self.phase1_headers = get_headers(new_request_id())
        cap = self.fetch_captcha(phase='phase1')
        if not cap.get('ok'):
            return {'needs_captcha': False, 'msg': cap.get('msg', 'Captcha failed')}
        return {'needs_captcha': True, 'image_png': cap.get('image_png') or b'', 'msg': 'Enter Phase 1 captcha'}

    def pdf_phase1_otp(self, captcha: str) -> dict[str, Any]:
        self.captcha_text = normalize_captcha(captcha)
        headers = self.phase1_headers
        payload = build_eid_otp_payload(self.name, self.mobile, self.dob, self.captcha_text, self.captcha_txn_id)
        r = self._post(EID_OTP_URL, headers, payload)
        try:
            j = r.json()
        except Exception:
            return {'otp_ok': False, 'msg': r.text[:120]}
        if str(j.get('status', '')).lower() != 'success':
            return {'otp_ok': False, 'msg': json.dumps(j)[:200]}
        self.otp_txn_id = str((j.get('responseData') or {}).get('otpTxnId') or '')
        return {'otp_ok': bool(self.otp_txn_id), 'msg': 'OTP 1 sent', 'image_png': self.last_captcha_image}

    def pdf_phase1_verify(self, otp: str) -> dict[str, Any]:
        payload = build_eid_verify_payload(
            self.name, self.mobile, self.dob, self.captcha_text, self.captcha_txn_id, otp, self.otp_txn_id,
        )
        r = self._post(EID_OTP_URL, self.phase1_headers, payload)
        try:
            j = r.json()
        except Exception:
            return {'retrieve_ok': False, 'msg': r.text[:120]}
        if str(j.get('status', '')).lower() != 'success':
            return {'retrieve_ok': False, 'msg': json.dumps(j)[:200]}
        self.eid = str((j.get('responseData') or {}).get('eidNumber') or '')
        return {'retrieve_ok': bool(self.eid), 'eid': self.eid, 'msg': 'EID retrieved'}

    def pdf_phase2_start(self) -> dict[str, Any]:
        if not self.eid:
            return {'needs_captcha': False, 'msg': 'EID missing'}
        cap = self.fetch_captcha(phase='phase2')
        if not cap.get('ok'):
            return {'needs_captcha': False, 'msg': cap.get('msg', 'Phase 2 captcha failed')}
        return {'needs_captcha': True, 'image_png': cap.get('image_png') or b'', 'msg': 'Enter Phase 2 captcha'}

    def pdf_phase2_otp(self, captcha: str) -> dict[str, Any]:
        self.captcha_text = normalize_captcha(captcha)
        if not self.phase2_headers:
            self.phase2_req_id = new_request_id()
            self.phase2_headers = get_headers(self.phase2_req_id)
        payload = build_download_otp_payload(self.eid, self.captcha_text, self.captcha_txn_id, self.phase2_req_id)
        r = self._post(DOWNLOAD_OTP_URL, self.phase2_headers, payload)
        try:
            j = r.json()
        except Exception:
            return {'otp_ok': False, 'msg': r.text[:120]}
        if str(j.get('status', '')).lower() != 'success':
            return {'otp_ok': False, 'msg': json.dumps(j)[:200]}
        self.download_otp_txn_id = str(j.get('txnId') or '')
        return {'otp_ok': bool(self.download_otp_txn_id), 'msg': 'OTP 2 sent'}

    def pdf_phase2_download(self, otp: str) -> dict[str, Any]:
        payload = build_download_pdf_payload(self.eid, otp, self.download_otp_txn_id)
        tmo = (self._timeout()[0], max(self._timeout()[1], 25))
        self._log('POST download PDF…')
        r = self._http.post(DOWNLOAD_PDF_URL, headers=self.phase2_headers, json=payload, timeout=tmo)
        try:
            j = r.json()
        except Exception:
            return {'download_ok': False, 'msg': r.text[:120]}
        if str(j.get('status', '')).lower() != 'success':
            return {'download_ok': False, 'msg': json.dumps(j)[:200]}
        b64 = (j.get('data') or {}).get('aadhaarPdf')
        if not b64:
            return {'download_ok': False, 'msg': 'aadhaarPdf missing'}
        try:
            pdf_bytes = base64.b64decode(b64)
        except Exception:
            return {'download_ok': False, 'msg': 'PDF decode failed'}
        return {'download_ok': True, 'pdf_bytes': pdf_bytes, 'msg': 'PDF ready'}


def get_session(chat_id: int) -> UidaiSession | None:
    return SESSIONS.get(chat_id)


def clear_session(chat_id: int) -> None:
    SESSIONS.pop(chat_id, None)


def clear_flow(chat_id: int) -> None:
    FLOW.pop(chat_id, None)


async def run_sync(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, lambda: fn(*args, **kwargs))


def wire_logs(sess: UidaiSession, loop: asyncio.AbstractEventLoop, progress: LoadingScreen) -> None:
    def on_log(line: str) -> None:
        asyncio.run_coroutine_threadsafe(progress.log_detail(line), loop)
    sess.on_log = on_log


async def send_captcha_photo(update: Update, png: bytes, *, phase: str = '') -> None:
    if not update.message or not png or len(png) < 80:
        return
    cap = f'🔐 {phase + " " if phase else ""}Captcha\nReply with 4–8 characters\n/refresh — new captcha'
    try:
        photo = InputFile(io.BytesIO(png), filename='captcha.png')
        await update.message.reply_photo(photo=photo, caption=cap)
    except Exception:
        await update.message.reply_photo(photo=png, caption=cap)


# ---------------------------------------------------------------------------
# Telegram bot handlers
# ---------------------------------------------------------------------------

def _ids(update: Update) -> tuple[str | None, str | None]:
    user_id = str(update.effective_user.id) if update.effective_user else None
    chat_id = str(update.effective_chat.id) if update.effective_chat else None
    return user_id, chat_id


def valid_name_input(text: str) -> bool:
    return is_skip_name(text) or bool(NAME_RE.match(text.strip()))


def flow_step(chat_id: int) -> str | None:
    return FLOW.get(chat_id, {}).get('step')


def flow_mode(chat_id: int) -> str:
    return FLOW.get(chat_id, {}).get('mode', FLOW_MODE_RETRIEVE)


async def guard(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    if ACCESS.allowed(user_id, chat_id):
        return True
    await update.message.reply_text(
        f'🔒 Bot locked — ask owner for access.\nYour Chat ID: `{chat_id}`',
        parse_mode='Markdown',
    )
    return False


def is_owner(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    return ACCESS.is_owner(user_id, chat_id)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    lines = [
        f'🔐 Rebel UIDAI Bot v{BOT_ENGINE_VERSION}',
        '',
        'API-only — no browser required.',
        '',
        '/open — SMS retrieve (captcha → OTP)',
        '/open 7651892956 — mobile only',
        '/pdf — 2-OTP e-Aadhaar PDF',
        '/pdf 01/01/1991 7651892956',
        '/captcha · /refresh · /status · /close',
        '/myid — your chat ID',
    ]
    if is_owner(update):
        lines.extend(['', '👑 /free · /lock · /approve · /deny · /access'])
    await update.message.reply_text('\n'.join(lines))


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    user_id, chat_id = _ids(update)
    await update.message.reply_text(f'🆔 Chat ID: `{chat_id}`\nUser ID: `{user_id}`', parse_mode='Markdown')


async def cmd_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        return
    await update.message.reply_text('\n'.join(['👑 Access Control', ''] + ACCESS.status_lines(len(SESSIONS))))


async def cmd_free(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        return
    ACCESS.set_free()
    await update.message.reply_text('🌍 Bot is now PUBLIC')


async def cmd_lock(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        return
    ACCESS.set_locked()
    await update.message.reply_text('🔒 Bot LOCKED — approved users only')


async def cmd_approve(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update) or not context.args:
        return
    ACCESS.approve(context.args[0].strip())
    await update.message.reply_text(f'✅ Approved: `{context.args[0]}`', parse_mode='Markdown')


async def cmd_deny(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update) or not context.args:
        return
    ACCESS.deny(context.args[0].strip())
    await update.message.reply_text(f'🚫 Removed: `{context.args[0]}`', parse_mode='Markdown')


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    SESSIONS.pop(cid, None)
    clear_flow(cid)
    await update.message.reply_text('✅ Session closed.')


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    step = flow_step(cid)
    mode = flow_mode(cid)
    lines = [
        '📊 Session Status',
        f'Mode: {"PDF" if mode == FLOW_MODE_DOWNLOAD else "Retrieve"}',
        f'Step: {step or "—"}',
        f'API session: {"active" if sess else "none"}',
    ]
    if sess:
        if sess.name:
            lines.append(f'Name: {sess.name}')
        if sess.mobile:
            lines.append(f'Mobile: {sess.mobile}')
    await update.message.reply_text('\n'.join(lines))


async def cmd_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess or not sess.last_captcha_image:
        await update.message.reply_text('Run /open or /pdf first.')
        return
    await send_captcha_photo(update, sess.last_captcha_image)


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    if not sess:
        await update.message.reply_text('Run /open or /pdf first.')
        return
    wait = await update.message.reply_text('⏳ Loading new captcha…')
    phase = 'phase1' if flow_mode(cid) == FLOW_MODE_DOWNLOAD else 'retrieve'
    result = await run_sync(sess.fetch_captcha, phase=phase)
    await wait.delete()
    if result.get('ok'):
        await send_captcha_photo(update, result.get('image_png') or b'', phase='New')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA if flow_mode(cid) == FLOW_MODE_RETRIEVE else flow_step(cid)}
    else:
        await update.message.reply_text(result.get('msg', 'Captcha refresh failed'))


async def _open_retrieve(update: Update, chat_id: int, name: str, mobile: str) -> None:
    clear_flow(chat_id)
    sess = UidaiSession()
    sess.setup(name, mobile, mode=FLOW_MODE_RETRIEVE)
    SESSIONS[chat_id] = sess

    wait = await update.message.reply_text('⏳ Fetching captcha (API)…')
    progress = LoadingScreen(wait, name, mobile, title='Retrieve', subtitle='HTTP API')
    wire_logs(sess, asyncio.get_running_loop(), progress)

    result = await run_sync(sess.retrieve_start)
    if not result.get('needs_captcha'):
        await progress.fail(result.get('msg', 'Captcha failed'))
        return

    await progress.done('Captcha ready')
    await send_captcha_photo(update, result.get('image_png') or b'')
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'mode': FLOW_MODE_RETRIEVE, 'name': name, 'mobile': mobile}


async def _start_pdf(update: Update, chat_id: int, name: str, mobile: str, dob: str | None) -> None:
    clear_flow(chat_id)
    sess = UidaiSession()
    sess.setup(name, mobile, dob, mode=FLOW_MODE_DOWNLOAD)
    SESSIONS[chat_id] = sess

    wait = await update.message.reply_text('⏳ PDF flow — Phase 1 captcha…')
    progress = LoadingScreen(wait, name, mobile, title='2-OTP PDF', subtitle='Phase 1')
    wire_logs(sess, asyncio.get_running_loop(), progress)

    result = await run_sync(sess.pdf_phase1_start)
    if not result.get('needs_captcha'):
        await progress.fail(result.get('msg', 'Phase 1 failed'))
        return

    pdf_pass = generate_pdf_password(name, dob)
    FLOW[chat_id] = {
        'step': STEP_CAPTCHA,
        'mode': FLOW_MODE_DOWNLOAD,
        'name': name,
        'mobile': mobile,
        'dob': dob,
        'pdf_password': pdf_pass,
    }
    await progress.done('Enter Phase 1 captcha')
    await send_captcha_photo(update, result.get('image_png') or b'', phase='Phase 1')


async def cmd_open(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    args = list(context.args or [])

    if len(args) >= 2:
        name = normalize_name(' '.join(args[:-1]))
        mobile = args[-1]
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Mobile must be 10 digits (6–9 start).')
            return
        await _open_retrieve(update, cid, name, mobile)
        return

    if len(args) == 1 and MOBILE_RE.match(args[0].strip()):
        await _open_retrieve(update, cid, PLACEHOLDER_NAME, args[0].strip())
        return

    clear_flow(cid)
    FLOW[cid] = {'step': STEP_NAME, 'mode': FLOW_MODE_RETRIEVE}
    await update.message.reply_text(
        'Send full name (as on Aadhaar)\nExample: KAMAR JAHAN\n\n'
        'Or send "Mr" / "skip" if unknown\nCancel: /close'
    )


async def cmd_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    args = list(context.args or [])

    if len(args) >= 3 and DOB_RE.match(args[-2].strip()) and MOBILE_RE.match(args[-1].strip()):
        await _start_pdf(update, cid, normalize_name(' '.join(args[:-2])), args[-1].strip(), normalize_dob(args[-2]))
        return
    if len(args) == 2 and DOB_RE.match(args[0].strip()) and MOBILE_RE.match(args[1].strip()):
        await _start_pdf(update, cid, PLACEHOLDER_NAME, args[1].strip(), normalize_dob(args[0]))
        return
    if len(args) >= 2:
        mobile = args[-1]
        if MOBILE_RE.match(mobile):
            await _start_pdf(update, cid, normalize_name(' '.join(args[:-1])), mobile, None if dob_bypass_on() else None)
            return
    if len(args) == 1 and MOBILE_RE.match(args[0].strip()):
        await _start_pdf(update, cid, PLACEHOLDER_NAME, args[0].strip(), None)
        return

    clear_flow(cid)
    FLOW[cid] = {'step': STEP_NAME, 'mode': FLOW_MODE_DOWNLOAD}
    await update.message.reply_text(
        '📥 2-OTP e-Aadhaar PDF\n\nSend full name\nExample: KAMAR JAHAN\n\n'
        'Quick: /pdf 01/01/1991 7651892956\nCancel: /close'
    )


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update) or not update.message or not update.message.text:
        return
    if update.message.text.strip().startswith('/'):
        return

    cid = update.effective_chat.id
    text = update.message.text.strip()
    step = flow_step(cid)
    mode = flow_mode(cid)
    sess = get_session(cid)

    if step == STEP_NAME:
        if not valid_name_input(text):
            await update.message.reply_text('Invalid name. Example: KAMAR JAHAN or Mr/skip')
            return
        name = normalize_name(text)
        FLOW[cid] = {'step': STEP_MOBILE, 'mode': mode, 'name': name}
        await update.message.reply_text(f'Name: {name}\n\nSend 10-digit mobile number.')
        return

    if step == STEP_MOBILE:
        mobile = re.sub(r'\s+', '', text)
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Invalid mobile — 10 digits starting 6–9.')
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        if mode == FLOW_MODE_DOWNLOAD:
            if dob_bypass_on():
                await _start_pdf(update, cid, name, mobile, None)
            else:
                FLOW[cid] = {'step': STEP_DOB, 'mode': mode, 'name': name, 'mobile': mobile}
                await update.message.reply_text('Send DOB DD/MM/YYYY\nExample: 01/01/1991')
        else:
            await _open_retrieve(update, cid, name, mobile)
        return

    if step == STEP_DOB and mode == FLOW_MODE_DOWNLOAD:
        dob = normalize_dob(text)
        if not dob:
            await update.message.reply_text('Invalid DOB — DD/MM/YYYY')
            return
        draft = FLOW.get(cid, {})
        await _start_pdf(update, cid, draft.get('name', DEFAULT_NAME), draft.get('mobile', ''), dob)
        return

    if not sess:
        return

    # Retrieve captcha → OTP
    if step == STEP_CAPTCHA and mode == FLOW_MODE_RETRIEVE:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha 4–8 chars.')
            return
        wait = await update.message.reply_text('⏳ Sending OTP…')
        progress = LoadingScreen(wait, sess.name, sess.mobile, title='OTP', subtitle='Retrieve')
        wire_logs(sess, asyncio.get_running_loop(), progress)
        result = await run_sync(sess.retrieve_send_otp, text)
        if result.get('otp_ok'):
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP, 'mode': mode}
            await progress.done(uidai_user_message(result, kind='otp'))
        else:
            await progress.fail(uidai_user_message(result, kind='otp'))
        return

    if step == STEP_OTP and mode == FLOW_MODE_RETRIEVE:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP.')
            return
        wait = await update.message.reply_text('⏳ Verifying OTP…')
        progress = LoadingScreen(wait, sess.name, sess.mobile, title='Verify', subtitle='Retrieve')
        result = await run_sync(sess.retrieve_verify_otp, text)
        if result.get('retrieve_ok'):
            await progress.done(uidai_user_message(result, kind='retrieve'))
            clear_flow(cid)
        else:
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
            await progress.fail(uidai_user_message(result, kind='retrieve'))
        return

    # PDF flow
    if step == STEP_CAPTCHA and mode == FLOW_MODE_DOWNLOAD:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha 4–8 chars.')
            return
        wait = await update.message.reply_text('⏳ Sending OTP 1…')
        progress = LoadingScreen(wait, sess.name, sess.mobile, title='OTP 1', subtitle='EID')
        wire_logs(sess, asyncio.get_running_loop(), progress)
        result = await run_sync(sess.pdf_phase1_otp, text)
        if result.get('otp_ok'):
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP_1, 'mode': mode}
            await progress.done(uidai_user_message(result, kind='otp'))
        else:
            await progress.fail(result.get('msg', 'OTP 1 failed'))
        return

    if step == STEP_OTP_1 and mode == FLOW_MODE_DOWNLOAD:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP 1.')
            return
        wait = await update.message.reply_text('⏳ Verifying OTP 1…')
        progress = LoadingScreen(wait, sess.name, sess.mobile, title='Phase 1', subtitle='EID')
        result = await run_sync(sess.pdf_phase1_verify, text)
        if not result.get('retrieve_ok'):
            await progress.fail(result.get('msg', 'OTP 1 verify failed'))
            return
        await progress.done(uidai_user_message(result, kind='retrieve'))
        wait2 = await update.message.reply_text('⏳ Phase 2 captcha…')
        p2 = await run_sync(sess.pdf_phase2_start)
        await wait2.delete()
        if p2.get('needs_captcha'):
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA_2}
            await send_captcha_photo(update, p2.get('image_png') or b'', phase='Phase 2')
        else:
            await update.message.reply_text(p2.get('msg', 'Phase 2 start failed'))
        return

    if step == STEP_CAPTCHA_2 and mode == FLOW_MODE_DOWNLOAD:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha 4–8 chars.')
            return
        wait = await update.message.reply_text('⏳ Sending OTP 2…')
        result = await run_sync(sess.pdf_phase2_otp, text)
        if result.get('otp_ok'):
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP_2}
            await wait.edit_text(uidai_user_message(result, kind='download_otp'))
        else:
            await wait.edit_text(result.get('msg', 'OTP 2 failed'))
        return

    if step == STEP_OTP_2 and mode == FLOW_MODE_DOWNLOAD:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP 2.')
            return
        wait = await update.message.reply_text('⏳ Downloading PDF…')
        result = await run_sync(sess.pdf_phase2_download, text)
        if result.get('download_ok'):
            pdf_pass = FLOW.get(cid, {}).get('pdf_password') or generate_pdf_password(sess.name, sess.dob_raw)
            await wait.edit_text('✅ PDF ready')
            await update.message.reply_document(
                document=result['pdf_bytes'],
                filename='eaadhaar.pdf',
                caption=f'✅ e-Aadhaar PDF\nPassword: {pdf_pass}',
            )
            clear_flow(cid)
            clear_session(cid)
        else:
            await wait.edit_text(result.get('msg', 'Download failed'))


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, Conflict):
        log.error('409 Conflict — stop duplicate bot.py instances')
        return
    if context.error:
        log.exception('Bot error: %s', context.error)


def main() -> None:
    if not TOKEN:
        raise SystemExit('❌ Set TELEGRAM_BOT_TOKEN in .env or run bash setup.sh')
    if ':' not in TOKEN or len(TOKEN) < 20:
        raise SystemExit('❌ Invalid TELEGRAM_BOT_TOKEN')

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
    app.add_handler(CommandHandler('pdf', cmd_pdf))
    app.add_handler(CommandHandler('download', cmd_pdf))
    app.add_handler(CommandHandler('captcha', cmd_captcha))
    app.add_handler(CommandHandler('refresh', cmd_refresh))
    app.add_handler(CommandHandler('status', cmd_status))
    app.add_handler(CommandHandler('close', cmd_close))
    app.add_handler(CommandHandler('myid', cmd_myid))
    app.add_handler(CommandHandler('free', cmd_free))
    app.add_handler(CommandHandler('lock', cmd_lock))
    app.add_handler(CommandHandler('approve', cmd_approve))
    app.add_handler(CommandHandler('deny', cmd_deny))
    app.add_handler(CommandHandler('access', cmd_access))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_error_handler(on_error)

    log.info(
        'Bot start v%s — API-only | access: %s | owner: %s',
        BOT_ENGINE_VERSION, ACCESS.mode, OWNER_ID or '—',
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)


if __name__ == '__main__':
    main()
