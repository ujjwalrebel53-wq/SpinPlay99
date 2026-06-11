"""Indian HTTP proxy — 50 pool, benchmarked fastest-first."""

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
# Live-tested working proxy (Gandhinagar) — uidai_baked_session.json
BAKED_PROXY = 'http://117.236.124.166:3128'
CACHE_FILE = Path(__file__).parent / 'proxy_cache.json'
RANKED_FILE = Path(__file__).parent / 'proxy_ranked.json'
SEEDS_FILE = Path(__file__).parent / 'indian_proxy_seeds.txt'
RANKED_MAX_AGE_SEC = int(os.getenv('UIDAI_PROXY_RANK_HOURS', '6')) * 3600

# 50 seeds — benchmark ke baad proxy_ranked.json fastest-first override karta hai
DEFAULT_INDIAN_PROXIES = [
    'http://14.143.222.113:57738',
    'http://14.143.222.113:57788',
    'http://14.143.222.113:10174',
    'http://14.143.222.113:10175',
    'http://14.143.130.210:1111',
    'http://139.167.218.162:3127',
    'http://117.236.124.166:3128',
    'http://117.236.124.166:3129',
    'http://111.92.88.27:3128',
    'http://111.125.242.34:1111',
    'http://111.125.242.34:80',
    'http://219.65.73.81:80',
    'http://27.34.242.98:80',
    'http://152.67.191.232:6800',
    'http://175.101.240.38:80',
    'http://139.59.59.122:8118',
    'http://103.172.254.145:80',
    'http://103.94.52.70:3128',
    'http://117.74.113.104:8080',
    'http://103.155.98.163:8080',
    'http://103.149.162.195:80',
    'http://103.152.112.162:80',
    'http://103.127.1.130:80',
    'http://103.48.68.218:83',
    'http://103.48.71.30:83',
    'http://202.62.75.38:84',
    'http://202.62.84.210:53281',
    'http://103.230.150.58:8080',
    'http://45.249.77.145:83',
    'http://115.247.115.38:8080',
    'http://172.105.62.167:8080',
    'http://103.179.46.49:6789',
    'http://203.115.101.61:82',
    'http://103.74.146.1:82',
    'http://49.229.100.42:8080',
    'http://116.80.90.141:3172',
    'http://116.80.48.236:3172',
    'http://103.153.149.138:8080',
    'http://103.80.118.33:8080',
    'http://52.140.3.27:3333',
    'http://103.152.112.145:80',
    'http://103.152.112.135:80',
    'http://103.152.112.136:80',
    'http://103.152.112.137:80',
    'http://103.152.112.138:80',
    'http://103.152.112.139:80',
    'http://103.152.112.140:80',
    'http://165.227.29.139:80',
    'http://45.67.59.98:80',
    'http://136.233.136.41:48976',
]


def _load_seeds_file() -> list[str]:
    if not SEEDS_FILE.exists():
        return []
    return [x.strip() for x in SEEDS_FILE.read_text(encoding='utf-8').splitlines() if x.strip()]


def load_ranked_proxies(*, max_age_sec: int | None = None) -> list[dict[str, Any]]:
    """proxy_ranked.json — benchmarked fastest first."""
    if not RANKED_FILE.exists():
        return []
    try:
        data = json.loads(RANKED_FILE.read_text(encoding='utf-8'))
        age_limit = max_age_sec if max_age_sec is not None else RANKED_MAX_AGE_SEC
        if age_limit > 0 and time.time() - float(data.get('ts', 0)) > age_limit:
            log.info('proxy_ranked.json stale — seeds use honge')
            return []
        return list(data.get('proxies') or [])
    except Exception as e:
        log.warning('proxy_ranked load fail: %s', e)
        return []


def save_ranked_proxies(rows: list[dict[str, Any]]) -> None:
    payload = {
        'ts': time.time(),
        'proxies': [
            {
                'proxy': r['proxy'],
                'score': r.get('score', r.get('uidai_sec', 999)),
                'city': (r.get('info') or {}).get('city', '?'),
            }
            for r in rows
        ],
    }
    RANKED_FILE.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def ranked_proxy_urls() -> list[str]:
    """Fastest-first URL list — benchmark > seeds > defaults."""
    ranked = load_ranked_proxies()
    if ranked:
        return [r['proxy'] for r in ranked if r.get('proxy')]

    seeds = _load_seeds_file()
    base = seeds or DEFAULT_INDIAN_PROXIES
    seen: set[str] = set()
    out: list[str] = []
    for p in base:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out[:50]


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


def proxy_list_from_env() -> list[str]:
    raw = os.getenv('UIDAI_PROXY_LIST', '').strip()
    if raw:
        items = [p.strip() for p in raw.split(',') if p.strip()]
    else:
        one = os.getenv('UIDAI_PROXY', '').strip()
        if one and one.lower() not in ('auto', 'india', 'none', 'no', ''):
            items = [one]
        else:
            items = ranked_proxy_urls()

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


def fastest_proxy_url() -> str:
    urls = ranked_proxy_urls()
    if urls:
        return urls[0]
    return DEFAULT_INDIAN_PROXIES[0]


def direct_first_enabled() -> bool:
    """Pehle direct + cookies, proxy baad me (agar fallback on)."""
    raw = os.getenv('UIDAI_DIRECT_FIRST', '1').strip().lower()
    if raw in ('0', 'false', 'no', 'off'):
        return False
    if raw in ('1', 'true', 'yes', 'on'):
        return True
    proxy_raw = os.getenv('UIDAI_PROXY', 'auto').strip().lower()
    if proxy_raw in ('none', 'no', 'off', 'direct'):
        return True
    auto = os.getenv('UIDAI_INDIAN_PROXY_AUTO', '0').strip().lower() in ('1', 'true', 'yes', 'on')
    return not auto


def proxy_fallback_enabled() -> bool:
    return os.getenv('UIDAI_PROXY_FALLBACK', '1').strip().lower() in ('1', 'true', 'yes', 'on')


def explicit_proxy_url() -> str | None:
    """User ne khud proxy diya — direct-first skip."""
    raw = os.getenv('UIDAI_PROXY', '').strip()
    if raw and raw.lower() not in ('auto', 'india', 'none', 'no', 'off', 'direct', ''):
        return raw
    return None


def resolve_proxy_fast(*, for_fallback: bool = False) -> str | None:
    """Hot path — explicit proxy > cache/ranked. Direct-first pe None (unless fallback)."""
    explicit = explicit_proxy_url()
    if explicit:
        return explicit
    proxy_raw = os.getenv('UIDAI_PROXY', '').strip().lower()
    if proxy_raw in ('none', 'no', 'off', 'direct'):
        return None
    if direct_first_enabled() and not for_fallback:
        return None
    cached = _load_cache()
    if cached:
        return cached
    try:
        return fastest_proxy_url()
    except Exception:
        return DEFAULT_INDIAN_PROXIES[0] if DEFAULT_INDIAN_PROXIES else None


def resolve_route(
    *,
    probe_ok: bool | None = None,
) -> tuple[str | None, str]:
    """
    (proxy_url, route_label) — direct-first logic.
    probe_ok=True → direct; False → proxy fallback; None → env only.
    """
    explicit = explicit_proxy_url()
    if explicit:
        return explicit, 'proxy'

    proxy_raw = os.getenv('UIDAI_PROXY', 'auto').strip().lower()
    if proxy_raw in ('none', 'no', 'off', 'direct'):
        return None, 'direct'

    if direct_first_enabled() and probe_ok is not False:
        if probe_ok is True or probe_ok is None:
            return None, 'direct'

    if not proxy_fallback_enabled():
        return None, 'direct'

    fast = resolve_proxy_fast(for_fallback=True)
    if fast:
        return fast, 'proxy'
    cached = _load_cache()
    if cached:
        return cached, 'proxy'
    try:
        return fastest_proxy_url(), 'proxy'
    except Exception:
        return (DEFAULT_INDIAN_PROXIES[0] if DEFAULT_INDIAN_PROXIES else None), 'proxy'


def fast_mode() -> bool:
    return os.getenv('UIDAI_FAST', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def proxy_trial_timeout() -> int:
    """Har proxy try ka timeout — default 30s (pehle wala trial)."""
    return int(os.getenv('UIDAI_PROXY_TRIAL_SEC', '30'))


def proxy_cache_enabled() -> bool:
    """Cache hit = instant skip. Bootstrap trial ke liye default band."""
    return os.getenv('UIDAI_PROXY_CACHE', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def _proxy_opener(proxy: str) -> urllib.request.OpenerDirector:
    handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
    return urllib.request.build_opener(handler)


def check_direct_india(timeout: int = 6) -> dict[str, Any] | None:
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
    trial = proxy_trial_timeout()
    host = proxy.split('//')[-1].split('@')[-1]
    t0 = time.monotonic()
    try:
        log.info('Proxy trial start — %s (max %ds)', host, trial)
        info = check_proxy(proxy, timeout=trial)
        if info.get('countryCode') != 'IN':
            log.info('Proxy trial fail — %s not India (%.1fs)', host, time.monotonic() - t0)
            return None
        uidai_s = 5.0
        if require_uidai:
            uidai_s = test_uidai(proxy, timeout=trial)
        elapsed = time.monotonic() - t0
        log.info('Proxy trial OK — %s %s UIDAI %.1fs', host, info.get('city', '?'), elapsed)
        return {
            'proxy': proxy,
            'info': info,
            'uidai_sec': uidai_s,
            'score': uidai_s,
            'trial_sec': elapsed,
        }
    except Exception as e:
        elapsed = time.monotonic() - t0
        log.info('Proxy trial fail — %s %.1fs: %s', host, elapsed, e)
        return None


def pick_ranked_proxies(
    proxies: list[str] | None = None,
    limit: int = 5,
    workers: int = 20,
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


def pick_indian_proxy(
    proxies: list[str] | None = None,
    *,
    limit: int | None = None,
    full_trial: bool = True,
) -> tuple[str, dict[str, Any]]:
    """Sequential proxy trial — har proxy max UIDAI_PROXY_TRIAL_SEC (default 30s)."""
    pool = proxies or proxy_list_from_env()
    if limit:
        pool = pool[:limit]
    pool = pool[:50]
    trial = proxy_trial_timeout()

    use_cache = proxy_cache_enabled() and not full_trial
    if use_cache:
        cached = _load_cache()
        if cached and cached in pool:
            row = score_proxy(cached, require_uidai=True)
            if row:
                log.info('Proxy cache hit — %s', cached)
                return row['proxy'], row['info']
            row = score_proxy(cached, require_uidai=False)
            if row:
                return row['proxy'], row['info']

    log.info('Proxy full trial — %d proxies, %ds each', len(pool), trial)
    for i, proxy in enumerate(pool, 1):
        log.info('Proxy trial %d/%d — %s', i, len(pool), proxy.split('//')[-1])
        row = score_proxy(proxy, require_uidai=True)
        if row:
            if use_cache or proxy_cache_enabled():
                _save_cache(proxy)
            log.info('Proxy picked %s — %.1fs %s', proxy, row.get('trial_sec', row['score']), row['info'].get('city'))
            return proxy, row['info']

    log.warning('UIDAI strict fail — India IP only try')
    for i, proxy in enumerate(pool, 1):
        row = score_proxy(proxy, require_uidai=False)
        if row:
            if use_cache or proxy_cache_enabled():
                _save_cache(proxy)
            return proxy, row['info']

    raise RuntimeError(
        f'{len(pool)} proxy me se koi kaam nahi ({trial}s/try).\n'
        'Chalao: python3 benchmark_proxies.py\n'
        'Ya .env: UIDAI_PROXY=http://14.143.222.113:57738'
    )


def format_proxy_line(info: dict[str, Any], proxy: str) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    host = proxy.split('//')[-1].split('@')[-1]
    return f'🇮🇳 VPN India — {city} ({ip} via {host})'


def format_direct_line(info: dict[str, Any]) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    return f'🇮🇳 Direct India — {city} ({ip})'
