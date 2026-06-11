"""UIDAI retrieve API — Python-first, no browser extension."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

BOT_ENGINE_VERSION = '2.10.1'

UIDAI_PAGE_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
RETRIEVE_PAGE_URL = UIDAI_PAGE_URL
DOWNLOAD_PAGE_URL = 'https://myaadhaar.uidai.gov.in/genricDownloadAadhaar/en'
OTP_API_URL = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
CAPTCHA_API_URL = 'https://tathya.uidai.gov.in/captchaService/api/captcha/v3/generation'
AUDIO_CAPTCHA_API_URL = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation'
DOWNLOAD_OTP_API_URL = (
    'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp'
)
DOWNLOAD_PDF_API_URL = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'

# Naam optional — DOB ki tarah placeholder (UIDAI mobile OTP pe verify karta hai)
PLACEHOLDER_NAME = 'Mr'
SKIP_NAME_TOKENS = frozenset({
    'mr', 'mister', 'skip', 'unknown', 'unk', 'na', 'n/a', 'no', 'none', '?', '-', 'x', 'naam',
})


def is_skip_name(name: str) -> bool:
    t = (name or '').strip().lower().rstrip('.')
    return not t or t in SKIP_NAME_TOKENS


def normalize_name(name: str) -> str:
    """Real naam ya placeholder Mr — API + form dono ke liye."""
    if is_skip_name(name):
        return PLACEHOLDER_NAME
    return ' '.join(str(name).split()).upper()


def new_request_id() -> str:
    return str(uuid.uuid4())


def build_otp_payload(
    *,
    name: str,
    mobile: str,
    captcha: str | None = '',
    captcha_txn_id: str | None = '',
    option: str = 'UID',
    resend: bool = False,
    captcha_bypass: bool | None = None,
) -> dict[str, Any]:
    """OTP generate — dob:null + optional captcha:null bypass."""
    from captcha_solver import apply_captcha_bypass_fields, captcha_bypass_enabled

    payload: dict[str, Any] = {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': normalize_name(name),
        'option': option if option in ('UID', 'EID') else 'UID',
        'otp': None,
        'otpTxnId': None,
        'resendOtp': resend,
    }
    force = captcha_bypass if captcha_bypass is not None else captcha_bypass_enabled()
    return apply_captcha_bypass_fields(
        payload,
        captcha=captcha,
        captcha_txn_id=captcha_txn_id,
        force_bypass=force and not (captcha or '').strip(),
    )


def build_download_otp_payload(
    *,
    uid: str,
    captcha: str | None = '',
    captcha_txn_id: str | None = '',
    captcha_bypass: bool | None = None,
) -> dict[str, Any]:
    """Phase 2 — e-Aadhaar download OTP (dob not required)."""
    from captcha_solver import apply_captcha_bypass_fields, captcha_bypass_enabled

    payload: dict[str, Any] = {
        'uid': uid.strip(),
        'otp': None,
        'otpTxnId': None,
    }
    force = captcha_bypass if captcha_bypass is not None else captcha_bypass_enabled()
    return apply_captcha_bypass_fields(
        payload,
        captcha=captcha,
        captcha_txn_id=captcha_txn_id,
        force_bypass=force and not (captcha or '').strip(),
    )


def build_download_pdf_payload(
    *,
    uid: str,
    captcha: str,
    captcha_txn_id: str,
    otp: str,
    otp_txn_id: str,
) -> dict[str, Any]:
    return {
        'uid': uid.strip(),
        'captcha': captcha.strip().lower(),
        'captchaTxnId': captcha_txn_id.strip(),
        'otp': otp.strip(),
        'otpTxnId': otp_txn_id.strip(),
    }


def build_retrieve_payload(
    *,
    name: str,
    mobile: str,
    captcha: str | None = '',
    captcha_txn_id: str | None = '',
    otp: str,
    otp_txn_id: str,
    option: str = 'UID',
    captcha_bypass: bool | None = None,
) -> dict[str, Any]:
    from captcha_solver import apply_captcha_bypass_fields, captcha_bypass_enabled

    payload: dict[str, Any] = {
        'mobileNumber': mobile.strip(),
        'dob': None,
        'email': None,
        'name': normalize_name(name),
        'option': option if option in ('UID', 'EID') else 'UID',
        'otp': otp.strip(),
        'otpTxnId': otp_txn_id.strip(),
        'resendOtp': False,
    }
    force = captcha_bypass if captcha_bypass is not None else captcha_bypass_enabled()
    return apply_captcha_bypass_fields(
        payload,
        captcha=captcha,
        captcha_txn_id=captcha_txn_id,
        force_bypass=force and not (captcha or '').strip(),
    )


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


def _deep_get(obj: Any, *keys: str) -> Any:
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def extract_otp_txn_id(data: dict[str, Any]) -> str | None:
    """OTP send success response se otpTxnId nikaalo."""
    candidates = [
        data.get('otpTxnId'),
        data.get('otpTxnID'),
        data.get('otpTransactionId'),
        _deep_get(data, 'data', 'otpTxnId'),
        _deep_get(data, 'response', 'otpTxnId'),
        _deep_get(data, 'responseData', 'otpTxnId'),
        _deep_get(data, 'result', 'otpTxnId'),
    ]
    for c in candidates:
        if c and str(c).strip():
            return str(c).strip()
    return None


def extract_aadhaar_number(data: dict[str, Any]) -> str | None:
    """Full 12-digit UID from API JSON if present."""
    if not isinstance(data, dict):
        return None
    for key in (
        'uid', 'UID', 'aadhaarNumber', 'aadhaarNo', 'aadhaar',
        'maskedAadhaar', 'aadhaarNumberMasked',
    ):
        val = data.get(key)
        if not val:
            continue
        digits = re.sub(r'\D', '', str(val))
        if len(digits) == 12:
            return digits
    for nested_key in ('data', 'response', 'responseData', 'result', 'aadhaarResponse'):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            found = extract_aadhaar_number(nested)
            if found:
                return found
    return None


def extract_aadhaar_hint(data: dict[str, Any]) -> str | None:
    """Retrieve response se UID/EID hint (masked) agar mile."""
    for key in (
        'uid', 'UID', 'aadhaar', 'aadhaarNumber', 'aadhaarNo',
        'eid', 'EID', 'enrolmentId', 'enrolmentNumber', 'maskedAadhaar',
    ):
        val = data.get(key)
        if val and str(val).strip():
            return f'{key}: {str(val).strip()[:20]}'
    nested = data.get('data') or data.get('response') or data.get('responseData')
    if isinstance(nested, dict):
        return extract_aadhaar_hint(nested)
    return None


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

    otp_txn = extract_otp_txn_id(j)
    if otp_txn:
        extra['otpTxnId'] = otp_txn
    if j.get('transactionId'):
        extra['transactionId'] = j['transactionId']

    hint = extract_aadhaar_hint(j)
    if hint:
        extra['aadhaar_hint'] = hint

    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'timed?\s*out|refresh the captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'captcha_expired'}
    if re.search(r'invalid.*otp|incorrect.*otp|otp.*expired|otp.*mismatch', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_otp'}
    if re.search(
        r'aadhaar.*sent|uid.*sent|eid.*sent|enrolment.*sent|sent to.*mobile|sent to your',
        msg_s,
        re.I,
    ):
        return True, msg_s, {**extra, 'reason': 'retrieve_ok'}
    if j.get('errorCode') and not re.search(r'otp.*sent|success|sent to', msg_s, re.I):
        return False, msg_s, extra
    if re.search(r'otp.*sent|success', msg_s, re.I):
        return True, msg_s, {**extra, 'reason': 'otp_sent'}
    return 200 <= status < 300, msg_s, extra


def parse_download_response(status: int, text: str) -> tuple[bool, str, dict[str, Any]]:
    """Download OTP / PDF API responses."""
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

    otp_txn = extract_otp_txn_id(j)
    if otp_txn:
        extra['otpTxnId'] = otp_txn

    for key in (
        'eAadhaar', 'eaadhaar', 'pdf', 'pdfData', 'aadhaarPdf',
        'base64', 'file', 'data',
    ):
        val = j.get(key)
        if isinstance(val, str) and len(val) > 200:
            extra['pdf_b64'] = val
            break
        if isinstance(val, dict):
            for sub in ('eAadhaar', 'pdf', 'base64', 'content'):
                sub_val = val.get(sub)
                if isinstance(sub_val, str) and len(sub_val) > 200:
                    extra['pdf_b64'] = sub_val
                    break

    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'invalid.*otp|incorrect.*otp|otp.*expired', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_otp'}
    if extra.get('pdf_b64'):
        return True, msg_s, {**extra, 'reason': 'pdf_ok'}
    if re.search(r'otp.*sent|sent to.*mobile|success', msg_s, re.I):
        return True, msg_s, {**extra, 'reason': 'download_otp_sent'}
    if j.get('errorCode') and not re.search(r'success|sent', msg_s, re.I):
        return False, msg_s, extra
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
