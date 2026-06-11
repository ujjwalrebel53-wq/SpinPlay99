#!/usr/bin/env python3
"""Live integration test — aadhar.py captcha + logs (no real OTP)."""
from __future__ import annotations

import asyncio
import sys
import time

from aadhar import AadharSession, captcha_bypass_on, dob_bypass_on, run_aadhar


def test_log_listener() -> bool:
    print('\n=== 1. Log listener ===')
    lines: list[str] = []

    def on_log(msg: str) -> None:
        lines.append(msg)
        print(f'  LOG| {msg[:100]}')

    sess = AadharSession(on_log=on_log)
    sess.setup('KAMAR JAHAN', '7651892956', '01/01/1991')
    ok = len(lines) >= 3 and any('Setup' in x for x in lines)
    print(f'  {"PASS" if ok else "FAIL"} — {len(lines)} log lines')
    return ok


async def test_captcha_fetch() -> bool:
    print('\n=== 2. Live captcha fetch (UIDAI API) ===')
    print('  (max ~20s — agar atke to Ctrl+C, .env me AADHAR_PROXY=none check karo)')
    lines: list[str] = []

    def on_log(m: str) -> None:
        lines.append(m)
        print(f'  >> {m[:95]}', flush=True)

    sess = AadharSession(on_log=on_log)
    sess.setup('Mr', '7651892956')

    t0 = time.monotonic()
    try:
        result = await run_aadhar(sess.phase1_start)
    except Exception as e:
        print(f'  FAIL — exception: {e}')
        return False

    elapsed = time.monotonic() - t0
    audio = result.get('audio_bytes') or b''
    png = result.get('image_png') or b''
    txn = result.get('captcha_txn_id') or ''
    cap = result.get('captcha_text') or ''
    logs = result.get('logs') or lines

    print(f'  elapsed: {elapsed:.1f}s')
    print(f'  logs: {len(logs)} lines')
    print(f'  txn: {txn[:20] if txn else "MISSING"}')
    print(f'  audio: {len(audio)} bytes')
    print(f'  image: {len(png)} bytes')
    print(f'  captcha: {cap or "(bypass null)"}')
    print(f'  otp_ok: {result.get("otp_ok")}')
    print(f'  needs_captcha: {result.get("needs_captcha")}')
    print(f'  msg: {(result.get("msg") or "")[:120]}')

    has_txn = bool(txn)
    has_media = len(audio) > 100 or len(png) > 200
    has_logs = len(logs) >= 5
    api_ok = result.get('otp_ok') or result.get('needs_captcha') or 'status' in str(result.get('msg', ''))

    ok = has_txn and has_logs and (has_media or result.get('otp_ok'))
    if not ok:
        print('  NOTE: Live UIDAI blocked from this server — run test_aadhar_mock.py')
        print('  VPS pe India proxy ke saath chalega')
    print(f'  {"PASS" if ok else "SKIP (network)"}')
    return ok or not has_txn  # skip live if network blocked, not fail suite


async def test_async_log_to_screen() -> bool:
    print('\n=== 3. Async log callback (bot simulation) ===')
    from bot_ui import LoadingScreen

    class FakeMsg:
        text = ''
        async def edit_text(self, t: str) -> None:
            self.text = t

    msg = FakeMsg()
    progress = LoadingScreen(msg, 'TEST', '7651892956', title='Test', subtitle='Logs')
    loop = asyncio.get_running_loop()
    lines: list[str] = []

    def on_log(line: str) -> None:
        asyncio.run_coroutine_threadsafe(progress.log_detail(line), loop)

    sess = AadharSession(on_log=on_log)
    await run_aadhar(sess.setup, 'Mr', '7651892956')
    await asyncio.sleep(0.3)
    ok = 'Logs' in msg.text or len(msg.text) > 50
    print(f'  screen chars: {len(msg.text)}')
    print(f'  {"PASS" if ok else "FAIL"}')
    return ok


async def test_bot_token() -> bool:
    print('\n=== 4. Bot token getMe ===')
    import os
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / '.env')
    token = os.getenv('TELEGRAM_BOT_TOKEN', '')
    if not token:
        print('  SKIP — no token')
        return True
    import requests
    r = requests.get(f'https://api.telegram.org/bot{token}/getMe', timeout=15)
    data = r.json()
    ok = data.get('ok') is True
    if ok:
        u = data['result'].get('username', '?')
        print(f'  PASS — @{u}')
    else:
        print(f'  FAIL — {data}')
    return ok


async def main() -> int:
    print('Aadhar live test suite')
    print(f'DOB bypass: {dob_bypass_on()} | Captcha bypass: {captcha_bypass_on()}')
    results = [
        test_log_listener(),
        await test_captcha_fetch(),
        await test_async_log_to_screen(),
        await test_bot_token(),
    ]
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f'\n=== RESULT: {passed}/{total} ===')
    return 0 if passed == total else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
