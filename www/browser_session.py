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

from react_extract import (
    CLEAR_RETRIEVE_FORM_JS,
    FILL_RETRIEVE_FORM_JS,
    FILL_RETRIEVE_NAME_JS,
    CLICK_REFRESH_CAPTCHA_JS,
    EXTRACT_CAPTCHA_BUNDLE_JS,
    EXTRACT_CAPTCHA_TXN_JS,
    FILL_DOWNLOAD_EID_JS,
    GET_OPTION_JS,
    SELECT_DOWNLOAD_EID_JS,
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
    get_header,
    is_skip_name,
    new_request_id,
    normalize_name,
    parse_uidai_response,
    summarize_logs,
    captcha_max_age_sec,
    uidai_fast,
)

log = logging.getLogger('uidai-browser')

SESSION_TTL_SEC = int(os.getenv('UIDAI_SESSION_HOURS', '24')) * 3600


def _ui_delay(seconds: float) -> float:
    """Shorter fixed waits when UIDAI_FAST=1."""
    return max(0.05, seconds * 0.22) if uidai_fast() else seconds


def _poll_attempts(default: int) -> int:
    return max(8, default // 2) if uidai_fast() else default


def _goto_timeout_ms() -> int:
    return 25_000 if uidai_fast() else 45_000
KEEPALIVE_INTERVAL_SEC = int(os.getenv('UIDAI_KEEPALIVE_MIN', '10')) * 60
CAPTCHA_CACHE_TTL_SEC = int(os.getenv('UIDAI_CAPTCHA_CACHE_MIN', '15')) * 60

MOBILE_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)
StepCb = Callable[[int, int, str], Awaitable[None]]
CaptchaReadyCb = Callable[[bytes, str], Awaitable[None]]

SKIP_FONTS_JS = """(() => {
  if (document.getElementById('rebel-skip-fonts')) return;
  const s = document.createElement('style');
  s.id = 'rebel-skip-fonts';
  s.textContent = '*{font-family:Arial,Helvetica,sans-serif!important}';
  (document.head || document.documentElement).appendChild(s);
})();"""

STANDBY_UID = 'standby_uid'
STANDBY_EID = 'standby_eid'
STANDBY_PDF = 'standby_pdf'
STANDBY_SLOTS = (STANDBY_UID, STANDBY_EID, STANDBY_PDF)


def _empty_standby() -> dict[str, Any]:
    return {
        'context': None,
        'page': None,
        'captcha_png': b'',
        'captcha_txn_id': '',
        'cached_at': 0.0,
    }


def _pool_key(pool: str = 'eid') -> str:
    p = (pool or 'eid').strip().lower()
    if p in ('uid', 'aadhaar', 'aadhar', 'fetch'):
        return STANDBY_UID
    if p in ('pdf', 'download'):
        return STANDBY_PDF
    return STANDBY_EID


_POOL: dict[str, Any] = {
    'browser_lock': asyncio.Lock(),
    'slot_locks': {
        STANDBY_UID: asyncio.Lock(),
        STANDBY_EID: asyncio.Lock(),
        STANDBY_PDF: asyncio.Lock(),
    },
    'pw': None,
    'browser': None,
    STANDBY_UID: _empty_standby(),
    STANDBY_EID: _empty_standby(),
    STANDBY_PDF: _empty_standby(),
}

# Limit parallel Chromium — OOM fix when many users hit together.
_BROWSER_SEM = asyncio.Semaphore(max(1, int(os.getenv('UIDAI_BROWSER_SLOTS', '3'))))
_WARM_LOCK = asyncio.Lock()
_WARM_TASK: asyncio.Task | None = None
_PRIME_LOCK = asyncio.Lock()
_PRIME_TASK: asyncio.Task | None = None


def _slot_lock(slot: str) -> asyncio.Lock:
    return _POOL['slot_locks'][slot]


async def _acquire_all_slot_locks() -> list[asyncio.Lock]:
    locks = [_slot_lock(s) for s in STANDBY_SLOTS]
    for lk in locks:
        await lk.acquire()
    return locks


def _release_locks(locks: list[asyncio.Lock]) -> None:
    for lk in reversed(locks):
        if lk.locked():
            lk.release()


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
    slot_locks = await _acquire_all_slot_locks()
    try:
        async with _POOL['browser_lock']:
            for slot in STANDBY_SLOTS:
                sb = _POOL.get(slot) or {}
                if sb.get('context'):
                    try:
                        await sb['context'].close()
                    except Exception:
                        pass
                _POOL[slot] = _empty_standby()
            await _pool_drop_browser_locked()
            if _POOL['pw']:
                try:
                    await _POOL['pw'].stop()
                except Exception:
                    pass
            _POOL['pw'] = None
    finally:
        _release_locks(slot_locks)


async def shutdown_browser_pool() -> None:
    """Graceful Chromium + pool tab shutdown (call on bot exit)."""
    try:
        await _pool_shutdown()
    except Exception as e:
        log.warning('shutdown_browser_pool: %s', e)


def _schedule_background(coro: Awaitable[Any], *, label: str = 'bg') -> None:
    """Fire-and-forget task that survives errors and ignores closed loop."""
    async def _wrapper() -> None:
        try:
            await coro
        except asyncio.CancelledError:
            return
        except Exception as e:
            log.debug('background %s: %s', label, e)

    try:
        loop = asyncio.get_running_loop()
        if loop.is_closed():
            return
        loop.create_task(_wrapper())
    except RuntimeError:
        pass


def pool_is_warm() -> bool:
    if not _browser_connected(_POOL.get('browser')):
        return False
    for slot in STANDBY_SLOTS:
        sb = _POOL.get(slot) or {}
        page = sb.get('page')
        if not page or page.is_closed():
            return False
    return True


def standby_has_captcha(pool: str = 'eid') -> bool:
    sb = _POOL.get(_pool_key(pool)) or {}
    png = sb.get('captcha_png') or b''
    if len(png) < 500:
        return False
    if not sb.get('cached_at'):
        return False
    return time.monotonic() - float(sb['cached_at']) < CAPTCHA_CACHE_TTL_SEC


def get_standby_captcha_png(pool: str = 'uid') -> bytes | None:
    if standby_has_captcha(pool):
        return _POOL[_pool_key(pool)]['captcha_png']
    return None


def get_standby_captcha_pair(pool: str = 'eid') -> tuple[bytes, str] | None:
    """24/7 pool — PNG + captchaTxnId (uid / eid / pdf)."""
    if not standby_has_captcha(pool):
        return None
    sb = _POOL[_pool_key(pool)]
    txn = str(sb.get('captcha_txn_id') or '').strip()
    png = sb.get('captcha_png') or b''
    if len(png) < 500 or not txn:
        return None
    return png, txn


async def fetch_pdf_browser_captcha(
    phase: str,
    *,
    name: str = '',
    mobile: str = '',
    eid: str = '',
    on_step: StepCb | None = None,
) -> tuple[bytes, str]:
    """Browser captcha for /pdf — same live-page logic as /open."""
    phase_key = (phase or 'phase1').lower()
    if phase_key.startswith('phase2'):
        return await fetch_captcha_from_page(
            DOWNLOAD_PAGE_URL,
            name='',
            mobile='',
            option='EID',
            eid=eid,
            on_step=on_step,
        )
    return await fetch_captcha_from_page(
        UIDAI_PAGE_URL,
        name=name,
        mobile=mobile,
        option='EID',
        on_step=on_step,
    )


async def fetch_captcha_from_page(
    page_url: str,
    *,
    name: str = '',
    mobile: str = '',
    option: str = 'EID',
    eid: str = '',
    on_step: StepCb | None = None,
    requests_session: Any | None = None,
) -> tuple[bytes, str]:
    """Browser captcha snapshot — UIDAI HTTP captcha API often returns 500."""
    is_retrieve = 'retrieve-eid-uid' in page_url
    is_download = 'genricdownload' in page_url.lower() or 'downloadaadhaar' in page_url.lower()
    sess = UidaiBrowserSession(on_step=on_step)
    net_captcha: dict[str, Any] = {}

    async def _on_captcha_response(response) -> None:
        url = (response.url or '').lower()
        if response.status != 200:
            return
        if 'captcha' not in url or 'generation' not in url:
            return
        try:
            net_captcha['json'] = await response.json()
        except Exception:
            pass

    try:
        await sess.start()
        await sess._step(1, 4, 'UIDAI page open')
        sess.page.on('response', _on_captcha_response)
        await sess.page.goto(page_url, wait_until='commit', timeout=_goto_timeout_ms())
        if is_retrieve:
            form_wait = 10.0 if uidai_fast() else 22.0
            if not await sess._poll_form(form_wait):
                raise RuntimeError('Retrieve form timeout')
            sess.name = normalize_name(name)
            sess.mobile = mobile.strip()
            await sess.page.fill('input[name="name"]', sess.name)
            await sess.page.fill('input[name="mobile"]', sess.mobile)
            await sess.page.evaluate(SET_OPTION_JS, option)
            await sess.refresh_captcha()
            png, txn = sess._captcha_png_cache, sess.captcha_txn_id
            if len(png or b'') >= 200 and txn:
                return png, txn
        elif is_download:
            await asyncio.sleep(_ui_delay(1.2))
            if eid:
                await sess.page.evaluate(SELECT_DOWNLOAD_EID_JS)
                await asyncio.sleep(_ui_delay(0.4))
                await sess.page.evaluate(FILL_DOWNLOAD_EID_JS, eid)
                await asyncio.sleep(_ui_delay(0.8))
            el = sess.page.locator('img[alt*="CAPTCHA" i]').first
            vis_timeout = 10_000 if uidai_fast() else 18_000
            for attempt in range(3):
                try:
                    await el.wait_for(state='visible', timeout=vis_timeout)
                    break
                except Exception:
                    if attempt < 2:
                        await sess.page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
                        await asyncio.sleep(_ui_delay(1.0))
                    else:
                        raise
            txn = ''
            poll_sleep = _ui_delay(0.35)
            for _ in range(_poll_attempts(50)):
                txn = str(await sess.page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()
                if txn:
                    break
                await asyncio.sleep(poll_sleep)
        else:
            el = sess.page.locator('img[alt*="CAPTCHA" i]').first
            await el.wait_for(state='visible', timeout=20_000)
            await sess._wait_captcha_txn(18.0)
        png, txn = await _capture_page_captcha(sess.page)
        if not txn and net_captcha.get('json'):
            from audio_captcha import parse_captcha_generation

            parsed = parse_captcha_generation(net_captcha['json'])
            txn = str(parsed.get('captchaTxnId') or '')
            if len(png) < 500 and parsed.get('image_png'):
                png = parsed['image_png']
        if not txn:
            txn = str(await sess.page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()
        if not txn:
            raise RuntimeError('captchaTxnId missing — try /pdf again')
        if len(png) < 200:
            raise RuntimeError('Captcha image failed to load — try /pdf again')
        return png, txn
    finally:
        await sess.close(keep_warm=True)


async def _capture_page_captcha(page: Page) -> tuple[bytes, str]:
    import base64

    txn = ''
    png = b''

    bundle = await page.evaluate(EXTRACT_CAPTCHA_BUNDLE_JS)
    if isinstance(bundle, dict):
        txn = str(bundle.get('txn') or '').strip()
        img_b64 = str(bundle.get('image') or '').strip()
        if img_b64.startswith('data:'):
            img_b64 = img_b64.split(',', 1)[-1]
        if img_b64:
            try:
                png = base64.b64decode(img_b64)
            except Exception:
                png = b''

    el = page.locator('img[alt*="CAPTCHA" i]').first
    try:
        await el.wait_for(state='visible', timeout=12_000)
    except Exception:
        if png and txn:
            return png, txn
        raise

    max_attempts = 12 if uidai_fast() else 50
    poll_sleep = 0.12 if uidai_fast() else 0.25
    refresh_at = 5 if uidai_fast() else 20
    for attempt in range(max_attempts):
        loaded = await el.evaluate(
            '(img) => img.complete && img.naturalWidth > 10 && img.naturalHeight > 5'
        )
        if loaded:
            break
        if attempt == refresh_at:
            await page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
        await asyncio.sleep(poll_sleep)

    if len(png) < 500:
        try:
            shot = await el.screenshot(type='png', timeout=8_000)
            if len(shot) > len(png):
                png = shot
        except Exception:
            pass

    if not txn:
        txn = str(await page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()

    if len(png) < 200 and txn:
        bundle2 = await page.evaluate(EXTRACT_CAPTCHA_BUNDLE_JS)
        if isinstance(bundle2, dict):
            img_b64 = str(bundle2.get('image') or '').strip()
            if img_b64:
                try:
                    png = base64.b64decode(img_b64.split(',')[-1])
                except Exception:
                    pass

    return png, txn


def _browser_context_kwargs() -> dict[str, Any]:
    """Isolated Playwright context — direct UIDAI, no cookies/proxy."""
    return {
        'viewport': {'width': 390, 'height': 844},
        'user_agent': MOBILE_UA,
        'locale': 'en-IN',
        'timezone_id': 'Asia/Kolkata',
        'geolocation': {'latitude': 28.6139, 'longitude': 77.2090},
        'permissions': ['geolocation'],
    }


async def _refresh_standby_captcha_locked(page: Page, slot: str) -> None:
    png, txn = await _capture_page_captcha(page)
    sb = _POOL[slot]
    sb['captcha_png'] = png
    sb['captcha_txn_id'] = txn
    sb['cached_at'] = time.monotonic()
    log.info('Standby %s captcha — txn=%s bytes=%s', slot, (txn or '')[:8], len(png))


async def _prepare_standby_retrieve_page(page: Page, slot: str) -> None:
    """Empty form + UID/EID option — ready for instant name/mobile fill."""
    opt = 'UID' if slot == STANDBY_UID else 'EID'
    await page.evaluate(SET_OPTION_JS, opt)
    await asyncio.sleep(_ui_delay(0.15))
    await page.evaluate(CLEAR_RETRIEVE_FORM_JS)
    await asyncio.sleep(_ui_delay(0.15))


async def warm_standby_slot(slot: str) -> bool:
    """Keep one 24/7 browser tab hot — UID / EID / PDF download."""
    try:
        browser, _ = await _pool_browser()
        sb = _POOL[slot]
        if not sb.get('page') or sb['page'].is_closed():
            if sb.get('context'):
                try:
                    await sb['context'].close()
                except Exception:
                    pass
            ctx = await browser.new_context(**_browser_context_kwargs())
            await ctx.add_init_script(SKIP_FONTS_JS)
            page = await ctx.new_page()
            sb['context'] = ctx
            sb['page'] = page
            target_url = DOWNLOAD_PAGE_URL if slot == STANDBY_PDF else UIDAI_PAGE_URL
            for attempt in range(3):
                try:
                    await page.goto(target_url, wait_until='commit', timeout=40_000)
                    if slot == STANDBY_PDF:
                        await asyncio.sleep(_ui_delay(0.35))
                    else:
                        for _ in range(100):
                            if await page.locator('input[name="name"]').count():
                                break
                            await asyncio.sleep(0.1)
                        await _prepare_standby_retrieve_page(page, slot)
                    break
                except Exception as e:
                    log.warning('warm %s attempt %s: %s', slot, attempt + 1, e)
                    if attempt == 2:
                        raise
                    await asyncio.sleep(1)

        page = sb['page']
        if not page or page.is_closed():
            return False
        lock = _slot_lock(slot)
        await lock.acquire()
        try:
            if slot != STANDBY_PDF:
                await _prepare_standby_retrieve_page(page, slot)
            net_txn: dict[str, Any] = {}
            _attach_captcha_net_hook(page, net_txn)
            await _refresh_standby_captcha_locked(page, slot)
            if slot != STANDBY_PDF:
                txn = await _wait_page_captcha_txn(page, net_txn, timeout_s=6.0 if uidai_fast() else 12.0)
                if txn:
                    sb['captcha_txn_id'] = txn
        finally:
            lock.release()
        return True
    except Exception as e:
        log.warning('warm_standby_slot %s fail: %s', slot, e)
        return False


def pool_form_ready(pool: str = 'uid') -> bool:
    """Preloaded pool tab open (captcha cache optional)."""
    slot = _pool_key(pool)
    sb = _POOL.get(slot) or {}
    page = sb.get('page')
    return bool(page and not page.is_closed())


def pool_slot_ready(pool: str = 'uid') -> bool:
    """Preloaded tab + fresh captcha snapshot."""
    if not pool_form_ready(pool):
        return False
    return standby_has_captcha(pool)


async def instant_pool_captcha(
    name: str,
    mobile: str,
    *,
    pool: str = 'uid',
    skip_replenish: bool = False,
) -> tuple[bytes, str] | None:
    """Fill shared pool tab in-place — no page steal, no goto (~1s)."""
    nm = normalize_name(name)
    mob = re.sub(r'\D', '', (mobile or '').strip())
    if not mob:
        return None
    slot = _pool_key(pool)
    if not pool_form_ready(pool):
        log.info('instant_pool_captcha — pool %s not ready', pool)
        return None
    async with _BROWSER_SEM:
        return await _instant_pool_captcha_locked(nm, mob, pool=pool, slot=slot, skip_replenish=skip_replenish)


async def _instant_pool_captcha_locked(
    nm: str,
    mob: str,
    *,
    pool: str,
    slot: str,
    skip_replenish: bool,
) -> tuple[bytes, str] | None:
    net_txn: dict[str, Any] = {}
    lock = _slot_lock(slot)
    await lock.acquire()
    try:
        sb = _POOL.get(slot) or {}
        page = sb.get('page')
        if not page or page.is_closed():
            return None
        if slot != STANDBY_PDF:
            await _prepare_standby_retrieve_page(page, slot)
        prior_png = sb.get('captcha_png') or b''
        filled = await page.evaluate(FILL_RETRIEVE_FORM_JS, {'name': nm, 'mobile': mob})
        if not filled:
            log.warning('instant_pool_captcha — JS fill miss pool=%s', pool)
        try:
            png, txn = await _force_refresh_page_captcha(page, net_txn)
        except Exception as exc:
            log.warning('instant_pool_captcha refresh pool=%s: %s', pool, exc)
            return None
        if prior_png and png == prior_png:
            try:
                png, txn = await _force_refresh_page_captcha(page, net_txn)
            except Exception:
                return None
        if len(png) < 200 or not txn:
            return None
        sb['captcha_png'] = png
        sb['captcha_txn_id'] = txn
        sb['cached_at'] = time.monotonic()
        log.info(
            'instant_pool_captcha pool=%s name=%s bytes=%s txn=%s…',
            pool, nm[:12], len(png), txn[:8],
        )
        return png, txn
    except Exception as e:
        log.warning('instant_pool_captcha pool=%s: %s', pool, e)
        return None
    finally:
        if lock.locked():
            lock.release()
        if not skip_replenish:
            _schedule_background(warm_standby_slot(slot), label=f'rewarm-{slot}')


async def prefill_standby_name(name: str, pool: str = 'uid') -> bool:
    """Pre-fill name on 24/7 pool tab while user types mobile in Telegram."""
    nm = normalize_name(name)
    if not nm or is_skip_name(nm):
        return False
    slot = _pool_key(pool)
    sb = _POOL.get(slot) or {}
    page = sb.get('page')
    if not page or page.is_closed():
        return False
    try:
        lock = _slot_lock(slot)
        async with lock:
            if slot != STANDBY_PDF:
                await _prepare_standby_retrieve_page(page, slot)
            ok = await page.evaluate(FILL_RETRIEVE_NAME_JS, nm)
            if ok:
                log.info('Pool %s — name prefilled: %s', pool, nm[:20])
            return bool(ok)
    except Exception as e:
        log.warning('prefill_standby_name %s: %s', pool, e)
        return False


async def open_instant_fetch_session(
    name: str,
    mobile: str,
    *,
    pool: str = 'uid',
) -> UidaiBrowserSession | None:
    """Adopt pool tab after instant fill + one fast captcha refresh (~3–6s)."""
    nm = normalize_name(name)
    mob = re.sub(r'\D', '', (mobile or '').strip())
    if not mob:
        return None
    slot = _pool_key(pool)
    if not pool_form_ready(pool):
        try:
            await asyncio.wait_for(warm_standby_slot(slot), timeout=6.0 if uidai_fast() else 10.0)
        except Exception as e:
            log.warning('open_instant_fetch_session warm %s: %s', pool, e)
        if not pool_form_ready(pool):
            return None

    hit = await instant_pool_captcha(nm, mob, pool=pool, skip_replenish=True)
    if hit:
        png, txn = hit
        browser = UidaiBrowserSession(pool=pool)
        browser.name = nm
        browser.mobile = mob
        browser.name_skipped = is_skip_name(name)
        if await browser._try_adopt_standby():
            browser._captcha_png_cache = png
            browser._captcha_cache_txn = txn
            browser.captcha_txn_id = txn
            browser._captcha_cache_at = time.monotonic()
            browser._captcha_consumed = False
            browser.form_ready = True
            browser.touch()
            browser._replenish_pool()
            log.info(
                'open_instant_fetch_session instant pool=%s txn=%s… bytes=%s',
                pool, txn[:8], len(png),
            )
            return browser

    browser = UidaiBrowserSession(pool=pool)
    browser.name = nm
    browser.mobile = mob
    browser.name_skipped = is_skip_name(name)
    try:
        png = await browser.instant_fetch(nm, mob)
        txn = str(browser.captcha_txn_id or browser._captcha_cache_txn or '').strip()
        if browser._page and browser._context and png and txn and len(png) >= 200:
            log.info(
                'open_instant_fetch_session fallback pool=%s txn=%s… bytes=%s',
                pool, txn[:8], len(png),
            )
            return browser
    except Exception as e:
        log.warning('open_instant_fetch_session pool=%s: %s', pool, e)
    try:
        await browser.close(keep_warm=True)
    except Exception:
        pass
    return None


async def fresh_retrieve_captcha(
    name: str,
    mobile: str,
    *,
    pool: str = 'eid',
) -> tuple[bytes, str] | None:
    """Fresh captcha image — closes browser after capture (PDF HTTP OTP path)."""
    browser = await open_instant_fetch_session(name, mobile, pool=pool)
    if not browser:
        return None
    png = browser._captcha_png_cache
    txn = str(browser.captcha_txn_id or browser._captcha_cache_txn or '').strip()
    try:
        await browser.close(keep_warm=True)
    except Exception:
        pass
    if png and txn and len(png) >= 200:
        return png, txn
    return None


async def instant_retrieve_captcha(
    name: str,
    mobile: str,
    *,
    pool: str = 'uid',
) -> tuple[bytes, str] | None:
    """Fresh captcha from pool — always uses full browser refresh path."""
    return await fresh_retrieve_captcha(name, mobile, pool=pool)


async def warm_standby_uidai() -> bool:
    """Legacy — warm EID retrieve tab."""
    return await warm_standby_slot(STANDBY_EID)


async def refresh_standby_slot(slot: str) -> bool:
    sb = _POOL.get(slot) or {}
    page = sb.get('page')
    if not page or page.is_closed():
        return False
    try:
        lock = _slot_lock(slot)
        async with lock:
            if slot != STANDBY_PDF:
                await _prepare_standby_retrieve_page(page, slot)
            net_txn: dict[str, Any] = {}
            _attach_captcha_net_hook(page, net_txn)
            png, txn = await _force_refresh_page_captcha(page, net_txn, fast=True)
            sb['captcha_png'] = png
            sb['captcha_txn_id'] = txn
            sb['cached_at'] = time.monotonic()
        return True
    except Exception as e:
        log.warning('refresh_standby_slot %s: %s', slot, e)
        return False


async def fast_refresh_standby_slot(slot: str) -> bool:
    """Fast captcha click-refresh on one pool tab (~2–4s)."""
    return await refresh_standby_slot(slot)


async def fast_refresh_all_pool_captchas() -> int:
    """Sequential refresh on UID + EID + PDF — avoids RAM spike under load."""
    if not uidai_instant_form():
        return 0
    if not _browser_connected(_POOL.get('browser')):
        try:
            await asyncio.wait_for(ensure_pool_warm(), timeout=90.0)
        except Exception as e:
            log.warning('fast_refresh_all warm: %s', e)
            return 0
    ok = 0
    for slot in STANDBY_SLOTS:
        try:
            async with _BROWSER_SEM:
                if await fast_refresh_standby_slot(slot):
                    ok += 1
        except Exception as e:
            log.warning('fast_refresh slot %s: %s', slot, e)
        await asyncio.sleep(0.15)
    log.info('Pool captcha prime — %s/3 slots refreshed', ok)
    return ok


_POOL_PRIME_AT = 0.0
_POOL_PRIME_RUNNING = False


async def _pool_captcha_prime_worker(label: str) -> int:
    global _POOL_PRIME_AT, _POOL_PRIME_RUNNING
    _POOL_PRIME_RUNNING = True
    try:
        _POOL_PRIME_AT = time.monotonic()
        return await fast_refresh_all_pool_captchas()
    except Exception as e:
        log.warning('pool captcha prime %s: %s', label, e)
        return 0
    finally:
        _POOL_PRIME_RUNNING = False


def schedule_pool_captcha_prime(label: str = 'activity') -> None:
    """Debounced pool refresh — safe when many users message at once."""
    if not uidai_instant_form():
        return
    now = time.monotonic()
    if _POOL_PRIME_RUNNING or (_WARM_TASK is not None and not _WARM_TASK.done()):
        return
    if now - _POOL_PRIME_AT < 5.0:
        return
    _schedule_background(_pool_captcha_prime_worker(label), label=f'pool-prime-{label}')


async def prime_pool_captchas_now(label: str = 'now') -> int:
    """Single-flight captcha refresh — concurrent callers share one task."""
    global _PRIME_TASK
    if not uidai_instant_form():
        return 0
    async with _PRIME_LOCK:
        if _PRIME_TASK is not None and not _PRIME_TASK.done():
            try:
                return await _PRIME_TASK
            except Exception:
                pass
        _PRIME_TASK = asyncio.create_task(_pool_captcha_prime_worker(label))
    try:
        return await _PRIME_TASK
    except Exception as e:
        log.warning('prime_pool_captchas_now %s: %s', label, e)
        return 0


async def refresh_standby_captcha() -> bool:
    """Re-snapshot captcha on all 24/7 pool tabs."""
    results = await asyncio.gather(
        *[refresh_standby_slot(slot) for slot in STANDBY_SLOTS],
        return_exceptions=True,
    )
    return any(r is True for r in results)


async def _txn_from_page_or_net(page: Page, net_txn: dict[str, Any]) -> str:
    """Read captcha txn from network hook, React fiber, or bundle JS."""
    cached = str(net_txn.get('txn') or '').strip()
    if cached:
        return cached
    txn = str(await page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()
    if txn:
        return txn
    bundle = await page.evaluate(EXTRACT_CAPTCHA_BUNDLE_JS)
    if isinstance(bundle, dict):
        txn = str(bundle.get('txn') or '').strip()
        if txn:
            return txn
    if net_txn.get('json'):
        from audio_captcha import parse_captcha_generation

        parsed = parse_captcha_generation(net_txn['json'])
        txn = str(parsed.get('captchaTxnId') or parsed.get('txn') or '').strip()
        if txn:
            return txn
    return ''


async def _wait_page_captcha_txn(
    page: Page,
    net_txn: dict[str, Any],
    *,
    timeout_s: float = 20.0,
) -> str:
    poll_sleep = _ui_delay(0.4)
    for _ in range(int(timeout_s / poll_sleep)):
        txn = await _txn_from_page_or_net(page, net_txn)
        if txn:
            net_txn['txn'] = txn
            return txn
        await asyncio.sleep(poll_sleep)
    return ''


def _attach_captcha_net_hook(page: Page, net_txn: dict[str, Any]) -> None:
    async def _on_captcha_response(response) -> None:
        url = (response.url or '').lower()
        if response.status != 200:
            return
        if 'captcha' not in url:
            return
        if 'generation' not in url and 'captchaservice' not in url:
            return
        try:
            data = await response.json()
            net_txn['json'] = data
            from audio_captcha import parse_captcha_generation

            parsed = parse_captcha_generation(data)
            txn = str(parsed.get('captchaTxnId') or parsed.get('txn') or '').strip()
            if txn:
                net_txn['txn'] = txn
        except Exception:
            pass

    page.on('response', _on_captcha_response)


async def _page_captcha_changed(page: Page, old_txn: str, old_src: str | None) -> bool:
    img = page.locator('img[alt*="CAPTCHA" i]').first
    new_src = await img.get_attribute('src')
    txn = str(await page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()
    if txn and old_txn and txn != old_txn:
        return True
    if old_src and new_src and new_src != old_src:
        return True
    return False


async def _wait_page_captcha_visible(page: Page, timeout_s: int = 20) -> None:
    el = page.locator('img[alt*="CAPTCHA" i]').first
    await el.wait_for(state='visible', timeout=timeout_s * 1000)
    for _ in range(timeout_s * 4):
        if await el.evaluate('(img) => img.complete && img.naturalWidth > 10'):
            return
        await asyncio.sleep(0.25)
    raise RuntimeError('Captcha load fail')


async def _force_refresh_page_captcha(
    page: Page,
    net_txn: dict[str, Any] | None = None,
    *,
    fast: bool = False,
) -> tuple[bytes, str]:
    """Click refresh and wait until captcha image or txn actually changes."""
    hook_txn = net_txn if net_txn is not None else {}
    _attach_captcha_net_hook(page, hook_txn)
    img = page.locator('img[alt*="CAPTCHA" i]').first
    old_txn = str(await page.evaluate(EXTRACT_CAPTCHA_TXN_JS) or '').strip()
    old_src = await img.get_attribute('src')
    await page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
    await asyncio.sleep(_ui_delay(0.35 if fast else 0.5))
    vis_timeout = 5 if fast else (12 if uidai_fast() else 20)
    try:
        await _wait_page_captcha_visible(page, vis_timeout)
    except Exception:
        pass
    poll_sleep = 0.12 if fast else (0.2 if uidai_fast() else 0.35)
    poll_rounds = 6 if fast else (20 if uidai_fast() else 30)
    changed = False
    for _ in range(poll_rounds):
        if await _page_captcha_changed(page, old_txn, old_src):
            changed = True
            break
        await asyncio.sleep(poll_sleep)
    if not changed and not fast:
        await page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
        await asyncio.sleep(_ui_delay(0.8))
        for _ in range(poll_rounds):
            if await _page_captcha_changed(page, old_txn, old_src):
                changed = True
                break
            await asyncio.sleep(poll_sleep)
    txn = await _wait_page_captcha_txn(
        page, hook_txn, timeout_s=3.0 if fast else (6.0 if uidai_fast() else 10.0),
    )
    png, cap_txn = await _capture_page_captcha(page)
    txn = (txn or cap_txn or '').strip()
    if len(png) < 200 or not txn:
        raise RuntimeError('Fresh captcha failed after refresh')
    return png, txn


async def _fill_download_page_captcha(page: Page, eid: str) -> tuple[bytes, str]:
    """Fill EID on download page and capture paired captcha image + txn."""
    if not eid:
        raise RuntimeError('EID required for download captcha')
    net_txn: dict[str, Any] = {}
    await page.evaluate(SELECT_DOWNLOAD_EID_JS)
    await asyncio.sleep(_ui_delay(0.15))
    await page.evaluate(FILL_DOWNLOAD_EID_JS, eid)
    await asyncio.sleep(_ui_delay(0.25))
    png, txn = await _force_refresh_page_captcha(page, net_txn)
    if not txn:
        raise RuntimeError('captchaTxnID missing — reload page or run /open again')
    if len(png) < 200:
        raise RuntimeError('Download captcha image missing')
    return png, txn


async def capture_phase2_captcha_on_pool(eid: str) -> tuple[bytes, str]:
    """Warm PDF pool tab — fill user EID and return fresh captcha."""
    if not eid:
        raise RuntimeError('EID required for phase-2 captcha')
    slot = STANDBY_PDF
    if not pool_form_ready('pdf'):
        if not await warm_standby_slot(slot):
            raise RuntimeError('PDF pool not warm')
    lock = _slot_lock(slot)
    await lock.acquire()
    try:
        sb = _POOL.get(slot) or {}
        page = sb.get('page')
        if not page or page.is_closed():
            raise RuntimeError('PDF pool page closed')
        url = (page.url or '').lower()
        if 'genricdownload' not in url and 'downloadaadhaar' not in url:
            await page.goto(DOWNLOAD_PAGE_URL, wait_until='commit', timeout=_goto_timeout_ms())
            await asyncio.sleep(_ui_delay(0.35))
        prior_png = sb.get('captcha_png') or b''
        png, txn = await _fill_download_page_captcha(page, eid)
        if prior_png and png == prior_png:
            png, txn = await _fill_download_page_captcha(page, eid)
        sb['captcha_png'] = png
        sb['captcha_txn_id'] = txn
        sb['cached_at'] = time.monotonic()
        log.info('Phase2 pool captcha — eid=%s… txn=%s bytes=%s', eid[:6], txn[:8], len(png))
        return png, txn
    finally:
        if lock.locked():
            lock.release()


async def _ensure_triple_pool_warm_staged() -> bool:
    """Staged warm — one tab at a time; easier on RAM with many users."""
    try:
        async with _BROWSER_SEM:
            await _pool_browser()
    except Exception as e:
        log.warning('pool browser launch: %s', e)
        return False
    ok_uid = False
    ok_eid = False
    ok_pdf = False
    try:
        async with _BROWSER_SEM:
            ok_uid = await warm_standby_slot(STANDBY_UID)
        await asyncio.sleep(0.25)
        async with _BROWSER_SEM:
            ok_eid = await warm_standby_slot(STANDBY_EID)
        await asyncio.sleep(0.25)
        async with _BROWSER_SEM:
            ok_pdf = await warm_standby_slot(STANDBY_PDF)
    except Exception as e:
        log.warning('staged pool warm: %s', e)
    ok = sum(1 for x in (ok_uid, ok_eid, ok_pdf) if x)
    log.info('Triple pool warm (staged) — %s/3 slots ready', ok)
    return bool(ok_uid or ok >= 2)


async def ensure_triple_pool_warm() -> bool:
    return await _ensure_triple_pool_warm_staged()


async def ensure_pool_warm() -> bool:
    """Single-flight — many users share one warm task."""
    global _WARM_TASK
    async with _WARM_LOCK:
        if _WARM_TASK is not None and not _WARM_TASK.done():
            try:
                return await _WARM_TASK
            except Exception:
                pass
        _WARM_TASK = asyncio.create_task(_ensure_triple_pool_warm_staged())
    try:
        return await _WARM_TASK
    except Exception as e:
        log.warning('ensure_pool_warm: %s', e)
        return False


def _browser_launch_opts() -> dict[str, Any]:
    """headless=0 + UIDAI_BROWSER_CHANNEL=chrome for laptop debugging."""
    headless = os.getenv('UIDAI_HEADLESS', '1').strip().lower() not in ('0', 'false', 'no', 'off')
    opts: dict[str, Any] = {
        'headless': headless,
        'args': [
            '--disable-remote-fonts',
            '--no-sandbox',
            '--disable-dev-shm-usage',
        ],
    }
    if headless:
        opts['args'].append('--disable-gpu')
    channel = os.getenv('UIDAI_BROWSER_CHANNEL', '').strip()
    if channel:
        opts['channel'] = channel
    return opts


async def _pool_browser() -> tuple[Browser, bool]:
    """Return (browser, reused). Dead pool entry auto-relaunch."""
    async with _POOL['browser_lock']:
        if _POOL['browser']:
            if _browser_connected(_POOL['browser']):
                log.info('Pre-warm: browser reuse (direct)')
                return _POOL['browser'], True
            log.warning('Pre-warm: dead browser in pool — relaunch')
            await _pool_drop_browser_locked()

        if not _POOL['pw']:
            _POOL['pw'] = await async_playwright().start()

        log.info('Pre-warm: launching browser (direct) headless=%s', _browser_launch_opts().get('headless'))
        opts = _browser_launch_opts()
        _POOL['browser'] = await _POOL['pw'].chromium.launch(**opts)
        return _POOL['browser'], False


class UidaiBrowserSession:
    """Thin Playwright session — captcha image + Python API OTP (dob:null)."""

    def __init__(
        self,
        bundle_path: Path | None = None,
        on_step: StepCb | None = None,
        on_captcha_ready: CaptchaReadyCb | None = None,
        pool: str = 'uid',
    ) -> None:
        # bundle_path kept for backward compat — no longer used
        self.bundle_path = bundle_path
        self._on_step = on_step
        self._on_captcha_ready = on_captcha_ready
        self._pool_slot = pool
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
        self.connection_label = 'Direct'
        self._captcha_png_cache: bytes = b''
        self._captcha_cache_txn: str = ''
        self._captcha_cache_at: float = 0.0
        self._captcha_notified = False
        self._captcha_photo_sent = False
        self._captcha_consumed = False

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError('Browser not started — run /open first')
        return self._page

    @property
    def version(self) -> str:
        return BOT_ENGINE_VERSION

    async def _step(self, n: int, total: int, msg: str) -> None:
        if self._on_step:
            await self._on_step(n, total, msg)

    def reset_captcha_notify(self) -> None:
        self._captcha_notified = False
        self._captcha_photo_sent = False

    def _clear_captcha_cache(self) -> None:
        self._captcha_png_cache = b''
        self._captcha_cache_txn = ''
        self._captcha_cache_at = 0.0

    def _captcha_cache_fresh(self) -> bool:
        if self._captcha_consumed or len(self._captcha_png_cache) < 200:
            return False
        if not self._captcha_cache_at or not self.captcha_txn_id:
            return False
        age = time.monotonic() - self._captcha_cache_at
        return age <= min(CAPTCHA_CACHE_TTL_SEC, captcha_max_age_sec())

    async def fast_refresh_captcha(self) -> bytes:
        """~2–4s refresh — no page reload (hot /fetch path)."""
        if not self._page:
            raise RuntimeError('Browser not started — run /fetch again')
        net_txn: dict[str, Any] = {}
        png, txn = await _force_refresh_page_captcha(self.page, net_txn, fast=True)
        self._captcha_png_cache = png
        self._captcha_cache_txn = txn
        self.captcha_txn_id = txn
        self._captcha_cache_at = time.monotonic()
        self._captcha_consumed = False
        return png

    async def ensure_fresh_captcha_png(self) -> bytes:
        """Fresh captcha for this request — fast path first."""
        if not self._page:
            raise RuntimeError('Browser not started — run /fetch again')
        try:
            await self.fast_refresh_captcha()
        except Exception as exc:
            log.warning('fast_refresh failed, full refresh: %s', exc)
            await self.refresh_captcha(allow_reload=True)
        self.reset_captcha_notify()
        png = self._captcha_png_cache
        if len(png or b'') < 200 or not self.captcha_txn_id:
            raise RuntimeError('Captcha not ready — try /fetch again')
        return png

    def note_captcha_submitted(self, captcha_text: str) -> None:
        """Captcha text sent — page txn is spent; refresh after OTP."""
        self.last_captcha = (captcha_text or '').strip().lower()
        self._captcha_consumed = True

    async def refresh_for_next_fetch(self) -> None:
        """Background — new captcha on pool tab after OTP / retrieve."""
        try:
            if self._page and not self._page.is_closed():
                await self.refresh_captcha()
                self._captcha_consumed = False
                self.reset_captcha_notify()
        except Exception as exc:
            log.warning('refresh_for_next_fetch: %s', exc)

    async def _notify_captcha_ready(self, png: bytes, txn: str = '') -> None:
        if len(png) < 200:
            return
        self._captcha_png_cache = png
        self._captcha_cache_txn = txn or self._captcha_cache_txn
        self._captcha_cache_at = time.monotonic()
        if txn:
            self.captcha_txn_id = txn
        cb = self._on_captcha_ready
        if not cb or self._captcha_photo_sent:
            return
        try:
            await cb(png, txn or self.captcha_txn_id)
            self._captcha_photo_sent = True
        except Exception as exc:
            log.warning('captcha ready callback: %s', exc)

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

    async def _form_on_page(self) -> bool:
        if not self._page or not self._context:
            return False
        try:
            if self._page.is_closed():
                return False
            return await self.page.locator('input[name="name"]').count() > 0
        except Exception:
            return False

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
        await self._notify_captcha_ready(png, txn)
        return png

    async def _try_adopt_standby(self) -> bool:
        slot = _pool_key(self._pool_slot)
        sb = _POOL.get(slot) or {}
        page = sb.get('page')
        ctx = sb.get('context')
        if not page or page.is_closed() or not ctx:
            return False
        self._context = ctx
        self._page = page
        sb['context'] = None
        sb['page'] = None
        self._clear_captcha_cache()
        self.captcha_txn_id = ''
        self.form_ready = True
        self.page_loaded_at = time.monotonic()
        self.touch()
        log.info('Adopted pool tab %s — instant captcha ready', slot)
        return True

    async def reset_for_next_attempt(self) -> None:
        """After retrieve — refresh captcha on the same page."""
        self.otp_txn_id = ''
        self.last_captcha = ''
        await self.refresh_captcha()

    async def _prepare_connection(self) -> None:
        """Direct Indian VPS — no proxy, no saved cookies."""
        self.connection_label = 'Direct connection'
        await self._step(1, 8, self.connection_label)

    async def _new_page(self) -> bool:
        """New context + page. Returns True if Chromium pool was reused."""
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
            self._page = None

        if await self._try_adopt_standby():
            await _pool_browser()
            self._replenish_pool()
            return True

        last_err: Exception | None = None
        for attempt in range(3):
            try:
                browser, reused = await _pool_browser()
                self._context = await browser.new_context(**_browser_context_kwargs())
                await self._context.add_init_script(SKIP_FONTS_JS)
                self._page = await self._context.new_page()
                return reused
            except Exception as e:
                last_err = e
                log.warning('new_context fail attempt %s: %s', attempt + 1, e)
                if attempt < 2 and _is_browser_closed_error(e):
                    async with _POOL['browser_lock']:
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
        await self._prepare_connection()
        reused = await self._new_page()
        if await self._form_on_page():
            self.form_ready = True
            await self._step(2, 8, 'Pool page ready ⚡')
        elif reused:
            await self._step(2, 8, 'Browser reuse ⚡')
        else:
            await self._step(2, 8, 'Browser start…')
        self.touch()
        if not self.page_loaded_at:
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

    async def _fill_fields_only_fast(self) -> None:
        """Fill name + mobile on preloaded page — one JS call, no reload."""
        filled = await self.page.evaluate(
            FILL_RETRIEVE_FORM_JS, {'name': self.name, 'mobile': self.mobile},
        )
        if not filled:
            await self.page.fill('input[name="name"]', self.name)
            await self.page.fill('input[name="mobile"]', self.mobile)
        txn = await self.page.evaluate(EXTRACT_CAPTCHA_TXN_JS)
        if txn:
            self.captcha_txn_id = str(txn)
        await self._read_option()
        self.form_ready = True
        self.touch()

    async def instant_fetch(self, name: str, mobile: str) -> bytes:
        """Turbo /fetch — adopt preloaded pool, fill form, return cached captcha (~1s)."""
        self.name = normalize_name(name)
        self.mobile = mobile.strip()
        self.name_skipped = is_skip_name(name)
        self.otp_txn_id = ''
        self.last_captcha = ''
        self._captcha_consumed = False
        self._clear_captcha_cache()
        self.reset_captcha_notify()
        self.touch()

        if not self._page:
            if not await self._try_adopt_standby():
                await self.start()
        elif not await self._form_on_page():
            if not await self._try_adopt_standby():
                await self.start()

        await self._fill_fields_only_fast()
        await self.fast_refresh_captcha()
        png = self._captcha_png_cache

        self.page_loaded_at = time.monotonic()
        self._replenish_pool()
        if not png or len(png) < 200:
            raise RuntimeError('Captcha not ready — try /fetch again')
        return png

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
        step = 0.08 if uidai_fast() else 0.15
        if uidai_fast() and max_sec > 12.0:
            max_sec = 12.0
        for _ in range(int(max_sec / step)):
            if await self.page.locator('input[name="name"]').count():
                return True
            await asyncio.sleep(step)
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
        raise RuntimeError('captchaTxnID missing — reload page or run /open again')

    async def _read_option(self) -> str:
        opt = await self.page.evaluate(GET_OPTION_JS)
        self.option = opt if opt in ('UID', 'EID') else 'UID'
        return self.option

    async     def _replenish_pool(self) -> None:
        _schedule_background(
            warm_standby_slot(_pool_key(self._pool_slot)),
            label='replenish-pool',
        )

    async def _open_from_preloaded_page(self) -> bytes:
        """Preloaded pool tab — fill name/mobile and return fresh captcha."""
        self.touch()
        self.page_loaded_at = time.monotonic()
        await self._step(1, 3, 'Preloaded UIDAI page ⚡')
        await self._fill_fields_only_fast()
        await self._step(2, 3, 'Refreshing captcha…')
        await self.fast_refresh_captcha()
        png = self._captcha_png_cache
        self._replenish_pool()
        return png or b''

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
        self.captcha_txn_id = ''
        self._captcha_consumed = False
        self._clear_captcha_cache()
        self.reset_captcha_notify()

        if not force_reload:
            if not self._page:
                await self.start()
            if await self.page_alive():
                await self._step(1, 3, f'Session active — {self.ttl_label()} left')
                await self._fill_fields_only_fast()
                await self.fast_refresh_captcha()
                png = self._captcha_png_cache
                return png or b''
            if await self._form_on_page():
                return await self._open_from_preloaded_page()

        self.captcha_txn_id = ''
        self._clear_captcha_cache()
        await self._step(3, 8, 'Opening UIDAI site…')
        goto_timeout = _goto_timeout_ms()
        poll_sec = 12.0 if uidai_fast() else 22.0
        max_tries = 3
        last_err: Exception | None = None
        for attempt in range(max_tries):
            try:
                await self.page.goto(
                    UIDAI_PAGE_URL,
                    wait_until='commit',
                    timeout=goto_timeout,
                )
                if await self._poll_form(poll_sec):
                    last_err = None
                    break
                raise RuntimeError('Form fields timeout')
            except Exception as e:
                last_err = e
                if attempt < max_tries - 1:
                    await self._step(3, 8, f'Retry {attempt + 1}/{max_tries}…')
                    await asyncio.sleep(0.3 if uidai_fast() else 0.5)
        if last_err:
            raise RuntimeError(f'UIDAI open fail: {last_err}') from last_err

        await self._step(3, 8, 'UIDAI page loaded')
        await self._step(4, 8, 'Form ready')
        await self._fill_fields_only_fast()
        await self.fast_refresh_captcha()
        png = self._captcha_png_cache
        self.page_loaded_at = time.monotonic()
        _schedule_background(self._prefetch_next_captcha(), label='prefetch-captcha')
        return self._captcha_png_cache or png or b''

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

    async def fetch_download_captcha(self, eid: str) -> tuple[bytes, str]:
        """Phase-2 download page captcha — reuse pool tab when already open."""
        if not eid:
            raise RuntimeError('EID required for download captcha')
        self.touch()
        await self.start()
        goto_timeout = _goto_timeout_ms()
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                url = (self.page.url or '').lower()
                if 'genricdownload' not in url and 'downloadaadhaar' not in url:
                    await self.page.goto(
                        DOWNLOAD_PAGE_URL,
                        wait_until='commit',
                        timeout=goto_timeout,
                    )
                    await asyncio.sleep(_ui_delay(0.35))
                png, txn = await _fill_download_page_captcha(self.page, eid)
                self.captcha_txn_id = txn
                self._captcha_png_cache = png
                self._captcha_cache_txn = txn
                self._captcha_cache_at = time.monotonic()
                return png, txn
            except Exception as e:
                last_err = e
                log.warning('fetch_download_captcha attempt %s: %s', attempt + 1, e)
                if attempt < 2:
                    await asyncio.sleep(0.6)
        raise RuntimeError(f'Download captcha failed: {last_err}')

    async def _captcha_changed(self, old_txn: str, old_src: str | None) -> bool:
        return await _page_captcha_changed(self.page, old_txn, old_src)

    async def refresh_captcha(self, *, allow_reload: bool = True) -> bytes:
        old_txn = self.captcha_txn_id
        old_src = await self.page.locator('img[alt*="CAPTCHA" i]').first.get_attribute('src')
        click_res = await self.page.evaluate(CLICK_REFRESH_CAPTCHA_JS)
        log.info('Captcha refresh click: %s', click_res)
        await asyncio.sleep(_ui_delay(0.5))
        await self._wait_captcha_image()
        poll_sleep = 0.2 if uidai_fast() else 0.35
        poll_rounds = 18 if uidai_fast() else 30
        for _ in range(poll_rounds):
            if await self._captcha_changed(old_txn, old_src):
                break
            await asyncio.sleep(poll_sleep)

        if allow_reload and not await self._captcha_changed(old_txn, old_src):
            log.info('Captcha refresh fallback — page reload')
            await self.page.reload(wait_until='commit', timeout=45_000)
            if not await self._poll_form(20.0):
                raise RuntimeError('Form reload timeout — run /open again')
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
        headers = get_header(new_request_id())
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
                append_log(logs, 'info', 'UIDAI response', {'status': status, 'msg': msg[:160], **extra})
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
            append_log(logs, 'info', 'UIDAI response', {'status': status, 'msg': msg[:160], **extra})
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

    async def ensure_browser_live(self) -> None:
        """Ensure Playwright context exists for UIDAI API calls (no captcha refresh)."""
        if self._context and self._page:
            try:
                if not self._page.is_closed():
                    self.touch()
                    return
            except Exception:
                pass
        if not self.name or not self.mobile:
            raise RuntimeError('Browser not started — run /fetch again')
        self._page = None
        self._context = None
        if not await self._try_adopt_standby():
            await self.start()
        if await self._form_on_page():
            await self._fill_fields_only_fast()
        if not self._context:
            raise RuntimeError('Browser not started — run /fetch again')

    async def send_otp(
        self,
        captcha: str,
        on_step: StepCb | None = None,
        *,
        captcha_bypass: bool = False,
    ) -> dict[str, Any]:
        captcha = (captcha or '').strip().lower()
        if not captcha:
            raise ValueError('Captcha required — enter 4–8 characters from the image')
        await self.ensure_browser_live()
        step_fn = on_step or self._on_step
        total = 6
        logs: list[dict[str, Any]] = []
        otp_ok = False

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        await s(1, f'Captcha fill: {captcha}')
        try:
            await self.page.fill('input[name="captcha"]', captcha)
        except Exception:
            append_log(logs, 'info', 'Captcha fill skipped — using paired txn from image')

        await s(2, 'captchaTxnID read…')
        txn = str(self.captcha_txn_id or self._captcha_cache_txn or '').strip()
        if not txn:
            txn = await self._extract_captcha_txn()
        if not txn:
            try:
                txn = await self._wait_captcha_txn(8.0)
            except RuntimeError:
                if not txn:
                    append_log(logs, 'warn', 'captchaTxnId missing — use /refresh')
                    await s(3, 'captchaTxnID missing')
                    await s(4, 'Done')
                    await s(5, 'Done')
                    await s(6, 'Done')
                    self.last_logs = logs
                    return self._api_result(logs, otp_ok=False, captcha=captcha)
        self.captcha_txn_id = txn

        option = self.option or await self._read_option()

        payload = build_otp_payload(
            name=self.name,
            mobile=self.mobile,
            captcha=captcha,
            captcha_txn_id=txn,
            option=option,
            captcha_bypass=False,
        )
        append_log(logs, 'info', 'Sending OTP', {
            'mobile': self.mobile,
            'captchaTxnId': txn,
            'option': option,
        })

        await s(3, 'UIDAI API — sending OTP…')
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
            await s(4, 'OTP sent via SMS')
            await s(5, 'Reply with your OTP')
            await s(6, 'Send 6-digit OTP')
        elif otp_ok:
            otp_ok = False
        elif status == 0 and not text:
            append_log(logs, 'warn', 'OTP network error — reload page or run /open again')
            await s(6, 'Network fail — run /open again')
        else:
            captcha_bad = any(
                'Captcha' in (x.get('m') or '') or 'captcha' in (x.get('m') or '').lower()
                for x in logs
            )
            await s(6, 'Captcha issue — /refresh' if captcha_bad else 'UIDAI rejected — check logs')

        self.last_logs = logs
        return self._api_result(logs, otp_ok=otp_ok, captcha=captcha)

    async def submit_otp(self, otp: str, on_step: StepCb | None = None) -> dict[str, Any]:
        """Verify SMS OTP — UIDAI sends Aadhaar/EID to registered mobile."""
        otp = re.sub(r'\s+', '', otp.strip())
        await self.ensure_browser_live()
        step_fn = on_step or self._on_step
        total = 5
        logs: list[dict[str, Any]] = []
        retrieve_ok = False

        async def s(n: int, msg: str) -> None:
            if step_fn:
                await step_fn(n, total, msg)

        if not self.otp_txn_id:
            append_log(logs, 'warn', 'otpTxnId missing — send captcha OTP first')
            self.last_logs = logs
            return self._api_result(logs, retrieve_ok=False)

        if not self.last_captcha or not self.captcha_txn_id:
            append_log(logs, 'warn', 'Session data missing — run /open again')
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

        await s(2, 'Sending OTP to UIDAI…')
        ok, status, text, extra = await self._call_uidai(payload, logs, 'Retrieve')

        if ok and extra.get('reason') == 'retrieve_ok':
            retrieve_ok = True
            hint = extra.get('aadhaar_hint')
            append_log(logs, 'info', f'Retrieve OK — UIDAI {status}', {'hint': hint} if hint else None)
            await s(3, 'UIDAI sent SMS')
            await s(4, 'Check registered mobile')
            await s(5, 'Done')
        elif extra.get('reason') == 'invalid_otp':
            append_log(logs, 'warn', 'Invalid OTP — try again')
            await s(3, 'Invalid OTP')
            await s(4, 'Try again')
            await s(5, 'Done')
        elif status == 0 and not text:
            append_log(logs, 'warn', 'Network error — try again')
            await s(3, 'Network fail')
            await s(4, 'Done')
            await s(5, 'Done')
        else:
            msg = extra.get('msg', '')
            if ok:
                retrieve_ok = True
                append_log(logs, 'info', 'Request OK — check SMS', {'msg': msg[:120]})
                await s(3, 'Check SMS')
                await s(4, 'Done')
                await s(5, 'Done')
            else:
                append_log(logs, 'warn', 'Retrieve fail', {'msg': msg[:120]})
                await s(3, 'Failed — check logs')
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
            'connection_label': self.connection_label,
            'otp_ok': otp_ok,
            'retrieve_ok': retrieve_ok,
        }
