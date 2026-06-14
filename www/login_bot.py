#!/usr/bin/env python3
"""
Login Try Bot — PDF-style password candidates on YOUR configured login page.

⚠️ Authorized use only — your own site or written permission.

.env:
  LOGIN_BOT_TOKEN=...          # separate Telegram bot (or LOGIN_BOT_TOKEN)
  LOGIN_SITE_URL=https://...
  LOGIN_USERNAME=fixed_user
  LOGIN_USER_SELECTOR=input[name="username"]
  LOGIN_PASS_SELECTOR=input[name="password"]
  LOGIN_SUBMIT_SELECTOR=button[type="submit"]
  LOGIN_SUCCESS_URL=dashboard    # optional — URL fragment after success
  LOGIN_SUCCESS_SELECTOR=        # optional — CSS on success page
  LOGIN_FAIL_TEXT=invalid        # optional
  TELEGRAM_OWNER_ID=...
  TELEGRAM_ALLOWED_CHAT_IDS=...

Commands:
  /try KAMAR JAHAN 01/01/1991  — name + DOB passwords
  /try KAMAR JAHAN              — NAME4 + 1920…2020 brute
  /preview KAMAR JAHAN 01/01/1991 — list first 15 candidates (no login)
  /config — show site config (no password)
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import BotCommand, Update
from telegram.ext import Application, CommandHandler, ContextTypes

from bot_access import AccessControl
from login_try import (
    LoginSiteConfig,
    build_login_passwords,
    build_login_passwords_year_only,
    try_login_passwords,
)
from pdf_unlock import pdf_name_prefix
from uidai_api import DOB_RE, normalize_dob, normalize_name

load_dotenv(Path(__file__).parent / '.env')
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('login-bot')

TOKEN = (
    os.getenv('LOGIN_BOT_TOKEN', '').strip()
    or os.getenv('TELEGRAM_LOGIN_BOT_TOKEN', '').strip()
)
OWNER_ID = os.getenv('TELEGRAM_OWNER_ID', '').strip()
ALLOWED = {x.strip() for x in os.getenv('TELEGRAM_ALLOWED_CHAT_IDS', '').split(',') if x.strip()}
ACCESS = AccessControl(OWNER_ID, ALLOWED)

LOGIN_TRY_VERSION = '1.0.0'
MAX_TRIES = int(os.getenv('LOGIN_MAX_TRIES', '120') or '120')


def _ids(update: Update) -> tuple[str, str]:
    user = update.effective_user
    chat = update.effective_chat
    return str(user.id if user else ''), str(chat.id if chat else '')


async def guard(update: Update) -> bool:
    user_id, chat_id = _ids(update)
    if ACCESS.allowed(user_id, chat_id):
        return True
    await update.message.reply_text('🔒 Locked — owner se access lo. /myid')
    return False


def _load_cfg() -> LoginSiteConfig:
    return LoginSiteConfig.from_env()


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    await update.message.reply_text(
        f'🔐 Login Try Bot v{LOGIN_TRY_VERSION}\n'
        '━━━━━━━━━━━━━━━━━━━━\n\n'
        'PDF jaisa password guess — tumhari **configured site** pe.\n\n'
        'Commands:\n'
        '/try NAME DOB — e.g. /try KAMAR JAHAN 01/01/1991\n'
        '/try NAME — year brute (1920–2020)\n'
        '/preview NAME DOB — candidates list only\n'
        '/config — site settings\n\n'
        '⚠️ Sirf apni site / authorized testing.',
        parse_mode='Markdown',
    )


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _, chat_id = _ids(update)
    await update.message.reply_text(f'Chat ID: `{chat_id}`', parse_mode='Markdown')


async def cmd_config(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    try:
        cfg = _load_cfg()
    except ValueError as e:
        await update.message.reply_text(f'❌ Config: {e}')
        return
    await update.message.reply_text(
        f'🌐 URL: {cfg.url}\n'
        f'👤 Username: {cfg.username}\n'
        f'User field: `{cfg.user_selector}`\n'
        f'Pass field: `{cfg.pass_selector}`\n'
        f'Submit: `{cfg.submit_selector or "(Enter)"}`\n'
        f'Success URL contains: `{cfg.success_url_contains or "—"}`\n'
        f'Max tries: {MAX_TRIES}',
        parse_mode='Markdown',
    )


async def cmd_preview(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    args = list(context.args or [])
    if not args:
        await update.message.reply_text('Usage: /preview NAME [DOB]')
        return
    dob = None
    if len(args) >= 2 and DOB_RE.match(args[-1].strip()):
        dob = normalize_dob(args[-1])
        name = normalize_name(' '.join(args[:-1]))
    else:
        name = normalize_name(' '.join(args))
    pwds = build_login_passwords(name, dob) if dob else build_login_passwords_year_only(name)
    if not pwds:
        pwds = build_login_passwords(name, None)
    prefix = pdf_name_prefix(name)
    lines = [f'👤 {name}', f'Prefix: {prefix}', f'Total: {len(pwds)}', '', 'First 15:']
    lines.extend(f'• `{p}`' for p in pwds[:15])
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')


async def cmd_try(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    args = list(context.args or [])
    if not args:
        await update.message.reply_text(
            'Usage:\n/try KAMAR JAHAN 01/01/1991\n/try KAMAR JAHAN'
        )
        return
    try:
        cfg = _load_cfg()
    except ValueError as e:
        await update.message.reply_text(f'❌ {e}')
        return

    dob = None
    if len(args) >= 2 and DOB_RE.match(args[-1].strip()):
        dob = normalize_dob(args[-1])
        name = normalize_name(' '.join(args[:-1]))
    else:
        name = normalize_name(' '.join(args))

    pwds = build_login_passwords(name, dob) if dob else build_login_passwords_year_only(name)
    if not pwds:
        pwds = build_login_passwords(name, None)

    status = await update.message.reply_text(
        f'⏳ Trying {min(len(pwds), MAX_TRIES)} passwords for `{cfg.username}`…',
        parse_mode='Markdown',
    )

    async def on_progress(msg: str) -> None:
        try:
            await status.edit_text(f'⏳ {msg}\n`{cfg.username}` @ site…', parse_mode='Markdown')
        except Exception:
            pass

    try:
        result = await try_login_passwords(
            cfg, pwds, max_tries=MAX_TRIES, on_progress=on_progress,
        )
    except Exception as e:
        log.exception('login try failed')
        await status.edit_text(f'❌ Error: {e}')
        return

    if result.ok:
        await status.edit_text(
            f'✅ Login success!\n'
            f'Password: `{result.password}`\n'
            f'Tries: {result.tried} · {result.elapsed_sec:.1f}s\n'
            f'URL: {result.final_url[:80]}',
            parse_mode='Markdown',
        )
    else:
        await status.edit_text(
            f'❌ No match ({result.tried} tries, {result.elapsed_sec:.0f}s)\n'
            f'{result.message}',
        )


async def _register_commands(application: Application) -> None:
    await application.bot.set_my_commands([
        BotCommand('start', 'Help'),
        BotCommand('try', 'Try passwords — /try NAME [DOB]'),
        BotCommand('preview', 'List password candidates'),
        BotCommand('config', 'Site config'),
        BotCommand('myid', 'Your chat ID'),
    ])


def main() -> None:
    if not TOKEN:
        raise SystemExit('Set LOGIN_BOT_TOKEN in .env')
    app = (
        Application.builder()
        .token(TOKEN)
        .post_init(_register_commands)
        .build()
    )
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('myid', cmd_myid))
    app.add_handler(CommandHandler('config', cmd_config))
    app.add_handler(CommandHandler('preview', cmd_preview))
    app.add_handler(CommandHandler('try', cmd_try))
    log.info('Login Try Bot v%s starting', LOGIN_TRY_VERSION)
    app.run_polling(drop_pending_updates=True)


if __name__ == '__main__':
    main()
