"""Web PDF flow — same engine as Telegram /pdf, no Telegram dependency."""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from aadhar import AadharSession, dob_bypass_on, pdf_password, run_aadhar, run_aadhar_retry
from browser_session import (
    UidaiBrowserSession,
    capture_phase2_captcha_on_pool,
    ensure_pool_warm,
    fresh_retrieve_captcha,
    pool_form_ready,
    schedule_pool_captcha_prime,
)
from pdf_unlock import build_pdf_password_candidates, unlock_eaadhaar_pdf
from uidai_api import is_skip_name, normalize_dob, normalize_name, uidai_fast

log = logging.getLogger('web-pdf')

_CAPTCHA_MIN_BYTES = 500
_PREFETCH_TASKS: dict[int, asyncio.Task] = {}
DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
SESSION_TTL_SEC = max(60, int(os.getenv('FLOW_IDLE_SEC', '180')))


def _pdf_captcha_mode() -> str:
    mode = os.getenv('UIDAI_PDF_CAPTCHA', '').strip().lower()
    if not mode:
        return 'auto' if uidai_fast() else 'browser'
    return mode


def _captcha_prime_ok(sess: AadharSession) -> bool:
    return bool(sess.captcha_txn_id and len(sess.last_captcha_image or b'') >= _CAPTCHA_MIN_BYTES)


def _slot_from_id(session_id: str) -> int:
    return hash(session_id) & 0x7FFFFFFF


async def _pdf_browser_session(slot: int, *, pool: str = 'eid') -> UidaiBrowserSession:
    return UidaiBrowserSession(pool=pool)


async def _try_http_captcha_prime(sess: AadharSession, phase: str) -> bool:
    tag = (phase or 'phase1').split('-')[0]
    return await run_aadhar(sess.prime_http_captcha, tag)


async def _prefetch_phase2_pool(sess: AadharSession) -> bool:
    if not sess.eid:
        return False
    try:
        png, txn = await capture_phase2_captcha_on_pool(sess.eid)
        sess.prime_browser_captcha(png, txn)
        sess.stash_phase2_captcha()
        return _captcha_prime_ok(sess)
    except Exception as e:
        log.warning('phase2 prefetch pool captcha: %s', e)
        return False


async def _prefetch_phase2_captcha(sess: AadharSession) -> bool:
    if sess.apply_phase2_captcha_stash() and _captcha_prime_ok(sess):
        return True
    if not sess.eid:
        return False
    return await _prefetch_phase2_pool(sess)


async def _await_phase2_prefetch(sess: AadharSession, *, timeout: float = 2.0) -> bool:
    task = _PREFETCH_TASKS.pop(id(sess), None)
    if task is None:
        return False
    try:
        return bool(await asyncio.wait_for(task, timeout=timeout))
    except (asyncio.TimeoutError, asyncio.CancelledError):
        return False
    except Exception:
        return False


async def _prime_pdf_phase1_open(
    sess: AadharSession,
    slot: int,
    *,
    refresh: bool = False,
) -> bool:
    if not refresh:
        hit = await fresh_retrieve_captcha(sess.name, sess.mobile, pool='eid')
        if hit:
            sess.prime_browser_captcha(hit[0], hit[1])
            return True
    browser = await _pdf_browser_session(slot, pool='eid')
    browser.name = sess.name
    browser.mobile = sess.mobile
    for attempt in range(3):
        try:
            await browser.start()
            if not await browser.page_alive():
                await browser.start()
            await browser._fill_fields_only_fast()
            png = await browser.refresh_captcha()
            txn = browser.captcha_txn_id or browser._captcha_cache_txn
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                return True
        except Exception as e:
            log.warning('web pdf phase1 captcha attempt %s: %s', attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(0.6)
    return False


async def _prime_pdf_phase2_fast(
    sess: AadharSession,
    slot: int,
    *,
    refresh: bool = False,
) -> bool:
    if not sess.eid:
        return False
    if refresh:
        sess.clear_browser_captcha()
        sess.clear_phase2_stash()
    elif (
        sess.apply_phase2_captcha_stash()
        and _captcha_prime_ok(sess)
        and not sess.captcha_is_stale()
    ):
        return True
    if not refresh and pool_form_ready('pdf'):
        try:
            png, txn = await capture_phase2_captcha_on_pool(sess.eid)
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                sess.stash_phase2_captcha()
                return True
        except Exception as e:
            log.warning('web pdf phase2 pool fast: %s', e)
    sess._ensure_phase2_headers()
    if not refresh and uidai_fast() and await _try_http_captcha_prime(sess, 'phase2'):
        sess.stash_phase2_captcha()
        if _captcha_prime_ok(sess):
            return True
    browser = await _pdf_browser_session(slot, pool='pdf')
    for attempt in range(2):
        try:
            png, txn = await browser.fetch_download_captcha(sess.eid)
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                sess.stash_phase2_captcha()
                return True
        except Exception as e:
            log.warning('web pdf phase2 browser fallback attempt %s: %s', attempt + 1, e)
            if attempt < 1:
                await asyncio.sleep(0.4)
    return False


async def prime_pdf_captcha(
    sess: AadharSession,
    slot: int,
    phase: str,
) -> bool:
    mode = _pdf_captcha_mode()
    phase_key = (phase or 'phase1').lower()
    refresh = 'refresh' in phase_key

    if phase_key.startswith('phase1'):
        if mode in ('auto', 'browser', ''):
            if await _prime_pdf_phase1_open(sess, slot, refresh=refresh):
                return True
        if mode == 'http':
            return await _try_http_captcha_prime(sess, phase)
        if mode == 'auto':
            return await _try_http_captcha_prime(sess, phase)
        return False

    if phase_key.startswith('phase2'):
        await _await_phase2_prefetch(sess, timeout=2.0)
        return await _prime_pdf_phase2_fast(sess, slot, refresh=refresh)

    return False


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
        refresh = f'{phase}-refresh'
        if await prime_pdf_captcha(sess, slot, refresh):
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
                'msg': 'Captcha load nahi hua — dubara try karo',
            }
    result = await run_aadhar_retry(fn, *args, **kwargs)
    if result.get('needs_browser_captcha'):
        refresh = f'{phase}-refresh'
        if await prime_pdf_captcha(sess, slot, refresh):
            result = {
                **result,
                'image_png': sess.last_captcha_image,
                'captcha_txn_id': sess.captcha_txn_id,
                'needs_captcha': True,
            }
        else:
            result['captcha_fetch_failed'] = True
            result['msg'] = result.get('msg') or 'Captcha refresh fail'
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
    name_list = [
        sess.aadhaar_name,
        name,
        form_name,
        DEFAULT_NAME,
        sess.name,
    ]
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
            slot=_slot_from_id(sid),
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
        row = self._sessions.pop(session_id, None)
        if not row:
            return
        task = _PREFETCH_TASKS.pop(id(row.aadhar), None)
        if task and not task.done():
            task.cancel()


STORE = WebSessionStore()


async def warm_web_pool() -> None:
    try:
        await ensure_pool_warm()
        schedule_pool_captcha_prime()
    except Exception as e:
        log.warning('web pool warm: %s', e)


async def start_pdf_flow(name: str, mobile: str, dob: str | None) -> WebPdfSession:
    await warm_web_pool()
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
        row.aadhar,
        row.slot,
        row.aadhar.phase1_otp_manual,
        captcha,
        phase='phase1',
        prime=False,
    )
    row.append_logs(result.get('logs') or [])

    if result.get('otp_ok'):
        row.step = 'otp1'
        row.message = 'OTP 1 SMS mein aaya — yahan daalo'
        return row

    if result.get('invalid_captcha') or result.get('needs_captcha'):
        if result.get('captcha_expired') or not _captcha_prime_ok(row.aadhar):
            if not await prime_pdf_captcha(row.aadhar, row.slot, 'phase1-refresh'):
                raise RuntimeError('Naya captcha load nahi hua')
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
            resolved_name,
            result.get('aadhaar_dob') or row.dob,
        )

    old_prefetch = _PREFETCH_TASKS.pop(id(row.aadhar), None)
    if old_prefetch and not old_prefetch.done():
        old_prefetch.cancel()
    _PREFETCH_TASKS[id(row.aadhar)] = asyncio.create_task(
        _prefetch_phase2_captcha(row.aadhar),
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
        row.aadhar,
        row.slot,
        row.aadhar.phase2_otp_manual,
        captcha,
        phase='phase2',
        prime=False,
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
        pdf,
        row.aadhar,
        form_name=row.name,
        form_dob=row.dob,
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
        raise RuntimeError('Captcha refresh fail')
    row.message = 'Naya captcha load ho gaya'
    return row
