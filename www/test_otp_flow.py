#!/usr/bin/env python3
"""Smoke test — open form, extract txn, dry OTP (fake captcha)."""
import asyncio
import os
import sys

from browser_session import UidaiBrowserSession
from uidai_api import BOT_ENGINE_VERSION

PROXY = os.getenv('UIDAI_PROXY', 'http://139.167.218.162:3127')
NAME = sys.argv[1] if len(sys.argv) > 1 else 'KAMAR JAHAN'
MOBILE = sys.argv[2] if len(sys.argv) > 2 else '7651892956'


async def main() -> None:
    print(f'Engine v{BOT_ENGINE_VERSION} proxy={PROXY}')
    sess = UidaiBrowserSession()
    try:
        await sess.start()
        print('connection:', sess.connection_label)
        await sess.open_form(NAME, MOBILE)
        print('captchaTxnId:', sess.captcha_txn_id)
        print('option:', sess.option)
        result = await sess.send_otp('test99')
        print('--- logs ---')
        print(result['summary'])
        print('otp_ok:', result.get('otp_ok'))
    finally:
        await sess.close(keep_warm=False)


if __name__ == '__main__':
    asyncio.run(main())
