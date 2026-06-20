#!/usr/bin/env python3
"""
AlwaysData VPS — full website + PDF engine (HTTP only, no Chromium/Selenium).

Mode auto:
  - INDIA_API_URL set  → proxy to Indian VPS (legacy)
  - INDIA_API_URL empty → HTTP-only engine on this server (default)
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

WWW_DIR = Path(__file__).parent
load_dotenv(WWW_DIR / '.env')

INDIA_API_URL = (os.getenv('INDIA_API_URL') or '').strip().rstrip('/')
PROXY_MODE = bool(INDIA_API_URL)

if not PROXY_MODE:
    os.environ.setdefault('WEB_PDF_ENGINE', 'http')
    os.environ.setdefault('UIDAI_PDF_CAPTCHA', 'http')
    os.environ.setdefault('UIDAI_FAST', '1')

import httpx
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

from uidai_api import BOT_ENGINE_VERSION

if not PROXY_MODE:
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
    from web_pdf_http import warm_web_pool

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('alwaysdata-web')

WEB_PIN = (os.getenv('WEB_ACCESS_PIN') or '').strip()
WEB_HOST = os.getenv('WEB_HOST', '0.0.0.0')
WEB_PORT = int(os.getenv('WEB_PORT', '8080'))
INDIA_API_KEY = (os.getenv('INDIA_API_KEY') or '').strip()
AUTH_COOKIE = 'rebel_web_auth'
AUTH_TOKENS: set[str] = set()
PROXY_TIMEOUT = float(os.getenv('INDIA_API_TIMEOUT', '120'))

mode_label = 'proxy' if PROXY_MODE else 'http-standalone'
app = FastAPI(
    title='Rebel Aadhaar Web (AlwaysData)',
    version=BOT_ENGINE_VERSION,
    description=f'mode={mode_label}',
)


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


def _india_headers() -> dict[str, str]:
    if not INDIA_API_URL or not INDIA_API_KEY:
        raise HTTPException(status_code=503, detail='INDIA_API_URL / INDIA_API_KEY missing')
    return {'X-Rebel-Api-Key': INDIA_API_KEY}


async def _proxy_json(method: str, path: str, *, json_body: dict | None = None) -> dict:
    url = f'{INDIA_API_URL}{path}'
    try:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT) as client:
            resp = await client.request(
                method, url, headers=_india_headers(), json=json_body,
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail='Indian VPS connect fail') from e
    if resp.status_code >= 400:
        detail = resp.text[:200]
        try:
            detail = resp.json().get('detail', detail)
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail)
    return resp.json()


async def _proxy_stream(path: str) -> StreamingResponse:
    url = f'{INDIA_API_URL}{path}'
    try:
        client = httpx.AsyncClient(timeout=PROXY_TIMEOUT)
        req = client.build_request('GET', url, headers=_india_headers())
        resp = await client.send(req, stream=True)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail='Indian VPS connect fail') from e
    if resp.status_code >= 400:
        body = await resp.aread()
        await resp.aclose()
        await client.aclose()
        raise HTTPException(status_code=resp.status_code, detail=body.decode()[:200])
    media = resp.headers.get('content-type', 'application/octet-stream')

    async def _iter():
        try:
            async for chunk in resp.aiter_bytes():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(_iter(), media_type=media)


@app.on_event('startup')
async def on_startup() -> None:
    log.info(
        'AlwaysData Web v%s — mode=%s pin=%s',
        BOT_ENGINE_VERSION,
        mode_label,
        'ON' if WEB_PIN else 'OFF',
    )
    if not PROXY_MODE:
        await warm_web_pool()


@app.get('/api/health')
async def health() -> dict:
    if not PROXY_MODE:
        data = health_payload(version=BOT_ENGINE_VERSION, role='alwaysdata-http')
        data['pin_required'] = _pin_required()
        data['engine'] = 'http-only (no browser)'
        proxy = (os.getenv('UIDAI_PROXY') or '').strip()
        data['proxy'] = proxy or None
        try:
            from proxy_india import load_ranked_proxies
            ranked = load_ranked_proxies()
            if ranked:
                data['proxy_fastest'] = ranked[0].get('proxy')
                data['proxy_city'] = ranked[0].get('city')
                data['proxy_score_sec'] = ranked[0].get('score')
        except Exception:
            pass
        data['proxy_set'] = bool(proxy and proxy.lower() not in ('none', 'no', 'off', 'direct', ''))
        return data

    india_ok = False
    india_version = ''
    india_error = ''
    try:
        data = await _proxy_json('GET', '/api/health')
        india_ok = bool(data.get('ok'))
        india_version = str(data.get('version') or '')
    except HTTPException as e:
        india_error = str(e.detail)
    except Exception as e:
        india_error = str(e)[:120]

    return {
        'ok': india_ok,
        'role': 'alwaysdata-proxy',
        'version': BOT_ENGINE_VERSION,
        'pin_required': _pin_required(),
        'india_connected': india_ok,
        'india_version': india_version,
        'india_error': india_error or None,
    }


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
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/start', json_body=body.model_dump())
    return await handle_pdf_start(body.name, body.mobile, body.dob)


@app.post('/api/pdf/captcha1')
async def pdf_captcha1(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/captcha1', json_body=body.model_dump())
    return await handle_captcha1(body.session_id, body.captcha)


@app.post('/api/pdf/otp1')
async def pdf_otp1(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/otp1', json_body=body.model_dump())
    return await handle_otp1(body.session_id, body.otp)


@app.post('/api/pdf/captcha2')
async def pdf_captcha2(body: CaptchaBody, _: None = Depends(require_auth)) -> dict:
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/captcha2', json_body=body.model_dump())
    return await handle_captcha2(body.session_id, body.captcha)


@app.post('/api/pdf/otp2')
async def pdf_otp2(body: OtpBody, _: None = Depends(require_auth)) -> dict:
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/otp2', json_body=body.model_dump())
    return await handle_otp2(body.session_id, body.otp)


@app.post('/api/pdf/refresh-captcha')
async def pdf_refresh(body: SessionBody, _: None = Depends(require_auth)) -> dict:
    if PROXY_MODE:
        return await _proxy_json('POST', '/api/pdf/refresh-captcha', json_body=body.model_dump())
    return await handle_refresh(body.session_id)


@app.get('/api/pdf/captcha/{session_id}')
async def pdf_captcha_image(session_id: str, _: None = Depends(require_auth)):
    if PROXY_MODE:
        return await _proxy_stream(f'/api/pdf/captcha/{session_id}')
    return captcha_file_response(session_id)


@app.get('/api/pdf/download/{session_id}')
async def pdf_download(session_id: str, _: None = Depends(require_auth)):
    if PROXY_MODE:
        return await _proxy_stream(f'/api/pdf/download/{session_id}')
    return pdf_file_response(session_id)


@app.get('/')
@app.get('/website.html')
async def index() -> HTMLResponse:
    page = WWW_DIR / 'website.html'
    if not page.is_file():
        return HTMLResponse('<h1>website.html missing in www/</h1>', status_code=500)
    return HTMLResponse(page.read_text(encoding='utf-8'))


@app.get('/style.css')
async def style_css():
    path = WWW_DIR / 'style.css'
    if not path.is_file():
        raise HTTPException(status_code=404, detail='style.css missing')
    return FileResponse(path, media_type='text/css')


@app.get('/app.js')
async def app_js():
    path = WWW_DIR / 'app.js'
    if not path.is_file():
        raise HTTPException(status_code=404, detail='app.js missing')
    return FileResponse(path, media_type='application/javascript')


def main() -> None:
    import uvicorn

    uvicorn.run(
        'web_app_alwaysdata:app',
        host=WEB_HOST,
        port=WEB_PORT,
        reload=False,
        log_level='info',
    )


if __name__ == '__main__':
    main()
