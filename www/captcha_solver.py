"""Captcha bypass — null payload (like dob:null), OCR, audio decode."""

from __future__ import annotations

import base64
import logging
import os
import re
from typing import Any

log = logging.getLogger('captcha-solver')


def captcha_bypass_enabled() -> bool:
    return os.getenv('UIDAI_CAPTCHA_BYPASS', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def ocr_enabled() -> bool:
    return os.getenv('UIDAI_OCR', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def normalize_captcha(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', (text or '').strip().lower())[:8]


def ocr_captcha_png(png: bytes) -> str:
    """Tesseract OCR — optional (apt install tesseract-ocr)."""
    if not png or len(png) < 200:
        return ''
    try:
        import io

        from PIL import Image, ImageFilter, ImageOps

        img = Image.open(io.BytesIO(png)).convert('L')
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.SHARPEN)
        w, h = img.size
        if w < 120:
            img = img.resize((w * 3, h * 3), Image.Resampling.LANCZOS)

        import pytesseract

        raw = pytesseract.image_to_string(
            img,
            config=(
                '--psm 7 --oem 3 '
                '-c tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
            ),
        )
        cap = normalize_captcha(raw)
        if len(cap) >= 4:
            log.info('OCR captcha: %r -> %s', raw[:30], cap)
            return cap
    except ImportError:
        log.debug('pytesseract not installed — OCR skip')
    except Exception as e:
        log.warning('OCR fail: %s', e)
    return ''


def apply_captcha_bypass_fields(
    payload: dict[str, Any],
    *,
    captcha: str | None = None,
    captcha_txn_id: str | None = None,
    force_bypass: bool = False,
) -> dict[str, Any]:
    """Set captcha:null like dob:null when bypass on and no text."""
    bypass = force_bypass or captcha_bypass_enabled()
    cap = normalize_captcha(captcha or '') if captcha else ''
    txn = (captcha_txn_id or '').strip()

    if bypass and not cap:
        payload['captcha'] = None
        payload['captchaTxnId'] = txn or None
    else:
        payload['captcha'] = cap or None
        payload['captchaTxnId'] = txn or None
    return payload


def auto_captcha_enabled() -> bool:
    return os.getenv('UIDAI_AUTO_CAPTCHA', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def captcha_attempt_values(png: bytes, txn: str) -> list[tuple[str, str, str]]:
    """
    Ordered captcha tries: (label, captcha_text_or_empty, txn).
    Empty captcha + txn uses null bypass in payload builder.
    """
    out: list[tuple[str, str, str]] = []
    fast = os.getenv('UIDAI_FAST', '1').strip().lower() in ('1', 'true', 'yes', 'on')

    if captcha_bypass_enabled() and txn:
        out.append(('null-captcha+txn', '', txn))
        if not fast:
            out.append(('null-full', '', ''))

    ocr = ocr_captcha_png(png) if ocr_enabled() and png and auto_captcha_enabled() else ''
    if ocr:
        out.append(('ocr', ocr, txn))

    if txn and ocr:
        return out

    return out
