#!/usr/bin/env python3
"""Proxy se UIDAI kholo → cookies/storage bake karo (uidai_baked_session.json)."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

from proxy_india import pick_indian_proxy, proxy_trial_timeout
from uidai_api import DOWNLOAD_PAGE_URL, UIDAI_PAGE_URL

BAKED_FILE = Path(__file__).parent / 'uidai_baked_session.json'
UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


async def capture_via_proxy(proxy: str) -> dict:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            proxy={'server': proxy},
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        ctx = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=UA,
            locale='en-IN',
            timezone_id='Asia/Kolkata',
        )
        page = await ctx.new_page()
        for url in ('https://myaadhaar.uidai.gov.in/', UIDAI_PAGE_URL, DOWNLOAD_PAGE_URL):
            await page.goto(url, wait_until='commit', timeout=60_000)
            await asyncio.sleep(2)
        for _ in range(80):
            if await page.locator('input[name="name"]').count():
                break
            await asyncio.sleep(0.25)
        state = await ctx.storage_state()
        await browser.close()
        return state


def main() -> int:
    parser = argparse.ArgumentParser(description='Bake UIDAI session via Indian proxy')
    parser.add_argument('--proxy', help='Force proxy URL (default: pick_indian_proxy)')
    args = parser.parse_args()

    trial = proxy_trial_timeout()
    if args.proxy:
        proxy = args.proxy.strip()
        city = '?'
    else:
        print(f'Proxy scan — {trial}s per try…')
        proxy, info = pick_indian_proxy(limit=50, full_trial=True)
        city = info.get('city', '?')
        print(f'Working proxy: {proxy} ({city})')

    print(f'Capturing cookies via {proxy}…')
    state = asyncio.run(capture_via_proxy(proxy))
    cookies = state.get('cookies') or []
    if not cookies:
        print('Warning: 0 cookies — page shayad poori load nahi hui')

    payload = {
        'proxy': proxy,
        'proxy_city': city,
        'baked': True,
        'bootstrapped': True,
        'forever': True,
        'ts': time.time(),
        'storage_state': state,
        'cookies': cookies,
    }
    BAKED_FILE.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Saved {BAKED_FILE} — {len(cookies)} cookies: {[c["name"] for c in cookies]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
