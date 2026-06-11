"""UIDAI cookie seeding — foreign VPS: proxy + portal cookies before API calls."""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlparse

import requests

from uidai_api import DOWNLOAD_PAGE_URL, RETRIEVE_PAGE_URL, UIDAI_PAGE_URL

log = logging.getLogger('uidai-cookies')

PORTAL_HOME = 'https://myaadhaar.uidai.gov.in/'
TATHYA_ORIGIN = 'https://tathya.uidai.gov.in'

BROWSER_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


def cookie_seed_enabled() -> bool:
    return os.getenv('UIDAI_COOKIE_SEED', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def _proxies(proxy_url: str | None) -> dict[str, str] | None:
    if not proxy_url:
        return None
    return {'http': proxy_url, 'https': proxy_url}


def _nav_headers(referer: str = PORTAL_HOME) -> dict[str, str]:
    return {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
        'Referer': referer,
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin' if 'myaadhaar' in referer else 'none',
        'Sec-Fetch-User': '?1',
    }


def cookie_summary(session: requests.Session) -> dict[str, Any]:
    jar = session.cookies
    names = sorted({c.name for c in jar})
    domains = sorted({c.domain for c in jar if c.domain})
    return {
        'count': len(jar),
        'names': names[:12],
        'domains': domains[:6],
    }


def import_playwright_cookies(
    session: requests.Session,
    cookies: list[dict[str, Any]],
) -> int:
    """Playwright context.cookies() → requests.Session jar."""
    added = 0
    for c in cookies or []:
        name = c.get('name')
        value = c.get('value')
        if not name or value is None:
            continue
        domain = c.get('domain') or ''
        path = c.get('path') or '/'
        session.cookies.set(name, value, domain=domain, path=path)
        added += 1
    return added


def seed_uidai_cookies(
    session: requests.Session,
    proxy_url: str | None,
    *,
    page_url: str | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """
    Foreign VPS fix — pehle portal kholo (India IP/proxy se), cookies collect karo.
    UIDAI API calls inke baad same session jar use karti hain.
    """
    if not cookie_seed_enabled():
        return {'skipped': True, **cookie_summary(session)}

    t = timeout or int(os.getenv('UIDAI_COOKIE_TIMEOUT', '25'))
    proxies = _proxies(proxy_url)
    target = page_url or RETRIEVE_PAGE_URL
    chain = [PORTAL_HOME]
    if target not in chain:
        chain.append(target)
    if 'genricDownload' in target and UIDAI_PAGE_URL not in chain:
        chain.insert(1, UIDAI_PAGE_URL)

    referer = PORTAL_HOME
    last_status = 0
    for url in chain:
        try:
            r = session.get(
                url,
                headers=_nav_headers(referer),
                proxies=proxies,
                timeout=t,
                allow_redirects=True,
            )
            last_status = r.status_code
            referer = str(r.url) if r.url else url
            log.debug('cookie seed GET %s → %s cookies=%s', url, r.status_code, len(session.cookies))
        except requests.RequestException as e:
            log.warning('cookie seed fail %s: %s', url, e)

    # Light touch on API origin (some WAFs set cross-subdomain cookies)
    try:
        session.head(
            TATHYA_ORIGIN + '/',
            headers={
                'User-Agent': BROWSER_UA,
                'Accept': '*/*',
                'Referer': referer,
                'Origin': 'https://myaadhaar.uidai.gov.in',
            },
            proxies=proxies,
            timeout=min(t, 15),
            allow_redirects=True,
        )
    except requests.RequestException:
        pass

    summary = cookie_summary(session)
    summary['last_status'] = last_status
    summary['page'] = urlparse(target).path or target
    log.info('UIDAI cookies seeded — %s', summary)
    return summary


def merge_browser_cookies_into_session(
    http_session: requests.Session,
    browser_cookies: list[dict[str, Any]],
) -> dict[str, Any]:
    """Browser tab se cookies copy — same India route + cookie context."""
    before = cookie_summary(http_session)
    added = import_playwright_cookies(http_session, browser_cookies)
    after = cookie_summary(http_session)
    log.info('Browser cookies merged — added=%s before=%s after=%s', added, before['count'], after['count'])
    return {'added': added, 'before': before, 'after': after}
