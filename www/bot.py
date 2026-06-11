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

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

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

from browser_session import KEEPALIVE_INTERVAL_SEC, UidaiBrowserSession
from uidai_api import BOT_ENGINE_VERSION, PLACEHOLDER_NAME, is_skip_name, normalize_name

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
STEP_CAPTCHA = 'captcha'
STEP_OTP = 'otp'

OTP_RE = re.compile(r'^\d{6}$')

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


async def guard(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    if ACCESS.allowed(user_id, chat_id):
        return True
    hint = (
        '🔒 Bot abhi locked hai — sirf approved users use kar sakte hain.\n\n'
        f'Aapka Chat ID: `{chat_id}`\n'
        'Owner se approval mangwao (/myid bhej sakte ho).'
    )
    await update.message.reply_text(hint, parse_mode='Markdown')
    return False


def is_owner(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    return ACCESS.is_owner(user_id, chat_id)


def get_session(chat_id: int) -> UidaiBrowserSession | None:
    return SESSIONS.get(chat_id)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    lines = [
        f'🔐 Rebel Aadhaar — UIDAI Bot v{BOT_ENGINE_VERSION}',
        '',
        'Commands:',
        '/open — naam + mobile',
        '/open 7651892956 — sirf mobile (24h reuse ⚡)',
        '/open fresh 7651892956 — pura naya load',
        '/captcha · /refresh · /status · /close',
        '/myid — apna chat ID dekho',
        '',
        'Flow: naam → mobile → captcha → OTP → Aadhaar SMS',
        '',
        '👥 Multiple users ek saath use kar sakte hain — har user ka alag session.',
    ]
    if is_owner(update):
        lines.extend([
            '',
            '👑 Owner commands:',
            '/free — sabko access do',
            '/lock — sirf approved users',
            '/approve CHAT_ID · /deny CHAT_ID',
            '/access — access control status',
        ])
    await update.message.reply_text('\n'.join(lines))


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
    if sess:
        await sess.close(keep_warm=False)
    await update.message.reply_text('Session band — browser pool bhi band.')


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    step = flow_step(cid)
    if not sess and not step:
        await update.message.reply_text('Koi active session nahi — /open chalao.')
        return
    draft = FLOW.get(cid, {})
    step_labels = {
        STEP_NAME: 'Naam enter karo',
        STEP_MOBILE: 'Mobile enter karo',
        STEP_CAPTCHA: 'Captcha enter karo',
        STEP_OTP: 'OTP enter karo',
    }
    lines = [
        '━━━━━━━━━━━━━━━━━━━━',
        '  📊 Session Status',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        f'Step: {step_labels.get(step, "Ready" if not step else step)}',
    ]
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
    await update.message.reply_text('\n'.join(lines))


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    user_id, chat_id = _ids(update)
    await update.message.reply_text(
        f'🆔 Aapka Chat ID: `{chat_id}`\n'
        f'User ID: `{user_id}`\n\n'
        'Owner ko ye ID bhejo approval ke liye.',
        parse_mode='Markdown',
    )


async def cmd_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Sirf owner /access use kar sakta hai.')
        return
    lines = [
        '━━━━━━━━━━━━━━━━━━━━',
        '  👑 Access Control',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        *ACCESS.status_lines(len(SESSIONS)),
        '',
        '/free — sab users | /lock — approved only',
        '/approve CHAT_ID · /deny CHAT_ID',
    ]
    await update.message.reply_text('\n'.join(lines))


async def cmd_free(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Sirf owner /free use kar sakta hai.')
        return
    ACCESS.set_free()
    await update.message.reply_text(
        '🌍 Bot OPEN — ab koi bhi user /start karke use kar sakta hai.\n'
        'Wapas lock: /lock'
    )


async def cmd_lock(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Sirf owner /lock use kar sakta hai.')
        return
    ACCESS.set_locked()
    await update.message.reply_text(
        '🔒 Bot LOCKED — sirf approved users access kar sakte hain.\n'
        f'Approved: {ACCESS.approved_count} users\n'
        'Naya user: /approve CHAT_ID'
    )


async def cmd_approve(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Sirf owner /approve use kar sakta hai.')
        return
    if not context.args:
        await update.message.reply_text('Usage: /approve CHAT_ID')
        return
    uid = context.args[0].strip()
    ACCESS.approve(uid)
    await update.message.reply_text(f'✅ Approved: `{uid}`', parse_mode='Markdown')


async def cmd_deny(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_owner(update):
        await update.message.reply_text('Sirf owner /deny use kar sakta hai.')
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
        await update.message.reply_text('/open pehle chalao.')
        return
    wait = await update.message.reply_text('🔄 Captcha image la raha hoon…')
    try:
        png = await sess.captcha_png()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption='Captcha bharo — text reply karo')
    except Exception as e:
        await wait.edit_text(f'Captcha fail: {e}')


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('/open pehle chalao.')
        return
    wait = await update.message.reply_text('🔄 Naya captcha load…')
    try:
        png = await sess.refresh_captcha()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption='Naya captcha — text reply karo')
    except Exception as e:
        await wait.edit_text(f'Refresh fail: {e}')


async def _send_captcha_ready(
    update: Update,
    sess: UidaiBrowserSession,
    progress: LoadingScreen,
    *,
    reused: bool = False,
) -> None:
    cap = await sess.captcha_png()
    ttl = f' · {sess.ttl_label()} session' if sess.last_activity_at else ''
    fast = '⚡ ' if reused else ''
    await update.message.reply_photo(
        photo=cap,
        caption=(
            f'{fast}Captcha image ↑\n'
            '4-8 characters reply karo\n'
            '/refresh — naya captcha'
            f'{ttl}'
        ),
    )
    await progress.done('Captcha ready — text reply karo')


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
            '❌ Indian VPN connect fail.\n\n'
            'VPS .env me ye add karo:\n'
            'UIDAI_PROXY=http://117.236.124.166:3128\n\n'
            'Phir: /close → /open dubara'
        )
    if 'browser' in low or 'closed' in low or 'chromium' in low:
        return '❌ Browser crash.\n/close phir /open dubara try karo.'
    if 'uidai open' in low or 'timeout' in low:
        return '❌ UIDAI site slow/down.\nThodi der baad /open fresh try karo.'
    if msg and len(msg) < 200:
        return f'❌ {msg}\n\n/close phir /open dubara'
    return '❌ Connection fail.\n/close phir /open dubara try karo.'


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
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile}

    existing = SESSIONS.get(chat_id)
    if not force_new and existing and await existing.page_alive():
        status_msg = await update.message.reply_text('⏳ Session reuse…')
        progress = LoadingScreen(
            status_msg, name, mobile,
            title='Fast Reopen',
            subtitle='24h session active',
        )

        async def on_step(n: int, total: int, text: str) -> None:
            await progress.update(n, total, text)

        existing._on_step = on_step
        try:
            await existing.start()
            await existing.open_form(name, mobile, force_reload=False)
            await _send_captcha_ready(update, existing, progress, reused=True)
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

    status_msg = await update.message.reply_text('⏳ Loading…')
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
        await _send_captcha_ready(update, sess, progress)
    except Exception as e:
        await _fail_open(chat_id, sess, progress, e)


async def cmd_open(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not TOKEN:
        await update.message.reply_text('TELEGRAM_BOT_TOKEN .env me set karo.')
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
            await update.message.reply_text('Mobile 10 digit hona chahiye (6-9 se start). Example: 7651892956')
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
            '/open 7651892956 — reuse 24h session ⚡\n'
            '/open fresh 7651892956 — pura naya load\n'
            '/open KAMAR JAHAN 7651892956 — naam + mobile'
        )
        return

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close(keep_warm=True)
    FLOW[cid] = {'step': STEP_NAME}
    await update.message.reply_text(
        'Naam bhejo (jaise Aadhaar pe likha hai)\n'
        'Example: KAMAR JAHAN\n\n'
        'Naam nahi pata? Sirf "Mr" ya "skip" bhejo — kaam chal jayega\n\n'
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

    if step == STEP_NAME:
        if not valid_name_input(text):
            await update.message.reply_text(
                'Naam letters/spaces me hona chahiye.\n'
                'Example: KAMAR JAHAN\n'
                'Ya naam nahi pata? "Mr" ya "skip" bhejo'
            )
            return
        name = normalize_name(text)
        FLOW[cid] = {'step': STEP_MOBILE, 'name': name}
        hint = (
            f'Naam skip — {PLACEHOLDER_NAME} use hoga (jaise DOB skip)\n\n'
            if is_skip_name(text)
            else f'Naam: {name}\n\n'
        )
        await update.message.reply_text(
            f'{hint}'
            'Ab 10 digit mobile number bhejo (OTP isi pe aayega).\n'
            'Example: 7651892956'
        )
        return

    if step == STEP_MOBILE:
        mobile = re.sub(r'\s+', '', text)
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text(
                'Galat number — 10 digit hona chahiye, 6-9 se start.\nExample: 7651892956'
            )
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        await update.message.reply_text(f'OK — {name} / {mobile}')
        await open_uidai_session(update, cid, name, mobile)
        return

    if step == STEP_OTP:
        if not OTP_RE.match(text):
            await update.message.reply_text('6 digit OTP bhejo (SMS wala). Example: 482910')
            return
        sess = get_session(cid)
        if not sess:
            clear_flow(cid)
            await update.message.reply_text('Session expire — /open dubara.')
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
                    f'🔒 Session live — {sess.ttl_label()} baki\n'
                    'Dubara: /open MOBILE ⚡\n'
                    'Fresh load: /open fresh MOBILE'
                )
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

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha 4-8 letters/numbers hona chahiye. Example: 6fhxdf')
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


def main() -> None:
    if not TOKEN:
        raise SystemExit(
            '❌ TELEGRAM_BOT_TOKEN missing!\n\n'
            f'  cd {Path(__file__).parent}\n'
            '  bash setup.sh "BOT_TOKEN_YAHAN" "8432393497"\n'
            '  ya .env me TELEGRAM_BOT_TOKEN=... likho'
        )
    if ':' not in TOKEN or len(TOKEN) < 20:
        raise SystemExit(
            '❌ TELEGRAM_BOT_TOKEN galat lag raha hai — @BotFather se sahi token copy karo'
        )

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
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

    if app.job_queue:
        app.job_queue.run_repeating(keepalive_job, interval=KEEPALIVE_INTERVAL_SEC, first=120)
        log.info('24h keepalive every %ss', KEEPALIVE_INTERVAL_SEC)

    log.info(
        'Bot start v%s — access: %s approved: %s owner: %s proxy: %s',
        BOT_ENGINE_VERSION,
        ACCESS.mode,
        ACCESS.approved_count,
        OWNER_ID or '—',
        PROXY or 'auto',
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
