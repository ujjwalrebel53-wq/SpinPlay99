"""Indian HTTP proxy — parallel fast pick + UIDAI reachability test."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

log = logging.getLogger('proxy-india')

UIDAI_TEST_URL = 'https://myaadhaar.uidai.gov.in/retrieve-eid-uid'

# Indian HTTP proxies — fast parallel test, .env se override
DEFAULT_INDIAN_PROXIES = [
    'http://139.167.218.162:3127',
    'http://103.152.112.162:80',
    'http://103.152.112.145:80',
    'http://45.67.59.98:80',
    'http://103.152.112.135:80',
    'http://103.152.112.136:80',
    'http://103.152.112.137:80',
    'http://103.152.112.138:80',
    'http://103.152.112.139:80',
    'http://103.152.112.140:80',
    'http://103.152.112.141:80',
    'http://103.152.112.142:80',
    'http://103.152.112.143:80',
    'http://103.152.112.144:80',
    'http://103.152.112.146:80',
    'http://103.152.112.147:80',
    'http://103.152.112.148:80',
    'http://103.152.112.149:80',
    'http://103.152.112.150:80',
    'http://165.227.29.139:80',
    'http://117.74.113.104:8080',
    'http://103.127.1.130:80',
    'http://103.94.52.70:3128',
    'http://103.155.98.163:8080',
    'http://103.149.162.195:80',
]


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
    # unique, order preserve
    seen: set[str] = set()
    out: list[str] = []
    for p in items:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _proxy_opener(proxy: str) -> urllib.request.OpenerDirector:
    handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
    return urllib.request.build_opener(handler)


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
    """UIDAI HEAD test — seconds return, fail = raise."""
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


def score_proxy(proxy: str) -> dict[str, Any] | None:
    """Ek proxy score — None = fail."""
    try:
        info = check_proxy(proxy, timeout=5)
        if info.get('countryCode') != 'IN':
            log.debug('skip %s country=%s', proxy, info.get('countryCode'))
            return None
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


def pick_indian_proxy(proxies: list[str] | None = None) -> tuple[str, dict[str, Any]]:
    ranked = pick_ranked_proxies(proxies, limit=1)
    if not ranked:
        raise RuntimeError('Koi Indian proxy kaam nahi kiya — UIDAI_PROXY_LIST .env me dalo')
    best = ranked[0]
    return best['proxy'], best['info']


def pick_ranked_proxies(
    proxies: list[str] | None = None,
    limit: int = 5,
    workers: int = 12,
) -> list[dict[str, Any]]:
    """Parallel test — fastest Indian + UIDAI reachable proxies."""
    pool = proxies or proxy_list_from_env()
    log.info('Proxy parallel test — %d candidates', len(pool))
    results: list[dict[str, Any]] = []
    workers = min(workers, max(1, len(pool)))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(score_proxy, p): p for p in pool}
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

    results.sort(key=lambda x: x['score'])
    return results[:limit]


def format_proxy_line(info: dict[str, Any], proxy: str) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    host = proxy.split('//')[-1].split('@')[-1]
    return f'🇮🇳 VPN India — {city} ({ip} via {host})'
