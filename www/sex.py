#!/usr/bin/env python3
"""
/open SMS retrieve bot — captcha → OTP → Aadhaar/EID on registered mobile.

Direct Indian VPS only (no proxy/VPN). Playwright + UIDAI live page.

Usage:
  cd www
  pip install -r requirements.txt
  playwright install chromium
  python sex.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
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

from bot_access import AccessControl
from bot_ui import LoadingScreen, uidai_user_message
from browser_session import (
    KEEPALIVE_INTERVAL_SEC,
    UidaiBrowserSession,
    ensure_pool_warm,
    get_standby_captcha_png,
    pool_is_warm,
    refresh_standby_captcha,
)
from uidai_cookie_session import baked_session_ready, cookie_jar_ready, sync_baked_to_runtime_jar
from uidai_api import BOT_ENGINE_VERSION, PLACEHOLDER_NAME, is_skip_name, normalize_name

load_dotenv(Path(__file__).parent / '.env')

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

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')
OTP_RE = re.compile(r'^\d{6}$')

STEP_NAME = 'name'
STEP_MOBILE = 'mobile'
STEP_CAPTCHA = 'captcha'
STEP_OTP = 'otp'

SESSIONS: dict[int, UidaiBrowserSession] = {}
FLOW: dict[int, dict] = {}


def _ids(update: Update) -> tuple[str | None, str | None]:
    user_id = str(update.effective_user.id) if update.effective_user else None
    chat_id = str(update.effective_chat.id) if update.effective_chat else None
    return user_id, chat_id


def clear_flow(chat_id: int) -> None:
    FLOW.pop(chat_id, None)


def flow_step(chat_id: int) -> str | None:
    return FLOW.get(chat_id, {}).get('step')


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


def _connection_error_hint(exc: Exception) -> str:
    msg = str(exc).strip()
    low = msg.lower()
    if 'browser' in low or 'closed' in low or 'chromium' in low:
        return '❌ Browser crashed.\nTry /close then /open.'
    if 'uidai open' in low or 'timeout' in low:
        return '❌ UIDAI portal slow or down.\nTry /open fresh in a moment.'
    if msg and len(msg) < 200:
        return f'❌ {msg}\n\nTry /close then /open'
    return '❌ Connection failed.\nTry /close then /open.'


async def _send_captcha_ready(
    update: Update,
    sess: UidaiBrowserSession,
    progress: LoadingScreen,
    *,
    instant_sent: bool = False,
) -> None:
    if not instant_sent:
        cap = await sess.captcha_png(use_cache=True)
        ttl = sess.ttl_label() if sess.last_activity_at else ''
        await update.message.reply_photo(
            photo=cap,
            caption=_captcha_caption(ttl=ttl),
        )
    await progress.done('Captcha ready — reply with 4–8 characters')


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


async def open_uidai_session(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
    *,
    force_new: bool = False,
) -> None:
    """Open UIDAI retrieve page — captcha → OTP SMS → Aadhaar/EID SMS."""
    name = normalize_name(name)
    mobile = mobile.strip()
    clear_flow(chat_id)
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile}

    instant_sent = False
    if not force_new:
        instant_sent = await _try_instant_captcha(update, SESSIONS.get(chat_id))

    existing = SESSIONS.get(chat_id)
    if not force_new and existing and await existing.page_alive():
        status_msg = await update.message.reply_text('⏳ Fast reopen…')
        progress = LoadingScreen(status_msg, name, mobile, title='Fast Reopen', subtitle='Live session')

        async def on_step(n: int, total: int, text: str) -> None:
            await progress.update(n, total, text)

        existing._on_step = on_step
        try:
            await existing.start()
            await existing.open_form(name, mobile, force_reload=False)
            await _send_captcha_ready(update, existing, progress, instant_sent=instant_sent)
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

    sess = UidaiBrowserSession(on_step=on_step)
    SESSIONS[chat_id] = sess

    try:
        await sess.start()
        await sess.open_form(name, mobile, force_reload=force_new)
        await _send_captcha_ready(update, sess, progress, instant_sent=instant_sent)
    except Exception as e:
        await _fail_open(chat_id, sess, progress, e)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    lines = [
        f'🔐 SMS Retrieve Bot v{BOT_ENGINE_VERSION}',
        '',
        'Flow: /open → captcha → OTP → Aadhaar/EID on your SMS',
        '',
        'Commands:',
        '/open — start retrieve session',
        '/open 7651892956 — mobile only ⚡',
        '/open KAMAR JAHAN 7651892956 — name + mobile',
        '/open fresh 7651892956 — full page reload',
        '/captcha · /refresh · /status · /close',
        '/myid — your chat ID',
        '',
        '👥 Each user gets an isolated browser session.',
    ]
    if is_owner(update):
        lines.extend([
            '',
            '👑 Owner: /free · /lock · /approve · /deny · /access',
        ])
    await update.message.reply_text('\n'.join(lines))


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
    if sess:
        await sess.close(keep_warm=True)
    pool_note = '🟢 Browser pool active' if pool_is_warm() else '⏳ Pool warms on next /open'
    await update.message.reply_text(
        f'✅ Session closed.\n{pool_note}\nUse /open again.'
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
    labels = {
        STEP_NAME: 'Enter name',
        STEP_MOBILE: 'Enter mobile',
        STEP_CAPTCHA: 'Enter captcha',
        STEP_OTP: 'Enter OTP from SMS',
    }
    lines = [
        '📊 Session Status',
        f'Step: {labels.get(step, "Ready")}',
    ]
    draft = FLOW.get(cid, {})
    if draft.get('name'):
        lines.append(f'Name: {draft["name"]}')
    if draft.get('mobile'):
        lines.append(f'Mobile: {draft["mobile"]}')
    if sess:
        lines.append(f'Active — {sess.ttl_label()} left')
    lines.append('🟢 Pool warm' if pool_is_warm() else '⚪ Pool idle')
    await update.message.reply_text('\n'.join(lines))


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    user_id, chat_id = _ids(update)
    await update.message.reply_text(
        f'🆔 Your Chat ID: `{chat_id}`\nUser ID: `{user_id}`',
        parse_mode='Markdown',
    )


async def cmd_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Owner only.')
        return
    await update.message.reply_text(
        '👑 Access Control\n\n'
        + '\n'.join(ACCESS.status_lines(len(SESSIONS)))
        + '\n\n/free · /lock · /approve CHAT_ID · /deny CHAT_ID'
    )


async def cmd_free(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        return
    ACCESS.set_free()
    await update.message.reply_text('🌍 Bot is PUBLIC. Lock: /lock')


async def cmd_lock(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        return
    ACCESS.set_locked()
    await update.message.reply_text(f'🔒 Bot LOCKED. Approved: {ACCESS.approved_count}')


async def cmd_approve(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update) or not context.args:
        await update.message.reply_text('Usage: /approve CHAT_ID')
        return
    ACCESS.approve(context.args[0].strip())
    await update.message.reply_text(f'✅ Approved: `{context.args[0]}`', parse_mode='Markdown')


async def cmd_deny(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update) or not context.args:
        await update.message.reply_text('Usage: /deny CHAT_ID')
        return
    ACCESS.deny(context.args[0].strip())
    await update.message.reply_text(f'🚫 Removed: `{context.args[0]}`', parse_mode='Markdown')


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
            await update.message.reply_text('Mobile must be 10 digits starting with 6–9.')
            return
        await open_uidai_session(update, cid, name, mobile, force_new=force_new)
        return

    if len(args) == 1 and MOBILE_RE.match(args[0].strip()):
        await open_uidai_session(update, cid, PLACEHOLDER_NAME, args[0].strip(), force_new=force_new)
        return

    if len(args) == 1:
        await update.message.reply_text(
            'Examples:\n/open 7651892956\n/open fresh 7651892956\n/open NAME 7651892956'
        )
        return

    SESSIONS.pop(cid, None)
    clear_flow(cid)
    FLOW[cid] = {'step': STEP_NAME}
    await update.message.reply_text(
        'Send full name (as on Aadhaar)\nExample: KAMAR JAHAN\n\n'
        'Unknown? Send "Mr" or "skip"\n\nCancel: /close'
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

    if step == STEP_NAME:
        if not valid_name_input(text):
            await update.message.reply_text('Invalid name. Example: KAMAR JAHAN or Mr/skip')
            return
        name = normalize_name(text)
        FLOW[cid] = {'step': STEP_MOBILE, 'name': name}
        hint = f'Name skipped — {PLACEHOLDER_NAME}\n\n' if is_skip_name(text) else f'Name: {name}\n\n'
        await update.message.reply_text(f'{hint}Send 10-digit mobile (OTP goes to this number).')
        return

    if step == STEP_MOBILE:
        mobile = re.sub(r'\s+', '', text)
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Invalid mobile — 10 digits starting with 6–9.')
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        await update.message.reply_text(f'OK — {name} / {mobile}')
        await open_uidai_session(update, cid, name, mobile)
        return

    if step == STEP_OTP:
        if not OTP_RE.match(text):
            await update.message.reply_text('Send 6-digit OTP from SMS.')
            return
        sess = get_session(cid)
        if not sess:
            clear_flow(cid)
            await update.message.reply_text('Session expired — /open again.')
            return

        FLOW[cid] = {**FLOW.get(cid, {}), 'step': None}
        wait_msg = await update.message.reply_text('⏳ Verifying OTP…')
        progress = LoadingScreen(
            wait_msg, sess.name, sess.mobile,
            title='Retrieve Aadhaar',
            subtitle='OTP verification',
        )

        async def retrieve_step(n: int, total: int, msg: str) -> None:
            await progress.update(n, total, msg)

        try:
            result = await sess.submit_otp(text, on_step=retrieve_step)
            ok = result.get('retrieve_ok', False)
            msg = uidai_user_message(result, kind='retrieve')
            if ok:
                await progress.done(msg)
                sess.touch()
                await update.message.reply_text(
                    f'🔒 Session active — {sess.ttl_label()} left\n'
                    'Again: /open MOBILE\nFull reload: /open fresh MOBILE'
                )
                try:
                    await sess.prefetch_captcha()
                except Exception:
                    pass
                FLOW[cid] = {'step': STEP_CAPTCHA, 'name': sess.name, 'mobile': sess.mobile}
            else:
                await progress.fail(msg)
                FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        except Exception as e:
            log.exception('retrieve failed')
            await progress.fail(f'Retrieve fail: {e}')
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        return

    if step != STEP_CAPTCHA:
        return

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha must be 4–8 letters/numbers. Example: 6fhxdf')
        return

    sess = get_session(cid)
    if not sess:
        clear_flow(cid)
        await update.message.reply_text('Session expired — /open again.')
        return

    FLOW[cid] = {**FLOW.get(cid, {}), 'step': None}
    wait_msg = await update.message.reply_text('⏳ Sending OTP to your mobile…')
    progress = LoadingScreen(
        wait_msg, sess.name, sess.mobile,
        title='Send OTP',
        subtitle='UIDAI verification',
    )

    async def otp_step(n: int, total: int, msg: str) -> None:
        await progress.update(n, total, msg)

    try:
        result = await sess.send_otp(text, on_step=otp_step)
        otp_ok = result.get('otp_ok')
        if otp_ok is None:
            otp_ok = any('OTP sent' in (x.get('m') or '') for x in result.get('logs', []))
        user_msg = uidai_user_message(result, kind='otp')
        if otp_ok:
            await progress.done(user_msg)
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        else:
            await progress.fail(user_msg)
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    except Exception as e:
        log.exception('otp failed')
        await progress.fail(f'OTP fail: {e}')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}


async def warm_pool_job(context) -> None:
    if os.getenv('UIDAI_POOL_WARM', '0').strip().lower() in ('0', 'false', 'no', 'off'):
        return
    if pool_is_warm():
        return
    try:
        await asyncio.wait_for(ensure_pool_warm(), timeout=45)
    except Exception as e:
        log.warning('pool warm skip: %s', e)


async def standby_captcha_job(context) -> None:
    try:
        await refresh_standby_captcha()
    except Exception as e:
        log.debug('standby captcha: %s', e)


async def keepalive_job(context) -> None:
    for cid, sess in list(SESSIONS.items()):
        try:
            if await sess.keepalive_ping():
                continue
            await sess.close(keep_warm=True)
            SESSIONS.pop(cid, None)
        except Exception as e:
            log.warning('keepalive chat=%s: %s', cid, e)


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, Conflict):
        log.error('409 Conflict — stop duplicate bot.py / sex.py instances')
        return
    if context.error:
        log.exception('Bot error: %s', context.error)


def main() -> None:
    if not TOKEN:
        raise SystemExit('❌ TELEGRAM_BOT_TOKEN missing in .env')

    if baked_session_ready():
        sync_baked_to_runtime_jar()

    async def _post_init(application: Application) -> None:
        if os.getenv('UIDAI_POOL_WARM', '0').strip().lower() in ('0', 'false', 'no', 'off'):
            return
        try:
            import playwright  # noqa: F401
            await asyncio.wait_for(ensure_pool_warm(), timeout=45)
        except Exception as e:
            log.warning('post_init pool warm skip: %s', e)

    app = Application.builder().token(TOKEN).post_init(_post_init).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
    app.add_handler(CommandHandler('close', cmd_close))
    app.add_handler(CommandHandler('status', cmd_status))
    app.add_handler(CommandHandler('captcha', cmd_captcha))
    app.add_handler(CommandHandler('refresh', cmd_refresh))
    app.add_handler(CommandHandler('myid', cmd_myid))
    app.add_handler(CommandHandler('access', cmd_access))
    app.add_handler(CommandHandler('free', cmd_free))
    app.add_handler(CommandHandler('lock', cmd_lock))
    app.add_handler(CommandHandler('approve', cmd_approve))
    app.add_handler(CommandHandler('deny', cmd_deny))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    app.add_error_handler(on_error)

    if app.job_queue:
        app.job_queue.run_once(warm_pool_job, when=2)
        app.job_queue.run_repeating(standby_captcha_job, interval=300, first=90)
        app.job_queue.run_repeating(keepalive_job, interval=KEEPALIVE_INTERVAL_SEC, first=120)

    log.info('sex.py start v%s — owner=%s access=%s', BOT_ENGINE_VERSION, OWNER_ID, ACCESS.mode)
    app.run_polling(drop_pending_updates=True)


if __name__ == '__main__':
    main()
