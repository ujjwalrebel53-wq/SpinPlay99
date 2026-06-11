#!/usr/bin/env python3
"""
Telegram bot — UIDAI retrieve page live + captcha Telegram se bharo.

Python-first OTP (no extension bundle) — dob:null direct API.

Usage:
  bash setup.sh
  pip install -r requirements.txt
  playwright install chromium
  python bot.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.error import Conflict
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

try:
    from bot_access import AccessControl
    from bot_ui import LoadingScreen, uidai_user_message
except ImportError as exc:
    raise SystemExit(
        '❌ bot_ui.py / bot_access.py missing!\n\n'
        'VPS pe ye chalao:\n'
        '  cd www\n'
        '  BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/www"\n'
        '  wget -O bot_ui.py "$BASE/bot_ui.py"\n'
        '  wget -O bot_access.py "$BASE/bot_access.py"\n'
        f'\nDetail: {exc}'
    ) from exc

from aadhar import (
    AADHAR_SESSIONS,
    AadharSession,
    attach_log_callback,
    clear_aadhar_session,
    dob_bypass_on,
    get_aadhar_session,
    pdf_password,
    run_aadhar,
    send_captcha_to_bot,
)
from browser_session import (
    KEEPALIVE_INTERVAL_SEC,
    UidaiBrowserSession,
    ensure_pool_warm,
    get_standby_captcha_png,
    pool_is_warm,
    refresh_standby_captcha,
)
from proxy_india import fastest_proxy_url, pick_indian_proxy
from uidai_cookie_session import baked_session_ready, cookie_jar_ready, sync_baked_to_runtime_jar
from http_uidai_flow import (
    UidaiHttpSession,
    HTTP_SESSIONS,
    get_http_session,
    sync_from_browser,
)
from react_extract import SET_OPTION_JS
from uidai_api import (
    BOT_ENGINE_VERSION,
    DOB_RE,
    PLACEHOLDER_NAME,
    is_skip_name,
    normalize_dob,
    normalize_name,
)

load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('uidai-bot')

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
PROXY_RAW = os.getenv('UIDAI_PROXY', 'auto').strip().lower()
if PROXY_RAW in ('none', 'no', 'off', 'direct'):
    PROXY = None
    AUTO_INDIA = False
elif PROXY_RAW in ('', 'auto', 'india'):
    PROXY = None
    # Pehli baar proxy scan; cookies save ke baad hamesha cookies-only
    AUTO_INDIA = os.getenv('UIDAI_INDIAN_PROXY_AUTO', '1') == '1'
else:
    PROXY = os.getenv('UIDAI_PROXY', '').strip()
    AUTO_INDIA = False
DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
DEFAULT_MOBILE = os.getenv('UIDAI_MOBILE', '7651892956').strip()

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')


def valid_name_input(text: str) -> bool:
    if is_skip_name(text):
        return True
    return bool(NAME_RE.match(text.strip()))

STEP_NAME = 'name'
STEP_MOBILE = 'mobile'
STEP_DOB = 'dob'
STEP_CAPTCHA = 'captcha'
STEP_OTP = 'otp'
STEP_OTP_1 = 'otp1'
STEP_OTP_2 = 'otp2'
STEP_UID = 'uid'
STEP_CAPTCHA_2 = 'captcha2'

FLOW_MODE_RETRIEVE = 'retrieve'
FLOW_MODE_DOWNLOAD = 'download'

OTP_RE = re.compile(r'^\d{6}$')
UID_RE = re.compile(r'^\d{12}$')

SESSIONS: dict[int, UidaiBrowserSession] = {}
FLOW: dict[int, dict] = {}


def _ids(update: Update) -> tuple[str | None, str | None]:
    user_id = str(update.effective_user.id) if update.effective_user else None
    chat_id = str(update.effective_chat.id) if update.effective_chat else None
    return user_id, chat_id


def clear_flow(chat_id: int) -> None:
    FLOW.pop(chat_id, None)


def clear_http_session(chat_id: int) -> None:
    HTTP_SESSIONS.pop(chat_id, None)
    clear_aadhar_session(chat_id)


def flow_mode(chat_id: int) -> str:
    return FLOW.get(chat_id, {}).get('mode', FLOW_MODE_RETRIEVE)


def flow_step(chat_id: int) -> str | None:
    return FLOW.get(chat_id, {}).get('step')


async def guard(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    if ACCESS.allowed(user_id, chat_id):
        return True
    hint = (
        '🔒 This bot is locked — approved users only.\n\n'
        f'Your Chat ID: `{chat_id}`\n'
        'Ask the owner for access (/myid).'
    )
    await update.message.reply_text(hint, parse_mode='Markdown')
    return False


def is_owner(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    return ACCESS.is_owner(user_id, chat_id)


def get_session(chat_id: int) -> UidaiBrowserSession | None:
    return SESSIONS.get(chat_id)


def _captcha_caption(*, fresh: bool = False, instant: bool = False, ttl: str = '') -> str:
    prefix = '⚡ Instant captcha\n' if instant else ('🔄 New captcha\n' if fresh else '')
    ttl_line = f'\nSession: {ttl} remaining' if ttl else ''
    return (
        f'{prefix}'
        'Reply with captcha text (4–8 characters)\n'
        '/refresh — load new captcha'
        f'{ttl_line}'
    )


async def _try_instant_captcha(
    update: Update,
    sess: UidaiBrowserSession | None = None,
) -> bool:
    cap = sess.peek_captcha_png() if sess else None
    if not cap:
        cap = get_standby_captcha_png()
    if not cap or len(cap) < 500:
        return False
    ttl = sess.ttl_label() if sess and sess.last_activity_at else ''
    await update.message.reply_photo(
        photo=cap,
        caption=_captcha_caption(instant=True, ttl=ttl),
    )
    return True


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    lines = [
        f'🔐 Rebel Aadhaar — UIDAI Bot v{BOT_ENGINE_VERSION}',
        '',
        'Commands:',
        '/open — SMS retrieve (captcha → OTP → Aadhaar SMS)',
        '/open 7651892956 — mobile only (instant captcha ⚡)',
        '/pdf — 2-OTP e-Aadhaar PDF (aadhar.py engine)',
        '/pdf 01/01/1991 7651892956 — DOB + mobile (name Mr)',
        '/pdf KAMAR JAHAN 01/01/1991 7651892956 — full',
        '/captcha · /refresh · /status',
        '/close — end session (browser stays 24/7)',
        '/myid — your chat ID',
        '',
        'Retrieve: captcha → OTP → SMS',
        'Download (/pdf): aadhar.py — OTP1 → OTP2 → PDF',
        '',
        '👥 Multi-user — each user gets an isolated session.',
    ]
    if is_owner(update):
        lines.extend([
            '',
            '👑 Owner:',
            '/free — public access',
            '/lock — approved users only',
            '/approve CHAT_ID · /deny CHAT_ID · /access',
        ])
    await update.message.reply_text('\n'.join(lines))


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
    clear_http_session(cid)
    if sess:
        await sess.close(keep_warm=True)
    pool_note = '🟢 Browser pool active 24/7' if pool_is_warm() else '⏳ Pool warms on next /open'
    await update.message.reply_text(
        '✅ Session closed.\n'
        f'{pool_note}\n'
        'Use /open again for instant captcha ⚡'
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    step = flow_step(cid)
    if not sess and not step:
        await update.message.reply_text('No active session — use /open.')
        return
    draft = FLOW.get(cid, {})
    mode = draft.get('mode', FLOW_MODE_RETRIEVE)
    step_labels = {
        STEP_NAME: 'Enter name',
        STEP_MOBILE: 'Enter mobile',
        STEP_CAPTCHA: 'Enter captcha',
        STEP_OTP: 'Enter OTP',
        STEP_OTP_1: 'Enter OTP 1 (EID retrieve)',
        STEP_OTP_2: 'Enter OTP 2 (PDF download)',
        STEP_UID: 'Enter 12-digit Aadhaar',
        STEP_CAPTCHA_2: 'Enter Phase 2 captcha',
    }
    lines = [
        '━━━━━━━━━━━━━━━━━━━━',
        '  📊 Session Status',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        f'Mode: {"PDF download (2-OTP)" if mode == FLOW_MODE_DOWNLOAD else "SMS retrieve"}',
        f'Step: {step_labels.get(step, "Ready" if not step else step)}',
    ]
    http_sess = get_http_session(cid)
    if http_sess:
        lines.append(f'Route: {http_sess.proxy_label()}')
    if draft.get('name'):
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
    lines.append('🟢 Browser pool: active 24/7' if pool_is_warm() else '⚪ Browser pool: idle')
    await update.message.reply_text('\n'.join(lines))


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    user_id, chat_id = _ids(update)
    await update.message.reply_text(
        f'🆔 Aapka Chat ID: `{chat_id}`\n'
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
        '/approve CHAT_ID · /deny CHAT_ID',
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
        await update.message.reply_text('Usage: /approve CHAT_ID')
        return
    uid = context.args[0].strip()
    ACCESS.approve(uid)
    await update.message.reply_text(f'✅ Approved: `{uid}`', parse_mode='Markdown')


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
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('Run /open first.')
        return
    wait = await update.message.reply_text('⏳ Fetching captcha…')
    try:
        png = await sess.captcha_png()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption=_captcha_caption())
    except Exception as e:
        await wait.edit_text(f'Captcha fail: {e}')


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('Run /open first.')
        return
    wait = await update.message.reply_text('⏳ Loading new captcha…')
    try:
        png = await sess.refresh_captcha()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption=_captcha_caption(fresh=True))
    except Exception as e:
        await wait.edit_text(f'Refresh fail: {e}')


async def _send_captcha_ready(
    update: Update,
    sess: UidaiBrowserSession,
    progress: LoadingScreen,
    *,
    instant_sent: bool = False,
    chat_id: int | None = None,
) -> None:
    if not instant_sent:
        cap = await sess.captcha_png(use_cache=True)
        ttl = sess.ttl_label() if sess.last_activity_at else ''
        await update.message.reply_photo(
            photo=cap,
            caption=_captcha_caption(ttl=ttl) + '\nOr send: auto',
        )
    await progress.done('Captcha ready — reply with text or auto')


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
    hint = _connection_error_hint(exc)
    await progress.fail(hint)


def _connection_error_hint(exc: Exception) -> str:
    msg = str(exc).strip()
    low = msg.lower()
    if 'proxy' in low or 'vpn' in low or 'indian' in low:
        return (
            '❌ VPN connection failed.\n\n'
            'Add to .env:\n'
            'UIDAI_PROXY=http://14.143.222.113:57738\n\n'
            'Then: /close → /open'
        )
    if 'browser' in low or 'closed' in low or 'chromium' in low:
        return '❌ Browser crashed.\nTry /close then /open.'
    if 'uidai open' in low or 'timeout' in low:
        return '❌ UIDAI portal slow or down.\nTry /open fresh in a moment.'
    if msg and len(msg) < 200:
        return f'❌ {msg}\n\nTry /close then /open'
    return '❌ Connection failed.\nTry /close then /open.'


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
    clear_flow(chat_id)
    FLOW[chat_id] = {
        'step': STEP_CAPTCHA,
        'mode': FLOW_MODE_RETRIEVE,
        'name': name,
        'mobile': mobile,
    }

    instant_sent = False
    if not force_new:
        instant_sent = await _try_instant_captcha(update, SESSIONS.get(chat_id))

    existing = SESSIONS.get(chat_id)
    if not force_new and existing and await existing.page_alive():
        status_msg = await update.message.reply_text('⏳ Fast reopen…')
        progress = LoadingScreen(
            status_msg, name, mobile,
            title='Fast Reopen',
            subtitle='Live session',
        )

        async def on_step(n: int, total: int, text: str) -> None:
            await progress.update(n, total, text)

        existing._on_step = on_step
        try:
            await existing.start()
            await existing.open_form(name, mobile, force_reload=False)
            await _send_captcha_ready(
                update, existing, progress, instant_sent=instant_sent, chat_id=chat_id,
            )
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

    if not instant_sent:
        instant_sent = await _try_instant_captcha(update)

    status_msg = await update.message.reply_text(
        '⚡ Pool ready — form fill…' if pool_is_warm() else '⏳ Initializing…',
    )
    progress = LoadingScreen(status_msg, name, mobile)

    async def on_step(n: int, total: int, text: str) -> None:
        await progress.update(n, total, text)

    sess = UidaiBrowserSession(
        proxy=PROXY,
        auto_india_proxy=AUTO_INDIA,
        on_step=on_step,
    )
    SESSIONS[chat_id] = sess

    try:
        await sess.start()
        await sess.open_form(name, mobile, force_reload=force_new)
        await _send_captcha_ready(
            update, sess, progress, instant_sent=instant_sent, chat_id=chat_id,
        )
    except Exception as e:
        await _fail_open(chat_id, sess, progress, e)


def _wire_aadhar_logs(sess: AadharSession, progress: LoadingScreen) -> None:
    """Live logs → loading screen (thread-safe)."""
    loop = asyncio.get_running_loop()
    attach_log_callback(sess, loop, progress)


async def _run_aadhar_with_ui(
    update: Update,
    sess: AadharSession,
    progress: LoadingScreen,
    fn,
    *args,
    phase: str = 'Phase',
    send_captcha: bool = True,
    **kwargs,
) -> dict:
    _wire_aadhar_logs(sess, progress)
    result = await run_aadhar(fn, *args, **kwargs)
    if send_captcha:
        await send_captcha_to_bot(update, result, phase=phase)
    cap = result.get('captcha_text') or sess.captcha_text
    if cap:
        await progress.log_detail(f'🔑 Captcha used: {cap}')
    return result


async def _start_download_flow(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
    dob: str | None = None,
) -> None:
    """2-OTP PDF — aadhar.py engine (no cookies, no proxy, per-user session)."""
    from aadhar import normalize_name as aadhar_name

    name = aadhar_name(name)
    mobile = mobile.strip()
    dob_norm = normalize_dob(dob) if dob else None
    if not dob_bypass_on() and not dob_norm:
        FLOW[chat_id] = {
            'step': STEP_DOB,
            'mode': FLOW_MODE_DOWNLOAD,
            'name': name,
            'mobile': mobile,
        }
        await update.message.reply_text(
            'Send DOB as DD/MM/YYYY (as on Aadhaar).\n'
            'Example: 01/01/1991'
        )
        return

    clear_flow(chat_id)
    clear_http_session(chat_id)

    old = SESSIONS.pop(chat_id, None)
    if old:
        try:
            await old.close(keep_warm=True)
        except Exception:
            pass

    wait = await update.message.reply_text('⏳ PDF flow — aadhar.py session…')
    progress = LoadingScreen(
        wait, name, mobile,
        title='2-OTP PDF',
        subtitle='Bypass + EID',
    )

    sess = AadharSession()
    AADHAR_SESSIONS[chat_id] = sess
    await run_aadhar(sess.setup, name, mobile, dob_norm or dob)
    await progress.log_detail('Session ready — starting Phase 1')

    pdf_pass = pdf_password(name, dob_norm or dob)
    FLOW[chat_id] = {
        'step': STEP_OTP_1,
        'mode': FLOW_MODE_DOWNLOAD,
        'name': name,
        'mobile': mobile,
        'dob': dob_norm,
        'pdf_password': pdf_pass,
        'engine': 'aadhar',
    }

    try:
        result = await _run_aadhar_with_ui(
            update, sess, progress, sess.phase1_start, phase='Phase 1',
        )
        if result.get('otp_ok'):
            FLOW[chat_id]['step'] = STEP_OTP_1
            hint = f'PDF password: {pdf_pass}' if pdf_pass else ''
            await progress.done(uidai_user_message(result, kind='otp') + ('\n' + hint if hint else ''))
            return
        if result.get('needs_captcha'):
            FLOW[chat_id]['step'] = STEP_CAPTCHA
            await progress.done('Captcha needed — reply 4–8 chars (see audio/image above)')
            return
        await progress.fail(result.get('msg') or 'Phase 1 OTP failed')
    except Exception as e:
        log.exception('download flow start failed')
        clear_flow(chat_id)
        clear_http_session(chat_id)
        await progress.fail(_connection_error_hint(e))


async def _phase2_after_otp1(
    update: Update,
    chat_id: int,
    sess: AadharSession,
) -> None:
    """After OTP1 — aadhar.py Phase 2 download OTP."""
    if not sess.eid:
        await update.message.reply_text('EID missing — /pdf again.')
        return

    wait = await update.message.reply_text('⏳ Phase 2 — download OTP…')
    progress = LoadingScreen(
        wait, sess.name, sess.mobile,
        title='OTP 2',
        subtitle='e-Aadhaar PDF',
    )

    try:
        result = await _run_aadhar_with_ui(
            update, sess, progress, sess.phase2_start, phase='Phase 2',
        )
        if result.get('needs_captcha'):
            FLOW[chat_id]['step'] = STEP_CAPTCHA_2
            await progress.done('Phase 2 captcha — reply 4–8 chars (see above)')
            return
        if result.get('otp_ok'):
            FLOW[chat_id]['step'] = STEP_OTP_2
            await progress.done(uidai_user_message(result, kind='download_otp'))
        else:
            FLOW[chat_id]['step'] = STEP_CAPTCHA_2
            await progress.fail(result.get('msg') or 'Phase 2 OTP failed')
    except Exception as e:
        log.exception('phase2 otp request failed')
        await progress.fail(f'Phase 2 fail: {e}')


async def cmd_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not TOKEN:
        await update.message.reply_text('Set TELEGRAM_BOT_TOKEN in .env')
        return

    cid = update.effective_chat.id
    args = list(context.args or [])

    if len(args) >= 3 and DOB_RE.match(args[-2].strip()) and MOBILE_RE.match(args[-1].strip()):
        dob = args[-2].strip()
        mobile = args[-1].strip()
        name = normalize_name(' '.join(args[:-2]))
        await _start_download_flow(update, cid, name, mobile, dob=dob)
        return

    if (
        len(args) == 2
        and DOB_RE.match(args[0].strip())
        and MOBILE_RE.match(args[1].strip())
    ):
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
    clear_http_session(cid)
    FLOW[cid] = {'step': STEP_NAME, 'mode': FLOW_MODE_DOWNLOAD}
    dob_hint = (
        'DOB bypass on — skip DOB step.\n\n'
        if dob_bypass_on()
        else 'You will be asked for DOB (DD/MM/YYYY).\n\n'
    )
    await update.message.reply_text(
        '📥 2-OTP e-Aadhaar PDF (aadhar.py — no proxy/cookies)\n\n'
        'Send full name (as on Aadhaar)\n'
        'Example: KAMAR JAHAN\n\n'
        'Unknown name? Send "Mr" or "skip"\n\n'
        f'{dob_hint}'
        'Quick: /pdf 01/01/1991 7651892956\n'
        'Cancel: /close'
    )


async def cmd_open(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
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
        await open_uidai_session(update, cid, name, mobile, force_new=force_new)
        return

    if len(args) == 1:
        one = args[0].strip()
        if MOBILE_RE.match(one):
            await open_uidai_session(update, cid, PLACEHOLDER_NAME, one, force_new=force_new)
            return
        await update.message.reply_text(
            'Examples:\n'
            '/open 7651892956 — instant captcha ⚡\n'
            '/open fresh 7651892956 — full reload\n'
            '/open KAMAR JAHAN 7651892956 — name + mobile'
        )
        return

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close(keep_warm=True)
    FLOW[cid] = {'step': STEP_NAME, 'mode': FLOW_MODE_RETRIEVE}
    await update.message.reply_text(
        'Send full name (as on Aadhaar)\n'
        'Example: KAMAR JAHAN\n\n'
        'Unknown name? Send "Mr" or "skip"\n\n'
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

    if step == STEP_NAME and mode == FLOW_MODE_DOWNLOAD:
        if not valid_name_input(text):
            await update.message.reply_text(
                'Name must use letters and spaces.\n'
                'Example: KAMAR JAHAN\n'
                'Or send "Mr" / "skip" if unknown'
            )
            return
        name = normalize_name(text)
        FLOW[cid] = {'step': STEP_MOBILE, 'mode': FLOW_MODE_DOWNLOAD, 'name': name}
        hint = (
            f'Name skipped — using {PLACEHOLDER_NAME}\n\n'
            if is_skip_name(text)
            else f'Name: {name}\n\n'
        )
        await update.message.reply_text(
            f'{hint}'
            'Send 10-digit mobile for OTP 1 (EID retrieve).\n'
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
        FLOW[cid] = {'step': STEP_MOBILE, 'name': name}
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
        await update.message.reply_text(f'OK — {name} / {mobile}')
        if mode == FLOW_MODE_DOWNLOAD:
            if dob_bypass_on():
                await _start_download_flow(update, cid, name, mobile)
            else:
                FLOW[cid] = {
                    'step': STEP_DOB,
                    'mode': FLOW_MODE_DOWNLOAD,
                    'name': name,
                    'mobile': mobile,
                }
                await update.message.reply_text(
                    'Send DOB as DD/MM/YYYY (as on Aadhaar).\nExample: 01/01/1991'
                )
        else:
            await open_uidai_session(update, cid, name, mobile)
        return

    if step == STEP_DOB and mode == FLOW_MODE_DOWNLOAD:
        dob = normalize_dob(text)
        if not dob:
            await update.message.reply_text('Invalid DOB — use DD/MM/YYYY.\nExample: 01/01/1991')
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
        wait = await update.message.reply_text('⏳ Sending OTP 1…')
        progress = LoadingScreen(wait, a_sess.name, a_sess.mobile, title='OTP 1', subtitle='EID')
        try:
            result = await _run_aadhar_with_ui(
                update, a_sess, progress, a_sess.phase1_otp_manual, text,
                phase='Phase 1', send_captcha=False,
            )
            if result.get('otp_ok'):
                FLOW[cid]['step'] = STEP_OTP_1
                await progress.done(uidai_user_message(result, kind='otp'))
            else:
                await progress.fail(result.get('msg') or 'OTP 1 failed')
        except Exception as e:
            await progress.fail(f'OTP 1 fail: {e}')
        return

    if step == STEP_CAPTCHA_2 and mode == FLOW_MODE_DOWNLOAD:
        if not CAPTCHA_RE.match(text):
            await update.message.reply_text('Captcha must be 4–8 letters/numbers.')
            return
        a_sess = get_aadhar_session(cid)
        if not a_sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /pdf again.')
            return
        wait = await update.message.reply_text('⏳ Sending OTP 2…')
        progress = LoadingScreen(wait, a_sess.name, a_sess.mobile, title='OTP 2', subtitle='Phase 2')
        try:
            result = await _run_aadhar_with_ui(
                update, a_sess, progress, a_sess.phase2_otp_manual, text,
                phase='Phase 2', send_captcha=False,
            )
            if result.get('otp_ok'):
                FLOW[cid]['step'] = STEP_OTP_2
                await progress.done(uidai_user_message(result, kind='download_otp'))
            else:
                await progress.fail(result.get('msg') or 'OTP 2 failed')
        except Exception as e:
            await progress.fail(f'OTP 2 fail: {e}')
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
        wait = await update.message.reply_text('⏳ Verifying OTP 1…')
        progress = LoadingScreen(
            wait, a_sess.name, a_sess.mobile,
            title='Phase 1',
            subtitle='EID retrieve',
        )
        try:
            _wire_aadhar_logs(a_sess, progress)
            result = await run_aadhar(a_sess.phase1_verify, text)
            eid = result.get('eid') or ''
            if result.get('retrieve_ok'):
                await progress.done(uidai_user_message({**result, 'eid': eid}, kind='retrieve'))
                await _phase2_after_otp1(update, cid, a_sess)
            else:
                FLOW[cid]['step'] = STEP_OTP_1
                await progress.fail(result.get('msg') or 'OTP 1 verify failed')
        except Exception as e:
            log.exception('otp1 verify failed')
            FLOW[cid]['step'] = STEP_OTP_1
            await progress.fail(f'OTP 1 fail: {e}')
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
        wait = await update.message.reply_text('⏳ Downloading PDF…')
        progress = LoadingScreen(
            wait, a_sess.name, a_sess.mobile,
            title='PDF Download',
            subtitle='Phase 2 verify',
        )
        try:
            _wire_aadhar_logs(a_sess, progress)
            result = await run_aadhar(a_sess.phase2_download, text)
            if result.get('download_ok'):
                pdf = result.get('pdf_bytes') or b''
                pdf_pass = FLOW.get(cid, {}).get('pdf_password') or pdf_password(
                    a_sess.name, a_sess.dob_raw,
                )
                await progress.done(uidai_user_message(result, kind='download'))
                await update.message.reply_document(
                    document=pdf,
                    filename='eaadhaar.pdf',
                    caption=(
                        '✅ e-Aadhaar PDF\n'
                        f'Password: {pdf_pass}\n'
                        '(first 4 name letters CAPS + birth year)'
                    ),
                )
                clear_flow(cid)
                clear_http_session(cid)
                browser_sess = SESSIONS.pop(cid, None)
                if browser_sess:
                    await browser_sess.close(keep_warm=True)
            else:
                FLOW[cid]['step'] = STEP_OTP_2
                await progress.fail(uidai_user_message(result, kind='download'))
        except Exception as e:
            log.exception('pdf download failed')
            FLOW[cid]['step'] = STEP_OTP_2
            await progress.fail(f'Download fail: {e}')
        return

    if step == STEP_OTP:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP from SMS. Example: 482910')
            return
        sess = get_session(cid)
        if not sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — use /open again.')
            return
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': None}
        wait_msg = await update.message.reply_text('⏳ Verifying OTP…')
        otp_progress = LoadingScreen(
            wait_msg, sess.name, sess.mobile,
            title='Retrieve Aadhaar',
            subtitle='OTP verification',
        )

        async def retrieve_step(n: int, total: int, msg: str) -> None:
            await otp_progress.update(n, total, msg)

        try:
            result = await sess.submit_otp(text, on_step=retrieve_step)
            retrieve_ok = result.get('retrieve_ok', False)
            user_msg = uidai_user_message(result, kind='retrieve')
            if retrieve_ok:
                await otp_progress.done(user_msg)
            else:
                await otp_progress.fail(user_msg)
            if retrieve_ok:
                sess.touch()
                await update.message.reply_text(
                    f'🔒 Session active — {sess.ttl_label()} left\n'
                    'Again: /open MOBILE ⚡\n'
                    'Full reload: /open fresh MOBILE'
                )
                try:
                    await sess.prefetch_captcha()
                except Exception:
                    pass
                FLOW[cid] = {
                    'step': STEP_CAPTCHA,
                    'name': sess.name,
                    'mobile': sess.mobile,
                }
            else:
                FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        except Exception as e:
            log.exception('retrieve failed')
            await otp_progress.fail(f'Retrieve fail: {e}')
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        return

    if step != STEP_CAPTCHA:
        return

    if mode == FLOW_MODE_RETRIEVE and text.lower() in ('auto', 'skip', 'bypass'):
        sess = get_session(cid)
        if not sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /open again.')
            return
        wait = await update.message.reply_text('⏳ Auto captcha…')
        progress = LoadingScreen(wait, sess.name, sess.mobile, title='Send OTP', subtitle='Auto bypass')
        try:
            result = await sess.auto_send_otp(on_step=progress.update)
            if result.get('otp_ok'):
                FLOW[cid]['step'] = STEP_OTP
                await progress.done(uidai_user_message(result, kind='otp'))
            else:
                await progress.fail(uidai_user_message(result, kind='otp'))
        except Exception as e:
            await progress.fail(f'Auto fail: {e}')
        return

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha must be 4–8 letters/numbers. Example: 6fhxdf')
        return

    sess = get_session(cid)
    if not sess:
        clear_flow(cid)
        await update.message.reply_text('Session expire — /open dubara.')
        return

    FLOW[cid] = {**FLOW.get(cid, {}), 'step': None}
    wait_msg = await update.message.reply_text('⏳ Sending OTP…')
    otp_progress = LoadingScreen(
        wait_msg, sess.name, sess.mobile,
        title='Send OTP',
        subtitle='UIDAI verification',
    )

    async def otp_step(n: int, total: int, msg: str) -> None:
        await otp_progress.update(n, total, msg)

    try:
        result = await sess.send_otp(text, on_step=otp_step)
        otp_ok = result.get('otp_ok')
        if otp_ok is None:
            otp_ok = any(
                'OTP sent' in (x.get('m') or '') for x in result.get('logs', [])
            )
        user_msg = uidai_user_message(result, kind='otp')

        if otp_ok:
            await otp_progress.done(user_msg)
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        else:
            await otp_progress.fail(user_msg)
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    except Exception as e:
        log.exception('otp failed')
        await otp_progress.fail(f'OTP fail: {e}')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}


async def benchmark_proxy_job(context) -> None:
    """Background — 50 proxy test, fastest first save."""
    import asyncio
    from pathlib import Path

    if baked_session_ready():
        log.info('Proxy benchmark skip — baked working proxy use ho raha hai')
        return

    ranked = Path(__file__).parent / 'proxy_ranked.json'
    if ranked.exists() and (time.time() - ranked.stat().st_mtime) < 3600 * 4:
        return
    try:
        from benchmark_proxies import benchmark_pool
        from proxy_india import save_ranked_proxies

        rows = await asyncio.to_thread(benchmark_pool, 50)
        if rows:
            save_ranked_proxies(rows)
            log.info('Proxy benchmark done — fastest %s', rows[0]['proxy'])
    except Exception as e:
        log.warning('proxy benchmark skip: %s', e)


async def warm_pool_job(context) -> None:
    """Bot start — baked working proxy se page pre-load (turant /open)."""
    if pool_is_warm():
        return
    if not cookie_jar_ready() and not baked_session_ready():
        log.info('Pool warm skip — cookies nahi')
        return
    from uidai_cookie_session import get_baked_proxy, use_baked_proxy_fast

    proxy = None
    if use_baked_proxy_fast():
        proxy = get_baked_proxy()
        log.info('Pool warm — baked proxy %s', proxy)
    elif PROXY and str(PROXY).lower() not in ('auto', 'india', ''):
        proxy = PROXY
    await ensure_pool_warm(proxy)


async def standby_captcha_job(context) -> None:
    """Refresh pre-captured standby captcha."""
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


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    err = context.error
    if isinstance(err, Conflict):
        log.error(
            '409 Conflict — same bot token do jagah polling ho rahi hai.\n'
            'VPS pe: pkill -9 -f bot.py && bash start.sh\n'
            'Local/duplicate copy band karo.'
        )
        return
    if err:
        log.exception('Bot error: %s', err)


def main() -> None:
    if not TOKEN:
        raise SystemExit(
            '❌ TELEGRAM_BOT_TOKEN missing!\n\n'
            f'  cd {Path(__file__).parent}\n'
            '  bash setup.sh "YOUR_BOT_TOKEN" "8432393497"\n'
            '  or set TELEGRAM_BOT_TOKEN in .env'
        )
    if ':' not in TOKEN or len(TOKEN) < 20:
        raise SystemExit(
            '❌ Invalid TELEGRAM_BOT_TOKEN — copy the correct token from @BotFather'
        )

    if baked_session_ready():
        sync_baked_to_runtime_jar()
        log.info('Baked UIDAI session loaded — all chats use isolated cookie copies')

    async def _bot_post_init(application: Application) -> None:
        """Startup inside PTB event loop — asyncio.run() mat use karo."""
        try:
            if baked_session_ready():
                from uidai_cookie_session import get_baked_proxy, use_baked_proxy_fast

                proxy = get_baked_proxy() if use_baked_proxy_fast() else None
                log.info('Startup pool warm — proxy=%s', proxy or 'direct')
                await ensure_pool_warm(proxy)
        except Exception as e:
            log.warning('post_init pool warm skip: %s', e)
        try:
            from aadhar import ensure_whisper_loaded

            ensure_whisper_loaded()
        except Exception as e:
            log.warning('post_init whisper skip: %s', e)

    app = (
        Application.builder()
        .token(TOKEN)
        .post_init(_bot_post_init)
        .build()
    )
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
    app.add_handler(CommandHandler('pdf', cmd_pdf))
    app.add_handler(CommandHandler('download', cmd_pdf))  # alias
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

    if app.job_queue:
        app.job_queue.run_once(warm_pool_job, when=1)
        if not baked_session_ready():
            app.job_queue.run_once(benchmark_proxy_job, when=30)
        app.job_queue.run_repeating(standby_captcha_job, interval=300, first=90)
        app.job_queue.run_repeating(keepalive_job, interval=KEEPALIVE_INTERVAL_SEC, first=120)
        log.info('24h keepalive every %ss', KEEPALIVE_INTERVAL_SEC)

    log.info(
        'Bot start v%s — access: %s approved: %s owner: %s proxy: %s http: %s',
        BOT_ENGINE_VERSION,
        ACCESS.mode,
        ACCESS.approved_count,
        OWNER_ID or '—',
        PROXY or 'auto',
        os.getenv('UIDAI_HTTP_MODE', 'auto'),
    )
    app.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == '__main__':
    main()
