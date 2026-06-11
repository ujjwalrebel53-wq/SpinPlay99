"""Indian HTTP proxy — parallel fast pick + UIDAI reachability test."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

log = logging.getLogger('proxy-india')

UIDAI_TEST_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'
CACHE_FILE = Path(__file__).parent / 'proxy_cache.json'

# Verified / high-priority Indian proxies (pehle try)
DEFAULT_INDIAN_PROXIES = [
    'http://139.167.218.162:3127',
    'http://117.236.124.166:3128',
    'http://111.92.88.27:3128',
    'http://103.172.254.145:80',
    'http://103.94.52.70:3128',
    'http://117.74.113.104:8080',
    'http://103.155.98.163:8080',
    'http://103.149.162.195:80',
    'http://103.152.112.162:80',
    'http://45.67.59.98:80',
    'http://165.227.29.139:80',
    'http://103.127.1.130:80',
]

LIVE_PROXY_URL = 'https://raw.githubusercontent.com/stormsia/proxy-list/main/http.txt'


def _load_cache() -> str | None:
    if not CACHE_FILE.exists():
        return None
    try:
        data = json.loads(CACHE_FILE.read_text(encoding='utf-8'))
        p = (data.get('proxy') or '').strip()
        return p or None
    except Exception:
        return None


def _save_cache(proxy: str) -> None:
    try:
        CACHE_FILE.write_text(
            json.dumps({'proxy': proxy, 'ts': int(time.time())}, indent=2),
            encoding='utf-8',
        )
    except Exception as e:
        log.debug('proxy cache save fail: %s', e)


def _fetch_live_proxies(limit: int = 40) -> list[str]:
    """Optional live list — stormsia HTTP proxies."""
    try:
        req = urllib.request.Request(LIVE_PROXY_URL, headers={'User-Agent': 'RebelAdharBot/1.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            lines = resp.read().decode().splitlines()
        out: list[str] = []
        for line in lines:
            p = line.strip()
            if p.startswith('http://') or p.startswith('https://'):
                out.append(p if p.startswith('http') else f'http://{p}')
            if len(out) >= limit:
                break
        return out
    except Exception as e:
        log.debug('live proxy fetch fail: %s', e)
        return []


def proxy_list_from_env() -> list[str]:
    raw = os.getenv('UIDAI_PROXY_LIST', '').strip()
    if raw:
        items = [p.strip() for p in raw.split(',') if p.strip()]
    else:
        one = os.getenv('UIDAI_PROXY', '').strip()
        if one and one.lower() not in ('auto', 'india', 'none', 'no', ''):
            items = [one]
        else:
            items = list(DEFAULT_INDIAN_PROXIES)
            items.extend(_fetch_live_proxies(30))
    seen: set[str] = set()
    out: list[str] = []
    cached = _load_cache()
    if cached:
        out.append(cached)
        seen.add(cached)
    for p in items:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _proxy_opener(proxy: str) -> urllib.request.OpenerDirector:
    handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
    return urllib.request.build_opener(handler)


def check_direct_india(timeout: int = 6) -> dict[str, Any] | None:
    """Server India me ho to proxy ki zaroorat nahi."""
    try:
        url = 'http://ip-api.com/json/?fields=status,country,countryCode,city,regionName,query'
        req = urllib.request.Request(url, headers={'User-Agent': 'RebelAdharBot/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        if data.get('status') == 'success' and data.get('countryCode') == 'IN':
            return data
    except Exception as e:
        log.debug('direct india check fail: %s', e)
    return None


def check_proxy(proxy: str, timeout: int = 6) -> dict[str, Any]:
    opener = _proxy_opener(proxy)
    url = 'http://ip-api.com/json/?fields=status,country,countryCode,city,regionName,query'
    req = urllib.request.Request(url, headers={'User-Agent': 'RebelAdharBot/1.0'})
    with opener.open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())
    if data.get('status') != 'success':
        raise RuntimeError(f'IP check fail: {data}')
    return data


def test_uidai(proxy: str, timeout: int = 10) -> float:
    opener = _proxy_opener(proxy)
    req = urllib.request.Request(
        UIDAI_TEST_URL,
        method='HEAD',
        headers={
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile',
            'Accept': 'text/html',
        },
    )
    t0 = time.monotonic()
    with opener.open(req, timeout=timeout) as resp:
        if resp.status >= 500:
            raise RuntimeError(f'HTTP {resp.status}')
    return time.monotonic() - t0


def score_proxy(proxy: str, *, require_uidai: bool = True) -> dict[str, Any] | None:
    try:
        info = check_proxy(proxy, timeout=5)
        if info.get('countryCode') != 'IN':
            return None
        uidai_s = 5.0
        if require_uidai:
            uidai_s = test_uidai(proxy, timeout=12)
        return {
            'proxy': proxy,
            'info': info,
            'uidai_sec': uidai_s,
            'score': uidai_s,
        }
    except Exception as e:
        log.debug('proxy fail %s: %s', proxy, e)
        return None


def pick_ranked_proxies(
    proxies: list[str] | None = None,
    limit: int = 5,
    workers: int = 12,
    *,
    require_uidai: bool = True,
    stop_early: bool = False,
) -> list[dict[str, Any]]:
    pool = proxies or proxy_list_from_env()
    log.info('Proxy parallel test — %d candidates (uidai=%s)', len(pool), require_uidai)
    results: list[dict[str, Any]] = []
    workers = min(workers, max(1, len(pool)))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(score_proxy, p, require_uidai=require_uidai) for p in pool]
        for fut in as_completed(futs):
            row = fut.result()
            if row:
                results.append(row)
                log.info(
                    'Proxy OK %s — %s UIDAI %.1fs',
                    row['proxy'],
                    row['info'].get('city', '?'),
                    row['uidai_sec'],
                )
                if stop_early and len(results) >= limit:
                    break

    results.sort(key=lambda x: x['score'])
    return results[:limit]


def pick_indian_proxy(proxies: list[str] | None = None) -> tuple[str, dict[str, Any]]:
    cached = _load_cache()
    if cached:
        row = score_proxy(cached, require_uidai=True)
        if row:
            log.info('Proxy cache hit — %s', cached)
            return row['proxy'], row['info']
        log.info('Proxy cache stale — %s', cached)

    ranked = pick_ranked_proxies(proxies, limit=1, require_uidai=True, stop_early=True)
    if not ranked:
        log.warning('Strict proxy test fail — trying India IP only')
        ranked = pick_ranked_proxies(proxies, limit=1, require_uidai=False, stop_early=True)
    if not ranked:
        raise RuntimeError(
            'Koi Indian proxy kaam nahi kiya.\n'
            '.env me set karo: UIDAI_PROXY=http://117.236.124.166:3128'
        )
    best = ranked[0]
    _save_cache(best['proxy'])
    return best['proxy'], best['info']


def format_proxy_line(info: dict[str, Any], proxy: str) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    host = proxy.split('//')[-1].split('@')[-1]
    return f'🇮🇳 VPN India — {city} ({ip} via {host})'


def format_direct_line(info: dict[str, Any]) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    return f'🇮🇳 Direct India — {city} ({ip})'
