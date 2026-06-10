"""Playwright UIDAI bot — Python-first OTP, no extension bundle."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from proxy_india import check_proxy, format_proxy_line, pick_indian_proxy
from react_extract import (
    EXTRACT_CAPTCHA_TXN_JS,
    GET_OPTION_JS,
    SEND_OTP_FETCH_JS,
    SEND_OTP_XHR_JS,
)
from uidai_api import (
    BOT_ENGINE_VERSION,
    OTP_API_URL,
    UIDAI_PAGE_URL,
    append_log,
    build_otp_payload,
    new_request_id,
    parse_uidai_response,
    summarize_logs,
    uidai_headers,
)

log = logging.getLogger('uidai-browser')

MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
StepCb = Callable[[int, int, str], Awaitable[None]]

SKIP_FONTS_JS = """(() => {
  if (document.getElementById('rebel-skip-fonts')) return;
  const s = document.createElement('style');
  s.id = 'rebel-skip-fonts';
  s.textContent = '*{font-family:Arial,Helvetica,sans-serif!important}';
  (document.head || document.documentElement).appendChild(s);
})();"""

_POOL: dict[str, Any] = {
    'lock': asyncio.Lock(),
    'pw': None,
    'browser': None,
    'proxy': None,
}


async def _pool_shutdown() -> None:
    async with _POOL['lock']:
        if _POOL['browser']:
            await _POOL['browser'].close()
        if _POOL['pw']:
            await _POOL['pw'].stop()
        _POOL['pw'] = None
        _POOL['browser'] = None
        _POOL['proxy'] = None


async def _pool_browser(proxy: str | None) -> Browser:
    async with _POOL['lock']:
        if _POOL['browser'] and _POOL['proxy'] == proxy:
            log.info('Pre-warm: browser reuse (proxy=%s)', proxy or 'direct')
            return _POOL['browser']

        if _POOL['browser']:
            await _POOL['browser'].close()
            _POOL['browser'] = None
        if _POOL['pw']:
            await _POOL['pw'].stop()
            _POOL['pw'] = None

        log.info('Pre-warm: naya browser launch (proxy=%s)', proxy or 'direct')
        _POOL['pw'] = await async_playwright().start()
        opts: dict[str, Any] = {
            'headless': True,
            'args': ['--disable-remote-fonts', '--no-sandbox', '--disable-dev-shm-usage'],
        }
        if proxy:
            opts['proxy'] = {'server': proxy}
        _POOL['browser'] = await _POOL['pw'].chromium.launch(**opts)
        _POOL['proxy'] = proxy
        return _POOL['browser']


class UidaiBrowserSession:
    """Thin Playwright session — captcha image + Python API OTP (dob:null)."""

    def __init__(
        self,
        bundle_path: Path | None = None,
        proxy: str | None = None,
        auto_india_proxy: bool = True,
        on_step: StepCb | None = None,
    ) -> None:
        # bundle_path kept for backward compat — no longer used
        self.bundle_path = bundle_path
        self.proxy = proxy
        self.auto_india_proxy = auto_india_proxy
        self._on_step = on_step
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self.name = ''
        self.mobile = ''
        self.captcha_txn_id = ''
        self.option = 'UID'
        self.last_logs: list[dict[str, Any]] = []
        self.proxy_info: dict[str, Any] = {}
        self.proxy_label = ''
        self._active_proxy: str | None = None

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started — /open pehle chalao')
        return self._page

    @property
    def version(self) -> str:
        return BOT_ENGINE_VERSION

    async def _step(self, n: int, total: int, msg: str) -> None:
        if self._on_step:
            await self._on_step(n, total, msg)

    async def _resolve_proxy(self) -> str | None:
        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            await self._step(1, 8, 'Indian proxy check…')
            info = await asyncio.to_thread(check_proxy, self.proxy, 4)
            if info.get('countryCode') != 'IN':
                raise RuntimeError(f'Proxy India nahi: {info.get("country")}')
            self.proxy_info = info
            self.proxy_label = format_proxy_line(info, self.proxy)
            await self._step(1, 8, f'VPN connected — {self.proxy_label}')
            return self.proxy

        if not self.auto_india_proxy and not self.proxy:
            self.proxy_label = '⚠️ Direct'
            await self._step(1, 8, 'Direct connect')
            return None

        await self._step(1, 8, 'Indian VPN connect…')
        proxy, info = await asyncio.to_thread(pick_indian_proxy)
        self.proxy = proxy
        self.proxy_info = info
        self.proxy_label = format_proxy_line(info, proxy)
        await self._step(1, 8, f'VPN connected — {self.proxy_label}')
        return proxy

    async def _new_page(self, proxy: str | None) -> None:
        if self._context:
            await self._context.close()
        browser = await _pool_browser(proxy)
        self._active_proxy = proxy
        self._context = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=MOBILE_UA,
            locale='en-IN',
            timezone_id='Asia/Kolkata',
            geolocation={'latitude': 28.6139, 'longitude': 77.2090},
            permissions=['geolocation'],
        )
        await self._context.add_init_script(SKIP_FONTS_JS)
        self._page = await self._context.new_page()

    async def start(self) -> None:
        if self._page:
            return
        proxy = await self._resolve_proxy()
        reused = _POOL['browser'] is not None and _POOL['proxy'] == proxy
        if reused:
            await self._step(2, 8, 'Browser pre-warm — turant ready ⚡')
        else:
            await self._step(2, 8, 'Chromium start…')
        await self._new_page(proxy)
        if not reused:
            await self._step(2, 8, 'Browser ready — India timezone (Asia/Kolkata)')

    async def close(self, keep_warm: bool = True) -> None:
        if self._context:
            await self._context.close()
        self._context = None
        self._page = None
        self.captcha_txn_id = ''
        if not keep_warm:
            await _pool_shutdown()

    async def _poll_form(self, max_sec: float = 25.0) -> bool:
        for _ in range(int(max_sec / 0.15)):
            if await self.page.locator('input[name="name"]').count():
                return True
            await asyncio.sleep(0.15)
        return False

    async def _extract_captcha_txn(self) -> str | None:
        txn = await self.page.evaluate(EXTRACT_CAPTCHA_TXN_JS)
        if txn:
            self.captcha_txn_id = str(txn)
        return txn

    async def _wait_captcha_txn(self, timeout_s: float = 22.0) -> str:
        for _ in range(int(timeout_s / 0.4)):
            txn = await self._extract_captcha_txn()
            if txn:
                return txn
            await asyncio.sleep(0.4)
        raise RuntimeError('captchaTxnID nahi mila — page reload / proxy change karo')

    async def _read_option(self) -> str:
        opt = await self.page.evaluate(GET_OPTION_JS)
        self.option = opt if opt in ('UID', 'EID') else 'UID'
        return self.option

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        self.name = name.strip()
        self.mobile = mobile.strip()
        self.captcha_txn_id = ''

        await self._step(3, 8, 'UIDAI site open (fast)…')
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                await self.page.goto(
                    UIDAI_PAGE_URL,
                    wait_until='commit',
                    timeout=45_000,
                )
                if await self._poll_form(22.0):
                    last_err = None
                    break
                raise RuntimeError('Form fields timeout')
            except Exception as e:
                last_err = e
                await self._step(3, 8, f'Retry {attempt + 1}/3…')
                await asyncio.sleep(1)
        if last_err:
            raise RuntimeError(f'UIDAI open fail: {last_err}') from last_err

        await self._step(3, 8, 'UIDAI page load ho gayi')
        await self._step(4, 8, 'Form mil gaya — naam/mobile fields ready')
        await self._step(5, 8, f'Python engine v{BOT_ENGINE_VERSION} — DOB skip API')

        await self._step(6, 8, f'Naam bhara: {self.name}')
        await self.page.fill('input[name="name"]', self.name)
        await self._step(7, 8, f'Mobile bhara: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)

        await self._step(8, 8, 'Captcha load…')
        await self._wait_captcha_image(20)
        txn = await self._wait_captcha_txn(18.0)
        await self._read_option()
        await self._step(8, 8, f'Captcha ready (txn={txn[:8]}…)')
        return b''

    async def _wait_captcha_image(self, timeout_s: int = 20) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='visible', timeout=timeout_s * 1000)
        for _ in range(timeout_s * 4):
            if await el.evaluate('(img) => img.complete && img.naturalWidth > 10'):
                return
            await asyncio.sleep(0.25)
        raise RuntimeError('Captcha load fail — /refresh')

    async def captcha_png(self) -> bytes:
        await self._wait_captcha_image()
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        return await el.screenshot(type='png', timeout=8_000)

    async def refresh_captcha(self) -> bytes:
        refresh = self.page.locator(
            'button[aria-label*="refresh" i], button:near(img[alt*="CAPTCHA" i])'
        ).first
        if await refresh.count():
            try:
                await refresh.click(timeout=3000)
            except Exception:
                pass
        else:
            await self.page.locator('img[alt*="CAPTCHA" i]').first.click()
        await asyncio.sleep(1.2)
        await self._wait_captcha_image()
        await self._wait_captcha_txn(15.0)
        return await self.captcha_png()

    async def _post_otp_playwright(
        self,
        payload: dict[str, Any],
        request_id: str,
        logs: list[dict[str, Any]],
    ) -> tuple[bool, int, str]:
        if not self._context:
            raise RuntimeError('Browser not started')
        headers = uidai_headers(request_id)
        try:
            resp = await self._context.request.post(
                OTP_API_URL,
                data=json.dumps(payload),
                headers=headers,
                timeout=45_000,
            )
            text = await resp.text()
            status = resp.status
            append_log(logs, 'info', 'OTP Playwright API response', {
                'status': status,
                'resp': text[:200],
            })
            ok, msg, extra = parse_uidai_response(status, text)
            if msg:
                append_log(logs, 'info', 'UIDAI jawab', {'status': status, 'msg': msg[:160], **extra})
            return ok, status, text
        except Exception as e:
            log.warning('Playwright request.post failed: %s', e)
            append_log(logs, 'warn', 'OTP Playwright network error', str(e)[:120])
            return False, 0, ''

    async def _post_otp_in_page(
        self,
        payload: dict[str, Any],
        logs: list[dict[str, Any]],
        via: str,
    ) -> tuple[bool, int, str]:
        js = SEND_OTP_FETCH_JS if via == 'fetch' else SEND_OTP_XHR_JS
        result = await self.page.evaluate(js, payload)
        if not result.get('ok'):
            append_log(logs, 'warn', f'OTP {via} fail', result.get('err', 'unknown'))
            return False, 0, ''

        status = int(result.get('status') or 0)
        text = str(result.get('text') or '')
        append_log(logs, 'info', f'OTP {via} response', {
            'status': status,
            'resp': text[:200],
        })
        ok, msg, extra = parse_uidai_response(status, text)
        if msg:
            append_log(logs, 'info', 'UIDAI jawab', {'status': status, 'msg': msg[:160], **extra})
        return ok, status, text

    async def send_otp(self, captcha: str, on_step: StepCb | None = None) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        step_fn = on_step or self._on_step
        total = 6
        logs: list[dict[str, Any]] = []
        otp_ok = False

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        await s(1, f'Captcha fill: {captcha}')
        await self.page.fill('input[name="captcha"]', captcha)

        await s(2, 'captchaTxnID read…')
        txn = await self._extract_captcha_txn()
        if not txn:
            try:
                txn = await self._wait_captcha_txn(8.0)
            except RuntimeError:
                append_log(logs, 'warn', 'captchaTxnId missing — /refresh karo')
                await s(3, 'captchaTxnID missing')
                await s(4, 'Done')
                await s(5, 'Done')
                await s(6, 'Done')
                self.last_logs = logs
                return self._otp_result(captcha, logs, otp_ok)

        option = await self._read_option()
        payload = build_otp_payload(
            name=self.name,
            mobile=self.mobile,
            captcha=captcha,
            captcha_txn_id=txn,
            option=option,
        )
        append_log(logs, 'info', 'OTP bhej rahe hain', {
            'mobile': self.mobile,
            'captchaTxnId': txn,
            'option': option,
        })

        def _network_fail(st: int, body: str) -> bool:
            return st == 0 and not body

        await s(3, 'UIDAI API — Playwright direct POST…')
        otp_ok, status, text = await self._post_otp_playwright(payload, new_request_id(), logs)

        if _network_fail(status, text):
            await s(4, 'Retry — in-page fetch…')
            otp_ok, status, text = await self._post_otp_in_page(payload, logs, 'fetch')

        if _network_fail(status, text):
            await s(5, 'Retry — in-page XHR…')
            otp_ok, status, text = await self._post_otp_in_page(payload, logs, 'xhr')

        if otp_ok:
            append_log(logs, 'info', f'OTP sent — UIDAI {status}')
            await s(6, 'SMS check karo')
        elif _network_fail(status, text):
            append_log(logs, 'warn', 'OTP network error — proxy / page reload try karo')
            await s(6, 'Network fail — /open dubara')
        else:
            captcha_bad = any(
                'Captcha' in (x.get('m') or '') or 'captcha' in (x.get('m') or '').lower()
                for x in logs
            )
            await s(6, 'Captcha issue — /refresh' if captcha_bad else 'UIDAI ne reject — logs dekho')

        self.last_logs = logs
        return self._otp_result(captcha, logs, otp_ok)

    def _otp_result(
        self,
        captcha: str,
        logs: list[dict[str, Any]],
        otp_ok: bool,
    ) -> dict[str, Any]:
        return {
            'captcha': captcha,
            'summary': summarize_logs(logs),
            'logs': logs[-15:],
            'diag': {'captchaTxnId': self.captcha_txn_id, 'option': self.option},
            'version': BOT_ENGINE_VERSION,
            'proxy_label': self.proxy_label,
            'otp_ok': otp_ok,
        }
