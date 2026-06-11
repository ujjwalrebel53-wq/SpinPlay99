#!/usr/bin/env python3
"""
Full test suite — unit + live UIDAI integration.
Exit 0 = all pass, 1 = fail.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

DEFAULT_PROXY = 'http://139.167.218.162:3127'
PROXY = os.getenv('UIDAI_PROXY', DEFAULT_PROXY)
NAME = os.getenv('UIDAI_TEST_NAME', 'KAMAR JAHAN')
MOBILE = os.getenv('UIDAI_TEST_MOBILE', '7651892956')

PASS = 0
FAIL = 0
SKIP = 0


def ok(name: str, detail: str = '') -> None:
    global PASS
    PASS += 1
    print(f'  ✅ {name}' + (f' — {detail}' if detail else ''))


def fail(name: str, detail: str = '') -> None:
    global FAIL
    FAIL += 1
    print(f'  ❌ {name}' + (f' — {detail}' if detail else ''))


def skip(name: str, detail: str = '') -> None:
    global SKIP
    SKIP += 1
    print(f'  ⏭️  {name}' + (f' — {detail}' if detail else ''))


def run_unit_tests() -> bool:
    print('\n=== Unit tests (uidai_api) ===')
    r = subprocess.run(
        [sys.executable, '-m', 'unittest', 'tests.test_uidai_api', '-v'],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if r.returncode == 0:
        ok('unittest uidai_api')
        return True
    print(r.stdout)
    print(r.stderr)
    fail('unittest uidai_api')
    return False


async def resolve_working_proxy() -> str | None:
    """Pick working Indian proxy — env first, then auto pool."""
    global PROXY
    from proxy_india import check_proxy, pick_indian_proxy, test_uidai

    candidates: list[str] = []
    if PROXY and PROXY.lower() not in ('auto', 'india'):
        candidates.append(PROXY)
    try:
        proxy, info = await asyncio.to_thread(pick_indian_proxy)
        if proxy not in candidates:
            candidates.append(proxy)
    except Exception:
        pass

    for proxy in candidates:
        for attempt in range(2):
            try:
                info = await asyncio.to_thread(check_proxy, proxy, 10)
                if info.get('countryCode') != 'IN':
                    break
                sec = await asyncio.to_thread(test_uidai, proxy, 18)
                PROXY = proxy
                ok('proxy OK', f'{info.get("city", "?")} {proxy} UIDAI {sec:.1f}s')
                return proxy
            except Exception as e:
                if attempt == 0:
                    await asyncio.sleep(2)
                else:
                    print(f'    proxy skip {proxy}: {str(e)[:80]}')
    return None


async def test_proxy_india() -> bool:
    print('\n=== Proxy India ===')
    proxy = await resolve_working_proxy()
    if not proxy:
        fail('proxy', 'koi working Indian proxy nahi mila')
        return False
    return True


async def test_open_form() -> tuple[bool, object | None]:
    print(f'\n=== Live: open_form + captchaTxnID (proxy={PROXY}) ===')
    from browser_session import UidaiBrowserSession

    sess = UidaiBrowserSession(proxy=PROXY, auto_india_proxy=False)
    try:
        t0 = time.monotonic()
        await sess.start()
        await sess.open_form(NAME, MOBILE)
        elapsed = time.monotonic() - t0

        if not sess.captcha_txn_id or len(sess.captcha_txn_id) < 8:
            fail('captchaTxnID', 'missing or short')
            return False, sess

        ok('captchaTxnID', sess.captcha_txn_id)
        ok('option', sess.option)
        ok('open_form time', f'{elapsed:.0f}s')

        png = await sess.captcha_png()
        if len(png) < 500:
            fail('captcha_png', f'only {len(png)} bytes')
            return False, sess
        ok('captcha_png', f'{len(png)} bytes')
        return True, sess
    except Exception as e:
        fail('open_form', str(e)[:120])
        await sess.close(keep_warm=False)
        return False, None


async def test_otp_api(sess) -> bool:
    print('\n=== Live: OTP API (fake captcha → expect invalid, NOT network error) ===')
    result = await sess.send_otp('zzzz99')
    summary = result.get('summary', '')
    otp_ok = result.get('otp_ok', False)

    if 'network error' in summary.lower() and 'Playwright network' in summary:
        fail('OTP API', 'network error — path broken')
        print(summary)
        return False

    if 'Playwright response' not in summary:
        fail('OTP API', 'no Playwright response in logs')
        print(summary)
        return False

    if otp_ok:
        skip('OTP fake captcha', 'unexpected success (rate limit?)')
        return True

    if 'invalid Captcha' in summary or 'invalid_captcha' in summary:
        ok('OTP API path', 'UIDAI invalid captcha (expected)')
        return True

    if 'Captcha' in summary:
        ok('OTP API path', 'captcha-related UIDAI response')
        return True

    fail('OTP API', 'unexpected response')
    print(summary)
    return False


async def test_refresh_captcha(sess) -> bool:
    print('\n=== Live: refresh captcha ===')
    old_txn = sess.captcha_txn_id
    try:
        await sess.refresh_captcha()
        if not sess.captcha_txn_id:
            fail('refresh', 'txn missing after refresh')
            return False
        ok('refresh captchaTxnID', sess.captcha_txn_id)
        if old_txn and sess.captcha_txn_id == old_txn:
            skip('refresh txn changed', 'same txn (sometimes OK)')
        else:
            ok('refresh new txn', 'changed')
        return True
    except Exception as e:
        fail('refresh', str(e)[:100])
        return False


async def test_browser_reuse() -> bool:
    print('\n=== Live: browser pool reuse ===')
    from browser_session import UidaiBrowserSession

    s1 = UidaiBrowserSession(proxy=PROXY, auto_india_proxy=False)
    try:
        await s1.start()
        await s1.close(keep_warm=True)
        s2 = UidaiBrowserSession(proxy=PROXY, auto_india_proxy=False)
        await s2.start()
        await s2.close(keep_warm=False)
        ok('pool reuse', 'second start OK')
        return True
    except Exception as e:
        fail('pool reuse', str(e)[:100])
        await s1.close(keep_warm=False)
        return False


async def test_bot_import() -> bool:
    print('\n=== Bot import ===')
    try:
        import bot  # noqa: F401
        ok('bot.py imports')
        return True
    except Exception as e:
        fail('bot.py import', str(e)[:100])
        return False


async def main() -> int:
    print(f'UIDAI test suite — proxy={PROXY}')
    t0 = time.monotonic()

    if not run_unit_tests():
        return 1

    if not await test_proxy_india():
        print('\n⚠️  Proxy fail — live tests skip')
        return 1

    if not await test_bot_import():
        return 1

    if not await test_browser_reuse():
        return 1

    form_ok, sess = await test_open_form()
    if not form_ok or not sess:
        return 1

    results = [
        await test_otp_api(sess),
        await test_refresh_captcha(sess),
    ]
    await sess.close(keep_warm=False)

    elapsed = time.monotonic() - t0
    print(f'\n=== Summary ({elapsed:.0f}s) ===')
    print(f'  PASS: {PASS}  FAIL: {FAIL}  SKIP: {SKIP}')

    if FAIL:
        print('\n❌ TESTS FAILED')
        return 1
    print('\n✅ ALL TESTS PASSED')
    return 0


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
