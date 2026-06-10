"""Playwright — UIDAI fast load, multi-proxy rotate, live logs."""

from __future__ import annotations

import asyncio
import io
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from PIL import Image
from playwright.async_api import Browser, Page, Playwright, async_playwright

from proxy_india import (
    check_proxy,
    format_proxy_line,
    pick_indian_proxy,
    pick_ranked_proxies,
    proxy_list_from_env,
)

log = logging.getLogger('uidai-browser')

UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
StepCb = Callable[[int, int, str], Awaitable[None]]
LogCb = Callable[[str], Awaitable[None]]

SKIP_FONTS_JS = """(() => {
  if (document.getElementById('rebel-skip-fonts')) return;
  const s = document.createElement('style');
  s.id = 'rebel-skip-fonts';
  s.textContent = '*{font-family:Arial,Helvetica,sans-serif!important}';
  (document.head || document.documentElement).appendChild(s);
})();"""

BLOCK_URL_PARTS = (
    'google-analytics', 'googletagmanager', 'facebook', 'doubleclick',
    'hotjar', 'clarity.ms', 'fonts.googleapis', 'fonts.gstatic',
    'analytics', 'adservice', 'ads.',
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
            raise RuntimeError('Browser not started — /open pehle chalao')
        return self._page

    async def _step(self, n: int, total: int, msg: str) -> None:
        await self._log(f'STEP {n}/{total}: {msg}')
        if self._on_step:
            await self._on_step(n, total, msg)

    async def _log(self, msg: str) -> None:
        log.info(msg)
        if self._on_log:
            await self._on_log(msg)

    def _build_proxy_candidates(self) -> list[str]:
        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            return [self.proxy]
        if not self.auto_india_proxy:
            return []
        try:
            ranked = pick_ranked_proxies(limit=6)
            return [r['proxy'] for r in ranked] or proxy_list_from_env()
        except Exception as e:
            log.warning('ranked proxy fail: %s', e)
            return proxy_list_from_env()

    async def _resolve_proxy(self) -> str | None:
        self._proxy_candidates = self._build_proxy_candidates()
        if not self._proxy_candidates:
            await self._step(1, 8, 'Direct connect (no VPN)')
            self.proxy_label = '⚠️ Direct'
            return None

        await self._step(1, 8, f'{len(self._proxy_candidates)} Indian proxy test…')
        errors: list[str] = []

        for i, proxy in enumerate(self._proxy_candidates, 1):
            try:
                await self._log(f'Proxy try {i}/{len(self._proxy_candidates)}: {proxy}')
                info = await asyncio.to_thread(check_proxy, proxy, 5)
                if info.get('countryCode') != 'IN':
                    errors.append(f'{proxy}: not India')
                    continue
                self.proxy = proxy
                self.proxy_info = info
                self.proxy_label = format_proxy_line(info, proxy)
                await self._step(1, 8, f'VPN OK — {info.get("city", "India")} ({proxy})')
                return proxy
            except Exception as e:
                errors.append(f'{proxy}: {e}')
                await self._log(f'Proxy fail {proxy}: {e}')

        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            raise RuntimeError('Proxy fail:\n' + '\n'.join(errors[:4]))

        await self._log('Fallback — sequential proxy pick')
        proxy, info = await asyncio.to_thread(pick_indian_proxy)
        self.proxy = proxy
        self.proxy_info = info
        self.proxy_label = format_proxy_line(info, proxy)
        await self._step(1, 8, f'VPN fallback — {self.proxy_label}')
        return proxy

    def _attach_page_logs(self, page: Page) -> None:
        session = self

        def _push(text: str) -> None:
            log.info(text)
            if not session._on_log:
                return
            try:
                asyncio.get_running_loop().create_task(session._on_log(text))
            except RuntimeError:
                pass

        page.on('console', lambda m: _push(f'[browser] {m.type}: {m.text[:180]}'))
        page.on('pageerror', lambda e: _push(f'[pageerror] {str(e)[:180]}'))
        page.on('requestfailed', lambda r: _push(f'[net-fail] {r.url[:70]} {r.failure}'))

    async def _block_heavy(self, route) -> None:
        url = route.request.url.lower()
        rtype = route.request.resource_type
        if rtype in ('font', 'media'):
            await route.abort()
            return
        if any(p in url for p in BLOCK_URL_PARTS):
            await route.abort()
            return
        if rtype == 'image' and 'captcha' not in url and 'uidai' not in url:
            await route.abort()
            return
        await route.continue_()

    async def _launch(self, proxy: str | None) -> None:
        if self._browser:
            await self.close()

        self._pw = await async_playwright().start()
        launch_opts: dict[str, Any] = {
            'headless': True,
            'args': [
                '--disable-remote-fonts',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--blink-settings=imagesEnabled=true',
            ],
        }
        if proxy:
            launch_opts['proxy'] = {'server': proxy}
            await self._log(f'Chromium launch proxy={proxy}')

        self._browser = await self._pw.chromium.launch(**launch_opts)
        context = await self._browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=MOBILE_UA,
            locale='en-IN',
            timezone_id='Asia/Kolkata',
            geolocation={'latitude': 28.6139, 'longitude': 77.2090},
            permissions=['geolocation'],
            ignore_https_errors=True,
        )
        await context.add_init_script(SKIP_FONTS_JS)
        await context.route('**/*', self._block_heavy)
        self._page = await context.new_page()
        self._attach_page_logs(self._page)

    async def start(self) -> None:
        if self._browser:
            return
        await self._step(1, 8, 'Chromium start…')
        proxy = await self._resolve_proxy()
        await self._launch(proxy)
        await self._step(2, 8, 'Browser ready — Asia/Kolkata')

    async def _rotate_proxy_and_retry(self) -> bool:
        """Agla proxy try — True if switched."""
        if not self._proxy_candidates or len(self._proxy_candidates) < 2:
            return False
        try:
            cur = self._proxy_candidates.pop(0)
            await self._log(f'Rotate proxy — drop {cur}')
        except IndexError:
            return False
        if not self._proxy_candidates:
            return False
        proxy = self._proxy_candidates[0]
        try:
            info = await asyncio.to_thread(check_proxy, proxy, 5)
            if info.get('countryCode') != 'IN':
                return await self._rotate_proxy_and_retry()
            self.proxy = proxy
            self.proxy_info = info
            self.proxy_label = format_proxy_line(info, proxy)
            await self._log(f'New proxy: {self.proxy_label}')
            await self._launch(proxy)
            return True
        except Exception as e:
            await self._log(f'Rotate fail: {e}')
            return await self._rotate_proxy_and_retry()

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        self._browser = None
        self._pw = None
        self._page = None

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

    async def _goto_uidai(self) -> None:
        last_err: Exception | None = None
        for attempt in range(4):
            try:
                await self._log(f'goto attempt {attempt + 1} → {UIDAI_URL}')
                await self.page.goto(
                    UIDAI_URL,
                    wait_until='commit',
                    timeout=45_000,
                )
                await self.page.wait_for_load_state('domcontentloaded', timeout=25_000)
                await self.page.wait_for_selector(
                    'input[name="name"], form, body',
                    timeout=20_000,
                )
                await self._log('UIDAI DOM ready')
                return
            except Exception as e:
                last_err = e
                await self._log(f'goto fail: {e}')
                await self._step(3, 8, f'Retry {attempt + 1}/4 — proxy switch…')
                if attempt < 3 and await self._rotate_proxy_and_retry():
                    continue
                await asyncio.sleep(1)
        raise RuntimeError(f'UIDAI load fail: {last_err}') from last_err

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        self.name = name.strip()
        self.mobile = mobile.strip()
        frames: list[Image.Image] = []

        async def snap(label: str = '') -> None:
            if on_frame:
                await on_frame(label)

        await self._step(3, 8, 'UIDAI site open…')
        await self._goto_uidai()
        await self._step(3, 8, 'UIDAI page load OK')
        await snap('Site open')

        await self._step(4, 8, 'Form wait…')
        form_ok = False
        for i in range(20):
            if await self.page.locator('input[name="name"]').count():
                form_ok = True
                break
            await asyncio.sleep(0.5)
        if not form_ok:
            raise RuntimeError('Form nahi mila — /open dubara ya proxy badlo')
        await self._step(4, 8, 'Form ready')

        await self._step(5, 8, 'Rebel inject…')
        inj = await self._inject_rebel()
        await asyncio.sleep(1)
        ver = inj.get('v', '') if isinstance(inj, dict) else ''
        await self._step(5, 8, f'Rebel ON v{ver or "?"}')

        await self._step(6, 8, f'Naam: {self.name}')
        await self.page.fill('input[name="name"]', self.name)
        await self._step(7, 8, f'Mobile: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)

        await self._step(8, 8, 'Captcha load…')
        await self._wait_captcha_image(timeout_s=25)
        await self._step(8, 8, 'Captcha ready')
        return self._frames_to_gif(frames)

    async def _wait_captcha_image(self, timeout_s: int = 25) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='visible', timeout=timeout_s * 1000)
        for i in range(timeout_s * 2):
            ok = await el.evaluate('(img) => img.complete && img.naturalWidth > 10')
            if ok:
                await self._log('Captcha image loaded')
                return
            await asyncio.sleep(0.5)
        raise RuntimeError('Captcha load fail — /refresh try karo')

    async def captcha_png(self) -> bytes:
        await self._wait_captcha_image()
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        return await el.screenshot(type='png', timeout=10_000)

    async def refresh_captcha(self) -> bytes:
        await self._log('Captcha refresh')
        refresh = self.page.locator(
            'button[aria-label*="refresh" i], button:near(img[alt*="CAPTCHA" i])'
        ).first
        if await refresh.count():
            try:
                await refresh.click(timeout=2000)
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
            await self._log(msg)
            if step_fn:
                await step_fn(n, total, msg)

        await s(1, f'Captcha fill: {captcha}')
        await self.page.fill('input[name="captcha"]', captcha)

        await s(2, 'DOB bypass + network hook')
        await s(3, 'Send OTP tap')
        result = await self.page.evaluate(
            """async (cap) => {
              const E = window.UidaiRetrieveEngine;
              if (!E) return { ok: false, err: 'Engine missing' };
              const logs = [];
              const log = (l, m, d) => { logs.push({ l, m, d }); console.log('[rebel]', m, d||''); };
              E.installNetworkBypass({ log, enabled: () => true });
              E.neutralizeReactDob('#tg', log);
              E.syncReactInputs(log);
              E.patchReactFormValues(log);
              E.patchReactOtpClick('#tg', log);
              const inp = document.querySelector('input[name="captcha"]');
              if (inp) E.setReactInputValue(inp, cap, log);
              const btn = E.findOtpButton();
              E.getReactProps(btn)?.onClick?.({});
              await new Promise((r) => setTimeout(r, 6000));
              return {
                ok: true, logs, version: E.ENGINE_VERSION,
                diag: E.getFormDiagnostics ? E.getFormDiagnostics('#tg') : null,
              };
            }""",
            captcha,
        )

        for item in result.get('logs') or []:
            m = item.get('m') or ''
            d = item.get('d')
            extra = f' {json.dumps(d)}' if d is not None else ''
            await self._log(f'[engine] {m}{extra}')

        await s(4, 'UIDAI jawab aaya')
        await s(5, 'Done')

        self.last_logs = result.get('logs') or []
        summary = self._summarize_logs(self.last_logs)
        return {
            'captcha': captcha,
            'summary': summary,
            'logs': self.last_logs[-20:],
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
            extra = ''
            if data is not None:
                extra = ' ' + (json.dumps(data) if not isinstance(data, str) else data)
            lines.append(f'[{level}] {msg}{extra}')
        return '\n'.join(lines[-20:]) or 'Koi log nahi'

    @staticmethod
    def _frames_to_gif(frames: list[Image.Image]) -> bytes:
        if not frames:
            return b''
        out = io.BytesIO()
        frames[0].save(
            out, format='GIF', save_all=True, append_images=frames[1:],
            duration=500, loop=0, optimize=True,
        )
        return out.getvalue()
