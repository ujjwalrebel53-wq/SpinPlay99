#!/usr/bin/env python3
"""UIDAI open speed test — live measure."""
import asyncio
import time

from playwright.async_api import async_playwright

URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
PROXY = 'http://139.167.218.162:3127'
UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


async def test(label: str, proxy: str | None) -> None:
    print(f'\n=== {label} ===')
    t0 = time.monotonic()
    pw = await async_playwright().start()
    try:
        opts = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if proxy:
            opts['proxy'] = {'server': proxy}
        browser = await pw.chromium.launch(**opts)
        page = await browser.new_page(user_agent=UA)

        t1 = time.monotonic()
        await page.goto(URL, wait_until='domcontentloaded', timeout=120_000)
        print(f'goto domcontentloaded: {time.monotonic() - t1:.1f}s')

        t2 = time.monotonic()
        found = False
        for _ in range(60):
            if await page.locator('input[name="name"]').count():
                found = True
                break
            await asyncio.sleep(0.5)
        print(f'form name field: {"YES" if found else "NO"} in {time.monotonic() - t2:.1f}s')
        print(f'TOTAL: {time.monotonic() - t0:.1f}s')
        print(f'title: {await page.title()}')
        await browser.close()
    except Exception as e:
        print(f'FAIL @ {time.monotonic() - t0:.1f}s: {e}')
    finally:
        await pw.stop()


async def main() -> None:
    await test(f'Proxy {PROXY}', PROXY)
    await test('Direct no proxy', None)


if __name__ == '__main__':
    asyncio.run(main())
