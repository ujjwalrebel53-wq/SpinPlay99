"""Playwright — UIDAI turbo load."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, Page, Playwright, async_playwright

from proxy_india import check_proxy, format_proxy_line

log = logging.getLogger('uidai-browser')

FAST_PROXY = 'http://139.167.218.162:3127'
UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
StepCb = Callable[[int, int, str], Awaitable[None]]
LogCb = Callable[[str], Awaitable[None]]

SKIP_FONTS_JS = """(() => {
  const s = document.createElement('style');
  s.textContent = '*{font-family:Arial,sans-serif!important}';
  (document.head || document.documentElement).appendChild(s);
})();"""

BLOCK = ('google-analytics', 'googletagmanager', 'facebook', 'doubleclick', 'fonts.', 'analytics')


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
        self.proxy_label = ''
        self._tried: list[str] = []

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started')
        return self._page

    async def _step(self, n: int, total: int, msg: str) -> None:
        log.info('STEP %s/%s %s', n, total, msg)
        if self._on_step:
            await self._on_step(n, total, msg)

    async def _log(self, msg: str) -> None:
        log.info(msg)

    async def _tg(self, msg: str) -> None:
        log.info(msg)
        if self._on_log:
            await self._on_log(msg)

    def _pick_proxy(self) -> str | None:
        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            return self.proxy
        if not self.auto_india_proxy:
            return None
        return FAST_PROXY

    async def _block_heavy(self, route) -> None:
        url = route.request.url.lower()
        rt = route.request.resource_type
        if rt in ('font', 'media', 'stylesheet') and 'uidai' not in url:
            await route.abort()
        elif any(b in url for b in BLOCK):
            await route.abort()
        elif rt == 'image' and 'captcha' not in url:
            await route.abort()
        else:
            await route.continue_()

    async def _launch(self, proxy: str | None) -> None:
        if self._browser:
            await self.close()
        self._pw = await async_playwright().start()
        opts: dict[str, Any] = {
            'headless': True,
            'args': ['--no-sandbox', '--disable-dev-shm-usage', '--disable-remote-fonts'],
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
        )
        await ctx.add_init_script(SKIP_FONTS_JS)
        await ctx.route('**/*', self._block_heavy)
        self._page = await ctx.new_page()

    async def start(self) -> None:
        if self._browser:
            return
        await self._step(1, 6, 'VPN + browser start…')
        proxy = self._pick_proxy()
        if proxy:
            self.proxy = proxy
            self.proxy_label = f'🇮🇳 Bengaluru ({proxy.split("//")[-1]})'
        else:
            self.proxy_label = 'Direct'
        await self._launch(proxy)
        await self._step(2, 6, f'Browser ready — {self.proxy_label}')

    async def _next_proxy(self) -> str | None:
        alts = [FAST_PROXY, 'http://103.152.112.162:80', 'http://45.67.59.98:80']
        for p in alts:
            if p not in self._tried:
                self._tried.append(p)
                try:
                    info = await asyncio.wait_for(asyncio.to_thread(check_proxy, p, 3), timeout=4)
                    if info.get('countryCode') == 'IN':
                        self.proxy = p
                        self.proxy_label = format_proxy_line(info, p)
                        await self._launch(p)
                        return p
                except Exception:
                    continue
        return None

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        self._browser = None
        self._pw = None
        self._page = None

    async def _goto_uidai(self) -> None:
        err: Exception | None = None
        for attempt in range(3):
            try:
                await self.page.goto(UIDAI_URL, wait_until='commit', timeout=35_000)
                await self.page.wait_for_selector('input[name="name"]', timeout=18_000)
                return
            except Exception as e:
                err = e
                await self._tg(f'Retry {attempt + 1}: {str(e)[:80]}')
                if attempt < 2 and await self._next_proxy():
                    continue
        raise RuntimeError(f'UIDAI load fail: {err}')

    async def _inject_rebel(self) -> str:
        bundle = self.bundle_path.read_text(encoding='utf-8')
        r = await self.page.evaluate(
            """(code) => {
              if (!window.__rebelPageBridge) { eval(code); }
              try { localStorage.setItem('rebelAdharOn', '1'); } catch(e) {}
              window.postMessage({ rebel: 1, type: 'cmd', cmd: 'boot' }, '*');
              return window.UidaiRetrieveEngine?.ENGINE_VERSION || '?';
            }""",
            bundle,
        )
        return str(r)

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        self.name = name.strip()
        self.mobile = mobile.strip()

        await self._step(3, 6, 'UIDAI khul rahi hai…')
        await self._goto_uidai()
        await self._step(4, 6, 'Form load OK')

        await self._step(5, 6, 'Rebel ON + fill…')
        ver = await self._inject_rebel()
        await self.page.fill('input[name="name"]', self.name)
        await self.page.fill('input[name="mobile"]', self.mobile)
        await self._tg(f'Filled v{ver}')

        await self._step(6, 6, 'Captcha…')
        await self._wait_captcha_image(15)
        await self._tg('Captcha ready')
        return b''

    async def _wait_captcha_image(self, timeout_s: int = 15) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='visible', timeout=timeout_s * 1000)
        for _ in range(timeout_s * 3):
            if await el.evaluate('(i) => i.complete && i.naturalWidth > 10'):
                return
            await asyncio.sleep(0.33)
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
        await asyncio.sleep(0.8)
        await self._wait_captcha_image(12)
        return await self.captcha_png()

    async def send_otp(self, captcha: str, on_step: StepCb | None = None) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        fn = on_step or self._on_step

        async def s(n: int, msg: str) -> None:
            if fn:
                await fn(n, 4, msg)

        await s(1, 'Captcha + OTP bhej rahe hain…')
        await self.page.fill('input[name="captcha"]', captcha)
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
              await new Promise((r) => setTimeout(r, 4500));
              return { ok: true, logs, version: E.ENGINE_VERSION };
            }""",
            captcha,
        )
        await s(2, 'UIDAI jawab…')
        self.last_logs = result.get('logs') or []
        summary = self._summarize_logs(self.last_logs)
        await s(3, 'Done')
        await self._tg(summary[:500] if summary else 'No logs')
        return {
            'captcha': captcha,
            'summary': summary,
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
