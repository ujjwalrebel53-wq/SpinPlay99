"""Playwright session — UIDAI + Rebel Adhar page bundle + Indian proxy."""

from __future__ import annotations

import asyncio
import io
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from PIL import Image
from playwright.async_api import Browser, Page, Playwright, async_playwright

from proxy_india import check_proxy, format_proxy_line, pick_indian_proxy

UIDAI_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
StepCb = Callable[[int, int, str], Awaitable[None]]


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
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._page: Page | None = None
        self.name = ''
        self.mobile = ''
        self.last_logs: list[dict[str, Any]] = []
        self.proxy_info: dict[str, Any] = {}
        self.proxy_label = ''

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
            await self._step(1, 8, 'Indian proxy check kar raha hoon…')
            info = await asyncio.to_thread(check_proxy, self.proxy)
            if info.get('countryCode') != 'IN':
                raise RuntimeError(
                    f'Proxy India nahi hai: {info.get("country")} ({info.get("query")})'
                )
            self.proxy_info = info
            self.proxy_label = format_proxy_line(info, self.proxy)
            await self._step(1, 8, f'VPN connected — {self.proxy_label}')
            return self.proxy

        if not self.auto_india_proxy and not self.proxy:
            await self._step(1, 8, 'Bina proxy — direct connect (India IP nahi)')
            self.proxy_label = '⚠️ Direct (no Indian VPN)'
            return None

        await self._step(1, 8, 'Indian VPN dhundh raha hoon…')
        proxy, info = await asyncio.to_thread(pick_indian_proxy)
        self.proxy = proxy
        self.proxy_info = info
        self.proxy_label = format_proxy_line(info, proxy)
        await self._step(1, 8, f'VPN connected — {self.proxy_label}')
        return proxy

    async def start(self) -> None:
        if self._browser:
            return

        await self._step(1, 8, 'Chromium browser start ho raha hai…')
        proxy = await self._resolve_proxy()

        self._pw = await async_playwright().start()
        launch_opts: dict[str, Any] = {'headless': True}
        if proxy:
            launch_opts['proxy'] = {'server': proxy}

        self._browser = await self._pw.chromium.launch(**launch_opts)
        context = await self._browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent=MOBILE_UA,
            locale='en-IN',
            timezone_id='Asia/Kolkata',
            geolocation={'latitude': 28.6139, 'longitude': 77.2090},
            permissions=['geolocation'],
        )
        self._page = await context.new_page()
        await self._step(2, 8, 'Browser ready — India timezone (Asia/Kolkata)')

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

        await self._step(3, 8, f'UIDAI site open: {UIDAI_URL}')
        await self.page.goto(UIDAI_URL, wait_until='domcontentloaded', timeout=120_000)
        await snap('Site khul rahi hai…')
        await self._step(3, 8, 'UIDAI page load ho gayi')

        await self._step(4, 8, 'Form fields wait kar raha hoon…')
        for i in range(30):
            if await self.page.locator('input[name="name"]').count():
                await self._step(4, 8, 'Form mil gaya — naam/mobile fields ready')
                break
            await asyncio.sleep(1)
            if i % 5 == 4:
                await self._step(4, 8, f'Form load… ({i + 1}s)')
            await snap('Form load…')
        else:
            raise RuntimeError('Form load nahi hua — proxy/VPN check karo')

        await self._step(5, 8, 'Rebel Adhar engine inject ho raha hai…')
        inj = await self._inject_rebel()
        await asyncio.sleep(3)
        ver = ''
        if isinstance(inj, dict):
            ver = inj.get('v') or ''
        await self._step(5, 8, f'Rebel Adhar ON {("(v" + ver + ")") if ver else ""}')
        await snap('Rebel Adhar ON')

        await self._step(6, 8, f'Naam bhara: {self.name}')
        await self.page.fill('input[name="name"]', self.name)
        await self._step(7, 8, f'Mobile bhara: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)
        await snap('Name + Mobile bhara')

        await self._step(8, 8, 'Captcha image load ho rahi hai…')
        await self._wait_captcha_image()
        await self._step(8, 8, 'Captcha ready — photo bhej raha hoon')
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

    async def send_otp(self, captcha: str, on_step: StepCb | None = None) -> dict[str, Any]:
        captcha = captcha.strip().lower()
        step_fn = on_step or self._on_step
        total = 5

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        await s(1, f'Captcha field me likh raha hoon: {captcha}')
        await self.page.fill('input[name="captcha"]', captcha)

        await s(2, 'DOB bypass + network hook ON…')
        await s(3, 'Send OTP button tap…')
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

        await s(4, 'UIDAI server jawab aaya')
        await s(5, 'OTP request complete — logs collect')

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
