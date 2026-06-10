"""Playwright — UIDAI fast: pre-warm browser, commit mode, no GIF."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from proxy_india import check_proxy, format_proxy_line, pick_indian_proxy

log = logging.getLogger('uidai-browser')

UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
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

# Pre-warm pool — Chromium band mat karo har /open pe
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
    def __init__(
        self,
        bundle_path: Path,
        proxy: str | None = None,
        auto_india_proxy: bool = True,
        on_step: StepCb | None = None,
    ) -> None:
        self.bundle_path = bundle_path
        self.proxy = proxy
        self.auto_india_proxy = auto_india_proxy
        self._on_step = on_step
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self.name = ''
        self.mobile = ''
        self.last_logs: list[dict[str, Any]] = []
        self.proxy_info: dict[str, Any] = {}
        self.proxy_label = ''
        self._active_proxy: str | None = None

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started — /open pehle chalao')
        return self._page

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
        """Page band — browser pool me rakho (keep_warm=True)."""
        if self._context:
            await self._context.close()
        self._context = None
        self._page = None
        if not keep_warm:
            await _pool_shutdown()

    async def _inject_rebel(self) -> dict[str, Any]:
        bundle = self.bundle_path.read_text(encoding='utf-8')
        return await self.page.evaluate(
            """async (code) => {
              if (window.__rebelPageBridge) return { ok: true, already: true };
              eval(code);
              try { localStorage.setItem('rebelAdharOn', '1'); } catch (e) {}
              window.postMessage({ rebel: 1, type: 'cmd', cmd: 'boot' }, '*');
              return { ok: true, v: window.UidaiRetrieveEngine?.ENGINE_VERSION };
            }""",
            bundle,
        )

    async def _poll_form(self, max_sec: float = 25.0) -> bool:
        for _ in range(int(max_sec / 0.15)):
            if await self.page.locator('input[name="name"]').count():
                return True
            await asyncio.sleep(0.15)
        return False

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        """commit mode + fast poll — GIF band (hamesha empty)."""
        self.name = name.strip()
        self.mobile = mobile.strip()

        await self._step(3, 8, 'UIDAI site open (fast)…')
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                await self.page.goto(
                    UIDAI_URL,
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

        await self._step(5, 8, 'Rebel Adhar engine inject…')
        inj = await self._inject_rebel()
        await asyncio.sleep(1)
        ver = inj.get('v', '') if isinstance(inj, dict) else ''
        await self._step(5, 8, f'Rebel Adhar ON{(f" (v{ver})" if ver else "")}')

        await self._step(6, 8, f'Naam bhara: {self.name}')
        await self.page.fill('input[name="name"]', self.name)
        await self._step(7, 8, f'Mobile bhara: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)

        await self._step(8, 8, 'Captcha load…')
        await self._wait_captcha_image(20)
        await self._step(8, 8, 'Captcha ready')
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
        await asyncio.sleep(1)
        await self._wait_captcha_image()
        return await self.captcha_png()

    async def send_otp(self, captcha: str, on_step: StepCb | None = None) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        step_fn = on_step or self._on_step
        total = 5

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        await s(1, f'Captcha fill: {captcha}')
        await self.page.fill('input[name="captcha"]', captcha)
        await s(2, 'DOB bypass + network hook ON…')
        await s(3, 'Send OTP tap…')
        result = await self.page.evaluate(
            """async (cap) => {
              const E = window.UidaiRetrieveEngine;
              if (!E) return { ok: false, err: 'Engine missing' };
              const logs = [];
              const log = (l, m, d) => logs.push({ l, m, d });
              E.installNetworkBypass({ log, enabled: () => true });
              E.neutralizeReactDob('#tg', log);
              E.syncReactInputs(log);
              E.patchReactFormValues(log);
              E.patchReactOtpClick('#tg', log);
              const inp = document.querySelector('input[name="captcha"]');
              if (inp) E.setReactInputValue(inp, cap, log);
              E.getReactProps(E.findOtpButton())?.onClick?.({});
              await new Promise((r) => setTimeout(r, 8000));
              return { ok: true, logs, version: E.ENGINE_VERSION,
                diag: E.getFormDiagnostics ? E.getFormDiagnostics('#tg') : null };
            }""",
            captcha,
        )
        await s(4, 'UIDAI jawab aaya')
        await s(5, 'Done')
        self.last_logs = result.get('logs') or []
        return {
            'captcha': captcha,
            'summary': self._summarize_logs(self.last_logs),
            'logs': self.last_logs[-12:],
            'diag': result.get('diag'),
            'version': result.get('version'),
            'proxy_label': self.proxy_label,
        }

    @staticmethod
    def _summarize_logs(logs: list[dict]) -> str:
        lines = []
        for item in logs:
            msg = item.get('m') or item.get('msg') or ''
            level = item.get('l') or item.get('level') or 'info'
            data = item.get('d') or item.get('data')
            extra = f' {json.dumps(data)}' if data is not None else ''
            lines.append(f'[{level}] {msg}{extra}')
        return '\n'.join(lines[-15:]) or 'Koi log nahi'
