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
MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')

STEP_NAME = 'name'
STEP_MOBILE = 'mobile'
STEP_CAPTCHA = 'captcha'

# chat_id -> session
SESSIONS: dict[int, UidaiBrowserSession] = {}
# chat_id -> { step, name?, mobile? }
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
        'Commands:\n'
        '/open — naam + mobile puchega, phir site khulegi\n'
        '/open KAMAR JAHAN 7651892956 — seedha naam/mobile ke saath\n'
        '/captcha — captcha image bhejo\n'
        '/refresh — naya captcha\n'
        '/status — session status\n'
        '/close — browser band\n\n'
        'Flow: /open → naam bhejo → mobile bhejo → captcha reply karo'
    )


async def cmd_close(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    cid = update.effective_chat.id
    sess = SESSIONS.pop(cid, None)
    clear_flow(cid)
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
    lines = [f'Flow step: {step or "none"}']
    if draft.get('name'):
        lines.append(f'Draft name: {draft["name"]}')
    if draft.get('mobile'):
        lines.append(f'Draft mobile: {draft["mobile"]}')
    if sess:
        lines.extend([
            'Session ON',
            f'Proxy: {PROXY or "none"}',
            f'Name: {sess.name}',
            f'Mobile: {sess.mobile}',
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


async def open_uidai_session(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
) -> None:
    old = SESSIONS.pop(chat_id, None)
    if old:
        await old.close()

    sess = UidaiBrowserSession(BUNDLE, proxy=PROXY)
    SESSIONS[chat_id] = sess
    clear_flow(chat_id)
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile}

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
        SESSIONS.pop(chat_id, None)
        clear_flow(chat_id)
        await status_msg.edit_text(f'Open fail: {e}\nProxy check karo / dubara try.')


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
            await update.message.reply_text('Mobile 10 digit hona chahiye (6-9 se start). Example: 7651892956')
            return
        await open_uidai_session(update, cid, name.upper(), mobile)
        return

    if len(args) == 1:
        await update.message.reply_text(
            'Dono chahiye: /open NAAM MOBILE\nExample: /open KAMAR JAHAN 7651892956'
        )
        return

    # Step-by-step: pehle naam, phir mobile
    old = SESSIONS.pop(cid, None)
    if old:
        await old.close()
    FLOW[cid] = {'step': STEP_NAME}
    await update.message.reply_text(
        'Aadhaar par registered naam bhejo.\n'
        'Example: KAMAR JAHAN\n\n'
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
        if not NAME_RE.match(text):
            await update.message.reply_text(
                'Naam sirf letters/spaces (kam se kam 2 char).\nExample: KAMAR JAHAN'
            )
            return
        FLOW[cid] = {'step': STEP_MOBILE, 'name': text.upper()}
        await update.message.reply_text(
            f'Naam: {text.upper()}\n\n'
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
        await update.message.reply_text(f'OK — {name} / {mobile}\nSite khul rahi hai…')
        await open_uidai_session(update, cid, name, mobile)
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

        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    except Exception as e:
        log.exception('otp failed')
        await wait.edit_text(f'OTP fail: {e}')
        FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}


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
