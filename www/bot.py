#!/usr/bin/env python3
"""Telegram bot — UIDAI live steps + terminal logs + multi-proxy."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from browser_session import UidaiBrowserSession
from tg_reporter import ReporterLogHandler, TelegramReporter

load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('uidai-bot')

TG_LOG = ReporterLogHandler()
for name in ('uidai-bot', 'uidai-browser', 'proxy-india', 'httpx', 'telegram'):
    logging.getLogger(name).addHandler(TG_LOG)
    logging.getLogger(name).setLevel(logging.INFO)

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
ALLOWED = {
    x.strip()
    for x in os.getenv('TELEGRAM_ALLOWED_CHAT_IDS', '').split(',')
    if x.strip()
}
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
BUNDLE = Path(os.getenv('REBEL_BUNDLE_PATH', '../browser-extension/page-bundle.js'))
if not BUNDLE.is_absolute():
    BUNDLE = (Path(__file__).parent / BUNDLE).resolve()

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')

STEP_NAME = 'name'
STEP_MOBILE = 'mobile'
STEP_CAPTCHA = 'captcha'

SESSIONS: dict[int, UidaiBrowserSession] = {}
FLOW: dict[int, dict] = {}


def allowed(update: Update) -> bool:
    if not ALLOWED:
        return True
    cid = str(update.effective_chat.id) if update.effective_chat else ''
    return cid in ALLOWED


def clear_flow(chat_id: int) -> None:
    FLOW.pop(chat_id, None)


def flow_step(chat_id: int) -> str | None:
    return FLOW.get(chat_id, {}).get('step')


async def guard(update: Update) -> bool:
    if not allowed(update):
        await update.message.reply_text('Unauthorized — TELEGRAM_ALLOWED_CHAT_IDS me apna chat id dalo.')
        return False
    return True


def get_session(chat_id: int) -> UidaiBrowserSession | None:
    return SESSIONS.get(chat_id)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    await update.message.reply_text(
        'Rebel Adhar — UIDAI Live Bot\n\n'
        '/open — naam + mobile → live steps + terminal logs\n'
        '/open KAMAR JAHAN 7651892956 — seedha\n'
        '/captcha /refresh /status /close\n\n'
        'Multi Indian proxy auto + fast load\n'
        'Saare logs Telegram pe dikhenge'
    )


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
    TG_LOG.set_reporter(None)
    if sess:
        await sess.close()
    await update.message.reply_text('Session band.')


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    step = flow_step(cid)
    if not sess and not step:
        await update.message.reply_text('Koi session nahi — /open chalao.')
        return
    draft = FLOW.get(cid, {})
    lines = [f'Flow: {step or "none"}']
    if draft.get('name'):
        lines.append(f'Name: {draft["name"]}')
    if draft.get('mobile'):
        lines.append(f'Mobile: {draft["mobile"]}')
    if sess:
        lines.extend([
            'Session ON',
            f'VPN: {sess.proxy_label or "auto"}',
            f'Proxy: {sess.proxy or "—"}',
            f'Bundle: {BUNDLE.name}',
        ])
    await update.message.reply_text('\n'.join(lines))


async def cmd_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('/open pehle chalao.')
        return
    wait = await update.message.reply_text('🔄 Captcha…')
    try:
        png = await sess.captcha_png()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption='Captcha reply karo')
    except Exception as e:
        await wait.edit_text(f'Fail: {e}')


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('/open pehle chalao.')
        return
    wait = await update.message.reply_text('🔄 Refresh…')
    try:
        png = await sess.refresh_captcha()
        await wait.delete()
        await update.message.reply_photo(photo=png, caption='Naya captcha')
    except Exception as e:
        await wait.edit_text(f'Fail: {e}')


async def open_uidai_session(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
) -> None:
    old = SESSIONS.pop(chat_id, None)
    if old:
        await old.close()

    status_msg = await update.message.reply_text('🚀 Start…')
    reporter = TelegramReporter(status_msg, name, mobile)
    TG_LOG.set_reporter(reporter)

    async def on_step(n: int, total: int, text: str) -> None:
        await reporter.update(n, total, text)

    async def on_log(line: str) -> None:
        await reporter.log(line)

    sess = UidaiBrowserSession(
        BUNDLE,
        proxy=PROXY,
        auto_india_proxy=AUTO_INDIA,
        on_step=on_step,
        on_log=on_log,
    )
    SESSIONS[chat_id] = sess
    clear_flow(chat_id)
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile}

    reporter.start_heartbeat('Loading')
    try:
        await reporter.update(1, 8, 'Session start…')
        await reporter.log('Bot ready — proxy + browser')
        await sess.start()
        if sess.proxy_label:
            await reporter.set_proxy(sess.proxy_label)

        await sess.open_form(name, mobile)
        cap = await sess.captcha_png()
        reporter.stop_heartbeat()
        await update.message.reply_photo(
            photo=cap,
            caption='Captcha ↑ — text reply karo\n/refresh = naya',
        )
        await reporter.done('✅ Ready — captcha bhejo')
    except Exception as e:
        log.exception('open failed')
        reporter.stop_heartbeat()
        await reporter.log(f'ERROR: {e}')
        await sess.close()
        SESSIONS.pop(chat_id, None)
        clear_flow(chat_id)
        await reporter.fail(f'❌ {e}')
    finally:
        await reporter.close()
        TG_LOG.set_reporter(None)


async def cmd_open(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not TOKEN:
        await update.message.reply_text('TELEGRAM_BOT_TOKEN .env me set karo.')
        return
    if not BUNDLE.is_file():
        await update.message.reply_text(f'Bundle missing: {BUNDLE}')
        return

    cid = update.effective_chat.id
    args = context.args or []

    if len(args) >= 2:
        name = ' '.join(args[:-1])
        mobile = args[-1]
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Mobile 10 digit (6-9 start). Ex: 7651892956')
            return
        await open_uidai_session(update, cid, name.upper(), mobile)
        return

    if len(args) == 1:
        await update.message.reply_text('/open NAAM MOBILE\nEx: /open KAMAR JAHAN 7651892956')
        return

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close()
    FLOW[cid] = {'step': STEP_NAME}
    await update.message.reply_text('Naam bhejo (Aadhaar registered)\nEx: KAMAR JAHAN\n/cancel = /close')


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
        if not NAME_RE.match(text):
            await update.message.reply_text('Galat naam. Ex: KAMAR JAHAN')
            return
        FLOW[cid] = {'step': STEP_MOBILE, 'name': text.upper()}
        await update.message.reply_text(f'Naam OK: {text.upper()}\nAb mobile bhejo (10 digit)')
        return

    if step == STEP_MOBILE:
        mobile = re.sub(r'\s+', '', text)
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Galat mobile. Ex: 7651892956')
            return
        name = FLOW.get(cid, {}).get('name', DEFAULT_NAME)
        await open_uidai_session(update, cid, name, mobile)
        return

    if step != STEP_CAPTCHA:
        return

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha 4-8 chars. Ex: 6fhxdf')
        return

    sess = get_session(cid)
    if not sess:
        clear_flow(cid)
        await update.message.reply_text('Session expire — /open')
        return

    FLOW[cid] = {**FLOW.get(cid, {}), 'step': None}
    wait_msg = await update.message.reply_text('🚀 OTP…')
    reporter = TelegramReporter(wait_msg, sess.name, sess.mobile, title='Send OTP')
    TG_LOG.set_reporter(reporter)
    if sess.proxy_label:
        await reporter.set_proxy(sess.proxy_label)

    async def otp_step(n: int, total: int, msg: str) -> None:
        await reporter.update(n, total, msg)

    async def otp_log(line: str) -> None:
        await reporter.log(line)

    sess._on_log = otp_log

    try:
        result = await sess.send_otp(text, on_step=otp_step)
        summary = result.get('summary', '')
        version = result.get('version', '?')

        otp_ok = any(
            'OTP sent' in (x.get('m') or '') or 'UIDAI ko OTP' in (x.get('m') or '')
            for x in result.get('logs', [])
        )
        status = '✅ SMS check karo' if otp_ok else '⚠️ Captcha galat ho sakta — /refresh'

        await reporter.done(status)
        await update.message.reply_text(f'Engine logs (v{version}):\n{summary[:3500]}')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    except Exception as e:
        log.exception('otp failed')
        await reporter.fail(f'OTP fail: {e}')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    finally:
        TG_LOG.set_reporter(None)


def main() -> None:
    if not TOKEN:
        raise SystemExit('TELEGRAM_BOT_TOKEN .env me set karo')

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
    app.add_handler(CommandHandler('captcha', cmd_captcha))
    app.add_handler(CommandHandler('refresh', cmd_refresh))
    app.add_handler(CommandHandler('status', cmd_status))
    app.add_handler(CommandHandler('close', cmd_close))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    log.info('Bot start — proxy=%s auto_india=%s', PROXY or 'auto', AUTO_INDIA)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
