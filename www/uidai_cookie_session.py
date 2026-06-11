"""UIDAI cookie session — direct-first, persistent jar (bina proxy)."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from uidai_api import DOWNLOAD_PAGE_URL, RETRIEVE_PAGE_URL, UIDAI_PAGE_URL

log = logging.getLogger('uidai-cookies')

PORTAL_HOME = 'https://myaadhaar.uidai.gov.in/'
TATHYA_ORIGIN = 'https://tathya.uidai.gov.in'
COOKIE_JAR_FILE = Path(__file__).parent / 'uidai_cookies.json'

BROWSER_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


def cookie_seed_enabled() -> bool:
    return os.getenv('UIDAI_COOKIE_SEED', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def cookie_persist_enabled() -> bool:
    return os.getenv('UIDAI_COOKIE_PERSIST', '1').strip().lower() in ('1', 'true', 'yes', 'on')


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


def export_session_cookies(session: requests.Session) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for c in session.cookies:
        rows.append({
            'name': c.name,
            'value': c.value,
            'domain': c.domain or '',
            'path': c.path or '/',
        })
    return rows


def load_cookie_jar() -> list[dict[str, Any]]:
    """Disk se saved cookies — pehle wale session reuse."""
    if not cookie_persist_enabled() or not COOKIE_JAR_FILE.exists():
        return []
    try:
        data = json.loads(COOKIE_JAR_FILE.read_text(encoding='utf-8'))
        cookies = list(data.get('cookies') or [])
        age = time.time() - float(data.get('ts', 0))
        max_age = int(os.getenv('UIDAI_COOKIE_MAX_AGE_HOURS', '48')) * 3600
        if max_age > 0 and age > max_age:
            log.info('Cookie jar stale (%.0fh) — fresh seed hoga', age / 3600)
            return []
        log.debug('Cookie jar loaded — %d cookies', len(cookies))
        return cookies
    except Exception as e:
        log.warning('Cookie jar load fail: %s', e)
        return []


def save_cookie_jar(session: requests.Session) -> None:
    """Session cookies disk pe — next run bina proxy ke kaam aayenge."""
    if not cookie_persist_enabled():
        return
    try:
        payload = {
            'ts': time.time(),
            'cookies': export_session_cookies(session),
        }
        COOKIE_JAR_FILE.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        log.debug('Cookie jar saved — %d cookies', len(payload['cookies']))
    except Exception as e:
        log.warning('Cookie jar save fail: %s', e)


def apply_cookie_jar_to_session(
    session: requests.Session,
    cookies: list[dict[str, Any]],
) -> int:
    return import_playwright_cookies(session, cookies)


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
    save: bool = True,
) -> dict[str, Any]:
    """
    Portal kholo — cookies collect karo (direct ya proxy).
    Bina proxy: proxy_url=None, saved jar pehle load hota hai bootstrap me.
    """
    if not cookie_seed_enabled():
        return {'skipped': True, **cookie_summary(session)}

    t = timeout or int(os.getenv('UIDAI_COOKIE_TIMEOUT', '25'))
    proxies = _proxies(proxy_url)
    from proxy_india import fast_mode

    target = page_url or RETRIEVE_PAGE_URL
    if fast_mode():
        chain = [target]
    else:
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
    summary['route'] = 'proxy' if proxy_url else 'direct'
    if save and cookie_persist_enabled():
        save_cookie_jar(session)
    log.info('UIDAI cookies seeded — %s', summary)
    return summary


def bootstrap_uidai_session(
    session: requests.Session,
    proxy_url: str | None = None,
    *,
    page_url: str | None = None,
) -> dict[str, Any]:
    """Saved jar load → portal seed → save — direct-first ke liye."""
    loaded = 0
    if cookie_persist_enabled():
        loaded = apply_cookie_jar_to_session(session, load_cookie_jar())
    info = seed_uidai_cookies(session, proxy_url, page_url=page_url, save=True)
    info['loaded_from_disk'] = loaded
    return info


def probe_uidai_access(
    session: requests.Session | None = None,
    proxy_url: str | None = None,
    *,
    page_url: str | None = None,
    timeout: int | None = None,
    bootstrap: bool = True,
) -> dict[str, Any]:
    """
    UIDAI portal reachable hai ya nahi — direct ya proxy test.
    Returns {ok, status, route, cookies, geo?}
    """
    own = session is None
    sess = session or requests.Session()
    if own:
        sess.headers.update({'User-Agent': BROWSER_UA})

    t = timeout or int(os.getenv('UIDAI_PROBE_TIMEOUT', '15'))
    target = page_url or RETRIEVE_PAGE_URL
    route = 'proxy' if proxy_url else 'direct'

    if bootstrap and cookie_seed_enabled():
        try:
            bootstrap_uidai_session(sess, proxy_url, page_url=target)
        except Exception as e:
            log.debug('probe bootstrap fail: %s', e)

    status = 0
    err = ''
    try:
        r = sess.get(
            target,
            headers=_nav_headers(PORTAL_HOME),
            proxies=_proxies(proxy_url),
            timeout=t,
            allow_redirects=True,
        )
        status = r.status_code
        ok = status < 500 and status != 0
    except requests.RequestException as e:
        ok = False
        err = str(e)

    geo: dict[str, Any] = {}
    if not proxy_url:
        try:
            from proxy_india import check_direct_india

            geo = check_direct_india(timeout=4) or {}
        except Exception:
            pass

    result = {
        'ok': ok,
        'status': status,
        'route': route,
        'error': err,
        'cookies': cookie_summary(sess),
        'geo': geo,
    }
    if ok and not proxy_url:
        result['label'] = '🌐 Direct + cookies'
    log.info('UIDAI probe %s — ok=%s status=%s cookies=%s', route, ok, status, result['cookies']['count'])
    return result


def merge_browser_cookies_into_session(
    http_session: requests.Session,
    browser_cookies: list[dict[str, Any]],
) -> dict[str, Any]:
    """Browser tab se cookies copy — jar me bhi save."""
    before = cookie_summary(http_session)
    added = import_playwright_cookies(http_session, browser_cookies)
    after = cookie_summary(http_session)
    save_cookie_jar(http_session)
    log.info('Browser cookies merged — added=%s before=%s after=%s', added, before['count'], after['count'])
    return {'added': added, 'before': before, 'after': after}
