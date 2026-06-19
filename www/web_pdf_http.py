"""HTTP-only PDF flow — no Playwright, no Selenium, no browser_session."""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from aadhar import AadharSession, dob_bypass_on, pdf_password, run_aadhar, run_aadhar_retry
from pdf_unlock import build_pdf_password_candidates, unlock_eaadhaar_pdf
from uidai_api import is_skip_name, normalize_dob, normalize_name

log = logging.getLogger('web-pdf-http')

_CAPTCHA_MIN_BYTES = 80
DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
SESSION_TTL_SEC = max(60, int(os.getenv('FLOW_IDLE_SEC', '300')))
_HTTP_RETRIES = max(2, int(os.getenv('HTTP_CAPTCHA_RETRIES', '4')))


def _captcha_prime_ok(sess: AadharSession) -> bool:
    return bool(sess.captcha_txn_id and len(sess.last_captcha_image or b'') >= _CAPTCHA_MIN_BYTES)


async def _prime_http(sess: AadharSession, phase: str) -> bool:
    tag = (phase or 'phase1').split('-')[0]
    for attempt in range(1, _HTTP_RETRIES + 1):
        ok = await run_aadhar(sess.prime_http_captcha, tag)
        if ok and _captcha_prime_ok(sess):
            return True
        if attempt < _HTTP_RETRIES:
            await asyncio.sleep(0.5 * attempt)
    return False


async def prime_pdf_captcha(sess: AadharSession, _slot: int, phase: str) -> bool:
    phase_key = (phase or 'phase1').lower()
    refresh = 'refresh' in phase_key
    if refresh:
        sess.clear_browser_captcha()
    if phase_key.startswith('phase2') and not sess.eid:
        return False
    if phase_key.startswith('phase1') and not sess.phase1_headers:
        sess.phase1_headers = {}  # prime_http_captcha creates headers
    if phase_key.startswith('phase2'):
        sess._ensure_phase2_headers()
    return await _prime_http(sess, phase_key)


async def run_pdf_step(
    sess: AadharSession,
    slot: int,
    fn,
    *args,
    phase: str = 'phase1',
    prime: bool = True,
    **kwargs,
) -> dict[str, Any]:
    phase_key = (phase or 'phase1').lower()
    if not prime and phase_key.startswith('phase2') and sess.captcha_is_stale():
        if await prime_pdf_captcha(sess, slot, f'{phase}-refresh'):
            return {
                'otp_ok': False,
                'needs_captcha': True,
                'invalid_captcha': True,
                'captcha_expired': True,
                'msg': 'Captcha expire ho gaya — naya image bharo',
            }
    if prime:
        if not await prime_pdf_captcha(sess, slot, phase):
            return {
                'otp_ok': False,
                'captcha_fetch_failed': True,
                'msg': 'HTTP captcha load fail — UIDAI_PROXY check karo',
            }
    result = await run_aadhar_retry(fn, *args, **kwargs)
    if result.get('needs_browser_captcha') or (
        result.get('needs_captcha') and not result.get('otp_ok') and not _captcha_prime_ok(sess)
    ):
        if await prime_pdf_captcha(sess, slot, f'{phase}-refresh'):
            result = {
                **result,
                'image_png': sess.last_captcha_image,
                'captcha_txn_id': sess.captcha_txn_id,
                'needs_captcha': True,
                'needs_browser_captcha': False,
                'captcha_fetch_failed': False,
            }
        else:
            result['captcha_fetch_failed'] = True
            result['msg'] = result.get('msg') or 'Captcha refresh fail — proxy try karo'
    return result


def unlock_pdf_for_web(
    pdf_bytes: bytes,
    sess: AadharSession,
    *,
    form_name: str = '',
    form_dob: str | None = None,
) -> tuple[bytes, str | None, str]:
    ident = sess.resolved_identity(env_name=DEFAULT_NAME)
    name = ident['name'] or form_name or sess.name
    dob = ident.get('dob') or form_dob or sess.dob_raw
    name_list = [sess.aadhaar_name, name, form_name, DEFAULT_NAME, sess.name]
    passwords = build_pdf_password_candidates(name_list, dob)
    unlocked, used_pwd = unlock_eaadhaar_pdf(pdf_bytes, passwords)
    if unlocked:
        return unlocked, used_pwd, 'unlocked'
    return pdf_bytes, None, 'locked'


@dataclass
class WebPdfSession:
    id: str
    slot: int
    aadhar: AadharSession
    step: str = 'form'
    name: str = ''
    mobile: str = ''
    dob: str | None = None
    pdf_password_hint: str = ''
    pdf_bytes: bytes = field(default_factory=bytes)
    unlocked_pdf: bytes = field(default_factory=bytes)
    pdf_password: str | None = None
    eid: str = ''
    logs: list[str] = field(default_factory=list)
    message: str = ''
    created_at: float = field(default_factory=time.monotonic)
    updated_at: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.updated_at = time.monotonic()

    def expired(self) -> bool:
        return (time.monotonic() - self.updated_at) > SESSION_TTL_SEC

    def append_logs(self, lines: list[str]) -> None:
        for line in lines:
            t = (line or '').strip()
            if t:
                self.logs.append(t)


class WebSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, WebPdfSession] = {}

    def create(self, name: str, mobile: str, dob: str | None) -> WebPdfSession:
        sid = str(uuid.uuid4())
        sess = AadharSession(on_log=lambda m: None)
        row = WebPdfSession(
            id=sid,
            slot=hash(sid) & 0x7FFFFFFF,
            aadhar=sess,
            name=normalize_name(name),
            mobile=mobile.strip(),
            dob=dob,
        )
        self._sessions[sid] = row
        return row

    def get(self, session_id: str) -> WebPdfSession | None:
        row = self._sessions.get(session_id)
        if not row:
            return None
        if row.expired():
            self.remove(session_id)
            return None
        row.touch()
        return row

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


STORE = WebSessionStore()


async def warm_web_pool() -> None:
    """No browser pool — HTTP only."""
    log.info('HTTP-only engine — no Playwright pool')


async def start_pdf_flow(name: str, mobile: str, dob: str | None) -> WebPdfSession:
    dob_norm = normalize_dob(dob) if dob else None
    if not dob_bypass_on() and not dob_norm:
        raise ValueError('DOB zaroori hai — DD/MM/YYYY format mein bhejo')

    row = STORE.create(name, mobile, dob_norm or dob)
    await run_aadhar(row.aadhar.setup, row.name, row.mobile, dob_norm or dob)
    row.pdf_password_hint = pdf_password(
        row.name if not is_skip_name(row.name) else DEFAULT_NAME,
        dob_norm or dob,
    )

    result = await run_pdf_step(row.aadhar, row.slot, row.aadhar.phase1_start, phase='phase1')
    row.append_logs(result.get('logs') or [])

    if result.get('otp_ok'):
        row.step = 'otp1'
        row.message = 'OTP 1 SMS mein aaya — yahan daalo'
        return row

    if result.get('captcha_fetch_failed'):
        STORE.remove(row.id)
        raise RuntimeError(result.get('msg') or 'Captcha load fail')

    if result.get('needs_captcha') and _captcha_prime_ok(row.aadhar):
        row.step = 'captcha1'
        row.message = 'Captcha image dekho aur 4–8 characters type karo'
        return row

    STORE.remove(row.id)
    raise RuntimeError(result.get('msg') or 'Phase 1 start fail')


async def submit_captcha1(session_id: str, captcha: str) -> WebPdfSession:
    row = STORE.get(session_id)
    if not row:
        raise LookupError('Session expire — dubara start karo')
    if row.step not in ('captcha1', 'otp1'):
        raise ValueError(f'Galat step — abhi {row.step} chal raha hai')

    result = await run_pdf_step(
        row.aadhar, row.slot, row.aadhar.phase1_otp_manual, captcha,
        phase='phase1', prime=False,
    )
    row.append_logs(result.get('logs') or [])

    if result.get('otp_ok'):
        row.step = 'otp1'
        row.message = 'OTP 1 SMS mein aaya — yahan daalo'
        return row

    if result.get('invalid_captcha') or result.get('needs_captcha'):
        if result.get('captcha_expired') or not _captcha_prime_ok(row.aadhar):
            if not await prime_pdf_captcha(row.aadhar, row.slot, 'phase1-refresh'):
                raise RuntimeError('Naya captcha load nahi hua — UIDAI_PROXY check karo')
        row.step = 'captcha1'
        row.message = result.get('msg') or 'Galat captcha — naya image try karo'
        return row

    if result.get('network_error'):
        row.step = 'captcha1'
        row.message = result.get('msg') or 'Network error — captcha dubara bhejo'
        return row

    raise RuntimeError(result.get('msg') or 'Captcha submit fail')


async def submit_otp1(session_id: str, otp: str) -> WebPdfSession:
    row = STORE.get(session_id)
    if not row:
        raise LookupError('Session expire — dubara start karo')
    if row.step != 'otp1':
        raise ValueError(f'Galat step — abhi {row.step} chal raha hai')

    result = await run_aadhar_retry(row.aadhar.phase1_verify, otp)
    row.append_logs(result.get('logs') or [])

    if not result.get('retrieve_ok'):
        if result.get('network_error'):
            row.message = result.get('msg') or 'Network error — OTP 1 dubara bhejo'
            return row
        raise RuntimeError(result.get('msg') or 'OTP 1 verify fail')

    row.eid = str(result.get('eid') or row.aadhar.eid or '')
    resolved_name = result.get('aadhaar_name') or row.aadhar.aadhaar_name
    if resolved_name and not is_skip_name(resolved_name):
        row.pdf_password_hint = pdf_password(
            resolved_name, result.get('aadhaar_dob') or row.dob,
        )

    result2 = await run_pdf_step(row.aadhar, row.slot, row.aadhar.phase2_start, phase='phase2')
    row.append_logs(result2.get('logs') or [])

    if result2.get('otp_ok'):
        row.step = 'otp2'
        row.message = 'OTP 2 SMS mein aaya — yahan daalo'
        return row

    if result2.get('captcha_fetch_failed'):
        raise RuntimeError(result2.get('msg') or 'Phase 2 captcha fail')

    if result2.get('needs_captcha') and _captcha_prime_ok(row.aadhar):
        row.step = 'captcha2'
        row.message = 'Phase 2 captcha — image dekho aur type karo'
        return row

    raise RuntimeError(result2.get('msg') or 'Phase 2 start fail')


async def submit_captcha2(session_id: str, captcha: str) -> WebPdfSession:
    row = STORE.get(session_id)
    if not row:
        raise LookupError('Session expire — dubara start karo')
    if row.step not in ('captcha2', 'otp2'):
        raise ValueError(f'Galat step — abhi {row.step} chal raha hai')

    result = await run_pdf_step(
        row.aadhar, row.slot, row.aadhar.phase2_otp_manual, captcha,
        phase='phase2', prime=False,
    )
    row.append_logs(result.get('logs') or [])

    if result.get('otp_ok'):
        row.step = 'otp2'
        row.message = 'OTP 2 SMS mein aaya — yahan daalo'
        return row

    if result.get('invalid_captcha') or result.get('needs_captcha'):
        if result.get('captcha_expired') or not _captcha_prime_ok(row.aadhar):
            if not await prime_pdf_captcha(row.aadhar, row.slot, 'phase2-refresh'):
                raise RuntimeError('Naya captcha load nahi hua')
        row.step = 'captcha2'
        row.message = result.get('msg') or 'Galat captcha — naya image try karo'
        return row

    if result.get('network_error'):
        row.step = 'captcha2'
        row.message = result.get('msg') or 'Network error — captcha dubara bhejo'
        return row

    raise RuntimeError(result.get('msg') or 'Phase 2 captcha fail')


async def submit_otp2(session_id: str, otp: str) -> WebPdfSession:
    row = STORE.get(session_id)
    if not row:
        raise LookupError('Session expire — dubara start karo')
    if row.step != 'otp2':
        raise ValueError(f'Galat step — abhi {row.step} chal raha hai')

    result = await run_aadhar_retry(row.aadhar.phase2_download, otp)
    row.append_logs(result.get('logs') or [])

    if not result.get('download_ok'):
        if result.get('network_error'):
            row.message = result.get('msg') or 'Network error — OTP 2 dubara bhejo'
            return row
        raise RuntimeError(result.get('msg') or 'PDF download fail')

    pdf = result.get('pdf_bytes') or b''
    if not pdf:
        raise RuntimeError('PDF empty aaya')

    unlocked, pwd, status = unlock_pdf_for_web(
        pdf, row.aadhar, form_name=row.name, form_dob=row.dob,
    )
    row.pdf_bytes = pdf
    row.unlocked_pdf = unlocked
    row.pdf_password = pwd
    row.step = 'done'
    row.message = (
        f'PDF ready — password: {pwd}'
        if status == 'unlocked' and pwd
        else 'PDF ready (locked) — download karo'
    )
    return row


async def refresh_captcha(session_id: str) -> WebPdfSession:
    row = STORE.get(session_id)
    if not row:
        raise LookupError('Session expire — dubara start karo')

    phase = 'phase1-refresh' if row.step in ('captcha1', 'otp1') else 'phase2-refresh'
    if row.step not in ('captcha1', 'captcha2', 'otp1', 'otp2'):
        raise ValueError('Is step pe captcha refresh nahi hota')

    ok = await prime_pdf_captcha(row.aadhar, row.slot, phase)
    if not ok:
        raise RuntimeError('Captcha refresh fail — Indian proxy zaroori ho sakta hai')
    row.message = 'Naya captcha load ho gaya'
    return row
