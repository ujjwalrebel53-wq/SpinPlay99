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

from browser_session import UidaiBrowserSession
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


class LiveProgress:
    """Telegram message me numbered live steps."""

    def __init__(self, msg, name: str, mobile: str, title: str = 'UIDAI Live Load') -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.proxy_line = ''
        self._steps: list[str] = []
        self._current = 0
        self._total = 8

    async def set_proxy(self, line: str) -> None:
        self.proxy_line = line
        await self._render()

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = total
        if n > len(self._steps):
            self._steps.extend([''] * (n - len(self._steps)))
        if n >= 1:
            for i in range(n - 1):
                if i < len(self._steps) and self._steps[i] and not self._steps[i].startswith('✅'):
                    self._steps[i] = '✅ ' + self._steps[i].lstrip('✅🔄⏳ ')
        self._current = n
        idx = n - 1
        if idx < len(self._steps):
            self._steps[idx] = f'🔄 {text}'
        else:
            self._steps.append(f'🔄 {text}')
        await self._render()

    async def done(self, final: str) -> None:
        for i, s in enumerate(self._steps):
            body = s.lstrip('✅🔄⏳ ')
            self._steps[i] = '✅ ' + body
        await self._render(final)

    async def fail(self, err: str) -> None:
        if self._steps and self._current >= 1:
            idx = self._current - 1
            body = self._steps[idx].lstrip('✅🔄⏳ ')
            self._steps[idx] = f'❌ {body}'
        await self._render(err)

    async def _render(self, footer: str = '') -> None:
        lines = [f'🚀 {self.title}', f'👤 {self.name} / 📱 {self.mobile}']
        if self.proxy_line:
            lines.append(self.proxy_line)
        lines.append('')
        for i, s in enumerate(self._steps):
            lines.append(f'{i + 1}/{self._total} {s}')
        for j in range(len(self._steps), self._total):
            lines.append(f'{j + 1}/{self._total} ⏳ …')
        if footer:
            lines.extend(['', footer])
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception:
            pass


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
        f'Rebel Adhar — UIDAI Live Bot (v{BOT_ENGINE_VERSION})\n\n'
        'Commands:\n'
        '/open — naam + mobile (ya Mr / skip agar naam nahi pata)\n'
        '/open 7651892956 — sirf mobile (naam = Mr)\n'
        '/open KAMAR JAHAN 7651892956 — seedha naam + mobile\n'
        '/captcha — captcha image bhejo\n'
        '/refresh — naya captcha\n'
        '/status — session status\n'
        '/close — browser band\n\n'
        'Flow: /open → naam → mobile → captcha → SMS OTP → Aadhaar SMS pe aayega'
    )


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
        await update.message.reply_text('Koi session nahi — /open chalao.')
        return
    draft = FLOW.get(cid, {})
    lines = [f'Engine: v{BOT_ENGINE_VERSION}', f'Flow step: {step or "none"}']
    if draft.get('name'):
        lines.append(f'Draft name: {draft["name"]}')
    if draft.get('mobile'):
        lines.append(f'Draft mobile: {draft["mobile"]}')
    if sess:
        lines.extend([
            'Session ON',
            f'VPN: {sess.proxy_label or PROXY or "auto India"}',
            f'Name: {sess.name}',
            f'Mobile: {sess.mobile}',
            f'captchaTxn: {sess.captcha_txn_id[:12] + "…" if sess.captcha_txn_id else "—"}',
            f'otpTxn: {sess.otp_txn_id[:12] + "…" if sess.otp_txn_id else "—"}',
            f'Flow: {step or "—"}',
        ])
    await update.message.reply_text('\n'.join(lines))


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


async def open_uidai_session(
    update: Update,
    chat_id: int,
    name: str,
    mobile: str,
) -> None:
    name = normalize_name(name)
    mobile = mobile.strip()
    old = SESSIONS.pop(chat_id, None)
    if old:
        try:
            await old.close(keep_warm=True)
        except Exception:
            from browser_session import _pool_shutdown
            await _pool_shutdown()

    status_msg = await update.message.reply_text('🚀 Shuru ho raha hai…')
    progress = LiveProgress(status_msg, name, mobile)

    async def on_step(n: int, total: int, text: str) -> None:
        await progress.update(n, total, text)

    sess = UidaiBrowserSession(
        proxy=PROXY,
        auto_india_proxy=AUTO_INDIA,
        on_step=on_step,
    )
    SESSIONS[chat_id] = sess
    clear_flow(chat_id)
    FLOW[chat_id] = {'step': STEP_CAPTCHA, 'name': name, 'mobile': mobile}

    try:
        await sess.start()
        if sess.proxy_label:
            await progress.set_proxy(sess.proxy_label)

        await sess.open_form(name, mobile)
        cap = await sess.captcha_png()
        await update.message.reply_photo(
            photo=cap,
            caption=(
                'Captcha ↑\n'
                'Text reply karo (4-8 chars)\n'
                '/refresh = naya captcha'
            ),
        )
        await progress.done('✅ Ready — captcha reply karo')
    except Exception as e:
        log.exception('open failed')
        from browser_session import _is_browser_closed_error, _pool_shutdown

        if _is_browser_closed_error(e):
            await _pool_shutdown()
        else:
            await sess.close(keep_warm=True)
        SESSIONS.pop(chat_id, None)
        clear_flow(chat_id)
        await progress.fail(f'❌ Fail: {e}\n\nTip: /close phir /open dubara')


async def cmd_open(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    if not TOKEN:
        await update.message.reply_text('TELEGRAM_BOT_TOKEN .env me set karo.')
        return

    cid = update.effective_chat.id
    args = context.args or []

    if len(args) >= 2:
        name = normalize_name(' '.join(args[:-1]))
        mobile = args[-1]
        if not MOBILE_RE.match(mobile):
            await update.message.reply_text('Mobile 10 digit hona chahiye (6-9 se start). Example: 7651892956')
            return
        await open_uidai_session(update, cid, name, mobile)
        return

    if len(args) == 1:
        one = args[0].strip()
        if MOBILE_RE.match(one):
            await open_uidai_session(update, cid, PLACEHOLDER_NAME, one)
            return
        await update.message.reply_text(
            'Examples:\n'
            '/open 7651892956 — sirf mobile (naam Mr)\n'
            '/open KAMAR JAHAN 7651892956 — naam + mobile\n'
            '/open Mr 7651892956 — naam skip'
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
        wait_msg = await update.message.reply_text('🚀 OTP verify + Aadhaar retrieve…')
        otp_progress = LiveProgress(wait_msg, sess.name, sess.mobile, title='Retrieve Aadhaar')
        if sess.proxy_label:
            await otp_progress.set_proxy(sess.proxy_label)

        async def retrieve_step(n: int, total: int, msg: str) -> None:
            await otp_progress.update(n, total, msg)

        try:
            result = await sess.submit_otp(text, on_step=retrieve_step)
            summary = result.get('summary', '')
            version = result.get('version', BOT_ENGINE_VERSION)
            retrieve_ok = result.get('retrieve_ok', False)
            if retrieve_ok:
                status = '✅ UIDAI ne registered mobile pe SMS bheja — phone check karo'
            else:
                status = 'Check logs — OTP galat ya fail'
            await otp_progress.done(status)
            await update.message.reply_text(f'Logs (v{version}):\n{summary[:3500]}')
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP if not retrieve_ok else None}
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
    wait_msg = await update.message.reply_text('🚀 OTP bhej rahe hain…')
    otp_progress = LiveProgress(wait_msg, sess.name, sess.mobile, title='Send OTP')
    if sess.proxy_label:
        await otp_progress.set_proxy(sess.proxy_label)

    async def otp_step(n: int, total: int, msg: str) -> None:
        await otp_progress.update(n, total, msg)

    try:
        result = await sess.send_otp(text, on_step=otp_step)
        summary = result.get('summary', '')
        version = result.get('version', BOT_ENGINE_VERSION)
        otp_ok = result.get('otp_ok')
        if otp_ok is None:
            otp_ok = any(
                'OTP sent' in (x.get('m') or '') for x in result.get('logs', [])
            )
        captcha_warn = any(
            'Captcha' in (x.get('m') or '') or 'captcha' in (x.get('m') or '').lower()
            for x in result.get('logs', [])
        )

        status = '✅ OTP SMS bheja — ab 6 digit OTP reply karo' if otp_ok else 'Check logs — shayad captcha galat'
        if captcha_warn:
            status = 'Captcha issue — /refresh karke dubara'

        await otp_progress.done(status)
        await update.message.reply_text(f'Logs (v{version}):\n{summary[:3500]}')

        if otp_ok:
            await update.message.reply_text(
                '📱 SMS me 6 digit OTP aaya hoga.\n'
                'Yahi chat me OTP reply karo — UIDAI Aadhaar number SMS pe bhejega.'
            )
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_OTP}
        else:
            FLOW[cid] = {**FLOW.get(cid, {}), 'step': STEP_CAPTCHA}
    except Exception as e:
        log.exception('otp failed')
        await otp_progress.fail(f'OTP fail: {e}')
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

    log.info(
        'Bot start v%s — allowed: %s proxy: %s auto_india: %s',
        BOT_ENGINE_VERSION,
        ALLOWED or 'ALL',
        PROXY or 'auto',
        AUTO_INDIA,
    )
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
