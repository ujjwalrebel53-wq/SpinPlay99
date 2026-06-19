#!/usr/bin/env python3
"""Rebel Aadhaar Web Panel — all-in-one (Indian VPS pe website + engine ek saath)."""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / '.env')

from uidai_api import BOT_ENGINE_VERSION
from web_handlers import (
    captcha_file_response,
    handle_captcha1,
    handle_captcha2,
    handle_otp1,
    handle_otp2,
    handle_pdf_start,
    handle_refresh,
    health_payload,
    pdf_file_response,
)
from web_pdf_service import warm_web_pool

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('web-app')

WWW_DIR = Path(__file__).parent
STATIC_DIR = WWW_DIR / 'static'
WEB_PIN = (os.getenv('WEB_ACCESS_PIN') or '').strip()
WEB_HOST = os.getenv('WEB_HOST', '0.0.0.0')
WEB_PORT = int(os.getenv('WEB_PORT', '8080'))
AUTH_COOKIE = 'rebel_web_auth'
AUTH_TOKENS: set[str] = set()

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


@app.on_event('startup')
async def on_startup() -> None:
    log.info('Rebel Web Panel v%s — pin=%s', BOT_ENGINE_VERSION, 'ON' if WEB_PIN else 'OFF')
    await warm_web_pool()


@app.get('/api/health')
async def health() -> dict:
    data = health_payload(version=BOT_ENGINE_VERSION, role='all-in-one')
    data['pin_required'] = _pin_required()
    return data


@app.post('/api/login')
async def login(body: LoginBody, response: Response) -> dict:
    if not _pin_required():
        token = secrets.token_urlsafe(24)
        AUTH_TOKENS.add(token)
        response.set_cookie(AUTH_COOKIE, token, httponly=True, samesite='lax', max_age=86400 * 7)
        return {'ok': True, 'message': 'Login OK (PIN disabled)'}

    if body.pin.strip() != WEB_PIN:
        raise HTTPException(status_code=403, detail='Galat PIN')

    token = secrets.token_urlsafe(24)
    AUTH_TOKENS.add(token)
    response.set_cookie(AUTH_COOKIE, token, httponly=True, samesite='lax', max_age=86400 * 7)
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
    return await handle_pdf_start(body.name, body.mobile, body.dob)


@app.post('/api/pdf/captcha1')
async def pdf_captcha1(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    return await handle_captcha1(body.session_id, body.captcha)


@app.post('/api/pdf/otp1')
async def pdf_otp1(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    return await handle_otp1(body.session_id, body.otp)


@app.post('/api/pdf/captcha2')
async def pdf_captcha2(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    return await handle_captcha2(body.session_id, body.captcha)


@app.post('/api/pdf/otp2')
async def pdf_otp2(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    return await handle_otp2(body.session_id, body.otp)


@app.post('/api/pdf/refresh-captcha')
async def pdf_refresh(body: SessionBody, _: None = Depends(require_auth)) -> dict:
    return await handle_refresh(body.session_id)


@app.get('/api/pdf/captcha/{session_id}')
async def pdf_captcha_image(session_id: str, _: None = Depends(require_auth)):
    return captcha_file_response(session_id)


@app.get('/api/pdf/download/{session_id}')
async def pdf_download(session_id: str, _: None = Depends(require_auth)):
    return pdf_file_response(session_id)


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

    uvicorn.run('web_app:app', host=WEB_HOST, port=WEB_PORT, reload=False, log_level='info')


if __name__ == '__main__':
    main()
