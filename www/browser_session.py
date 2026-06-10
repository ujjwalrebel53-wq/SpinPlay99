"""Playwright — fast UIDAI load (classic 8-step UI)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, Page, Playwright, async_playwright

from proxy_india import check_proxy, format_proxy_line, proxy_list_from_env

log = logging.getLogger('uidai-browser')

FAST_PROXY = 'http://139.167.218.162:3127'
UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
TOTAL_STEPS = 8
FORM_SELECTORS = (
    'input[name="name"]',
    'input[name="mobile"]',
    'input[placeholder*="name" i]',
    'input[placeholder*="mobile" i]',
    'form input[type="text"]',
)
StepCb = Callable[[int, int, str], Awaitable[None]]
LogCb = Callable[[str], Awaitable[None]]

SKIP_FONTS_JS = """(() => {
  const s = document.createElement('style');
  s.textContent = '*{font-family:Arial,sans-serif!important}';
  (document.head || document.documentElement).appendChild(s);
})();"""

JUNK_HOSTS = (
    'google-analytics', 'googletagmanager', 'facebook', 'doubleclick',
    'hotjar', 'clarity.ms', 'analytics', 'adservice',
)


class UidaiBrowserSession:
    def __init__(
        self,
        bundle_path: Path,
        proxy: str | None = None,
        auto_india_proxy: bool = True,
        on_step: StepCb | None = None,
        on_log: LogCb | None = None,
    ) -> None:
        self.bundle_path = bundle_path
        self.proxy = proxy
        self.auto_india_proxy = auto_india_proxy
        self._on_step = on_step
        self._on_log = on_log
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._page: Page | None = None
        self.name = ''
        self.mobile = ''
        self.last_logs: list[dict[str, Any]] = []
        self.proxy_info: dict[str, Any] = {}
        self.proxy_label = ''
        self._proxy_candidates: list[str] = []

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started')
        return self._page

    async def _step(self, n: int, msg: str) -> None:
        log.info('STEP %s/%s: %s', n, TOTAL_STEPS, msg)
        if self._on_step:
            await self._on_step(n, TOTAL_STEPS, msg)

    def _build_proxy_candidates(self) -> list[str]:
        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            return [self.proxy]
        if not self.auto_india_proxy:
            return []
        seen: set[str] = set()
        out: list[str] = []
        for p in [FAST_PROXY, *proxy_list_from_env()]:
            if p and p not in seen:
                seen.add(p)
                out.append(p)
        return out[:5]

    async def _resolve_proxy(self) -> str | None:
        self._proxy_candidates = self._build_proxy_candidates()
        if not self._proxy_candidates:
            self.proxy_label = '⚠️ Direct'
            await self._step(1, 'Bina proxy — direct connect')
            return None

        for proxy in self._proxy_candidates:
            try:
                info = await asyncio.wait_for(asyncio.to_thread(check_proxy, proxy, 3), timeout=4)
                if info.get('countryCode') != 'IN':
                    continue
                self.proxy = proxy
                self.proxy_info = info
                self.proxy_label = format_proxy_line(info, proxy)
                await self._step(1, f'VPN connected — {self.proxy_label}')
                return proxy
            except Exception as e:
                log.warning('proxy %s: %s', proxy, e)

        raise RuntimeError('Koi Indian proxy kaam nahi kiya')

    async def _block_junk_only(self, route) -> None:
        url = route.request.url.lower()
        if 'uidai.gov.in' in url or 'myaadhaar' in url:
            await route.continue_()
            return
        if route.request.resource_type in ('image', 'media', 'font') and 'captcha' not in url:
            await route.abort()
            return
        if any(h in url for h in JUNK_HOSTS):
            await route.abort()
            return
        await route.continue_()

    async def _launch(self, proxy: str | None) -> None:
        if self._browser:
            await self.close()
        self._pw = await async_playwright().start()
        opts: dict[str, Any] = {
            'headless': True,
            'args': [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-remote-fonts',
                '--disable-background-networking',
                '--disable-default-apps',
            ],
        }
        if proxy:
            opts['proxy'] = {'server': proxy}
        self._browser = await self._pw.chromium.launch(**opts)
        ctx = await self._browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=MOBILE_UA,
            locale='en-IN',
            timezone_id='Asia/Kolkata',
            ignore_https_errors=True,
            bypass_csp=True,
            extra_http_headers={'Accept-Language': 'en-IN,en;q=0.9'},
        )
        await ctx.add_init_script(SKIP_FONTS_JS)
        await ctx.route('**/*', self._block_junk_only)
        self._page = await ctx.new_page()

    async def start(self) -> None:
        if self._browser:
            return
        proxy = await self._resolve_proxy()
        await self._launch(proxy)
        await self._step(2, 'Browser ready — India timezone (Asia/Kolkata)')

    async def _rotate_proxy(self) -> bool:
        if len(self._proxy_candidates) < 2:
            return False
        self._proxy_candidates.pop(0)
        if not self._proxy_candidates:
            return False
        proxy = self._proxy_candidates[0]
        try:
            info = await asyncio.wait_for(asyncio.to_thread(check_proxy, proxy, 3), timeout=4)
            if info.get('countryCode') != 'IN':
                return await self._rotate_proxy()
            self.proxy = proxy
            self.proxy_info = info
            self.proxy_label = format_proxy_line(info, proxy)
            await self._launch(proxy)
            return True
        except Exception:
            return await self._rotate_proxy()

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        self._browser = None
        self._pw = None
        self._page = None

    async def _form_ready(self) -> bool:
        return await self.page.evaluate(
            """() => {
              const n = document.querySelector('input[name="name"]');
              const m = document.querySelector('input[name="mobile"]');
              return !!(n && m);
            }"""
        )

    async def _poll_form(self, max_sec: float = 25.0) -> float:
        """Form milte hi return — seconds elapsed."""
        t0 = time.monotonic()
        while time.monotonic() - t0 < max_sec:
            if await self._form_ready():
                return time.monotonic() - t0
            for sel in FORM_SELECTORS:
                try:
                    loc = self.page.locator(sel).first
                    if await loc.count() and await loc.is_visible():
                        return time.monotonic() - t0
                except Exception:
                    pass
            await asyncio.sleep(0.08)
        return -1.0

    async def _goto_uidai(self) -> None:
        err: Exception | None = None
        for attempt in range(3):
            try:
                t0 = time.monotonic()
                await self._step(3, 'UIDAI site open…')
                await self.page.goto(
                    UIDAI_URL,
                    wait_until='commit',
                    timeout=30_000,
                )
                elapsed = time.monotonic() - t0
                await self._step(3, f'Page connect {elapsed:.1f}s — form wait…')

                wait_s = await self._poll_form(22.0)
                if wait_s >= 0:
                    total = elapsed + wait_s
                    await self._step(3, f'UIDAI page load ho gayi ({total:.1f}s)')
                    return

                await self._step(3, f'Retry {attempt + 1} — reload…')
                await self.page.reload(wait_until='domcontentloaded', timeout=20_000)
                wait_s = await self._poll_form(12.0)
                if wait_s >= 0:
                    await self._step(3, 'UIDAI page load ho gayi')
                    return

                raise RuntimeError('Form fields nahi mile — React slow')
            except Exception as e:
                err = e
                log.warning('goto attempt %s: %s', attempt + 1, e)
                if attempt < 2 and await self._rotate_proxy():
                    continue
        raise RuntimeError(f'UIDAI load fail: {err}')

    async def _inject_rebel(self) -> str:
        bundle = self.bundle_path.read_text(encoding='utf-8')
        r = await self.page.evaluate(
            """(code) => {
              if (!window.__rebelPageBridge) { eval(code); }
              try { localStorage.setItem('rebelAdharOn', '1'); } catch(e) {}
              window.postMessage({ rebel: 1, type: 'cmd', cmd: 'boot' }, '*');
              return window.UidaiRetrieveEngine?.ENGINE_VERSION || '';
            }""",
            bundle,
        )
        return str(r or '')

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        self.name = name.strip()
        self.mobile = mobile.strip()

        await self._goto_uidai()

        await self._step(4, 'Form mil gaya — naam/mobile fields ready')

        await self._step(5, 'Rebel Adhar engine inject ho raha hai…')
        ver = await self._inject_rebel()
        suffix = f' (v{ver})' if ver else ''
        await self._step(5, f'Rebel Adhar ON{suffix}')

        await self._step(6, f'Naam bhara: {self.name}')
        await self.page.fill('input[name="name"]', self.name)

        await self._step(7, f'Mobile bhara: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)

        await self._step(8, 'Captcha image load ho rahi hai…')
        await self._wait_captcha_image(15)
        await self._step(8, 'Captcha ready')
        return b''

    async def _wait_captcha_image(self, timeout_s: int = 15) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='attached', timeout=timeout_s * 1000)
        for _ in range(timeout_s * 5):
            if await el.evaluate('(i) => i.complete && i.naturalWidth > 10'):
                return
            await asyncio.sleep(0.2)
        raise RuntimeError('Captcha load fail — /refresh')

    async def captcha_png(self) -> bytes:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        return await el.screenshot(type='png', timeout=8_000)

    async def refresh_captcha(self) -> bytes:
        btn = self.page.locator('button[aria-label*="refresh" i]').first
        if await btn.count():
            await btn.click(timeout=2000)
        else:
            await self.page.locator('img[alt*="CAPTCHA" i]').first.click()
        await asyncio.sleep(0.6)
        await self._wait_captcha_image(12)
        return await self.captcha_png()

    async def send_otp(self, captcha: str, on_step: StepCb | None = None) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        fn = on_step or self._on_step

        async def s(n: int, msg: str) -> None:
            if fn:
                await fn(n, 4, msg)

        await s(1, 'Captcha sync + DOB bypass…')
        await self.page.fill('input[name="captcha"]', captcha)
        await s(2, 'Send OTP tap…')
        result = await self.page.evaluate(
            """async (cap) => {
              const E = window.UidaiRetrieveEngine;
              if (!E) return { ok: false, logs: [], version: '?' };
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
              await new Promise((r) => setTimeout(r, 5000));
              return { ok: true, logs, version: E.ENGINE_VERSION };
            }""",
            captcha,
        )
        self.last_logs = result.get('logs') or []
        await s(3, 'UIDAI server jawab aaya')
        await s(4, 'OTP request complete')
        return {
            'captcha': captcha,
            'summary': self._summarize_logs(self.last_logs),
            'logs': self.last_logs,
            'version': result.get('version'),
            'proxy_label': self.proxy_label,
        }

    @staticmethod
    def _summarize_logs(logs: list[dict]) -> str:
        out = []
        for item in logs[-15:]:
            m = item.get('m') or ''
            d = item.get('d')
            out.append(f"[{item.get('l','i')}] {m}" + (f' {json.dumps(d)}' if d else ''))
        return '\n'.join(out)
