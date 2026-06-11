"""UIDAI cookie session — baked proxy cookies + isolated per-session copies."""

from __future__ import annotations

import copy
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
BAKED_SESSION_FILE = Path(__file__).parent / 'uidai_baked_session.json'

# Proxy se capture — Gandhinagar (live tested)
BAKED_PROXY_DEFAULT = 'http://117.236.124.166:3128'

_BAKED_CACHE: dict[str, Any] | None = None

BROWSER_UA = (
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
)


def cookie_seed_enabled() -> bool:
    return os.getenv('UIDAI_COOKIE_SEED', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def cookie_persist_enabled() -> bool:
    return os.getenv('UIDAI_COOKIE_PERSIST', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def baked_session_enabled() -> bool:
    return os.getenv('UIDAI_BAKED_SESSION', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def load_baked_session(*, reload: bool = False) -> dict[str, Any]:
    """Code me baked uidai_baked_session.json — proxy + cookies + storage_state."""
    global _BAKED_CACHE
    if _BAKED_CACHE is not None and not reload:
        return _BAKED_CACHE
    if not baked_session_enabled() or not BAKED_SESSION_FILE.exists():
        _BAKED_CACHE = {}
        return _BAKED_CACHE
    try:
        data = json.loads(BAKED_SESSION_FILE.read_text(encoding='utf-8'))
        _BAKED_CACHE = data if isinstance(data, dict) else {}
        return _BAKED_CACHE
    except Exception as e:
        log.warning('Baked session load fail: %s', e)
        _BAKED_CACHE = {}
        return _BAKED_CACHE


def baked_session_ready() -> bool:
    data = load_baked_session()
    cookies = list(data.get('cookies') or [])
    return bool(data.get('baked') and cookies)


def get_baked_proxy() -> str | None:
    data = load_baked_session()
    return (data.get('proxy') or BAKED_PROXY_DEFAULT or '').strip() or None


def get_baked_cookies() -> list[dict[str, Any]]:
    """Baked cookies — har session ko copy deni hai (isolated)."""
    data = load_baked_session()
    return list(data.get('cookies') or [])


def get_isolated_baked_cookies() -> list[dict[str, Any]]:
    return copy.deepcopy(get_baked_cookies())


def get_isolated_storage_state() -> dict[str, Any] | None:
    """Playwright new_context(storage_state=…) — per-session deep copy."""
    data = load_baked_session()
    state = data.get('storage_state')
    if not isinstance(state, dict) or not state.get('cookies'):
        cookies = get_baked_cookies()
        if not cookies:
            return None
        state = {'cookies': cookies, 'origins': data.get('origins') or []}
    return copy.deepcopy(state)


def apply_isolated_baked_cookies(session: requests.Session) -> int:
    """HTTP session — baked cookies ki isolated copy."""
    cookies = get_isolated_baked_cookies()
    if not cookies:
        return 0
    return import_playwright_cookies(session, cookies)


def sync_baked_to_runtime_jar() -> bool:
    """Bot start — baked cookies runtime jar me (optional)."""
    if not baked_session_ready() or not cookie_persist_enabled():
        return False
    if COOKIE_JAR_FILE.exists():
        data = _read_cookie_jar_data()
        if data.get('bootstrapped') and data.get('cookies'):
            return False
    try:
        baked = load_baked_session()
        payload = {
            'ts': time.time(),
            'cookies': copy.deepcopy(baked.get('cookies') or []),
            'bootstrapped': True,
            'forever': True,
            'from_baked': True,
            'proxy': baked.get('proxy'),
        }
        COOKIE_JAR_FILE.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        log.info('Baked cookies synced → uidai_cookies.json (%d)', len(payload['cookies']))
        return True
    except Exception as e:
        log.warning('Baked sync fail: %s', e)
        return False


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


def _read_cookie_jar_data() -> dict[str, Any]:
    if not COOKIE_JAR_FILE.exists():
        return {}
    try:
        data = json.loads(COOKIE_JAR_FILE.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception as e:
        log.warning('Cookie jar read fail: %s', e)
        return {}


def cookie_jar_ready() -> bool:
    """Baked ya runtime jar — cookies ready for all sessions."""
    if baked_session_ready():
        return True
    if not cookie_persist_enabled():
        return False
    data = _read_cookie_jar_data()
    cookies = list(data.get('cookies') or [])
    if not cookies:
        return False
    if data.get('bootstrapped') or data.get('forever'):
        return True
    return False


def load_cookie_jar() -> list[dict[str, Any]]:
    """Baked cookies pehle, phir disk jar — hamesha isolated copy."""
    if baked_session_ready():
        return get_isolated_baked_cookies()
    if not cookie_persist_enabled() or not COOKIE_JAR_FILE.exists():
        return []
    try:
        data = _read_cookie_jar_data()
        cookies = list(data.get('cookies') or [])
        if data.get('bootstrapped') or data.get('forever'):
            log.debug('Cookie jar loaded (forever) — %d cookies', len(cookies))
            return cookies
        age = time.time() - float(data.get('ts', 0))
        max_age = int(os.getenv('UIDAI_COOKIE_MAX_AGE_HOURS', '0')) * 3600
        if max_age > 0 and age > max_age:
            log.info('Cookie jar stale (%.0fh) — fresh seed hoga', age / 3600)
            return []
        log.debug('Cookie jar loaded — %d cookies', len(cookies))
        return cookies
    except Exception as e:
        log.warning('Cookie jar load fail: %s', e)
        return []


def load_playwright_cookies() -> list[dict[str, Any]]:
    """Playwright add_cookies — baked/runtime se isolated."""
    rows: list[dict[str, Any]] = []
    for c in get_isolated_baked_cookies() if baked_session_ready() else load_cookie_jar():
        name = c.get('name')
        value = c.get('value')
        if not name or value is None:
            continue
        domain = (c.get('domain') or '.uidai.gov.in').lstrip()
        if domain and not domain.startswith('.'):
            domain = '.' + domain
        row: dict[str, Any] = {
            'name': name,
            'value': value,
            'domain': domain,
            'path': c.get('path') or '/',
        }
        if c.get('secure'):
            row['secure'] = True
        if c.get('httpOnly'):
            row['httpOnly'] = True
        rows.append(row)
    return rows


def save_cookie_jar(session: requests.Session, *, bootstrapped: bool = False) -> None:
    """Session cookies disk pe — bootstrapped=True → hamesha ke liye."""
    if not cookie_persist_enabled():
        return
    try:
        prev = _read_cookie_jar_data()
        payload: dict[str, Any] = {
            'ts': time.time(),
            'cookies': export_session_cookies(session),
        }
        if bootstrapped or prev.get('bootstrapped') or prev.get('forever'):
            payload['bootstrapped'] = True
            payload['forever'] = True
        COOKIE_JAR_FILE.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        log.info(
            'Cookie jar saved — %d cookies bootstrapped=%s',
            len(payload['cookies']),
            payload.get('bootstrapped', False),
        )
    except Exception as e:
        log.warning('Cookie jar save fail: %s', e)


def mark_cookie_jar_bootstrapped(session: requests.Session | None = None) -> None:
    """Pehli successful site load ke baad — proxy skip, cookies forever."""
    if not cookie_persist_enabled():
        return
    try:
        data = _read_cookie_jar_data()
        if session is not None:
            data['cookies'] = export_session_cookies(session)
        data['bootstrapped'] = True
        data['forever'] = True
        data['ts'] = time.time()
        COOKIE_JAR_FILE.write_text(json.dumps(data, indent=2), encoding='utf-8')
        log.info('Cookie jar bootstrapped — ab hamesha cookies se, bina proxy')
    except Exception as e:
        log.warning('Cookie bootstrap mark fail: %s', e)


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
    force_seed: bool = False,
) -> dict[str, Any]:
    """Bootstrapped jar → sirf load. Pehli baar → portal seed + save."""
    loaded = 0
    if baked_session_ready():
        loaded = apply_isolated_baked_cookies(session)
    elif cookie_persist_enabled():
        loaded = apply_cookie_jar_to_session(session, load_cookie_jar())

    if cookie_jar_ready() and not force_seed:
        summary = cookie_summary(session)
        summary['loaded_from_disk'] = loaded
        summary['cookies_only'] = True
        log.info('Cookies-only session — %s', summary)
        return summary

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
    save_cookie_jar(http_session, bootstrapped=True)
    mark_cookie_jar_bootstrapped(http_session)
    log.info('Browser cookies merged — added=%s before=%s after=%s', added, before['count'], after['count'])
    return {'added': added, 'before': before, 'after': after}
