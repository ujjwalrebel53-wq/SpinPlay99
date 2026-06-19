#!/usr/bin/env python3
"""Indian VPS — PDF engine API only (Playwright + UIDAI). Website is on AlwaysData."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
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
log = logging.getLogger('india-api')

INDIA_API_KEY = (os.getenv('INDIA_API_KEY') or '').strip()
INDIA_API_HOST = os.getenv('INDIA_API_HOST', '0.0.0.0')
INDIA_API_PORT = int(os.getenv('INDIA_API_PORT', '8787'))
ALLOWED_IPS = {
    x.strip()
    for x in os.getenv('INDIA_API_ALLOWED_IPS', '').split(',')
    if x.strip()
}

app = FastAPI(title='Rebel India PDF API', version=BOT_ENGINE_VERSION)


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


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get('x-forwarded-for') or '').split(',')[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host or ''
    return ''


async def require_india_api(
    request: Request,
    x_rebel_api_key: str = Header(default='', alias='X-Rebel-Api-Key'),
) -> None:
    if not INDIA_API_KEY:
        raise HTTPException(
            status_code=503,
            detail='INDIA_API_KEY .env mein set karo',
        )
    if x_rebel_api_key != INDIA_API_KEY:
        raise HTTPException(status_code=401, detail='Invalid API key')
    if ALLOWED_IPS:
        ip = _client_ip(request)
        if ip not in ALLOWED_IPS:
            raise HTTPException(status_code=403, detail=f'IP not allowed: {ip}')


@app.on_event('startup')
async def on_startup() -> None:
    log.info(
        'India PDF API v%s — port %s — ip_filter=%s',
        BOT_ENGINE_VERSION,
        INDIA_API_PORT,
        'ON' if ALLOWED_IPS else 'OFF',
    )
    await warm_web_pool()


@app.get('/api/health')
async def health(_: None = Depends(require_india_api)) -> dict:
    return health_payload(version=BOT_ENGINE_VERSION, role='india-engine')


@app.post('/api/pdf/start')
async def pdf_start(body: StartBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_pdf_start(body.name, body.mobile, body.dob)


@app.post('/api/pdf/captcha1')
async def pdf_captcha1(body: CaptchaBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_captcha1(body.session_id, body.captcha)


@app.post('/api/pdf/otp1')
async def pdf_otp1(body: OtpBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_otp1(body.session_id, body.otp)


@app.post('/api/pdf/captcha2')
async def pdf_captcha2(body: CaptchaBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_captcha2(body.session_id, body.captcha)


@app.post('/api/pdf/otp2')
async def pdf_otp2(body: OtpBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_otp2(body.session_id, body.otp)


@app.post('/api/pdf/refresh-captcha')
async def pdf_refresh(body: SessionBody, _: None = Depends(require_india_api)) -> dict:
    return await handle_refresh(body.session_id)


@app.get('/api/pdf/captcha/{session_id}')
async def pdf_captcha_image(session_id: str, _: None = Depends(require_india_api)):
    return captcha_file_response(session_id)


@app.get('/api/pdf/download/{session_id}')
async def pdf_download(session_id: str, _: None = Depends(require_india_api)):
    return pdf_file_response(session_id)


def main() -> None:
    import uvicorn

    uvicorn.run(
        'web_api_india:app',
        host=INDIA_API_HOST,
        port=INDIA_API_PORT,
        reload=False,
        log_level='info',
    )


if __name__ == '__main__':
    main()
