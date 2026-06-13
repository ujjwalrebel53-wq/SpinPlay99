#!/usr/bin/env python3
"""
Rebel Aadhaar — classic /open SMS retrieve (v2.5 flow).

/open — captcha → OTP → Aadhaar SMS.
/pdf — 2-OTP e-Aadhaar PDF download.
Direct Indian VPS only — no proxy, no cookies.

Usage:
  python sex.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from telegram import BotCommand, Update
from telegram.error import Conflict
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv(Path(__file__).parent / '.env')

from bot_access import AccessControl
from bot_ui_classic import (
    LoadingScreen,
    create_loading_screen,
    dismiss_loading_screen,
    get_loading_screen,
    get_or_create_loading_screen,
    uidai_user_message,
)
from browser_session import (
    KEEPALIVE_INTERVAL_SEC,
    UidaiBrowserSession,
    capture_phase2_captcha_on_pool,
    ensure_pool_warm,
    instant_pool_captcha,
    instant_retrieve_captcha,
    get_standby_captcha_pair,
    pool_form_ready,
    pool_is_warm,
    pool_slot_ready,
    prefill_standby_name,
    refresh_standby_captcha,
)
from aadhar import (
    AADHAR_SESSIONS,
    AadharSession,
    clear_aadhar_session,
    dob_bypass_on,
    get_aadhar_session,
    pdf_password,
    run_aadhar,
    run_aadhar_retry,
)
from pdf_unlock import build_pdf_password_candidates, unlock_eaadhaar_pdf
from uidai_api import is_skip_name
from uidai_api import (
    BOT_ENGINE_VERSION,
    DOB_RE,
    PLACEHOLDER_NAME,
    is_skip_name,
    normalize_dob,
    normalize_name,
    uidai_fast,
    uidai_instant_form,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('sex-bot')

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
ALLOWED = {
    x.strip()
    for x in os.getenv('TELEGRAM_ALLOWED_CHAT_IDS', '').split(',')
    if x.strip()
}
OWNER_ID = os.getenv('TELEGRAM_OWNER_ID', '8432393497').strip()
if not OWNER_ID and len(ALLOWED) == 1:
    OWNER_ID = next(iter(ALLOWED))
ACCESS = AccessControl(OWNER_ID, ALLOWED)
DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
WWW_DIR = Path(__file__).parent
START_BANNER_PATHS = (
    WWW_DIR / 'Picsart_26-06-12_12-40-13-733.jpg',
    WWW_DIR / 'assets' / 'Picsart_26-06-12_12-40-13-733.jpg',
)


def _start_banner() -> Path | None:
    for path in START_BANNER_PATHS:
        if path.is_file() and path.stat().st_size > 1000:
            return path
    return None

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')
OTP_RE = re.compile(r'^\d{6}$')

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

SESSIONS: dict[int, UidaiBrowserSession] = {}
FLOW: dict[int, dict] = {}

FLOW_IDLE_SEC = max(30, int(os.getenv('FLOW_IDLE_SEC', '180')))


def _idle_timeout_label() -> str:
    if FLOW_IDLE_SEC >= 60 and FLOW_IDLE_SEC % 60 == 0:
        return f'{FLOW_IDLE_SEC // 60} min'
    return f'{FLOW_IDLE_SEC}s'


_IDLE_STEPS = frozenset({
    STEP_NAME,
    STEP_MOBILE,
    STEP_DOB,
    STEP_CAPTCHA,
    STEP_OTP,
    STEP_CAPTCHA_2,
    STEP_OTP_1,
    STEP_OTP_2,
})


def _ids(update: Update) -> tuple[str | None, str | None]:
    user_id = str(update.effective_user.id) if update.effective_user else None
    chat_id = str(update.effective_chat.id) if update.effective_chat else None
    return user_id, chat_id


def clear_flow(chat_id: int) -> None:
    FLOW.pop(chat_id, None)


def assign_flow(chat_id: int, data: dict) -> None:
    FLOW[chat_id] = {**data, 'last_activity': time.monotonic()}


def bump_flow(chat_id: int, **data) -> None:
    FLOW[chat_id] = {**FLOW.get(chat_id, {}), **data, 'last_activity': time.monotonic()}


def touch_flow(chat_id: int) -> None:
    """Reset idle timer when user sends any message during a waiting step."""
    if chat_id in FLOW:
        FLOW[chat_id]['last_activity'] = time.monotonic()


def flow_step(chat_id: int) -> str | None:
    return FLOW.get(chat_id, {}).get('step')


def flow_mode(chat_id: int) -> str:
    return FLOW.get(chat_id, {}).get('mode', FLOW_MODE_RETRIEVE)


def _flow_display_name(chat_id: int, sess: AadharSession | None = None) -> str:
    """UIDAI enrollment name — persists on loading UI and captcha after EID verify."""
    draft = FLOW.get(chat_id, {})
    for candidate in (
        draft.get('aadhaar_name'),
        sess.aadhaar_name if sess else None,
        draft.get('name'),
        sess.name if sess else None,
    ):
        if candidate and not is_skip_name(str(candidate)):
            return normalize_name(str(candidate))
    return ''


def clear_pdf_session(chat_id: int) -> None:
    clear_aadhar_session(chat_id)


def valid_name_input(text: str) -> bool:
    if is_skip_name(text):
        return True
    return bool(NAME_RE.match(text.strip()))


async def guard(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    if ACCESS.allowed(user_id, chat_id):
        return True
    await update.message.reply_text(
        '🔒 This bot is locked — approved users only.\n\n'
        f'Your Chat ID: `{chat_id}`\n'
        'Ask the owner for access (/myid).',
        parse_mode='Markdown',
    )
    return False


async def guard_credits(update: Update, cost: int, *, action: str) -> bool:
    """Locked mode: approved users need credits before /fetch or /pdf."""
    if not await guard(update):
        return False
    user_id, chat_id = _ids(update)
    if not ACCESS.credits_required():
        return True
    if ACCESS.is_owner(user_id, chat_id):
        return True
    if ACCESS.has_credits(user_id, chat_id, cost):
        return True
    bal = ACCESS.credits(str(chat_id or user_id))
    await update.message.reply_text(
        f'💳 Credits khatam — {action} ke liye {cost} credit chahiye.\n'
        f'Balance: {bal}\n\n'
        'Owner se contact karo ya /credits check karo.',
    )
    return False


def _credit_footer(update: Update) -> str:
    user_id, chat_id = _ids(update)
    if not ACCESS.credits_required() or ACCESS.is_owner(user_id, chat_id):
        return ''
    bal = ACCESS.credits(str(chat_id or user_id))
    return f'\n\n💳 Credits: {bal}'


def _credit_remain_line(update: Update) -> str:
    user_id, chat_id = _ids(update)
    if not ACCESS.credits_required() or ACCESS.is_owner(user_id, chat_id):
        return ''
    return f'\n💳 Remaining: {ACCESS.credits(str(chat_id or user_id))}'


def is_owner(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    return ACCESS.is_owner(user_id, chat_id)


def get_session(chat_id: int) -> UidaiBrowserSession | None:
    return SESSIONS.get(chat_id)


def _captcha_caption(
    *,
    fresh: bool = False,
    instant: bool = False,
    ttl: str = '',
    display_name: str = '',
) -> str:
    prefix = '⚡ Instant captcha\n' if instant else ('🔄 New captcha\n' if fresh else '')
    ttl_line = f'\nSession: {ttl} remaining' if ttl else ''
    name_line = ''
    if display_name and not is_skip_name(display_name):
        name_line = f'👤 {display_name}\n'
    return (
        f'{name_line}'
        f'{prefix}'
        'Reply with captcha text (4–8 characters)\n'
        '/refresh — load new captcha'
        f'{ttl_line}'
    )


def _connection_error_hint(exc: Exception) -> str:
    msg = str(exc).strip()
    low = msg.lower()
    if 'browser' in low or 'closed' in low or 'chromium' in low:
        return '❌ Browser crashed.\nTry /close then /fetch.'
    if 'httpsconnectionpool' in low or 'connectionpool' in low:
        return '🔄 UIDAI network glitch — auto-retried.\nSend captcha/OTP again.'
    if 'uidai open' in low or 'timeout' in low:
        return '❌ UIDAI portal slow or down.\nTry /fetch fresh in a moment.'
    if msg and len(msg) < 200:
        return f'❌ {msg}\n\nTry /close then /fetch'
    return '❌ Connection failed.\nTry /close then /fetch.'


async def _reply_captcha(
    update: Update,
    sess: UidaiBrowserSession,
    cap: bytes,
    *,
    instant: bool = False,
) -> None:
    ttl = sess.ttl_label() if sess.last_activity_at else ''
    await update.message.reply_photo(
        photo=cap,
        caption=_captcha_caption(instant=instant, ttl=ttl),
    )


async def _begin_session_terminal(
    message,
    chat_id: int,
    mobile: str,
    *,
    mode: str,
    name: str = '',
) -> LoadingScreen:
    """Session terminal — stays open until flow completes."""
    progress = await create_loading_screen(
        message, chat_id, mobile, mode=mode, name=name,
    )
    progress.start_script_ticker()
    return progress


async def _hold_captcha_terminal(
    progress: LoadingScreen,
    *,
    instant: bool = False,
) -> None:
    if instant:
        await progress.rush_to_captcha_hold(instant=True)
    else:
        await progress.hold_for_captcha()


async def _send_captcha_ready(
    update: Update,
    sess: UidaiBrowserSession,
    progress: LoadingScreen,
    *,
    instant: bool = False,
) -> None:
    cap = sess.peek_captcha_png() or await sess.captcha_png(use_cache=True)
    await _reply_captcha(update, sess, cap, instant=instant)
    await _hold_captcha_terminal(progress, instant=instant)


async def _fail_open(
    chat_id: int,
    sess: UidaiBrowserSession | None,
    progress: LoadingScreen,
    exc: Exception,
) -> None:
    log.exception('open failed')
    from browser_session import _is_browser_closed_error, _pool_shutdown

    if _is_browser_closed_error(exc):
        await _pool_shutdown()
    elif sess:
        await sess.close(keep_warm=True)
    SESSIONS.pop(chat_id, None)
    clear_flow(chat_id)
    await progress.fail(_connection_error_hint(exc))


async def _turbo_fetch(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
    progress: LoadingScreen,
) -> bool:
    """Pool hot → captcha in ~1s. Returns False → use slow path."""
    if not uidai_instant_form():
        return False
    hit = await instant_retrieve_captcha(name, mobile, pool='uid')
    if not hit and not pool_form_ready('uid'):
        try:
            from browser_session import STANDBY_UID, warm_standby_slot
            await warm_standby_slot(STANDBY_UID)
            hit = await instant_retrieve_captcha(name, mobile, pool='uid')
        except Exception as e:
            log.warning('fetch turbo warm retry: %s', e)
    if not hit:
        return False
    png, txn = hit
    existing = SESSIONS.get(chat_id)
    if existing and await existing.page_alive():
        sess = existing
    else:
        old = SESSIONS.pop(chat_id, None)
        if old:
            try:
                await old.close(keep_warm=True)
            except Exception:
                pass
        sess = UidaiBrowserSession(pool='uid')
        SESSIONS[chat_id] = sess
    try:
        sess.name = normalize_name(name)
        sess.mobile = mobile.strip()
        sess.captcha_txn_id = txn
        sess._captcha_png_cache = png
        sess._captcha_cache_txn = txn
        sess._captcha_cache_at = time.monotonic()
        sess.form_ready = True
        sess.touch()
        await _reply_captcha(update, sess, png, instant=True)
        await _hold_captcha_terminal(progress, instant=True)
        return True
    except Exception as e:
        log.warning('turbo fetch failed, slow path: %s', e)
        SESSIONS.pop(chat_id, None)
        return False


def _schedule_pool_prefill_name(name: str, pool: str) -> None:
    """Background — pool tab pe naam pehle se bhar do jab user mobile type kare."""
    if not uidai_instant_form() or is_skip_name(name):
        return
    asyncio.create_task(prefill_standby_name(name, pool))


async def _reply_pdf_captcha(
    update: Update,
    chat_id: int,
    sess: AadharSession,
    png: bytes,
    *,
    instant: bool = False,
) -> None:
    await update.message.reply_photo(
        photo=png,
        caption=_captcha_caption(
            instant=instant,
            display_name=_flow_display_name(chat_id, sess),
        ),
    )


async def _turbo_pdf_phase1(
    update: Update,
    chat_id: int,
    sess: AadharSession,
    name: str,
    mobile: str,
    progress: LoadingScreen,
    *,
    dob_norm: str | None,
    pdf_pass: str,
) -> bool:
    """Preloaded EID pool → instant form fill + captcha for /pdf phase 1."""
    if not uidai_instant_form():
        return False
    hit = await instant_retrieve_captcha(name, mobile, pool='eid')
    if not hit and not pool_form_ready('eid'):
        try:
            from browser_session import STANDBY_EID, warm_standby_slot
            await warm_standby_slot(STANDBY_EID)
            hit = await instant_retrieve_captcha(name, mobile, pool='eid')
        except Exception as e:
            log.warning('pdf turbo warm retry: %s', e)
    if not hit:
        log.info(
            'pdf turbo miss — eid_form=%s eid_captcha=%s',
            pool_form_ready('eid'),
            pool_slot_ready('eid'),
        )
        return False
    png, txn = hit
    sess.prime_browser_captcha(png, txn)
    assign_flow(chat_id, {
        'step': STEP_CAPTCHA,
        'mode': FLOW_MODE_DOWNLOAD,
        'name': name,
        'mobile': mobile,
        'dob': dob_norm,
        'pdf_password': pdf_pass,
    })
    await _reply_pdf_captcha(update, chat_id, sess, png, instant=True)
    await _hold_captcha_terminal(progress, instant=True)
    return True


async def open_uidai_session(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
    *,
    force_new: bool = False,
) -> None:
    name = normalize_name(name)
    mobile = mobile.strip()
    if not await guard_credits(update, ACCESS.credit_fetch_cost(), action='/fetch'):
        return
    clear_flow(chat_id)
    assign_flow(chat_id, {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile})

    progress = await _begin_session_terminal(
        update.message, chat_id, mobile, mode='fetch', name=name,
    )

    if not force_new and await _turbo_fetch(update, chat_id, name, mobile, progress):
        return

    existing = SESSIONS.get(chat_id)
    if not force_new and existing and await existing.page_alive():
        try:
            await existing.open_form(name, mobile, force_reload=False)
            await _send_captcha_ready(update, existing, progress)
        except Exception as e:
            await _fail_open(chat_id, existing, progress, e)
        return

    old = SESSIONS.pop(chat_id, None)
    if old:
        try:
            await old.close(keep_warm=True)
        except Exception:
            from browser_session import _pool_shutdown
            await _pool_shutdown()

    sess = UidaiBrowserSession(pool='uid')
    SESSIONS[chat_id] = sess

    try:
        await sess.start()
        await sess.open_form(name, mobile, force_reload=force_new)
        await _send_captcha_ready(update, sess, progress)
    except Exception as e:
        await _fail_open(chat_id, sess, progress, e)


def _pdf_captcha_mode() -> str:
    """auto/browser = same live browser as /open | http = API fallback only."""
    return os.getenv('UIDAI_PDF_CAPTCHA', 'browser').strip().lower()


_PREFETCH_TASKS: dict[int, asyncio.Task] = {}

_CAPTCHA_MIN_BYTES = 500


def _captcha_prime_ok(sess: AadharSession) -> bool:
    return bool(sess.captcha_txn_id and len(sess.last_captcha_image or b'') >= _CAPTCHA_MIN_BYTES)


async def _pdf_browser_session(
    chat_id: int,
    progress: LoadingScreen | None = None,
    *,
    pool: str = 'eid',
) -> UidaiBrowserSession:
    browser = UidaiBrowserSession(pool=pool)
    if progress is not None:
        async def on_step(n: int, total: int, text: str) -> None:
            await progress.update(n, total, text)

        browser._on_step = on_step
    return browser


async def _try_http_captcha_prime(sess: AadharSession, phase: str) -> bool:
    tag = (phase or 'phase1').split('-')[0]
    return await run_aadhar(sess.prime_http_captcha, tag)


async def _prefetch_phase2_captcha(sess: AadharSession, chat_id: int) -> bool:
    """Background phase-2 captcha while user reads OTP1 SMS — HTTP then EID pool."""
    if not sess.eid:
        return False
    if sess.apply_phase2_captcha_stash() and _captcha_prime_ok(sess):
        return True
    sess._ensure_phase2_headers()
    try:
        if await _try_http_captcha_prime(sess, 'phase2'):
            sess.stash_phase2_captcha()
            return _captcha_prime_ok(sess)
    except Exception as e:
        log.warning('phase2 prefetch HTTP captcha: %s', e)
    try:
        png, txn = await capture_phase2_captcha_on_pool(sess.eid)
        sess.prime_browser_captcha(png, txn)
        sess.stash_phase2_captcha()
        return _captcha_prime_ok(sess)
    except Exception as e:
        log.warning('phase2 prefetch pool captcha: %s', e)
    try:
        browser = await _pdf_browser_session(chat_id, pool='pdf')
        png, txn = await browser.fetch_download_captcha(sess.eid)
        sess.prime_browser_captcha(png, txn)
        sess.stash_phase2_captcha()
        return _captcha_prime_ok(sess)
    except Exception as e:
        log.warning('phase2 prefetch browser captcha: %s', e)
        return False


async def _await_phase2_prefetch(sess: AadharSession, *, timeout: float = 12.0) -> None:
    task = _PREFETCH_TASKS.pop(id(sess), None)
    if task is None:
        return
    try:
        await asyncio.wait_for(task, timeout=timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass


async def _prime_pdf_phase1_open(
    sess: AadharSession,
    progress: LoadingScreen,
    chat_id: int,
    *,
    refresh: bool = False,
) -> bool:
    """Phase 1 captcha — instant pool fill first, cold browser last."""
    if not refresh and uidai_instant_form():
        hit = await instant_retrieve_captcha(sess.name, sess.mobile, pool='eid')
        if hit:
            sess.prime_browser_captcha(hit[0], hit[1])
            return True
    pair = get_standby_captcha_pair('eid')
    if pair and not refresh:
        sess.prime_browser_captcha(pair[0], pair[1])
        if _captcha_prime_ok(sess):
            return True
    browser = await _pdf_browser_session(chat_id, None, pool='eid')
    for attempt in range(3):
        try:
            await browser.start()
            if refresh and await browser.page_alive():
                png = await browser.refresh_captcha()
                txn = browser.captcha_txn_id or browser._captcha_cache_txn
            else:
                png = await browser.instant_fetch(sess.name, sess.mobile)
                txn = browser.captcha_txn_id or browser._captcha_cache_txn
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                return True
        except Exception as e:
            log.warning('pdf phase1 open-captcha attempt %s: %s', attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(0.6)
    return False


async def _prime_pdf_phase2_browser(
    sess: AadharSession,
    progress: LoadingScreen,
    chat_id: int,
    *,
    refresh: bool = False,
) -> bool:
    """Phase 2 browser captcha — EID-filled pool tab, then cold browser fallback."""
    if not sess.eid:
        return False
    if not refresh:
        try:
            png, txn = await capture_phase2_captcha_on_pool(sess.eid)
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                sess.stash_phase2_captcha()
                return True
        except Exception as e:
            log.warning('pdf phase2 pool-captcha: %s', e)
    browser = await _pdf_browser_session(chat_id, progress, pool='pdf')
    for attempt in range(3):
        try:
            await browser.start()
            png, txn = await browser.fetch_download_captcha(sess.eid)
            if png and txn and len(png) >= _CAPTCHA_MIN_BYTES:
                sess.prime_browser_captcha(png, txn)
                sess.stash_phase2_captcha()
                return True
        except Exception as e:
            log.warning('pdf phase2 browser-captcha attempt %s: %s', attempt + 1, e)
            if attempt < 2:
                await asyncio.sleep(0.6)
    return False


async def _prime_pdf_browser_captcha(
    sess: AadharSession,
    progress: LoadingScreen,
    phase: str,
    chat_id: int,
) -> bool:
    """Captcha for /pdf — same reliability as /open (browser first)."""
    mode = _pdf_captcha_mode()
    phase_key = (phase or 'phase1').lower()
    refresh = 'refresh' in phase_key

    if phase_key.startswith('phase1'):
        if mode in ('auto', 'browser', ''):
            if await _prime_pdf_phase1_open(sess, progress, chat_id, refresh=refresh):
                return True
        pair = get_standby_captcha_pair('eid')
        if pair and sess.name and sess.mobile and not refresh:
            sess.prime_browser_captcha(pair[0], pair[1])
            if _captcha_prime_ok(sess):
                return True
        if mode == 'http':
            return await _try_http_captcha_prime(sess, phase)
        if mode == 'auto':
            return await _try_http_captcha_prime(sess, phase)
        return False

    if phase_key.startswith('phase2'):
        await _await_phase2_prefetch(sess)
        if (
            not refresh
            and sess.apply_phase2_captcha_stash()
            and _captcha_prime_ok(sess)
            and not sess.captcha_is_stale()
        ):
            return True
        sess._ensure_phase2_headers()
        if not refresh and await _try_http_captcha_prime(sess, phase):
            sess.stash_phase2_captcha()
            if _captcha_prime_ok(sess):
                return True
        if mode in ('auto', 'browser', 'http', ''):
            if await _prime_pdf_phase2_browser(sess, progress, chat_id, refresh=refresh):
                return True
        if mode in ('auto', 'http') and refresh:
            if await _try_http_captcha_prime(sess, phase):
                sess.stash_phase2_captcha()
                return _captcha_prime_ok(sess)
        return False

    return False


async def _send_pdf_captcha_photo(
    update: Update,
    sess: AadharSession,
    *,
    fresh: bool = False,
    instant: bool = False,
    chat_id: int | None = None,
) -> bool:
    png = sess.last_captcha_image or b''
    if len(png) < _CAPTCHA_MIN_BYTES:
        return False
    cid = chat_id if chat_id is not None else update.effective_chat.id
    await update.message.reply_photo(
        photo=png,
        caption=_captcha_caption(
            fresh=fresh,
            instant=instant,
            display_name=_flow_display_name(cid, sess),
        ),
    )
    return True


async def _run_pdf_with_browser_captcha(
    update: Update,
    sess: AadharSession,
    progress: LoadingScreen,
    fn,
    *args,
    phase: str = 'phase1',
    prime: bool = True,
    **kwargs,
) -> dict:
    """Run /pdf step with browser captcha — manual image entry like /open."""
    chat_id = update.effective_chat.id
    phase_key = (phase or 'phase1').lower()
    if not prime and phase_key.startswith('phase2') and sess.captcha_is_stale():
        refresh = f'{phase}-refresh'
        if await _prime_pdf_browser_captcha(sess, progress, refresh, chat_id):
            await progress.update(2, 3, 'Captcha refreshed')
            await _send_pdf_captcha_photo(update, sess, fresh=True, chat_id=chat_id)
            return {
                'otp_ok': False,
                'needs_captcha': True,
                'invalid_captcha': True,
                'captcha_expired': True,
                'msg': '⏱ Captcha expire ho gaya — naya image bharo',
            }
    if prime:
        if not await _prime_pdf_browser_captcha(sess, progress, phase, chat_id):
            return {
                'otp_ok': False,
                'captcha_fetch_failed': True,
                'msg': 'Captcha failed to load — try /pdf again',
            }
    result = await run_aadhar_retry(fn, *args, progress=progress, **kwargs)
    if result.get('needs_browser_captcha'):
        refresh = f'{phase}-refresh'
        if await _prime_pdf_browser_captcha(sess, progress, refresh, chat_id):
            result = {
                **result,
                'image_png': sess.last_captcha_image,
                'captcha_txn_id': sess.captcha_txn_id,
                'needs_captcha': True,
            }
        else:
            result['captcha_fetch_failed'] = True
            result['msg'] = result.get('msg') or 'Could not refresh captcha'
    if (
        result.get('needs_captcha')
        and not result.get('otp_ok')
        and not result.get('captcha_fetch_failed')
        and sess.captcha_txn_id
        and len(sess.last_captcha_image) >= _CAPTCHA_MIN_BYTES
    ):
        await progress.update(4, 8, 'Loading captcha')
        await _send_pdf_captcha_photo(
            update, sess,
            fresh=bool(result.get('invalid_captcha')),
            chat_id=chat_id,
        )
    return result


async def _send_eaadhaar_pdf(
    update: Update,
    *,
    pdf_bytes: bytes,
    sess: AadharSession,
    flow: dict,
) -> None:
    """Unlock e-Aadhaar — NAME4 + birth year 1920–2020 brute force."""
    from pdf_unlock import pdf_name_prefix, year_range

    ident = sess.resolved_identity(env_name=DEFAULT_NAME)
    name = ident['name'] or sess.name
    dob = ident.get('dob') or flow.get('dob') or sess.dob_raw
    name_list = [
        sess.aadhaar_name,
        name,
        flow.get('aadhaar_name'),
        flow.get('name'),
        DEFAULT_NAME,
        sess.name,
    ]
    passwords = build_pdf_password_candidates(name_list, dob)
    wait = await update.message.reply_text(
        f'⏳ Opening PDF… trying {pdf_name_prefix(name)} + '
        f'{year_range()[0]}–{year_range()[1]}',
    )
    unlocked, used_pwd = unlock_eaadhaar_pdf(pdf_bytes, passwords)
    eid_hint = f'\nEID: {sess.eid[:8]}…{sess.eid[-4:]}' if sess.eid and len(sess.eid) > 12 else ''
    name_line = f'\nName: {name}' if name and not is_skip_name(name) else ''
    prefix = pdf_name_prefix(name) if not is_skip_name(name) else pdf_name_prefix(DEFAULT_NAME)
    year_hint = used_pwd[len(prefix):] if used_pwd and used_pwd.startswith(prefix) else ''

    try:
        await wait.delete()
    except Exception:
        pass

    if unlocked:
        year_line = f'\nBirth year: {year_hint}' if year_hint.isdigit() else ''
        await update.message.reply_document(
            document=unlocked,
            filename='eaadhaar_open.pdf',
            caption=(
                '✅ e-Aadhaar PDF — opened\n'
                f'Password: {used_pwd}'
                f'{name_line}'
                f'{year_line}'
                f'{eid_hint}'
            ),
        )
        return

    y_min, y_max = year_range()
    await update.message.reply_document(
        document=pdf_bytes,
        filename='eaadhaar_locked.pdf',
        caption=(
            '✅ e-Aadhaar PDF (locked)\n'
            f'Could not open — tried {prefix}{y_min}…{prefix}{y_max}\n'
            'Set UIDAI_NAME in .env to exact Aadhaar name.'
            f'{name_line}'
            f'{eid_hint}'
        ),
    )


def _pdf_captcha_ready(sess: AadharSession, result: dict) -> bool:
    if result.get('captcha_fetch_failed'):
        return False
    if not result.get('needs_captcha'):
        return False
    return bool(sess.captcha_txn_id and len(sess.last_captcha_image) >= _CAPTCHA_MIN_BYTES)


async def _start_download_flow(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
    dob: str | None = None,
) -> None:
    """2-OTP PDF — captcha → OTP1 → OTP2 → PDF file."""
    from aadhar import normalize_name as aadhar_name

    name = aadhar_name(name)
    mobile = mobile.strip()
    if not await guard_credits(update, ACCESS.credit_pdf_cost(), action='/pdf'):
        return
    dob_norm = normalize_dob(dob) if dob else None
    if not dob_bypass_on() and not dob_norm:
        assign_flow(chat_id, {
            'step': STEP_DOB,
            'mode': FLOW_MODE_DOWNLOAD,
            'name': name,
            'mobile': mobile,
        })
        await update.message.reply_text(
            'Send DOB as DD/MM/YYYY (as on Aadhaar).\nExample: 01/01/1991'
        )
        return

    clear_flow(chat_id)
    clear_pdf_session(chat_id)

    old = SESSIONS.pop(chat_id, None)
    if old:
        try:
            await old.close(keep_warm=True)
        except Exception:
            pass

    sess = AadharSession()
    AADHAR_SESSIONS[chat_id] = sess
    await run_aadhar(sess.setup, name, mobile, dob_norm or dob)

    pdf_pass = pdf_password(
        name if not is_skip_name(name) else DEFAULT_NAME,
        dob_norm or dob,
    )

    progress = await _begin_session_terminal(
        update.message, chat_id, mobile, mode='pdf', name=name,
    )

    if await _turbo_pdf_phase1(
        update, chat_id, sess, name, mobile, progress,
        dob_norm=dob_norm, pdf_pass=pdf_pass,
    ):
        return

    if uidai_instant_form():
        hit = await instant_retrieve_captcha(name, mobile, pool='eid')
        if hit:
            sess.prime_browser_captcha(hit[0], hit[1])
            assign_flow(chat_id, {
                'step': STEP_CAPTCHA,
                'mode': FLOW_MODE_DOWNLOAD,
                'name': name,
                'mobile': mobile,
                'dob': dob_norm,
                'pdf_password': pdf_pass,
            })
            await _reply_pdf_captcha(update, chat_id, sess, hit[0], instant=True)
            await _hold_captcha_terminal(progress, instant=True)
            return

    assign_flow(chat_id, {
        'step': STEP_OTP_1,
        'mode': FLOW_MODE_DOWNLOAD,
        'name': name,
        'mobile': mobile,
        'dob': dob_norm,
        'pdf_password': pdf_pass,
    })

    try:
        result = await _run_pdf_with_browser_captcha(
            update, sess, progress, sess.phase1_start, phase='phase1',
        )
        if result.get('otp_ok'):
            bump_flow(chat_id, step=STEP_OTP_1)
            hint = f'\nPDF password: {pdf_pass}' if pdf_pass else ''
            await progress.done(uidai_user_message(result, kind='otp') + hint)
            return
        if result.get('network_error'):
            bump_flow(chat_id, step=STEP_CAPTCHA)
            await progress.fail(
                result.get('msg') or '🔄 Network error — send captcha again',
            )
            return
        if result.get('captcha_fetch_failed'):
            await progress.fail(result.get('msg') or 'Captcha failed — try /pdf again')
            return
        if result.get('needs_captcha'):
            bump_flow(chat_id, step=STEP_CAPTCHA)
            if not _pdf_captcha_ready(sess, result):
                await progress.fail(result.get('msg') or 'Captcha failed — try /pdf again')
            elif result.get('invalid_captcha'):
                await progress.fail(result.get('msg') or 'Invalid captcha — see new image above')
            else:
                await progress.hold_for_captcha('Reply with captcha (4–8 chars)')
            return
        await progress.fail(result.get('msg') or 'Phase 1 failed')
    except Exception as e:
        log.exception('download flow start failed')
        clear_flow(chat_id)
        clear_pdf_session(chat_id)
        await progress.fail(_connection_error_hint(e))


async def _phase2_after_otp1(
    update: Update,
    chat_id: int,
    sess: AadharSession,
) -> None:
    if not sess.eid:
        await update.message.reply_text('EID missing — /pdf again.')
        return

    progress = await get_or_create_loading_screen(
        update.message,
        chat_id,
        sess.mobile,
        mode='pdf',
        name=_flow_display_name(chat_id, sess),
    )
    if not progress._hold_captcha:
        progress.start_script_ticker()

    try:
        result = await _run_pdf_with_browser_captcha(
            update, sess, progress, sess.phase2_start, phase='phase2',
        )
        if result.get('network_error'):
            bump_flow(chat_id, step=STEP_CAPTCHA_2)
            await progress.fail(
                result.get('msg') or '🔄 Network error — /pdf again or resend captcha',
            )
            return
        if result.get('captcha_fetch_failed'):
            await progress.fail(result.get('msg') or 'Phase 2 captcha failed — try /pdf again')
            return
        if result.get('needs_captcha'):
            bump_flow(chat_id, step=STEP_CAPTCHA_2)
            if not _pdf_captcha_ready(sess, result):
                await progress.fail(result.get('msg') or 'Phase 2 captcha failed — try /pdf again')
            elif result.get('invalid_captcha'):
                await progress.fail(result.get('msg') or 'Invalid captcha — see new image above')
            else:
                await progress.hold_for_captcha('Reply with captcha 2 (4–8 chars)')
            return
        if result.get('otp_ok'):
            bump_flow(chat_id, step=STEP_OTP_2)
            await progress.done(uidai_user_message(
                {**result, 'aadhaar_name': _flow_display_name(chat_id, sess)},
                kind='download_otp',
            ))
        else:
            bump_flow(chat_id, step=STEP_CAPTCHA_2)
            await progress.fail(result.get('msg') or 'Phase 2 OTP failed')
    except Exception as e:
        log.exception('phase2 otp request failed')
        await progress.fail(f'Phase 2 fail: {e}')


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    caption = (
        f'🔐 Rebel Aadhaar Bot v{BOT_ENGINE_VERSION}\n'
        '━━━━━━━━━━━━━━━━━━━━\n\n'
        'Commands:\n'
        '/fetch MOBILE — Aadhaar SMS (1 OTP)\n'
        '/pdf MOBILE — e-Aadhaar PDF (2 OTP)\n'
        '/credits — balance check'
        f'{_credit_footer(update)}'
    )
    banner = _start_banner()
    if banner:
        with banner.open('rb') as img:
            await update.message.reply_photo(photo=img, caption=caption)
    else:
        await update.message.reply_text(caption)


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
    clear_pdf_session(cid)
    await dismiss_loading_screen(cid)
    if sess:
        await sess.close(keep_warm=True)
    pool_note = '🟢 Triple browser pool 24/7' if pool_is_warm() else '⏳ Pool warming…'
    await update.message.reply_text(
        '✅ Session closed.\n'
        f'{pool_note}\n'
        'Use /fetch again for instant captcha ⚡'
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    step = flow_step(cid)
    if not sess and not step:
        await update.message.reply_text('No active session — use /fetch.')
        return
    draft = FLOW.get(cid, {})
    step_labels = {
        STEP_NAME: 'Enter name',
        STEP_MOBILE: 'Enter mobile',
        STEP_CAPTCHA: 'Enter captcha',
        STEP_OTP: 'Enter OTP',
    }
    lines = [
        '━━━━━━━━━━━━━━━━━━━━',
        '  📊 Session Status',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        f'Step: {step_labels.get(step, "Ready" if not step else step)}',
    ]
    display_name = _flow_display_name(cid, get_aadhar_session(cid))
    if display_name:
        lines.append(f'Name: {display_name}')
    elif draft.get('name'):
        lines.append(f'Name: {draft["name"]}')
    if draft.get('mobile'):
        lines.append(f'Mobile: {draft["mobile"]}')
    if sess:
        lines.extend([
            '',
            '✅ Session active',
            f'24h remaining: {sess.ttl_label()}' if sess.last_activity_at else '24h remaining: —',
        ])
    lines.append('')
    user_id, chat_id = _ids(update)
    if ACCESS.credits_required() and not ACCESS.is_owner(user_id, chat_id):
        lines.append(f'💳 Credits: {ACCESS.credits(str(chat_id or user_id))}')
    if pool_form_ready('eid') or pool_form_ready('uid'):
        lines.append('⚡ UIDAI preloaded — instant /fetch & /pdf ready')
    elif pool_is_warm():
        lines.append('🟢 Browser pool: active 24/7')
    else:
        lines.append('⚪ Browser pool: warming…')
    await update.message.reply_text('\n'.join(lines))


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    user_id, chat_id = _ids(update)
    await update.message.reply_text(
        f'🆔 Your Chat ID: `{chat_id}`\n'
        f'User ID: `{user_id}`\n\n'
        'Share this ID with the owner for approval.',
        parse_mode='Markdown',
    )


async def cmd_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    lines = [
        '━━━━━━━━━━━━━━━━━━━━',
        '  👑 Access Control',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        *ACCESS.status_lines(len(SESSIONS)),
        '',
        '/free — public | /lock — approved only',
        '/approve CHAT_ID [credits] · /deny CHAT_ID',
        '/addcredits CHAT_ID N · /setcredits CHAT_ID N',
    ]
    await update.message.reply_text('\n'.join(lines))


async def cmd_free(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    ACCESS.set_free()
    await update.message.reply_text(
        '🌍 Bot is now PUBLIC — anyone can use /start.\n'
        'Lock again: /lock'
    )


async def cmd_lock(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    ACCESS.set_locked()
    await update.message.reply_text(
        '🔒 Bot LOCKED — approved users only.\n'
        f'Approved: {ACCESS.approved_count} users\n'
        'Add user: /approve CHAT_ID'
    )


async def cmd_approve(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    if not context.args:
        await update.message.reply_text('Usage: /approve CHAT_ID [credits]')
        return
    uid = context.args[0].strip()
    credits = None
    if len(context.args) >= 2:
        try:
            credits = max(0, int(context.args[1]))
        except ValueError:
            await update.message.reply_text('Credits must be a number.')
            return
    bal = ACCESS.approve(uid, credits=credits)
    await update.message.reply_text(
        f'✅ Approved: `{uid}`\n💳 Credits: {bal}',
        parse_mode='Markdown',
    )


async def cmd_addcredits(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    if len(context.args) < 2:
        await update.message.reply_text('Usage: /addcredits CHAT_ID AMOUNT')
        return
    uid = context.args[0].strip()
    try:
        amount = int(context.args[1])
    except ValueError:
        await update.message.reply_text('Amount must be a number.')
        return
    bal = ACCESS.add_credits(uid, amount)
    await update.message.reply_text(f'💳 `{uid}` balance: {bal}', parse_mode='Markdown')


async def cmd_setcredits(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    if len(context.args) < 2:
        await update.message.reply_text('Usage: /setcredits CHAT_ID AMOUNT')
        return
    uid = context.args[0].strip()
    try:
        amount = max(0, int(context.args[1]))
    except ValueError:
        await update.message.reply_text('Amount must be a number.')
        return
    bal = ACCESS.set_credits(uid, amount)
    await update.message.reply_text(f'💳 `{uid}` set to: {bal}', parse_mode='Markdown')


async def cmd_credits(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    user_id, chat_id = _ids(update)
    cid = str(chat_id or user_id)
    if ACCESS.is_owner(user_id, chat_id):
        await update.message.reply_text('👑 Owner — unlimited credits.')
        return
    bal = ACCESS.credits(cid)
    if not ACCESS.credits_required():
        await update.message.reply_text('🌍 Bot is public — credits not required right now.')
        return
    await update.message.reply_text(
        f'💳 Your credits: {bal}\n'
        f'/fetch = {ACCESS.credit_fetch_cost()} · /pdf = {ACCESS.credit_pdf_cost()}'
    )


async def cmd_deny(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only command.')
        return
    if not context.args:
        await update.message.reply_text('Usage: /deny CHAT_ID')
        return
    uid = context.args[0].strip()
    ACCESS.deny(uid)
    await update.message.reply_text(f'🚫 Removed: `{uid}`', parse_mode='Markdown')


async def cmd_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    if not sess:
        await update.message.reply_text('Run /fetch first.')
        return
    progress = await create_loading_screen(
        update.message, cid, sess.mobile, mode='captcha',
    )
    try:
        await progress.update(2, 5, 'Loading captcha')
        png = await sess.captcha_png()
        await progress.done('Captcha ready')
        await dismiss_loading_screen(cid)
        await update.message.reply_photo(photo=png, caption=_captcha_caption())
    except Exception as e:
        await progress.fail(f'Captcha fail: {e}')


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    if not sess:
        await update.message.reply_text('Run /fetch first.')
        return
    progress = await create_loading_screen(
        update.message, cid, sess.mobile, mode='captcha',
    )
    try:
        await progress.update(3, 5, 'Refreshing captcha')
        png = await sess.refresh_captcha()
        await progress.done('New captcha ready')
        await dismiss_loading_screen(cid)
        await update.message.reply_photo(photo=png, caption=_captcha_caption(fresh=True))
    except Exception as e:
        await progress.fail(f'Refresh fail: {e}')


async def cmd_fetch(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not await guard_credits(update, ACCESS.credit_fetch_cost(), action='/fetch'):
        return
    if not TOKEN:
        await update.message.reply_text('Set TELEGRAM_BOT_TOKEN in .env')
        return

    cid = update.effective_chat.id
    args = list(context.args or [])
    force_new = False
    if args and args[0].lower() in ('fresh', 'new', 'reload'):
        force_new = True
        args = args[1:]

    if len(args) >= 2:
        name = normalize_name(' '.join(args[:-1]))
        mobile = args[-1]
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Mobile must be 10 digits starting with 6–9. Example: 7651892956')
            return
        _schedule_pool_prefill_name(name, 'uid')
        await open_uidai_session(update, cid, name, mobile, force_new=force_new)
        return

    if len(args) == 1:
        one = args[0].strip()
        if MOBILE_RE.match(one):
            await open_uidai_session(update, cid, PLACEHOLDER_NAME, one, force_new=force_new)
            return
        await update.message.reply_text(
            'Examples:\n'
            '/fetch 7651892956 — instant captcha ⚡\n'
            '/fetch fresh 7651892956 — full reload\n'
            '/fetch KAMAR JAHAN 7651892956 — name + mobile'
        )
        return

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close(keep_warm=True)
    assign_flow(cid, {'step': STEP_NAME, 'mode': FLOW_MODE_RETRIEVE})
    await update.message.reply_text(
        'Send full name (as on Aadhaar)\n'
        'Example: KAMAR JAHAN\n\n'
        'Unknown name? Send "Mr" or "skip"\n\n'
        'Cancel: /close'
    )


async def cmd_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not await guard_credits(update, ACCESS.credit_pdf_cost(), action='/pdf'):
        return
    if not TOKEN:
        await update.message.reply_text('Set TELEGRAM_BOT_TOKEN in .env')
        return

    cid = update.effective_chat.id
    args = list(context.args or [])

    if len(args) >= 3 and DOB_RE.match(args[-2].strip()) and MOBILE_RE.match(args[-1].strip()):
        name = normalize_name(' '.join(args[:-2]))
        await _start_download_flow(update, cid, name, args[-1].strip(), dob=args[-2].strip())
        return

    if len(args) == 2 and DOB_RE.match(args[0].strip()) and MOBILE_RE.match(args[1].strip()):
        await _start_download_flow(
            update, cid, PLACEHOLDER_NAME, args[1].strip(), dob=args[0].strip(),
        )
        return

    if len(args) >= 2:
        name = normalize_name(' '.join(args[:-1]))
        mobile = args[-1]
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Mobile must be 10 digits starting with 6–9.')
            return
        await _start_download_flow(update, cid, name, mobile)
        return

    if len(args) == 1 and MOBILE_RE.match(args[0].strip()):
        await _start_download_flow(update, cid, PLACEHOLDER_NAME, args[0].strip())
        return

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close(keep_warm=True)
    clear_pdf_session(cid)
    assign_flow(cid, {'step': STEP_NAME, 'mode': FLOW_MODE_DOWNLOAD})
    dob_hint = (
        'DOB bypass on — skip DOB.\n\n'
        if dob_bypass_on()
        else 'You will be asked for DOB (DD/MM/YYYY).\n\n'
    )
    await update.message.reply_text(
        '📥 2-OTP e-Aadhaar PDF\n\n'
        'Send full name (as on Aadhaar)\n'
        'Example: KAMAR JAHAN\n\n'
        'Unknown name? Send "Mr" or "skip"\n\n'
        f'{dob_hint}'
        'Quick: /pdf 01/01/1991 7651892956\n'
        'Cancel: /close'
    )


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not update.message or not update.message.text:
        return
    cid = update.effective_chat.id
    text = update.message.text.strip()

    if text.startswith('/'):
        return

    step = flow_step(cid)
    mode = flow_mode(cid)
    if step in _IDLE_STEPS:
        touch_flow(cid)

    if step == STEP_NAME and mode == FLOW_MODE_DOWNLOAD:
        if not valid_name_input(text):
            await update.message.reply_text(
                'Name must use letters and spaces.\n'
                'Example: KAMAR JAHAN\n'
                'Or send "Mr" / "skip" if unknown'
            )
            return
        name = normalize_name(text)
        assign_flow(cid, {'step': STEP_MOBILE, 'mode': FLOW_MODE_DOWNLOAD, 'name': name})
        _schedule_pool_prefill_name(name, 'eid')
        hint = (
            f'Name skipped — using {PLACEHOLDER_NAME}\n\n'
            if is_skip_name(text)
            else f'Name: {name}\n\n'
        )
        await update.message.reply_text(
            f'{hint}'
            'Send 10-digit mobile for OTP 1.\n'
            'Example: 7651892956'
        )
        return

    if step == STEP_NAME:
        if not valid_name_input(text):
            await update.message.reply_text(
                'Name must use letters and spaces.\n'
                'Example: KAMAR JAHAN\n'
                'Or send "Mr" / "skip" if unknown'
            )
            return
        name = normalize_name(text)
        assign_flow(cid, {'step': STEP_MOBILE, 'mode': FLOW_MODE_RETRIEVE, 'name': name})
        _schedule_pool_prefill_name(name, 'uid')
        hint = (
            f'Name skipped — using {PLACEHOLDER_NAME}\n\n'
            if is_skip_name(text)
            else f'Name: {name}\n\n'
        )
        await update.message.reply_text(
            f'{hint}'
            'Send 10-digit mobile number (OTP will be sent here).\n'
            'Example: 7651892956'
        )
        return

    if step == STEP_MOBILE:
        mobile = re.sub(r'\s+', '', text)
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text(
                'Invalid number — 10 digits starting with 6–9.\nExample: 7651892956'
            )
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        if mode == FLOW_MODE_DOWNLOAD:
            if dob_bypass_on():
                await _start_download_flow(update, cid, name, mobile)
            else:
                assign_flow(cid, {
                    'step': STEP_DOB,
                    'mode': FLOW_MODE_DOWNLOAD,
                    'name': name,
                    'mobile': mobile,
                })
                await update.message.reply_text(
                    'Send DOB as DD/MM/YYYY.\nExample: 01/01/1991'
                )
        else:
            await open_uidai_session(update, cid, name, mobile)
        return

    if step == STEP_DOB and mode == FLOW_MODE_DOWNLOAD:
        dob = normalize_dob(text)
        if not dob:
            await update.message.reply_text('Invalid DOB — DD/MM/YYYY.\nExample: 01/01/1991')
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        mobile = FLOW.get(cid, {}).get('mobile', '')
        await _start_download_flow(update, cid, name, mobile, dob=dob)
        return

    if step == STEP_CAPTCHA and mode == FLOW_MODE_DOWNLOAD:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha 4–8 chars.')
            return
        a_sess = get_aadhar_session(cid)
        if not a_sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /pdf again.')
            return
        progress = get_loading_screen(cid) or await get_or_create_loading_screen(
            update.message, cid, a_sess.mobile, mode='pdf', name=a_sess.name,
        )
        await progress.advance_after_captcha('UIDAI OTP request')
        try:
            result = await _run_pdf_with_browser_captcha(
                update, a_sess, progress, a_sess.phase1_otp_manual, text,
                phase='phase1', prime=False,
            )
            if result.get('otp_ok'):
                bump_flow(cid, step=STEP_OTP_1)
                await progress.done(uidai_user_message(result, kind='otp'))
            elif result.get('network_error'):
                bump_flow(cid, step=STEP_CAPTCHA)
                await progress.fail(
                    result.get('msg') or '🔄 Network error — same captcha, send again',
                )
            elif result.get('invalid_captcha'):
                bump_flow(cid, step=STEP_CAPTCHA)
                await progress.fail(result.get('msg') or 'Wrong captcha — try the new image')
            else:
                await progress.fail(result.get('msg') or 'OTP 1 failed')
        except Exception as e:
            bump_flow(cid, step=STEP_CAPTCHA)
            await progress.fail(_connection_error_hint(e))
        return

    if step == STEP_CAPTCHA_2 and mode == FLOW_MODE_DOWNLOAD:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha 4–8 letters/numbers.')
            return
        a_sess = get_aadhar_session(cid)
        if not a_sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /pdf again.')
            return
        progress = get_loading_screen(cid) or await get_or_create_loading_screen(
            update.message,
            cid,
            a_sess.mobile,
            mode='pdf',
            name=_flow_display_name(cid, a_sess),
        )
        await progress.advance_after_captcha('Download OTP request')
        try:
            result = await _run_pdf_with_browser_captcha(
                update, a_sess, progress, a_sess.phase2_otp_manual, text,
                phase='phase2', prime=False,
            )
            if result.get('otp_ok'):
                bump_flow(cid, step=STEP_OTP_2)
                await progress.done(uidai_user_message(
                    {**result, 'aadhaar_name': _flow_display_name(cid, a_sess)},
                    kind='download_otp',
                ))
            elif result.get('network_error'):
                bump_flow(cid, step=STEP_CAPTCHA_2)
                await progress.fail(
                    result.get('msg') or '🔄 Network error — same captcha, send again',
                )
            elif result.get('invalid_captcha'):
                bump_flow(cid, step=STEP_CAPTCHA_2)
                await progress.fail(result.get('msg') or 'Wrong captcha — try the new image')
            else:
                await progress.fail(result.get('msg') or 'OTP 2 failed')
        except Exception as e:
            bump_flow(cid, step=STEP_CAPTCHA_2)
            await progress.fail(_connection_error_hint(e))
        return

    if step == STEP_OTP_1 and mode == FLOW_MODE_DOWNLOAD:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP 1 from SMS.')
            return
        a_sess = get_aadhar_session(cid)
        if not a_sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /pdf again.')
            return
        progress = get_loading_screen(cid) or await get_or_create_loading_screen(
            update.message, cid, a_sess.mobile, mode='pdf', name=a_sess.name,
        )
        await progress.advance_after_captcha('EID verify request')
        try:
            result = await run_aadhar_retry(
                a_sess.phase1_verify, text, progress=progress,
            )
            if result.get('retrieve_ok'):
                resolved_name = result.get('aadhaar_name') or a_sess.aadhaar_name
                if resolved_name and not is_skip_name(resolved_name):
                    bump_flow(
                        cid,
                        aadhaar_name=resolved_name,
                        pdf_password=pdf_password(
                            resolved_name,
                            result.get('aadhaar_dob') or FLOW.get(cid, {}).get('dob'),
                        ),
                    )
                await progress.done(uidai_user_message({**result, 'eid': result.get('eid')}, kind='retrieve'))
                old_prefetch = _PREFETCH_TASKS.pop(id(a_sess), None)
                if old_prefetch and not old_prefetch.done():
                    old_prefetch.cancel()
                _PREFETCH_TASKS[id(a_sess)] = asyncio.create_task(
                    _prefetch_phase2_captcha(a_sess, cid),
                )
                await _phase2_after_otp1(update, cid, a_sess)
            elif result.get('network_error'):
                bump_flow(cid, step=STEP_OTP_1)
                await progress.fail(
                    result.get('msg') or '🔄 Network error — send OTP 1 again',
                )
            else:
                bump_flow(cid, step=STEP_OTP_1)
                await progress.fail(result.get('msg') or 'OTP 1 verify failed')
        except Exception as e:
            log.exception('otp1 verify failed')
            bump_flow(cid, step=STEP_OTP_1)
            await progress.fail(_connection_error_hint(e))
        return

    if step == STEP_OTP_2 and mode == FLOW_MODE_DOWNLOAD:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP 2 from SMS.')
            return
        a_sess = get_aadhar_session(cid)
        if not a_sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /pdf again.')
            return
        progress = get_loading_screen(cid) or await get_or_create_loading_screen(
            update.message,
            cid,
            a_sess.mobile,
            mode='pdf',
            name=_flow_display_name(cid, a_sess),
        )
        await progress.advance_after_captcha('PDF download request')
        try:
            result = await run_aadhar_retry(
                a_sess.phase2_download, text, progress=progress,
            )
            if result.get('download_ok'):
                pdf = result.get('pdf_bytes') or b''
                flow_draft = FLOW.get(cid, {})
                if result.get('aadhaar_name'):
                    flow_draft['aadhaar_name'] = result['aadhaar_name']
                user_id, chat_id = _ids(update)
                ACCESS.use_credits(user_id, chat_id, ACCESS.credit_pdf_cost())
                await progress.done(
                    uidai_user_message(result, kind='download') + _credit_remain_line(update),
                )
                await _send_eaadhaar_pdf(
                    update,
                    pdf_bytes=pdf,
                    sess=a_sess,
                    flow=flow_draft,
                )
                clear_flow(cid)
                clear_pdf_session(cid)
                browser_sess = SESSIONS.pop(cid, None)
                if browser_sess:
                    await browser_sess.close(keep_warm=True)
            elif result.get('network_error'):
                bump_flow(cid, step=STEP_OTP_2)
                await progress.fail(
                    result.get('msg') or '🔄 Network error — send OTP 2 again',
                )
            else:
                bump_flow(cid, step=STEP_OTP_2)
                await progress.fail(uidai_user_message(result, kind='download'))
        except Exception as e:
            log.exception('pdf download failed')
            bump_flow(cid, step=STEP_OTP_2)
            await progress.fail(_connection_error_hint(e))
        return

    if step == STEP_OTP:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP from SMS. Example: 482910')
            return
        sess = get_session(cid)
        if not sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — use /fetch again.')
            return
        bump_flow(cid, step=None)
        otp_progress = get_loading_screen(cid) or await get_or_create_loading_screen(
            update.message, cid, sess.mobile, mode='fetch', name=sess.name,
        )
        await otp_progress.advance_after_captcha('Aadhaar SMS retrieve')

        try:
            result = await sess.submit_otp(text)
            retrieve_ok = result.get('retrieve_ok', False)
            user_msg = uidai_user_message(result, kind='retrieve')
            if retrieve_ok:
                user_id, chat_id = _ids(update)
                ACCESS.use_credits(user_id, chat_id, ACCESS.credit_fetch_cost())
                await otp_progress.done(user_msg + _credit_remain_line(update))
            else:
                await otp_progress.fail(user_msg)
            if retrieve_ok:
                sess.touch()
                await update.message.reply_text(
                    f'🔒 Session active — {sess.ttl_label()} left\n'
                    'Again: /fetch MOBILE ⚡\n'
                    'Full reload: /fetch fresh MOBILE'
                )
                try:
                    await sess.prefetch_captcha()
                except Exception:
                    pass
                assign_flow(cid, {
                    'step': STEP_CAPTCHA,
                    'name': sess.name,
                    'mobile': sess.mobile,
                })
            else:
                bump_flow(cid, step=STEP_OTP)
        except Exception as e:
            log.exception('retrieve failed')
            await otp_progress.fail(f'Retrieve fail: {e}')
            bump_flow(cid, step=STEP_OTP)
        return

    if step != STEP_CAPTCHA or mode == FLOW_MODE_DOWNLOAD:
        return

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha must be 4–8 letters/numbers. Example: 6fhxdf')
        return

    sess = get_session(cid)
    if not sess:
        clear_flow(cid)
        await update.message.reply_text('Session expired — use /open again.')
        return

    bump_flow(cid, step=None)
    otp_progress = get_loading_screen(cid) or await get_or_create_loading_screen(
        update.message, cid, sess.mobile, mode='fetch', name=sess.name,
    )
    await otp_progress.advance_after_captcha('UIDAI OTP request')

    try:
        result = await sess.send_otp(text)
        otp_ok = result.get('otp_ok')
        if otp_ok is None:
            otp_ok = any(
                'OTP sent' in (x.get('m') or '') for x in result.get('logs', [])
            )
        user_msg = uidai_user_message(result, kind='otp')

        if otp_ok:
            await otp_progress.done(user_msg)
            bump_flow(cid, step=STEP_OTP)
        else:
            await otp_progress.fail(user_msg)
            bump_flow(cid, step=STEP_CAPTCHA)
    except Exception as e:
        log.exception('otp failed')
        await otp_progress.fail(f'OTP fail: {e}')
        bump_flow(cid, step=STEP_CAPTCHA)


async def warm_pool_job(context) -> None:
    default_warm = '1' if uidai_fast() else '0'
    if os.getenv('UIDAI_POOL_WARM', default_warm).strip().lower() in ('0', 'false', 'no', 'off'):
        return
    if pool_is_warm():
        return
    try:
        await asyncio.wait_for(ensure_pool_warm(), timeout=120)
    except Exception as e:
        log.warning('pool warm skip: %s', e)


async def standby_captcha_job(context) -> None:
    try:
        await refresh_standby_captcha()
    except Exception as e:
        log.debug('standby captcha refresh: %s', e)


async def keepalive_job(context) -> None:
    for cid, sess in list(SESSIONS.items()):
        try:
            if await sess.keepalive_ping():
                continue
            log.info('24h session expire chat=%s', cid)
            try:
                await sess.close(keep_warm=True)
            except Exception:
                pass
            SESSIONS.pop(cid, None)
        except Exception as e:
            log.warning('keepalive chat=%s: %s', cid, e)


async def _expire_idle_chat(bot, chat_id: int) -> None:
    await dismiss_loading_screen(chat_id)
    sess = SESSIONS.pop(chat_id, None)
    if sess:
        try:
            await sess.close(keep_warm=True)
        except Exception:
            pass
    clear_pdf_session(chat_id)
    clear_flow(chat_id)
    try:
        await bot.send_message(
            chat_id,
            f'⏱ Session expired ({_idle_timeout_label()} no reply).\n/fetch to start again.',
        )
    except Exception:
        pass
    log.info('idle session expire chat=%s', chat_id)


async def idle_session_job(context) -> None:
    now = time.monotonic()
    for cid, flow in list(FLOW.items()):
        step = flow.get('step')
        if step not in _IDLE_STEPS:
            continue
        last = float(flow.get('last_activity') or 0)
        if last <= 0 or now - last < FLOW_IDLE_SEC:
            continue
        await _expire_idle_chat(context.bot, cid)


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, Conflict):
        log.error('409 Conflict — stop duplicate bot instances (bot.py / sex.py)')
        return
    if context.error:
        log.exception('Bot error: %s', context.error)


async def _startup_pool_warm() -> None:
    default_warm = '1' if uidai_fast() else '0'
    if os.getenv('UIDAI_POOL_WARM', default_warm).strip().lower() in ('0', 'false', 'no', 'off'):
        return
    try:
        await asyncio.wait_for(ensure_pool_warm(), timeout=120)
        log.info('UIDAI triple pool preloaded — instant /fetch ready')
    except Exception as e:
        log.warning('startup pool warm: %s', e)


async def _register_bot_commands(application: Application) -> None:
    await application.bot.set_my_commands([
        BotCommand('start', 'Rebel Aadhaar — command list'),
        BotCommand('fetch', 'Aadhaar SMS — 1 OTP'),
        BotCommand('pdf', 'e-Aadhaar PDF — 2 OTP'),
    ])
    asyncio.create_task(_startup_pool_warm())


def main() -> None:
    if not TOKEN:
        raise SystemExit(
            '❌ TELEGRAM_BOT_TOKEN missing!\n\n'
            f'  cd {Path(__file__).parent}\n'
            '  bash setup.sh "YOUR_BOT_TOKEN" "8432393497"'
        )
    if ':' not in TOKEN or len(TOKEN) < 20:
        raise SystemExit('❌ Invalid TELEGRAM_BOT_TOKEN — copy from @BotFather')

    app = (
        Application.builder()
        .token(TOKEN)
        .post_init(_register_bot_commands)
        .build()
    )
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('fetch', cmd_fetch))
    app.add_handler(CommandHandler('open', cmd_fetch))
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
    app.add_handler(CommandHandler('addcredits', cmd_addcredits))
    app.add_handler(CommandHandler('setcredits', cmd_setcredits))
    app.add_handler(CommandHandler('credits', cmd_credits))
    app.add_handler(CommandHandler('access', cmd_access))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_error_handler(on_error)

    if app.job_queue:
        warm_delay = 1 if uidai_fast() else 5
        standby_first = 20 if uidai_fast() else 60
        app.job_queue.run_once(warm_pool_job, when=warm_delay)
        app.job_queue.run_repeating(standby_captcha_job, interval=120, first=standby_first)
        app.job_queue.run_repeating(keepalive_job, interval=KEEPALIVE_INTERVAL_SEC, first=120)
        app.job_queue.run_repeating(idle_session_job, interval=15, first=20)
        log.info('24h keepalive every %ss | idle timeout %ss', KEEPALIVE_INTERVAL_SEC, FLOW_IDLE_SEC)

    log.info(
        'sex.py v%s — /fetch + /pdf — owner=%s access=%s',
        BOT_ENGINE_VERSION,
        OWNER_ID,
        ACCESS.mode,
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)


if __name__ == '__main__':
    main()
