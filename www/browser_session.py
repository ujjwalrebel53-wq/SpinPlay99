"""Playwright session — UIDAI + Rebel Adhar page bundle + proxy."""

from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path
from typing import Any

from PIL import Image
from playwright.async_api import Browser, Page, Playwright, async_playwright

UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


class UidaiBrowserSession:
    def __init__(self, bundle_path: Path, proxy: str | None = None) -> None:
        self.bundle_path = bundle_path
        self.proxy = proxy
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._page: Page | None = None
        self.name = ''
        self.mobile = ''
        self.last_logs: list[dict[str, Any]] = []

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started — /open pehle chalao')
        return self._page

    async def start(self) -> None:
        if self._browser:
            return
        self._pw = await async_playwright().start()
        launch_opts: dict[str, Any] = {'headless': True}
        if self.proxy:
            launch_opts['proxy'] = {'server': self.proxy}
        self._browser = await self._pw.chromium.launch(**launch_opts)
        context = await self._browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=MOBILE_UA,
            locale='en-IN',
        )
        self._page = await context.new_page()

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        self._browser = None
        self._pw = None
        self._page = None

    async def _inject_rebel(self) -> None:
        bundle = self.bundle_path.read_text(encoding='utf-8')
        await self.page.evaluate(
            """async (code) => {
              if (window.__rebelPageBridge) return { ok: true, already: true };
              eval(code);
              try { localStorage.setItem('rebelAdharOn', '1'); } catch (e) {}
              window.postMessage({ rebel: 1, type: 'cmd', cmd: 'boot' }, '*');
              return { ok: true, v: window.UidaiRetrieveEngine?.ENGINE_VERSION };
            }""",
            bundle,
        )

    async def open_form(self, name: str, mobile: str, on_frame=None) -> bytes:
        """Navigate, inject Rebel, fill name/mobile. Returns animated GIF bytes."""
        self.name = name.strip()
        self.mobile = mobile.strip()
        frames: list[Image.Image] = []

        async def snap(label: str = '') -> None:
            if not on_frame:
                return
            png = await self.page.screenshot(full_page=False)
            img = Image.open(io.BytesIO(png)).convert('RGB')
            frames.append(img)
            await on_frame(label)

        await self.page.goto(UIDAI_URL, wait_until='domcontentloaded', timeout=120_000)
        await snap('Site khul rahi hai…')

        for _ in range(30):
            if await self.page.locator('input[name="name"]').count():
                break
            await asyncio.sleep(1)
            await snap('Form load…')

        await self._inject_rebel()
        await asyncio.sleep(3)
        await snap('Rebel Adhar ON')

        await self.page.fill('input[name="name"]', self.name)
        await self.page.fill('input[name="mobile"]', self.mobile)
        await snap('Name + Mobile bhara')

        await self._wait_captcha_image()
        await snap('Captcha ready')

        return self._frames_to_gif(frames)

    async def _wait_captcha_image(self, timeout_s: int = 40) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='visible', timeout=timeout_s * 1000)
        for _ in range(timeout_s):
            ok = await el.evaluate('(img) => img.complete && img.naturalWidth > 10')
            if ok:
                return
            await asyncio.sleep(1)
        raise RuntimeError('Captcha image load nahi hui — /refresh try karo')

    async def captcha_png(self) -> bytes:
        await self._wait_captcha_image()
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        return await el.screenshot(type='png')

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
        await asyncio.sleep(2)
        await self._wait_captcha_image()
        return await self.captcha_png()

    async def send_otp(self, captcha: str) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        await self.page.fill('input[name="captcha"]', captcha)

        result = await self.page.evaluate(
            """async (cap) => {
              const E = window.UidaiRetrieveEngine;
              if (!E) return { ok: false, err: 'Engine missing — /open dubara' };
              const logs = [];
              const log = (l, m, d) => logs.push({ l, m, d });
              E.installNetworkBypass({ log, enabled: () => true });
              E.neutralizeReactDob('#tg', log);
              E.syncReactInputs(log);
              E.patchReactFormValues(log);
              E.patchReactOtpClick('#tg', log);
              const inp = document.querySelector('input[name="captcha"]');
              if (inp) E.setReactInputValue(inp, cap, log);
              const btn = E.findOtpButton();
              E.getReactProps(btn)?.onClick?.({});
              await new Promise((r) => setTimeout(r, 8000));
              return {
                ok: true,
                logs,
                version: E.ENGINE_VERSION,
                diag: E.getFormDiagnostics ? E.getFormDiagnostics('#tg') : null,
              };
            }""",
            captcha,
        )

        self.last_logs = result.get('logs') or []
        screen = await self.page.screenshot(full_page=False, type='png')
        summary = self._summarize_logs(self.last_logs)
        return {
            'captcha': captcha,
            'summary': summary,
            'logs': self.last_logs[-12:],
            'diag': result.get('diag'),
            'version': result.get('version'),
            'screen_png': screen,
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
        return '\n'.join(lines[-15:]) or 'Koi log nahi'

    @staticmethod
    def _frames_to_gif(frames: list[Image.Image]) -> bytes:
        if not frames:
            return b''
        out = io.BytesIO()
        dur = 700
        frames[0].save(
            out,
            format='GIF',
            save_all=True,
            append_images=frames[1:],
            duration=dur,
            loop=0,
            optimize=True,
        )
        return out.getvalue()
