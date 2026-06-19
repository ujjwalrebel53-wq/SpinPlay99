#!/usr/bin/env python3
"""Rebel Aadhaar Web Panel — e-Aadhaar PDF download on website."""

from __future__ import annotations

import logging
import os
import re
import secrets
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / '.env')

from aadhar import dob_bypass_on
from uidai_api import BOT_ENGINE_VERSION, normalize_dob
from web_pdf_service import (
    STORE,
    refresh_captcha,
    start_pdf_flow,
    submit_captcha1,
    submit_captcha2,
    submit_otp1,
    submit_otp2,
    warm_web_pool,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('web-app')

WWW_DIR = Path(__file__).parent
STATIC_DIR = WWW_DIR / 'static'
WEB_PIN = (os.getenv('WEB_ACCESS_PIN') or '').strip()
WEB_HOST = os.getenv('WEB_HOST', '0.0.0.0')
WEB_PORT = int(os.getenv('WEB_PORT', '8080'))
AUTH_COOKIE = 'rebel_web_auth'
AUTH_TOKENS: set[str] = set()

MOBILE_RE = re.compile(r'^[6-9]\d{9}$')
NAME_RE = re.compile(r'^[A-Za-z][A-Za-z\s\.]{1,59}$')
CAPTCHA_RE = re.compile(r'^[a-zA-Z0-9]{4,8}$')
OTP_RE = re.compile(r'^\d{6}$')

app = FastAPI(title='Rebel Aadhaar Web', version=BOT_ENGINE_VERSION)


class LoginBody(BaseModel):
    pin: str = Field(min_length=1, max_length=32)


class StartBody(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    mobile: str = Field(min_length=10, max_length=10)
    dob: str | None = Field(default=None, max_length=12)


class CaptchaBody(BaseModel):
    session_id: str
    captcha: str = Field(min_length=4, max_length=8)


class OtpBody(BaseModel):
    session_id: str
    otp: str = Field(min_length=6, max_length=6)


class SessionBody(BaseModel):
    session_id: str


def _pin_required() -> bool:
    return bool(WEB_PIN)


def _check_auth(auth_cookie: str | None) -> bool:
    if not _pin_required():
        return True
    return bool(auth_cookie and auth_cookie in AUTH_TOKENS)


def require_auth(auth_cookie: str | None = Cookie(default=None, alias=AUTH_COOKIE)) -> None:
    if not _check_auth(auth_cookie):
        raise HTTPException(status_code=401, detail='PIN login zaroori hai')


def _session_payload(row) -> dict:
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


@app.on_event('startup')
async def on_startup() -> None:
    log.info('Rebel Web Panel v%s — pin=%s', BOT_ENGINE_VERSION, 'ON' if WEB_PIN else 'OFF')
    await warm_web_pool()


@app.get('/api/health')
async def health() -> dict:
    return {
        'ok': True,
        'version': BOT_ENGINE_VERSION,
        'pin_required': _pin_required(),
        'dob_bypass': dob_bypass_on(),
        'active_sessions': len(STORE._sessions),
    }


@app.post('/api/login')
async def login(body: LoginBody, response: Response) -> dict:
    if not _pin_required():
        token = secrets.token_urlsafe(24)
        AUTH_TOKENS.add(token)
        response.set_cookie(
            AUTH_COOKIE,
            token,
            httponly=True,
            samesite='lax',
            max_age=86400 * 7,
        )
        return {'ok': True, 'message': 'Login OK (PIN disabled)'}

    if body.pin.strip() != WEB_PIN:
        raise HTTPException(status_code=403, detail='Galat PIN')

    token = secrets.token_urlsafe(24)
    AUTH_TOKENS.add(token)
    response.set_cookie(
        AUTH_COOKIE,
        token,
        httponly=True,
        samesite='lax',
        max_age=86400 * 7,
    )
    return {'ok': True, 'message': 'Login successful'}


@app.post('/api/logout')
async def logout(
    response: Response,
    auth_cookie: str | None = Cookie(default=None, alias=AUTH_COOKIE),
) -> dict:
    if auth_cookie:
        AUTH_TOKENS.discard(auth_cookie)
    response.delete_cookie(AUTH_COOKIE)
    return {'ok': True}


@app.post('/api/pdf/start')
async def pdf_start(body: StartBody, _: None = Depends(require_auth)) -> dict:
    name = body.name.strip()
    mobile = body.mobile.strip()
    if not NAME_RE.match(name):
        raise HTTPException(status_code=400, detail='Name galat hai — sirf letters')
    if not MOBILE_RE.match(mobile):
        raise HTTPException(status_code=400, detail='Mobile 10 digit hona chahiye (6-9 se start)')

    dob = (body.dob or '').strip() or None
    if dob:
        dob = normalize_dob(dob) or dob

    try:
        row = await start_pdf_flow(name, mobile, dob)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return {'ok': True, **_session_payload(row)}


@app.post('/api/pdf/captcha1')
async def pdf_captcha1(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    cap = body.captcha.strip()
    if not CAPTCHA_RE.match(cap):
        raise HTTPException(status_code=400, detail='Captcha 4–8 characters hona chahiye')
    try:
        row = await submit_captcha1(body.session_id, cap)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **_session_payload(row)}


@app.post('/api/pdf/otp1')
async def pdf_otp1(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    otp = body.otp.strip()
    if not OTP_RE.match(otp):
        raise HTTPException(status_code=400, detail='OTP 6 digit hona chahiye')
    try:
        row = await submit_otp1(body.session_id, otp)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **_session_payload(row)}


@app.post('/api/pdf/captcha2')
async def pdf_captcha2(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    cap = body.captcha.strip()
    if not CAPTCHA_RE.match(cap):
        raise HTTPException(status_code=400, detail='Captcha 4–8 characters hona chahiye')
    try:
        row = await submit_captcha2(body.session_id, cap)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **_session_payload(row)}


@app.post('/api/pdf/otp2')
async def pdf_otp2(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    otp = body.otp.strip()
    if not OTP_RE.match(otp):
        raise HTTPException(status_code=400, detail='OTP 6 digit hona chahiye')
    try:
        row = await submit_otp2(body.session_id, otp)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **_session_payload(row)}


@app.post('/api/pdf/refresh-captcha')
async def pdf_refresh(body: SessionBody, _: None = Depends(require_auth)) -> dict:
    try:
        row = await refresh_captcha(body.session_id)
    except LookupError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True, **_session_payload(row)}


@app.get('/api/pdf/captcha/{session_id}')
async def pdf_captcha_image(session_id: str, _: None = Depends(require_auth)):
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


@app.get('/api/pdf/download/{session_id}')
async def pdf_download(session_id: str, _: None = Depends(require_auth)):
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


@app.get('/')
async def index() -> HTMLResponse:
    index_path = STATIC_DIR / 'index.html'
    if not index_path.is_file():
        return HTMLResponse('<h1>Rebel Web — static missing</h1>', status_code=500)
    return HTMLResponse(index_path.read_text(encoding='utf-8'))


if STATIC_DIR.is_dir():
    app.mount('/static', StaticFiles(directory=str(STATIC_DIR)), name='static')


def main() -> None:
    import uvicorn

    uvicorn.run(
        'web_app:app',
        host=WEB_HOST,
        port=WEB_PORT,
        reload=False,
        log_level='info',
    )


if __name__ == '__main__':
    main()
