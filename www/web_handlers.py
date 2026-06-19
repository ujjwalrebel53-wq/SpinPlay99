"""Shared PDF API handlers — used by India engine and local web_app."""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

from aadhar import dob_bypass_on
from uidai_api import normalize_dob
from web_pdf_service import (
    STORE,
    WebPdfSession,
    refresh_captcha,
    start_pdf_flow,
    submit_captcha1,
    submit_captcha2,
    submit_otp1,
    submit_otp2,
)

MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')
CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
OTP_RE = re.compile(r'^\d{6}$')


def session_payload(row: WebPdfSession) -> dict:
    png = row.aadhar.last_captcha_image or b''
    return {
        'session_id': row.id,
        'step': row.step,
        'message': row.message,
        'eid': row.eid or row.aadhar.eid or '',
        'mobile': row.mobile,
        'name': row.name,
        'pdf_password_hint': row.pdf_password_hint,
        'has_captcha': bool(len(png) >= 500),
        'has_pdf': bool(row.unlocked_pdf or row.pdf_bytes),
        'pdf_unlocked': bool(row.unlocked_pdf),
        'pdf_password': row.pdf_password,
        'logs': row.logs[-40:],
    }


def health_payload(*, version: str, role: str = 'engine') -> dict:
    return {
        'ok': True,
        'role': role,
        'version': version,
        'dob_bypass': dob_bypass_on(),
        'active_sessions': len(STORE._sessions),
    }


async def handle_pdf_start(name: str, mobile: str, dob: str | None) -> dict:
    name = name.strip()
    mobile = mobile.strip()
    if not NAME_RE.match(name):
        raise HTTPException(status_code=400, detail='Name galat hai — sirf letters')
    if not MOBILE_RE.match(mobile):
        raise HTTPException(status_code=400, detail='Mobile 10 digit hona chahiye (6-9 se start)')

    dob_val = (dob or '').strip() or None
    if dob_val:
        dob_val = normalize_dob(dob_val) or dob_val

    try:
        row = await start_pdf_flow(name, mobile, dob_val)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return {'ok': True, **session_payload(row)}


async def handle_captcha1(session_id: str, captcha: str) -> dict:
    cap = captcha.strip()
    if not CAPTCHA_RE.match(cap):
        raise HTTPException(status_code=400, detail='Captcha 4–8 characters hona chahiye')
    try:
        row = await submit_captcha1(session_id, cap)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **session_payload(row)}


async def handle_otp1(session_id: str, otp: str) -> dict:
    val = otp.strip()
    if not OTP_RE.match(val):
        raise HTTPException(status_code=400, detail='OTP 6 digit hona chahiye')
    try:
        row = await submit_otp1(session_id, val)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **session_payload(row)}


async def handle_captcha2(session_id: str, captcha: str) -> dict:
    cap = captcha.strip()
    if not CAPTCHA_RE.match(cap):
        raise HTTPException(status_code=400, detail='Captcha 4–8 characters hona chahiye')
    try:
        row = await submit_captcha2(session_id, cap)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **session_payload(row)}


async def handle_otp2(session_id: str, otp: str) -> dict:
    val = otp.strip()
    if not OTP_RE.match(val):
        raise HTTPException(status_code=400, detail='OTP 6 digit hona chahiye')
    try:
        row = await submit_otp2(session_id, val)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **session_payload(row)}


async def handle_refresh(session_id: str) -> dict:
    try:
        row = await refresh_captcha(session_id)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **session_payload(row)}


def captcha_file_response(session_id: str) -> FileResponse:
    row = STORE.get(session_id)
    if not row:
        raise HTTPException(status_code=410, detail='Session expire')
    png = row.aadhar.last_captcha_image or b''
    if len(png) < 500:
        raise HTTPException(status_code=404, detail='Captcha image nahi hai')
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    try:
        tmp.write(png)
        tmp.flush()
        tmp.close()
        return FileResponse(
            tmp.name,
            media_type='image/png',
            filename='captcha.png',
            headers={'Cache-Control': 'no-store'},
        )
    except Exception:
        Path(tmp.name).unlink(missing_ok=True)
        raise


def pdf_file_response(session_id: str) -> FileResponse:
    row = STORE.get(session_id)
    if not row:
        raise HTTPException(status_code=410, detail='Session expire')
    data = row.unlocked_pdf or row.pdf_bytes
    if not data:
        raise HTTPException(status_code=404, detail='PDF abhi ready nahi hai')
    name = (row.name or 'eaadhaar').replace(' ', '_')[:30]
    filename = f'{name}_eaadhaar.pdf'
    tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        return FileResponse(
            tmp.name,
            media_type='application/pdf',
            filename=filename,
            headers={'Cache-Control': 'no-store'},
        )
    except Exception:
        Path(tmp.name).unlink(missing_ok=True)
        raise
