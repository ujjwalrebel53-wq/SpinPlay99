#!/usr/bin/env python3
"""
Telegram bot — UIDAI retrieve page live + captcha Telegram se bharo.

Usage:
  cp .env.example .env   # token + chat id bharo
  pip install -r requirements.txt
  playwright install chromium
  python bot.py
"""

from __future__ import annotations

import io
import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from telegram import InputFile, Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from browser_session import UidaiBrowserSession

load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('uidai-bot')

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
ALLOWED = {
    x.strip()
    for x in os.getenv('TELEGRAM_ALLOWED_CHAT_IDS', '').split(',')
    if x.strip()
}
PROXY = os.getenv('UIDAI_PROXY', '').strip() or None
DEFAULT_NAME = os.getenv('UIDAI_NAME', 'KAMAR JAHAN').strip()
DEFAULT_MOBILE = os.getenv('UIDAI_MOBILE', '7651892956').strip()
BUNDLE = Path(os.getenv('REBEL_BUNDLE_PATH', '../browser-extension/page-bundle.js'))
if not BUNDLE.is_absolute():
    BUNDLE = (Path(__file__).parent / BUNDLE).resolve()

CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')

# chat_id -> session
SESSIONS: dict[int, UidaiBrowserSession] = {}
# chat_id waiting for captcha after /open
WAITING_CAPTCHA: set[int] = set()


def allowed(update: Update) -> bool:
    if not ALLOWED:
        return True
    cid = str(update.effective_chat.id) if update.effective_chat else ''
    return cid in ALLOWED


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
        'Commands:\n'
        '/open — site kholo (name/mobile .env se)\n'
        '/open KAMAR JAHAN 7651892956 — custom data\n'
        '/captcha — captcha image bhejo\n'
        '/refresh — naya captcha\n'
        '/status — session status\n'
        '/close — browser band\n\n'
        '/open ke baad captcha text reply karo (jaise: 6fhxdf)'
    )


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    WAITING_CAPTCHA.discard(cid)
    if sess:
        await sess.close()
    await update.message.reply_text('Session band.')


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = get_session(cid)
    if not sess:
        await update.message.reply_text('Koi open session nahi — /open chalao.')
        return
    waiting = 'haan' if cid in WAITING_CAPTCHA else 'nahi'
    await update.message.reply_text(
        f'Session ON\nProxy: {PROXY or "none"}\n'
        f'Name: {sess.name}\nMobile: {sess.mobile}\n'
        f'Captcha wait: {waiting}\nBundle: {BUNDLE.name}'
    )


async def cmd_captcha(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('/open pehle chalao.')
        return
    await update.message.reply_text('Captcha la raha hoon…')
    try:
        png = await sess.captcha_png()
        await update.message.reply_photo(photo=png, caption='Captcha bharo — text reply karo')
    except Exception as e:
        await update.message.reply_text(f'Captcha fail: {e}')


async def cmd_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    sess = get_session(update.effective_chat.id)
    if not sess:
        await update.message.reply_text('/open pehle chalao.')
        return
    await update.message.reply_text('Captcha refresh…')
    try:
        png = await sess.refresh_captcha()
        await update.message.reply_photo(photo=png, caption='Naya captcha — text reply karo')
    except Exception as e:
        await update.message.reply_text(f'Refresh fail: {e}')


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
    name = args[0] if len(args) > 0 else DEFAULT_NAME
    mobile = args[1] if len(args) > 1 else DEFAULT_MOBILE

    old = SESSIONS.pop(cid, None)
    if old:
        await old.close()

    sess = UidaiBrowserSession(BUNDLE, proxy=PROXY)
    SESSIONS[cid] = sess
    WAITING_CAPTCHA.discard(cid)

    status_msg = await update.message.reply_text(
        f'UIDAI khul rahi hai…\nProxy: {PROXY or "direct"}\n{name} / {mobile}'
    )

    async def on_frame(label: str) -> None:
        try:
            await status_msg.edit_text(f'{label}\n{name} / {mobile}')
        except Exception:
            pass

    try:
        await sess.start()
        gif_bytes = await sess.open_form(name, mobile, on_frame=on_frame)
        if gif_bytes:
            await update.message.reply_animation(
                animation=InputFile(io.BytesIO(gif_bytes), filename='uidai-open.gif'),
                caption='Live open — captcha neeche',
            )
        cap = await sess.captcha_png()
        WAITING_CAPTCHA.add(cid)
        await update.message.reply_photo(
            photo=cap,
            caption=(
                'Captcha image upar ↑\n'
                'Ab captcha text reply karo (4-8 chars)\n'
                'Ya /refresh naya captcha'
            ),
        )
        await status_msg.edit_text('Ready — captcha reply karo.')
    except Exception as e:
        log.exception('open failed')
        await sess.close()
        SESSIONS.pop(cid, None)
        await status_msg.edit_text(f'Open fail: {e}\nProxy check karo / dubara try.')


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not update.message or not update.message.text:
        return
    cid = update.effective_chat.id
    text = update.message.text.strip()

    if text.startswith('/'):
        return

    if cid not in WAITING_CAPTCHA:
        return

    if not CAPTCHA_RE.match(text):
        await update.message.reply_text('Captcha 4-8 letters/numbers hona chahiye. Example: 6fhxdf')
        return

    sess = get_session(cid)
    if not sess:
        WAITING_CAPTCHA.discard(cid)
        await update.message.reply_text('Session expire — /open dubara.')
        return

    WAITING_CAPTCHA.discard(cid)
    wait = await update.message.reply_text(f'OTP bhej rahe hain… captcha: {text}')

    try:
        result = await sess.send_otp(text)
        summary = result.get('summary', '')
        version = result.get('version', '?')
        screen = result.get('screen_png')

        otp_ok = any(
            'OTP sent' in (x.get('m') or '') or 'UIDAI ko OTP' in (x.get('m') or '')
            for x in result.get('logs', [])
        )
        captcha_warn = any(
            'Captcha' in (x.get('m') or '') or 'captcha' in (x.get('m') or '').lower()
            for x in result.get('logs', [])
        )

        status = 'Request gayi — SMS check karo' if otp_ok else 'Check logs — shayad captcha galat'
        if captcha_warn:
            status = 'Captcha issue — /refresh karke dubara'

        await wait.edit_text(
            f'Send OTP done (v{version})\n{status}\n\nLogs:\n{summary[:3500]}'
        )
        if screen:
            await update.message.reply_photo(photo=screen, caption='Page screenshot')
    except Exception as e:
        log.exception('otp failed')
        await wait.edit_text(f'OTP fail: {e}')


def main() -> None:
    if not TOKEN:
        raise SystemExit('TELEGRAM_BOT_TOKEN .env me set karo — .env.example dekho')

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_start))
    app.add_handler(CommandHandler('open', cmd_open))
    app.add_handler(CommandHandler('captcha', cmd_captcha))
    app.add_handler(CommandHandler('refresh', cmd_refresh))
    app.add_handler(CommandHandler('status', cmd_status))
    app.add_handler(CommandHandler('close', cmd_close))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    log.info('Bot start — allowed chats: %s proxy: %s', ALLOWED or 'ALL', PROXY)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
