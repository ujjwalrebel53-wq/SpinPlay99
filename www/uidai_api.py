"""UIDAI retrieve API — Python-first, no browser extension."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

BOT_ENGINE_VERSION = '2.0.0'

UIDAI_PAGE_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
OTP_API_URL = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'


def new_request_id() -> str:
    return str(uuid.uuid4())


def build_otp_payload(
    *,
    name: str,
    mobile: str,
    captcha: str,
    captcha_txn_id: str,
    option: str = 'UID',
    resend: bool = False,
) -> dict[str, Any]:
    """OTP generate — dob:null proven working without DOB field on form."""
    return {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': name.strip(),
        'option': option if option in ('UID', 'EID') else 'UID',
        'otp': None,
        'otpTxnId': None,
        'captchaTxnId': captcha_txn_id.strip(),
        'captcha': captcha.strip().lower(),
        'resendOtp': resend,
    }


def build_retrieve_payload(
    *,
    name: str,
    mobile: str,
    captcha: str,
    captcha_txn_id: str,
    otp: str,
    otp_txn_id: str,
    option: str = 'UID',
) -> dict[str, Any]:
    return {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': name.strip(),
        'option': option if option in ('UID', 'EID') else 'UID',
        'otp': otp.strip(),
        'otpTxnId': otp_txn_id.strip(),
        'captchaTxnId': captcha_txn_id.strip(),
        'captcha': captcha.strip().lower(),
        'resendOtp': False,
    }


def uidai_headers(request_id: str | None = None) -> dict[str, str]:
    rid = request_id or new_request_id()
    return {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'appid': 'MYAADHAAR',
        'accept-language': 'en_IN',
        'x-request-id': rid,
        'Origin': 'https://myaadhaar.uidai.gov.in',
        'Referer': UIDAI_PAGE_URL,
    }


def parse_uidai_response(status: int, text: str) -> tuple[bool, str, dict[str, Any]]:
    """Return (success, message, extra)."""
    extra: dict[str, Any] = {'status': status}
    if not text:
        ok = 200 <= status < 300
        return ok, '' if ok else f'HTTP {status}', extra

    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        extra['raw'] = text[:200]
        return 200 <= status < 300, text[:160], extra

    msg = (
        (j.get('errorDetails') or {}).get('messageEnglish')
        or j.get('messageEnglish')
        or j.get('message')
        or j.get('status')
        or ''
    )
    msg_s = str(msg)
    extra['json'] = j
    extra['msg'] = msg_s[:200]

    if j.get('otpTxnId'):
        extra['otpTxnId'] = j['otpTxnId']
    if j.get('transactionId'):
        extra['transactionId'] = j['transactionId']

    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'timed?\s*out|refresh the captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'captcha_expired'}
    if j.get('errorCode') and not re.search(r'otp.*sent|success', msg_s, re.I):
        return False, msg_s, extra
    if re.search(r'otp.*sent|success|transaction', msg_s, re.I):
        return True, msg_s, extra
    return 200 <= status < 300, msg_s, extra


def append_log(
    logs: list[dict[str, Any]],
    level: str,
    msg: str,
    data: Any = None,
) -> None:
    entry: dict[str, Any] = {'l': level, 'm': msg}
    if data is not None:
        entry['d'] = data
    logs.append(entry)


def summarize_logs(logs: list[dict[str, Any]], limit: int = 15) -> str:
    lines = []
    for item in logs[-limit:]:
        msg = item.get('m') or item.get('msg') or ''
        level = item.get('l') or item.get('level') or 'info'
        data = item.get('d') if 'd' in item else item.get('data')
        extra = f' {json.dumps(data)}' if data is not None else ''
        lines.append(f'[{level}] {msg}{extra}')
    return '\n'.join(lines) or 'Koi log nahi'
