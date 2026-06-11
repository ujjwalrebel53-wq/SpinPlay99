"""Playwright UIDAI bot — Python-first OTP, no extension bundle."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from proxy_india import (
    check_direct_india,
    check_proxy,
    fastest_proxy_url,
    format_direct_line,
    format_proxy_line,
    pick_indian_proxy,
    test_uidai,
)
from react_extract import (
    CLICK_REFRESH_CAPTCHA_JS,
    EXTRACT_CAPTCHA_TXN_JS,
    GET_OPTION_JS,
    SEND_OTP_FETCH_JS,
    SEND_OTP_XHR_JS,
    SET_OPTION_JS,
)
from uidai_api import (
    BOT_ENGINE_VERSION,
    DOWNLOAD_PAGE_URL,
    OTP_API_URL,
    UIDAI_PAGE_URL,
    append_log,
    build_otp_payload,
    build_retrieve_payload,
    extract_otp_txn_id,
    new_request_id,
    parse_uidai_response,
    summarize_logs,
    uidai_headers,
    is_skip_name,
    normalize_name,
)

log = logging.getLogger('uidai-browser')

SESSION_TTL_SEC = int(os.getenv('UIDAI_SESSION_HOURS', '24')) * 3600
KEEPALIVE_INTERVAL_SEC = int(os.getenv('UIDAI_KEEPALIVE_MIN', '10')) * 60
CAPTCHA_CACHE_TTL_SEC = int(os.getenv('UIDAI_CAPTCHA_CACHE_MIN', '15')) * 60
PROXY_CONNECT_TRIES = int(os.getenv('UIDAI_PROXY_TRIES', '3'))
def _primary_proxy() -> str:
    return os.getenv('UIDAI_PRIMARY_PROXY', '').strip() or fastest_proxy_url()

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
    'proxy_info': None,
    'standby': {
        'context': None,
        'page': None,
        'captcha_png': b'',
        'captcha_txn_id': '',
        'cached_at': 0.0,
    },
}


def _browser_connected(browser: Browser | None) -> bool:
    if not browser:
        return False
    try:
        return browser.is_connected()
    except Exception:
        return False


def _is_browser_closed_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return 'has been closed' in msg or 'target closed' in msg or 'browser has been closed' in msg


async def _pool_drop_browser_locked() -> None:
    """Pool lock held — browser ref hatao (Chromium crash / stale)."""
    if _POOL['browser']:
        try:
            await _POOL['browser'].close()
        except Exception:
            pass
    _POOL['browser'] = None


async def _pool_shutdown() -> None:
    async with _POOL['lock']:
        standby = _POOL.get('standby') or {}
        if standby.get('context'):
            try:
                await standby['context'].close()
            except Exception:
                pass
        _POOL['standby'] = {
            'context': None,
            'page': None,
            'captcha_png': b'',
            'captcha_txn_id': '',
            'cached_at': 0.0,
        }
        await _pool_drop_browser_locked()
        if _POOL['pw']:
            try:
                await _POOL['pw'].stop()
            except Exception:
                pass
        _POOL['pw'] = None
        _POOL['proxy'] = None
        _POOL['proxy_info'] = None


def pool_is_warm() -> bool:
    return _browser_connected(_POOL.get('browser'))


def standby_has_captcha() -> bool:
    sb = _POOL.get('standby') or {}
    png = sb.get('captcha_png') or b''
    if len(png) < 500:
        return False
    if not sb.get('cached_at'):
        return False
    return time.monotonic() - float(sb['cached_at']) < CAPTCHA_CACHE_TTL_SEC


def get_standby_captcha_png() -> bytes | None:
    if standby_has_captcha():
        return _POOL['standby']['captcha_png']
    return None


def get_standby_captcha_pair() -> tuple[bytes, str] | None:
    """Standby cache — PNG + captchaTxnId (instant /pdf captcha)."""
    if not standby_has_captcha():
        return None
    sb = _POOL['standby']
    txn = str(sb.get('captcha_txn_id') or '').strip()
    png = sb.get('captcha_png') or b''
    if len(png) < 500 or not txn:
        return None
    return png, txn


async def fetch_captcha_from_page(
    page_url: str,
    *,
    proxy: str | None = None,
    auto_india_proxy: bool = True,
    name: str = '',
    mobile: str = '',
    option: str = 'EID',
    on_step: StepCb | None = None,
) -> tuple[bytes, str]:
    """Browser captcha snapshot — UIDAI HTTP captcha API often returns 500."""
    is_retrieve = 'retrieve-eid-uid' in page_url
    if is_retrieve and name and mobile:
        pair = get_standby_captcha_pair()
        if pair:
            log.info('fetch_captcha_from_page — standby cache hit')
            return pair

    sess = UidaiBrowserSession(
        proxy=proxy,
        auto_india_proxy=auto_india_proxy,
        on_step=on_step,
    )
    try:
        await sess.start()
        await sess._step(1, 4, 'UIDAI page open')
        await sess.page.goto(page_url, wait_until='commit', timeout=45_000)
        if is_retrieve:
            if not await sess._poll_form(22.0):
                raise RuntimeError('Retrieve form timeout')
            await sess.page.fill('input[name="name"]', normalize_name(name))
            await sess.page.fill('input[name="mobile"]', mobile.strip())
            await sess.page.evaluate(SET_OPTION_JS, option)
            await sess._wait_captcha_txn(18.0)
        else:
            el = sess.page.locator('img[alt*="CAPTCHA" i]').first
            await el.wait_for(state='visible', timeout=20_000)
            await sess._wait_captcha_txn(18.0)
        png, txn = await _capture_page_captcha(sess.page)
        if not txn:
            raise RuntimeError('captchaTxnId missing — try /pdf again')
        return png, txn
    finally:
        await sess.close(keep_warm=True)


async def _capture_page_captcha(page: Page) -> tuple[bytes, str]:
    el = page.locator('img[alt*="CAPTCHA" i]').first
    await el.wait_for(state='visible', timeout=15_000)
    for _ in range(40):
        if await el.evaluate('(img) => img.complete && img.naturalWidth > 10'):
            break
        await asyncio.sleep(0.2)
    png = await el.screenshot(type='png', timeout=8_000)
    txn = await page.evaluate(EXTRACT_CAPTCHA_TXN_JS)
    return png, str(txn or '')


async def _refresh_standby_captcha_locked(page: Page) -> None:
    png, txn = await _capture_page_captcha(page)
    _POOL['standby']['captcha_png'] = png
    _POOL['standby']['captcha_txn_id'] = txn
    _POOL['standby']['cached_at'] = time.monotonic()
    log.info('Standby captcha cached — txn=%s bytes=%s', (txn or '')[:8], len(png))


async def warm_standby_uidai(proxy: str | None) -> bool:
    """UIDAI page + captcha prefetch — 24/7 standby tab."""
    try:
        browser, _ = await _pool_browser(proxy)
        sb = _POOL['standby']
        if not sb.get('page') or sb['page'].is_closed():
            if sb.get('context'):
                try:
                    await sb['context'].close()
                except Exception:
                    pass
            ctx = await browser.new_context(
                viewport={'width': 390, 'height': 844},
                user_agent=MOBILE_UA,
                locale='en-IN',
                timezone_id='Asia/Kolkata',
                geolocation={'latitude': 28.6139, 'longitude': 77.2090},
                permissions=['geolocation'],
            )
            await ctx.add_init_script(SKIP_FONTS_JS)
            page = await ctx.new_page()
            sb['context'] = ctx
            sb['page'] = page
            for attempt in range(3):
                try:
                    await page.goto(UIDAI_PAGE_URL, wait_until='commit', timeout=45_000)
                    for _ in range(int(25 / 0.15)):
                        if await page.locator('input[name="name"]').count():
                            break
                        await asyncio.sleep(0.15)
                    break
                except Exception as e:
                    log.warning('standby goto attempt %s: %s', attempt + 1, e)
                    if attempt == 2:
                        raise
                    await asyncio.sleep(1)

        page = sb['page']
        if not page or page.is_closed():
            return False
        async with _POOL['lock']:
            await _refresh_standby_captcha_locked(page)
        return True
    except Exception as e:
        log.warning('warm_standby_uidai fail: %s', e)
        return False


async def refresh_standby_captcha() -> bool:
    """Re-snapshot standby captcha if page still open."""
    sb = _POOL.get('standby') or {}
    page = sb.get('page')
    if not page or page.is_closed():
        return False
    try:
        async with _POOL['lock']:
            await _refresh_standby_captcha_locked(page)
        return True
    except Exception as e:
        log.warning('refresh_standby_captcha fail: %s', e)
        return False


async def ensure_pool_warm(proxy: str | None = None) -> bool:
    """Chromium + UIDAI standby page + captcha prefetch."""
    try:
        await _pool_browser(proxy)
        ok = await warm_standby_uidai(proxy)
        log.info('Pool warm — proxy=%s standby=%s', proxy or 'direct', ok)
        return ok
    except Exception as e:
        log.warning('Pool warm fail: %s', e)
        return False


async def _pool_browser(proxy: str | None) -> tuple[Browser, bool]:
    """Return (browser, reused). Dead pool entry auto-relaunch."""
    async with _POOL['lock']:
        if _POOL['browser'] and _POOL['proxy'] == proxy:
            if _browser_connected(_POOL['browser']):
                log.info('Pre-warm: browser reuse (proxy=%s)', proxy or 'direct')
                return _POOL['browser'], True
            log.warning('Pre-warm: dead browser in pool — relaunch')
            await _pool_drop_browser_locked()

        if _POOL['browser']:
            await _pool_drop_browser_locked()

        if not _POOL['pw']:
            _POOL['pw'] = await async_playwright().start()

        log.info('Pre-warm: naya browser launch (proxy=%s)', proxy or 'direct')
        opts: dict[str, Any] = {
            'headless': True,
            'args': [
                '--disable-remote-fonts',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        }
        if proxy:
            opts['proxy'] = {'server': proxy}
        _POOL['browser'] = await _POOL['pw'].chromium.launch(**opts)
        _POOL['proxy'] = proxy
        return _POOL['browser'], False


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
        self.otp_txn_id = ''
        self.last_captcha = ''
        self.option = 'UID'
        self.name_skipped = False
        self.form_ready = False
        self.last_activity_at = 0.0
        self.page_loaded_at = 0.0
        self.last_logs: list[dict[str, Any]] = []
        self.proxy_info: dict[str, Any] = {}
        self.proxy_label = ''
        self._active_proxy: str | None = None
        self._captcha_png_cache: bytes = b''
        self._captcha_cache_txn: str = ''
        self._captcha_cache_at: float = 0.0

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

    def touch(self) -> None:
        self.last_activity_at = time.monotonic()

    def ttl_remaining_sec(self) -> int:
        if not self.last_activity_at:
            return 0
        return max(0, int(SESSION_TTL_SEC - (time.monotonic() - self.last_activity_at)))

    def ttl_label(self) -> str:
        sec = self.ttl_remaining_sec()
        if sec <= 0:
            return 'expire'
        h, rem = divmod(sec, 3600)
        m = rem // 60
        return f'{h}h {m}m'

    async def page_alive(self) -> bool:
        if not self._page or not self._context:
            return False
        if not self.last_activity_at:
            return False
        if time.monotonic() - self.last_activity_at > SESSION_TTL_SEC:
            return False
        try:
            if self._page.is_closed():
                return False
            return await self.page.locator('input[name="name"]').count() > 0
        except Exception:
            return False

    async def keepalive_ping(self) -> bool:
        if not await self.page_alive():
            return False
        try:
            await self.page.evaluate('() => true')
            self.touch()
            try:
                await self.prefetch_captcha()
            except Exception:
                pass
            return True
        except Exception:
            return False

    def peek_captcha_png(self) -> bytes | None:
        if len(self._captcha_png_cache) < 500:
            return None
        if not self._captcha_cache_at:
            return None
        if time.monotonic() - self._captcha_cache_at > CAPTCHA_CACHE_TTL_SEC:
            return None
        return self._captcha_png_cache

    async def prefetch_captcha(self) -> bytes:
        if not self._page:
            return b''
        png, txn = await _capture_page_captcha(self.page)
        self._captcha_png_cache = png
        self._captcha_cache_txn = txn
        self._captcha_cache_at = time.monotonic()
        if txn:
            self.captcha_txn_id = txn
        await self._read_option()
        self.form_ready = True
        return png

    async def _try_adopt_standby(self, proxy: str | None) -> bool:
        sb = _POOL.get('standby') or {}
        if _POOL.get('proxy') != proxy:
            return False
        page = sb.get('page')
        ctx = sb.get('context')
        if not page or page.is_closed() or not ctx:
            return False
        self._context = ctx
        self._page = page
        sb['context'] = None
        sb['page'] = None
        if sb.get('captcha_png'):
            self._captcha_png_cache = sb['captcha_png']
            self._captcha_cache_txn = sb.get('captcha_txn_id', '')
            self.captcha_txn_id = self._captcha_cache_txn
            self._captcha_cache_at = float(sb.get('cached_at') or time.monotonic())
        log.info('Adopted standby UIDAI page — instant captcha ready')
        return True

    async def reset_for_next_attempt(self) -> None:
        """Retrieve ke baad — same page pe naya captcha."""
        self.otp_txn_id = ''
        self.last_captcha = ''
        await self.refresh_captcha()

    async def _connect_proxy(self, proxy: str) -> str:
        """Ek proxy — 3 try (pehle wala Bengaluru logic)."""
        if _POOL['proxy'] == proxy and _POOL.get('proxy_info') and pool_is_warm():
            self.proxy_info = _POOL['proxy_info']
            self.proxy_label = format_proxy_line(self.proxy_info, proxy)
            await self._step(1, 8, f'VPN reuse — {self.proxy_label}')
            return proxy

        last_err: Exception | None = None
        for attempt in range(PROXY_CONNECT_TRIES):
            try:
                await self._step(1, 8, f'VPN try {attempt + 1}/{PROXY_CONNECT_TRIES}…')
                info = await asyncio.to_thread(check_proxy, proxy, 8)
                if info.get('countryCode') != 'IN':
                    raise RuntimeError(f'Proxy India nahi: {info.get("country")}')
                await asyncio.to_thread(test_uidai, proxy, 12)
                self.proxy_info = info
                _POOL['proxy_info'] = info
                self.proxy_label = format_proxy_line(info, proxy)
                await self._step(1, 8, f'VPN connected — {self.proxy_label}')
                return proxy
            except Exception as e:
                last_err = e
                log.warning('proxy %s attempt %s/%s: %s', proxy, attempt + 1, PROXY_CONNECT_TRIES, e)
                if attempt < PROXY_CONNECT_TRIES - 1:
                    await asyncio.sleep(1.5)
        raise RuntimeError(
            f'VPN fail ({PROXY_CONNECT_TRIES} try): {last_err}'
        ) from last_err

    async def _resolve_proxy(self) -> str | None:
        if self.proxy and self.proxy.lower() not in ('auto', 'india'):
            return await self._connect_proxy(self.proxy)

        if not self.auto_india_proxy and not self.proxy:
            self.proxy_label = '⚠️ Direct'
            await self._step(1, 8, 'Direct connect')
            return None

        await self._step(1, 8, 'Indian VPN connect…')
        primary = _primary_proxy()
        if primary:
            try:
                self.proxy = primary
                return await self._connect_proxy(primary)
            except Exception as e:
                log.warning('primary proxy fail after %s tries: %s', PROXY_CONNECT_TRIES, e)

        try:
            proxy, info = await asyncio.to_thread(pick_indian_proxy)
            self.proxy = proxy
            self.proxy_info = info
            self.proxy_label = format_proxy_line(info, proxy)
            _POOL['proxy_info'] = info
            await self._step(1, 8, f'VPN connected — {self.proxy_label}')
            return proxy
        except RuntimeError:
            direct = await asyncio.to_thread(check_direct_india)
            if direct:
                log.info('Proxy pool fail — direct India IP')
                self.proxy_info = direct
                self.proxy_label = format_direct_line(direct)
                await self._step(1, 8, f'Direct India — {self.proxy_label}')
                return None
            raise

    async def _new_page(self, proxy: str | None) -> bool:
        """New context + page. Returns True if Chromium pool reuse hua."""
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
            self._page = None

        if await self._try_adopt_standby(proxy):
            browser, reused = await _pool_browser(proxy)
            asyncio.create_task(warm_standby_uidai(proxy))
            return reused

        last_err: Exception | None = None
        for attempt in range(3):
            try:
                browser, reused = await _pool_browser(proxy)
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
                return reused
            except Exception as e:
                last_err = e
                log.warning('new_context fail attempt %s: %s', attempt + 1, e)
                if attempt < 2 and _is_browser_closed_error(e):
                    async with _POOL['lock']:
                        await _pool_drop_browser_locked()
                    await asyncio.sleep(1)
                    continue
                raise
        if last_err:
            raise last_err
        return False

    async def start(self) -> None:
        if self._page and await self.page_alive():
            self.touch()
            return
        if self._page:
            self._page = None
            self._context = None
        proxy = await self._resolve_proxy()
        await self._step(2, 8, 'Chromium start…')
        reused = await self._new_page(proxy)
        if reused:
            await self._step(2, 8, 'Browser pre-warm — turant ready ⚡')
        else:
            await self._step(2, 8, 'Browser ready — India timezone (Asia/Kolkata)')
        self.touch()
        self.page_loaded_at = time.monotonic()

    async def close(self, keep_warm: bool = True) -> None:
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
        self._context = None
        self._page = None
        self.captcha_txn_id = ''
        self.otp_txn_id = ''
        self.last_captcha = ''
        self.form_ready = False
        self.last_activity_at = 0.0
        self.page_loaded_at = 0.0
        self._captcha_png_cache = b''
        self._captcha_cache_txn = ''
        self._captcha_cache_at = 0.0
        if not keep_warm:
            await _pool_shutdown()

    async def _fill_fields_only(self) -> None:
        label = 'Name placeholder applied' if self.name_skipped else f'Name: {self.name}'
        await self._step(6, 8, label)
        await self.page.fill('input[name="name"]', self.name)
        await self._step(7, 8, f'Mobile: {self.mobile}')
        await self.page.fill('input[name="mobile"]', self.mobile)
        await self._extract_captcha_txn()
        await self._read_option()
        self.form_ready = True
        self.touch()

    async def _fill_fields_and_captcha(self, *, fresh_captcha: bool) -> None:
        await self._fill_fields_only()
        if fresh_captcha:
            await self._step(8, 8, 'Refreshing captcha…')
            await self.refresh_captcha()
        else:
            await self._step(8, 8, 'Using pre-loaded captcha')
            if self.peek_captcha_png():
                await self._step(8, 8, 'Captcha ready (cached)')
            else:
                await self.prefetch_captcha()
                await self._step(8, 8, 'Captcha ready')

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

    async def open_form(
        self,
        name: str,
        mobile: str,
        on_frame=None,
        force_reload: bool = False,
    ) -> bytes:
        self.touch()
        self.name = normalize_name(name)
        self.mobile = mobile.strip()
        self.name_skipped = is_skip_name(name)
        self.otp_txn_id = ''
        self.last_captcha = ''

        if not force_reload and await self.page_alive():
            await self._step(1, 8, f'Session active — {self.ttl_label()} left')
            await self._step(2, 8, 'Reusing live page')
            await self._step(3, 8, 'Skip reload')
            await self._step(4, 8, 'Updating form')
            await self._step(5, 8, f'Engine v{BOT_ENGINE_VERSION}')
            await self._fill_fields_and_captcha(fresh_captcha=False)
            asyncio.create_task(self._prefetch_next_captcha())
            return self.peek_captcha_png() or b''

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
        await self._step(5, 8, f'Python engine v{BOT_ENGINE_VERSION} — 24h session')
        await self._fill_fields_and_captcha(fresh_captcha=False)
        self.page_loaded_at = time.monotonic()
        await self.prefetch_captcha()
        asyncio.create_task(self._prefetch_next_captcha())
        return self._captcha_png_cache

    async def _prefetch_next_captcha(self) -> None:
        """Background — refresh captcha cache for next /open."""
        try:
            await asyncio.sleep(0.5)
            if self._page and not self._page.is_closed():
                await self.prefetch_captcha()
        except Exception as e:
            log.debug('prefetch next captcha: %s', e)

    async def _wait_captcha_image(self, timeout_s: int = 20) -> None:
        el = self.page.locator('img[alt*="CAPTCHA" i]').first
        await el.wait_for(state='visible', timeout=timeout_s * 1000)
        for _ in range(timeout_s * 4):
            if await el.evaluate('(img) => img.complete && img.naturalWidth > 10'):
                return
            await asyncio.sleep(0.25)
        raise RuntimeError('Captcha load fail — /refresh')

    async def captcha_png(self, *, use_cache: bool = True) -> bytes:
        if use_cache:
            cached = self.peek_captcha_png()
            if cached:
                return cached
        png, txn = await _capture_page_captcha(self.page)
        self._captcha_png_cache = png
        self._captcha_cache_txn = txn
        self._captcha_cache_at = time.monotonic()
        if txn:
            self.captcha_txn_id = txn
        return png

    async def _captcha_changed(self, old_txn: str, old_src: str | None) -> bool:
        img = self.page.locator('img[alt*="CAPTCHA" i]').first
        new_src = await img.get_attribute('src')
        txn = await self._extract_captcha_txn()
        if txn and old_txn and txn != old_txn:
            return True
        if old_src and new_src and new_src != old_src:
            return True
        return False

    async def refresh_captcha(self) -> bytes:
        old_txn = self.captcha_txn_id
        old_src = await self.page.locator('img[alt*="CAPTCHA" i]').first.get_attribute('src')
        click_res = await self.page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
        log.info('Captcha refresh click: %s', click_res)
        await asyncio.sleep(1.2)
        await self._wait_captcha_image()
        for _ in range(30):
            if await self._captcha_changed(old_txn, old_src):
                break
            await asyncio.sleep(0.35)

        if not await self._captcha_changed(old_txn, old_src):
            log.info('Captcha refresh fallback — page reload')
            await self.page.reload(wait_until='commit', timeout=45_000)
            if not await self._poll_form(20.0):
                raise RuntimeError('Form reload timeout — /open dubara')
            await self.page.fill('input[name="name"]', self.name)
            await self.page.fill('input[name="mobile"]', self.mobile)
            await self._wait_captcha_image(20)
            await self._wait_captcha_txn(15.0)

        return await self.captcha_png(use_cache=False)

    async def _post_uidai_playwright(
        self,
        payload: dict[str, Any],
        logs: list[dict[str, Any]],
        label: str = 'API',
    ) -> tuple[bool, int, str, dict[str, Any]]:
        if not self._context:
            raise RuntimeError('Browser not started')
        headers = uidai_headers(new_request_id())
        try:
            resp = await self._context.request.post(
                OTP_API_URL,
                data=json.dumps(payload),
                headers=headers,
                timeout=45_000,
            )
            text = await resp.text()
            status = resp.status
            append_log(logs, 'info', f'{label} Playwright response', {
                'status': status,
                'resp': text[:240],
            })
            ok, msg, extra = parse_uidai_response(status, text)
            if msg:
                append_log(logs, 'info', 'UIDAI jawab', {'status': status, 'msg': msg[:160], **extra})
            return ok, status, text, extra
        except Exception as e:
            log.warning('Playwright request.post failed: %s', e)
            append_log(logs, 'warn', f'{label} network error', str(e)[:120])
            return False, 0, '', {}

    async def _post_uidai_in_page(
        self,
        payload: dict[str, Any],
        logs: list[dict[str, Any]],
        via: str,
        label: str = 'API',
    ) -> tuple[bool, int, str, dict[str, Any]]:
        js = SEND_OTP_FETCH_JS if via == 'fetch' else SEND_OTP_XHR_JS
        result = await self.page.evaluate(js, payload)
        if not result.get('ok'):
            append_log(logs, 'warn', f'{label} {via} fail', result.get('err', 'unknown'))
            return False, 0, '', {}

        status = int(result.get('status') or 0)
        text = str(result.get('text') or '')
        append_log(logs, 'info', f'{label} {via} response', {
            'status': status,
            'resp': text[:240],
        })
        ok, msg, extra = parse_uidai_response(status, text)
        if msg:
            append_log(logs, 'info', 'UIDAI jawab', {'status': status, 'msg': msg[:160], **extra})
        return ok, status, text, extra

    async def _call_uidai(
        self,
        payload: dict[str, Any],
        logs: list[dict[str, Any]],
        label: str = 'UIDAI',
    ) -> tuple[bool, int, str, dict[str, Any]]:
        def _net_fail(st: int, body: str) -> bool:
            return st == 0 and not body

        ok, status, text, extra = await self._post_uidai_playwright(payload, logs, label)
        if _net_fail(status, text):
            ok, status, text, extra = await self._post_uidai_in_page(payload, logs, 'fetch', label)
        if _net_fail(status, text):
            ok, status, text, extra = await self._post_uidai_in_page(payload, logs, 'xhr', label)
        return ok, status, text, extra

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
                return self._api_result(logs, otp_ok=False, captcha=captcha)

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

        await s(3, 'UIDAI API — OTP bhej rahe hain…')
        otp_ok, status, text, extra = await self._call_uidai(payload, logs, 'OTP')

        if otp_ok and extra.get('reason') == 'otp_sent':
            txn_otp = extra.get('otpTxnId')
            if not txn_otp and text:
                try:
                    txn_otp = extract_otp_txn_id(json.loads(text))
                except json.JSONDecodeError:
                    pass
            if not txn_otp:
                txn_otp = extra.get('transactionId')
            if txn_otp:
                self.otp_txn_id = str(txn_otp)
            self.last_captcha = captcha
            otp_ok = True
            append_log(logs, 'info', f'OTP sent — UIDAI {status}', {'otpTxnId': self.otp_txn_id or None})
            await s(4, 'OTP SMS bheja gaya')
            await s(5, 'Ab OTP reply karo')
            await s(6, '6 digit OTP bhejo')
        elif otp_ok:
            otp_ok = False
        elif status == 0 and not text:
            append_log(logs, 'warn', 'OTP network error — proxy / page reload try karo')
            await s(6, 'Network fail — /open dubara')
        else:
            captcha_bad = any(
                'Captcha' in (x.get('m') or '') or 'captcha' in (x.get('m') or '').lower()
                for x in logs
            )
            await s(6, 'Captcha issue — /refresh' if captcha_bad else 'UIDAI ne reject — logs dekho')

        self.last_logs = logs
        return self._api_result(logs, otp_ok=otp_ok, captcha=captcha)

    async def submit_otp(self, otp: str, on_step: StepCb | None = None) -> dict[str, Any]:
        """SMS OTP bharo — UIDAI registered mobile pe Aadhaar/EID bhejega."""
        otp = re.sub(r'\s+', '', otp.strip())
        step_fn = on_step or self._on_step
        total = 5
        logs: list[dict[str, Any]] = []
        retrieve_ok = False

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        if not self.otp_txn_id:
            append_log(logs, 'warn', 'otpTxnId missing — pehle captcha se OTP bhejo')
            self.last_logs = logs
            return self._api_result(logs, retrieve_ok=False)

        if not self.last_captcha or not self.captcha_txn_id:
            append_log(logs, 'warn', 'Session data missing — /open dubara')
            self.last_logs = logs
            return self._api_result(logs, retrieve_ok=False)

        await s(1, f'OTP verify: {otp[:2]}****')
        try:
            await self.page.fill('input[name="otp"]', otp)
        except Exception:
            pass

        payload = build_retrieve_payload(
            name=self.name,
            mobile=self.mobile,
            captcha=self.last_captcha,
            captcha_txn_id=self.captcha_txn_id,
            otp=otp,
            otp_txn_id=self.otp_txn_id,
            option=self.option,
        )
        append_log(logs, 'info', 'Aadhaar retrieve request', {
            'mobile': self.mobile,
            'option': self.option,
            'otpTxnId': self.otp_txn_id[:12] + '…',
        })

        await s(2, 'UIDAI ko OTP bhej rahe hain…')
        ok, status, text, extra = await self._call_uidai(payload, logs, 'Retrieve')

        if ok and extra.get('reason') == 'retrieve_ok':
            retrieve_ok = True
            hint = extra.get('aadhaar_hint')
            append_log(logs, 'info', f'Retrieve OK — UIDAI {status}', {'hint': hint} if hint else None)
            await s(3, 'UIDAI ne SMS bheja')
            await s(4, 'Registered mobile check karo')
            await s(5, 'Done')
        elif extra.get('reason') == 'invalid_otp':
            append_log(logs, 'warn', 'Galat OTP — dubara bharo')
            await s(3, 'Galat OTP')
            await s(4, 'Dubara try karo')
            await s(5, 'Done')
        elif status == 0 and not text:
            append_log(logs, 'warn', 'Network error — dubara try karo')
            await s(3, 'Network fail')
            await s(4, 'Done')
            await s(5, 'Done')
        else:
            msg = extra.get('msg', '')
            if ok:
                retrieve_ok = True
                append_log(logs, 'info', 'Request OK — SMS check karo', {'msg': msg[:120]})
                await s(3, 'SMS check karo')
                await s(4, 'Done')
                await s(5, 'Done')
            else:
                append_log(logs, 'warn', 'Retrieve fail', {'msg': msg[:120]})
                await s(3, 'Fail — logs dekho')
                await s(4, 'Done')
                await s(5, 'Done')

        self.last_logs = logs
        return self._api_result(logs, retrieve_ok=retrieve_ok, otp=otp)

    def _api_result(
        self,
        logs: list[dict[str, Any]],
        *,
        otp_ok: bool = False,
        retrieve_ok: bool = False,
        captcha: str = '',
        otp: str = '',
    ) -> dict[str, Any]:
        return {
            'captcha': captcha,
            'otp': otp,
            'summary': summarize_logs(logs),
            'logs': logs[-15:],
            'diag': {
                'captchaTxnId': self.captcha_txn_id,
                'otpTxnId': self.otp_txn_id,
                'option': self.option,
            },
            'version': BOT_ENGINE_VERSION,
            'proxy_label': self.proxy_label,
            'otp_ok': otp_ok,
            'retrieve_ok': retrieve_ok,
        }
