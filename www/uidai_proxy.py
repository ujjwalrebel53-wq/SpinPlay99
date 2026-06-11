"""Optional explicit UIDAI forward proxy — e.g. Indian VPS from cloud bot."""

from __future__ import annotations

import os
from urllib.parse import urlparse


def proxy_url() -> str | None:
    raw = os.getenv('UIDAI_PROXY', '').strip()
    if not raw or raw.lower() in ('none', 'no', 'off', 'direct', 'auto', 'india', ''):
        return None
    return raw


def requests_proxies() -> dict[str, str] | None:
    url = proxy_url()
    if not url:
        return None
    return {'http': url, 'https': url}


def playwright_proxy() -> dict[str, str] | None:
    url = proxy_url()
    if not url:
        return None
    p = urlparse(url)
    scheme = p.scheme or 'http'
    host = p.hostname
    if not host:
        return None
    port = p.port or (443 if scheme == 'https' else 80)
    out: dict[str, str] = {'server': f'{scheme}://{host}:{port}'}
    if p.username:
        out['username'] = p.username
        out['password'] = p.password or ''
    return out


def connection_label() -> str:
    url = proxy_url()
    if not url:
        return 'Direct connection'
    host = urlparse(url).hostname or url
    return f'UIDAI via proxy ({host})'
