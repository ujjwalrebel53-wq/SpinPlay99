#!/usr/bin/env python3
"""Telegram user login helper — sendCode / signIn via Telethon (optional server dependency)."""
from __future__ import annotations

import json
import os
import sys

SESSION_DIR = os.path.join(os.path.dirname(__file__), '..', 'tg_sessions')


def out(data: dict, code: int = 0) -> None:
    print(json.dumps(data, ensure_ascii=False))
    sys.exit(code)


def session_path(phone: str) -> str:
    safe = ''.join(c for c in phone if c.isdigit() or c == '+')
    os.makedirs(SESSION_DIR, exist_ok=True)
    return os.path.join(SESSION_DIR, f'{safe}.session')


def meta_path(phone: str) -> str:
    safe = ''.join(c for c in phone if c.isdigit() or c == '+')
    os.makedirs(SESSION_DIR, exist_ok=True)
    return os.path.join(SESSION_DIR, f'{safe}.meta.json')


def load_meta(phone: str) -> dict:
    path = meta_path(phone)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_meta(phone: str, data: dict) -> None:
    with open(meta_path(phone), 'w', encoding='utf-8') as f:
        json.dump(data, f)


def api_creds() -> tuple[int, str]:
    api_id = os.getenv('REBEL_TG_API_ID', '').strip()
    api_hash = os.getenv('REBEL_TG_API_HASH', '').strip()
    if not api_id or not api_hash:
        out({'ok': False, 'error': 'Set REBEL_TG_API_ID and REBEL_TG_API_HASH on server (my.telegram.org)'}, 1)
    try:
        return int(api_id), api_hash
    except ValueError:
        out({'ok': False, 'error': 'Invalid REBEL_TG_API_ID'}, 1)


def client_for(phone: str):
    try:
        from telethon.sync import TelegramClient
    except ImportError:
        out({'ok': False, 'error': 'pip install telethon on server for auto Telegram login'}, 1)
    api_id, api_hash = api_creds()
    return TelegramClient(session_path(phone), api_id, api_hash)


def cmd_send_code(phone: str) -> None:
    phone = phone.strip()
    if not phone.startswith('+'):
        out({'ok': False, 'error': 'Phone must be E.164 (+91...)'}, 1)
    client = client_for(phone)
    client.connect()
    if client.is_user_authorized():
        me = client.get_me()
        client.disconnect()
        out({
            'ok': True,
            'already_logged_in': True,
            'user_id': getattr(me, 'id', None),
            'username': getattr(me, 'username', None) or '',
            'phone': phone,
        })
    try:
        sent = client.send_code_request(phone)
        save_meta(phone, {
            'phone_code_hash': sent.phone_code_hash,
            'phone': phone,
        })
        client.disconnect()
        out({'ok': True, 'phone': phone, 'code_sent': True})
    except Exception as e:
        client.disconnect()
        out({'ok': False, 'error': str(e)}, 1)


def cmd_sign_in(phone: str, code: str) -> None:
    phone = phone.strip()
    code = code.strip()
    meta = load_meta(phone)
    phone_code_hash = meta.get('phone_code_hash')
    if not phone_code_hash:
        out({'ok': False, 'error': 'No pending login — call send_code first'}, 1)
    client = client_for(phone)
    client.connect()
    try:
        client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
    except Exception as e:
        err = str(e)
        if 'Two-steps verification' in err or '2FA' in err or 'password' in err.lower():
            out({'ok': False, 'error': '2FA enabled — disable 2FA or add password flow', 'needs_2fa': True}, 1)
        out({'ok': False, 'error': err}, 1)
    me = client.get_me()
    client.disconnect()
    if os.path.isfile(meta_path(phone)):
        os.remove(meta_path(phone))
    out({
        'ok': True,
        'user_id': getattr(me, 'id', None),
        'username': getattr(me, 'username', None) or '',
        'first_name': getattr(me, 'first_name', None) or '',
        'phone': phone,
    })


def cmd_status(phone: str) -> None:
    phone = phone.strip()
    if not os.path.isfile(session_path(phone) + '.session'):
        out({'ok': True, 'logged_in': False})
    client = client_for(phone)
    client.connect()
    logged = client.is_user_authorized()
    payload = {'ok': True, 'logged_in': logged}
    if logged:
        me = client.get_me()
        payload.update({
            'user_id': getattr(me, 'id', None),
            'username': getattr(me, 'username', None) or '',
            'first_name': getattr(me, 'first_name', None) or '',
        })
    client.disconnect()
    out(payload)


def main() -> None:
    if len(sys.argv) < 2:
        out({'ok': False, 'error': 'Usage: tg_device_login.py send_code|sign_in|status PHONE [CODE]'}, 1)
    action = sys.argv[1].lower()
    if action == 'send_code':
        if len(sys.argv) < 3:
            out({'ok': False, 'error': 'Missing phone'}, 1)
        cmd_send_code(sys.argv[2])
    elif action == 'sign_in':
        if len(sys.argv) < 4:
            out({'ok': False, 'error': 'Missing phone or code'}, 1)
        cmd_sign_in(sys.argv[2], sys.argv[3])
    elif action == 'status':
        if len(sys.argv) < 3:
            out({'ok': False, 'error': 'Missing phone'}, 1)
        cmd_status(sys.argv[2])
    else:
        out({'ok': False, 'error': 'Unknown action'}, 1)


if __name__ == '__main__':
    main()
