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
  LOGIN_FAIL_TEXT=invalid        # optional — page text on wrong password
  LOGIN_WAIT_SEC=8               # Selenium wait for auto success detect
  CHROME_BIN=                    # optional chromium path
  TELEGRAM_OWNER_ID=...
  TELEGRAM_ALLOWED_CHAT_IDS=...

Commands:
  /try KAMAR JAHAN 01/01/1991  — fixed .env username + PDF-style passwords
  /try KAMAR JAHAN              — NAME4 + 1920…2020 brute
  /tryuser myuser KAMAR JAHAN 01/01/1991 — custom username + passwords
  /tryuser auto KAMAR JAHAN     — name-based usernames + year brute
  /preview KAMAR JAHAN 01/01/1991 — list first 15 candidates (no login)
  /config — show site config (no password)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from telegram import BotCommand, Update
from telegram.ext import Application, CommandHandler, ContextTypes

from bot_access import AccessControl
from login_try import (
    LoginSiteConfig,
    build_login_passwords,
    build_login_passwords_year_only,
    build_login_username_candidates,
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

LOGIN_TRY_VERSION = '1.2.0'
MAX_TRIES = int(os.getenv('LOGIN_MAX_TRIES', '120') or '120')


def _parse_name_dob(args: list[str]) -> tuple[str, str | None]:
    if len(args) >= 2 and DOB_RE.match(args[-1].strip()):
        return normalize_name(' '.join(args[:-1])), normalize_dob(args[-1])
    return normalize_name(' '.join(args)), None


def _passwords_for_name(name: str, dob: str | None) -> list[str]:
    pwds = build_login_passwords(name, dob) if dob else build_login_passwords_year_only(name)
    if not pwds:
        pwds = build_login_passwords(name, None)
    return pwds


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
        'PDF jaisa password guess — tumhari **configured site** pe (Selenium).\n'
        'Login ke baad bot khud detect karega — URL/cookie/form change.\n\n'
        'Commands:\n'
        '/try NAME DOB — e.g. /try KAMAR JAHAN 01/01/1991\n'
        '/try NAME — year brute (1920–2020)\n'
        '/tryuser USER NAME [DOB] — custom username\n'
        '/tryuser auto NAME — name-based usernames\n'
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
        f'Engine: Selenium (auto-detect)\n'
        f'User field: `{cfg.user_selector}`\n'
        f'Pass field: `{cfg.pass_selector}`\n'
        f'Submit: `{cfg.submit_selector or "(Enter)"}`\n'
        f'Success URL contains: `{cfg.success_url_contains or "auto"}`\n'
        f'Wait: {cfg.wait_sec}s · Max tries: {MAX_TRIES}',
        parse_mode='Markdown',
    )


async def cmd_preview(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    args = list(context.args or [])
    if not args:
        await update.message.reply_text('Usage: /preview NAME [DOB]')
        return
    name, dob = _parse_name_dob(args)
    pwds = _passwords_for_name(name, dob)
    prefix = pdf_name_prefix(name)
    users = build_login_username_candidates(name)
    lines = [f'👤 {name}', f'Prefix: {prefix}', f'Passwords: {len(pwds)}', f'Usernames: {len(users)}', '', 'Users (first 8):']
    lines.extend(f'• `{u}`' for u in users[:8])
    lines.extend(['', 'Passwords (first 15):'])
    lines.extend(f'• `{p}`' for p in pwds[:15])
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')


async def _run_try(
    update: Update,
    *,
    usernames: list[str],
    passwords: list[str],
    cfg: LoginSiteConfig,
) -> None:
    total = min(len(usernames) * len(passwords), MAX_TRIES)
    status = await update.message.reply_text(
        f'⏳ Up to {total} tries ({len(usernames)} user × {len(passwords)} pass)…',
        parse_mode='Markdown',
    )
    tried = 0

    async def on_progress(msg: str) -> None:
        try:
            await status.edit_text(f'⏳ {msg}', parse_mode='Markdown')
        except Exception:
            pass

    t0 = time.monotonic()
    for user in usernames:
        user_cfg = LoginSiteConfig(
            url=cfg.url,
            username=user,
            user_selector=cfg.user_selector,
            pass_selector=cfg.pass_selector,
            submit_selector=cfg.submit_selector,
            success_url_contains=cfg.success_url_contains,
            success_selector=cfg.success_selector,
            fail_text=cfg.fail_text,
            headless=cfg.headless,
        )
        remaining = MAX_TRIES - tried
        if remaining <= 0:
            break
        slice_pwds = passwords[:remaining]
        await on_progress(f'User `{user}` — {len(slice_pwds)} passwords…')
        try:
            result = await try_login_passwords(
                user_cfg, slice_pwds, max_tries=remaining, on_progress=on_progress,
            )
        except Exception as e:
            log.exception('login try failed')
            await status.edit_text(f'❌ Error: {e}')
            return
        tried += result.tried
        if result.ok:
            elapsed = time.monotonic() - t0
            await status.edit_text(
                f'✅ Login success!\n'
                f'Username: `{user}`\n'
                f'Password: `{result.password}`\n'
                f'Tries: {tried} · {elapsed:.1f}s\n'
                f'URL: {result.final_url[:80]}',
                parse_mode='Markdown',
            )
            return

    elapsed = time.monotonic() - t0
    await status.edit_text(
        f'❌ No match ({tried} tries, {elapsed:.0f}s)\n'
        f'Users tried: {len(usernames)}',
    )


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

    name, dob = _parse_name_dob(args)
    pwds = _passwords_for_name(name, dob)
    await _run_try(update, usernames=[cfg.username], passwords=pwds, cfg=cfg)


async def cmd_tryuser(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await guard(update):
        return
    args = list(context.args or [])
    if len(args) < 2:
        await update.message.reply_text(
            'Usage:\n/tryuser myuser KAMAR JAHAN 01/01/1991\n/tryuser auto KAMAR JAHAN'
        )
        return
    try:
        cfg = _load_cfg()
    except ValueError as e:
        await update.message.reply_text(f'❌ {e}')
        return

    username_arg = args[0].strip()
    name, dob = _parse_name_dob(args[1:])
    pwds = _passwords_for_name(name, dob)
    if username_arg.lower() == 'auto':
        usernames = build_login_username_candidates(name)
        if not usernames:
            await update.message.reply_text('❌ No username candidates for this name.')
            return
    else:
        usernames = [username_arg]
    await _run_try(update, usernames=usernames, passwords=pwds, cfg=cfg)


async def _register_commands(application: Application) -> None:
    await application.bot.set_my_commands([
        BotCommand('start', 'Help'),
        BotCommand('try', 'Try passwords — /try NAME [DOB]'),
        BotCommand('tryuser', 'Custom username — /tryuser USER NAME [DOB]'),
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
    app.add_handler(CommandHandler('tryuser', cmd_tryuser))
    log.info('Login Try Bot v%s starting', LOGIN_TRY_VERSION)
    app.run_polling(drop_pending_updates=True)


if __name__ == '__main__':
    main()
