#!/usr/bin/env python3
"""Optional — OCR captcha + real OTP attempt (needs tesseract)."""
from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile

PROXY = os.getenv('UIDAI_PROXY', 'http://139.167.218.162:3127')
NAME = sys.argv[1] if len(sys.argv) > 1 else 'KAMAR JAHAN'
MOBILE = sys.argv[2] if len(sys.argv) > 2 else '7651892956'
MAX_TRIES = int(os.getenv('UIDAI_OCR_TRIES', '3'))


def ocr_captcha(png: bytes) -> str:
    import pytesseract
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(png)).convert('L')
    text = pytesseract.image_to_string(
        img,
        config='--psm 7 -c tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    )
    return re.sub(r'\s+', '', text).strip().lower()


async def main() -> int:
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        print('SKIP — pip install pytesseract')
        return 0

    from browser_session import UidaiBrowserSession

    sess = UidaiBrowserSession()
    try:
        await sess.start()
        await sess.open_form(NAME, MOBILE)
        print('txn:', sess.captcha_txn_id)

        for attempt in range(1, MAX_TRIES + 1):
            png = await sess.captcha_png()
            cap = ocr_captcha(png)
            print(f'try {attempt} OCR captcha: {cap!r}')
            if len(cap) < 4:
                print('OCR too short — refresh')
                await sess.refresh_captcha()
                continue

            result = await sess.send_otp(cap)
            print(result['summary'])
            if result.get('otp_ok'):
                print('SUCCESS — OTP sent!')
                return 0
            if 'invalid Captcha' in result.get('summary', ''):
                print('wrong OCR — refresh')
                await sess.refresh_captcha()
                continue
            print('UIDAI reject — stop')
            return 1

        print(f'FAIL — {MAX_TRIES} OCR tries exhausted')
        return 1
    finally:
        await sess.close(keep_warm=False)


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
