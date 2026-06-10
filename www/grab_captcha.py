#!/usr/bin/env python3
"""UIDAI site kholo, captcha PNG save karo."""
import asyncio
import sys
from pathlib import Path

from browser_session import UidaiBrowserSession

BUNDLE = Path(__file__).parent / 'browser-extension' / 'page-bundle.js'
OUT = Path(__file__).parent / 'captcha-live.png'
PROXY = 'http://139.167.218.162:3127'
NAME = sys.argv[1] if len(sys.argv) > 1 else 'KAMAR JAHAN'
MOBILE = sys.argv[2] if len(sys.argv) > 2 else '7651892956'


async def main() -> None:
    sess = UidaiBrowserSession(BUNDLE, proxy=PROXY)
    try:
        await sess.start()
        await sess.open_form(NAME, MOBILE)
        png = await sess.captcha_png()
        OUT.write_bytes(png)
        print(f'OK {OUT} ({len(png)} bytes)')
    finally:
        await sess.close()


if __name__ == '__main__':
    asyncio.run(main())
