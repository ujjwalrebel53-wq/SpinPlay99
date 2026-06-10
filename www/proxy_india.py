"""Indian HTTP proxy — auto pick + IP verify (India location)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

# Default Indian proxies (HTTP) — comma list .env se override ho sakti hai
DEFAULT_INDIAN_PROXIES = [
    'http://139.167.218.162:3127',
    'http://103.152.112.162:80',
    'http://103.152.112.145:80',
    'http://45.67.59.98:80',
]


def proxy_list_from_env() -> list[str]:
    raw = os.getenv('UIDAI_PROXY_LIST', '').strip()
    if raw:
        return [p.strip() for p in raw.split(',') if p.strip()]
    one = os.getenv('UIDAI_PROXY', '').strip()
    if one and one.lower() not in ('auto', 'india', 'none', 'no', ''):
        return [one]
    return list(DEFAULT_INDIAN_PROXIES)


def check_proxy(proxy: str, timeout: int = 12) -> dict[str, Any]:
    """Proxy se IP check — country India honi chahiye."""
    handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
    opener = urllib.request.build_opener(handler)
    url = 'http://ip-api.com/json/?fields=status,country,countryCode,city,regionName,query'
    req = urllib.request.Request(url, headers={'User-Agent': 'RebelAdharBot/1.0'})
    with opener.open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())
    if data.get('status') != 'success':
        raise RuntimeError(f'IP check fail: {data}')
    return data


def pick_indian_proxy(proxies: list[str] | None = None) -> tuple[str, dict[str, Any]]:
    """Pehla working Indian proxy return karo."""
    errors: list[str] = []
    for proxy in proxies or proxy_list_from_env():
        try:
            info = check_proxy(proxy)
            if info.get('countryCode') == 'IN':
                return proxy, info
            errors.append(f'{proxy}: {info.get("country")} ({info.get("countryCode")})')
        except Exception as e:
            errors.append(f'{proxy}: {e}')
    raise RuntimeError('Koi Indian proxy kaam nahi kiya.\n' + '\n'.join(errors[:5]))


def format_proxy_line(info: dict[str, Any], proxy: str) -> str:
    city = info.get('city') or info.get('regionName') or 'India'
    ip = info.get('query', '?')
    host = proxy.split('//')[-1].split('@')[-1]
    return f'🇮🇳 VPN India — {city} ({ip} via {host})'
