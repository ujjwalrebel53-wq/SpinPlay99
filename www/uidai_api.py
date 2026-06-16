"""UIDAI retrieve API — Python-first, no browser extension."""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

BOT_ENGINE_VERSION = '2.21.3'


def captcha_max_age_sec() -> float:
    """UIDAI captcha txn TTL — refresh before submit if older."""
    return max(15.0, float(os.getenv('UIDAI_CAPTCHA_MAX_AGE', '180')))


def uidai_fast() -> bool:
    """Fast path — HTTP-first captcha, tight timeouts, debounced UI (default ON)."""
    return os.getenv('UIDAI_FAST', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def uidai_instant_form() -> bool:
    """24/7 preloaded pool + instant name/mobile fill (default ON)."""
    return os.getenv('UIDAI_INSTANT_FORM', '1').strip().lower() in ('1', 'true', 'yes', 'on')

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

# Name optional — placeholder like DOB (UIDAI verifies via mobile OTP)
PLACEHOLDER_NAME = 'Mr'
SKIP_NAME_TOKENS = frozenset({
    'mr', 'mister', 'skip', 'unknown', 'unk', 'na', 'n/a', 'no', 'none', '?', '-', 'x', 'naam',
})


def is_skip_name(name: str) -> bool:
    t = (name or '').strip().lower().rstrip('.')
    return not t or t in SKIP_NAME_TOKENS


def normalize_name(name: str) -> str:
    """Real name or placeholder Mr — for API and form."""
    if is_skip_name(name):
        return PLACEHOLDER_NAME
    return ' '.join(str(name).split()).upper()


def new_request_id() -> str:
    return str(uuid.uuid4())


DOB_RE = re.compile(r'^(\d{2})/(\d{2})/(\d{4})$')

SCRIPT_USER_AGENT = (
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
)


def normalize_dob(dob: str | None) -> str | None:
    """DD/MM/YYYY — script-aligned; None when bypass."""
    if not dob or not str(dob).strip():
        return None
    m = DOB_RE.match(str(dob).strip())
    if not m:
        return None
    return f'{m.group(1)}/{m.group(2)}/{m.group(3)}'


def dob_bypass_enabled() -> bool:
    import os

    return os.getenv('UIDAI_DOB_BYPASS', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def resolve_dob(dob: str | None) -> str | None:
    if dob_bypass_enabled():
        return None
    return normalize_dob(dob)


def generate_pdf_password(name: str, dob: str | None) -> str:
    """First 4 name chars UPPERCASE + birth year (UIDAI PDF default)."""
    name_clean = re.sub(r'\s+', '', (name or '').strip())
    first_4 = name_clean[:4].upper()
    if len(first_4) < 4:
        first_4 = first_4 + ('A' * (4 - len(first_4)))
    year = ''
    if dob and DOB_RE.match(dob.strip()):
        year = dob.strip().split('/')[-1]
    return first_4 + year if year else first_4


def build_audio_captcha_payload() -> dict[str, Any]:
    return {
        'captchaLength': '6',
        'captchaType': '2',
        'audioCaptchaRequired': True,
    }


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


def build_eid_otp_payload(
    *,
    name: str,
    mobile: str,
    dob: str | None,
    captcha: str,
    captcha_txn_id: str,
    option: str = 'EID',
    resend: bool = False,
) -> dict[str, Any]:
    """Phase 1 OTP — script payload (real DOB when provided)."""
    return {
        'mobileNumber': mobile.strip(),
        'dob': resolve_dob(dob),
        'email': None,
        'name': normalize_name(name),
        'option': option if option in ('UID', 'EID') else 'EID',
        'otp': None,
        'otpTxnId': None,
        'captchaTxnId': captcha_txn_id.strip(),
        'captcha': captcha.strip().lower(),
        'resendOtp': resend,
    }


def build_eid_verify_payload(
    *,
    name: str,
    mobile: str,
    dob: str | None,
    captcha: str,
    captcha_txn_id: str,
    otp: str,
    otp_txn_id: str,
    option: str = 'EID',
) -> dict[str, Any]:
    return {
        'mobileNumber': mobile.strip(),
        'email': None,
        'dob': resolve_dob(dob),
        'name': normalize_name(name),
        'option': option if option in ('UID', 'EID') else 'EID',
        'otp': otp.strip(),
        'otpTxnId': otp_txn_id.strip(),
        'captchaTxnId': captcha_txn_id.strip(),
        'captcha': captcha.strip().lower(),
        'resendOtp': False,
    }


def build_eid_download_otp_payload(
    *,
    eid: str,
    captcha: str,
    captcha_txn_id: str,
    transaction_id: str,
    resend: bool = False,
) -> dict[str, Any]:
    """Phase 2 download OTP — eidNumber + captchaValue."""
    return {
        'eidNumber': eid.strip(),
        'idType': 'eid',
        'captchaTxnId': captcha_txn_id.strip(),
        'captchaValue': captcha.strip().lower(),
        'transactionId': transaction_id.strip(),
        'resendOTP': resend,
    }


def build_eid_download_pdf_payload(
    *,
    eid: str,
    otp: str,
    otp_txn_id: str,
    mask: bool = False,
) -> dict[str, Any]:
    return {
        'eid': eid.strip(),
        'mask': mask,
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


def get_header(req_id: str) -> dict[str, str]:
    """UIDAI API headers — script-aligned transactionId + X-Request-ID."""
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


def uidai_headers(request_id: str | None = None) -> dict[str, str]:
    return get_header(request_id or new_request_id())


def _deep_get(obj: Any, *keys: str) -> Any:
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def extract_otp_txn_id(data: dict[str, Any]) -> str | None:
    """Extract otpTxnId from OTP send success response."""
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


def extract_eid_number(data: dict[str, Any]) -> str | None:
    """28-digit enrolment ID from responseData.eidNumber."""
    if not isinstance(data, dict):
        return None
    for key in ('eidNumber', 'eid', 'EID', 'enrolmentId', 'enrolmentNumber'):
        val = data.get(key)
        if val and str(val).strip():
            digits = re.sub(r'\D', '', str(val))
            if len(digits) >= 14:
                return digits
    for nested_key in ('data', 'response', 'responseData', 'result'):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            found = extract_eid_number(nested)
            if found:
                return found
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
    """Extract UID/EID hint (masked) from retrieve response if present."""
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
    eid_num = extract_eid_number(j)
    if eid_num:
        extra['eidNumber'] = eid_num
    try:
        from pdf_unlock import extract_resident_profile

        profile = extract_resident_profile(j)
        if profile.get('name'):
            extra['resident_name'] = profile['name']
        if profile.get('dob'):
            extra['resident_dob'] = profile['dob']
    except Exception:
        pass
    if str(j.get('status', '')).lower() == 'success' and eid_num:
        return True, msg_s or 'EID retrieved', {**extra, 'reason': 'retrieve_ok'}
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

    otp_txn = extract_otp_txn_id(j) or j.get('txnId')
    if otp_txn:
        extra['otpTxnId'] = str(otp_txn).strip()

    nested_data = j.get('data')
    if isinstance(nested_data, dict):
        pdf_val = nested_data.get('aadhaarPdf')
        if isinstance(pdf_val, str) and len(pdf_val) > 200:
            extra['pdf_b64'] = pdf_val
        try:
            from pdf_unlock import extract_resident_profile

            profile = extract_resident_profile(nested_data)
            if profile.get('name'):
                extra['resident_name'] = profile['name']
            if profile.get('dob'):
                extra['resident_dob'] = profile['dob']
        except Exception:
            pass

    if not extra.get('pdf_b64'):
        for key in (
            'eAadhaar', 'eaadhaar', 'pdf', 'pdfData', 'aadhaarPdf',
            'base64', 'file', 'data',
        ):
            val = j.get(key)
            if isinstance(val, str) and len(val) > 200:
                extra['pdf_b64'] = val
                break
            if isinstance(val, dict):
                for sub in ('eAadhaar', 'pdf', 'base64', 'content', 'aadhaarPdf'):
                    sub_val = val.get(sub)
                    if isinstance(sub_val, str) and len(sub_val) > 200:
                        extra['pdf_b64'] = sub_val
                        break

    if str(j.get('status', '')).lower() == 'success' and extra.get('pdf_b64'):
        return True, msg_s or 'PDF ready', {**extra, 'reason': 'pdf_ok'}

    if re.search(r'invalid.*captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'invalid_captcha'}
    if re.search(r'timed?\s*out|refresh the captcha', msg_s, re.I):
        return False, msg_s, {**extra, 'reason': 'captcha_expired'}
    code = str(j.get('errorCode') or '').upper()
    if 'VCS_INF' in code:
        return False, msg_s, {**extra, 'reason': 'captcha_expired'}
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
    return '\n'.join(lines) or 'No logs'
