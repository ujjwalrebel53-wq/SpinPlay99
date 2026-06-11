#!/usr/bin/env python3
"""50 Indian proxy benchmark — fastest UIDAI load pehle."""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from proxy_india import (
    RANKED_FILE,
    check_proxy,
    save_ranked_proxies,
    score_proxy,
)

WWW = Path(__file__).parent


def gather_candidates() -> list[str]:
    candidates: list[str] = []

    def pull(url: str, limit: int = 200) -> None:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'RebelAdharBot/2.0'})
            with urllib.request.urlopen(req, timeout=20) as resp:
                for line in resp.read().decode().splitlines():
                    p = line.strip()
                    if not p or ':' not in p:
                        continue
                    if not p.startswith('http'):
                        p = f'http://{p}'
                    candidates.append(p)
                    if len(candidates) >= limit:
                        return
        except Exception as exc:
            print(f'  skip {url[:50]}: {exc}', file=sys.stderr)

    # India APIs
    for page in range(1, 6):
        pull(
            f'https://proxylist.geonode.com/api/proxy-list?limit=100&page={page}'
            f'&sort_by=speed&sort_type=asc&country=IN&protocols=http',
            limit=999,
        )
    pull(
        'https://api.proxyscrape.com/v2/?request=displayproxies'
        '&protocol=http&timeout=5000&country=IN&ssl=all&anonymity=all',
        limit=999,
    )
    pull('https://raw.githubusercontent.com/stormsia/proxy-list/main/http.txt', limit=120)

    # Curated India seeds
    seeds = Path(__file__).parent.joinpath('indian_proxy_seeds.txt')
    if seeds.exists():
        candidates.extend(x.strip() for x in seeds.read_text().splitlines() if x.strip())

    seen: set[str] = set()
    out: list[str] = []
    for p in candidates:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def benchmark_pool(max_proxies: int = 50, workers: int = 25) -> list[dict]:
    pool = gather_candidates()
    print(f'Testing {len(pool)} candidates…')

    uidai_ok: list[dict] = []
    india_ok: list[dict] = []

    def test_one(proxy: str) -> tuple[str, dict] | None:
        row = score_proxy(proxy, require_uidai=True)
        if row:
            return 'uidai', row
        try:
            info = check_proxy(proxy, 5)
            if info.get('countryCode') == 'IN':
                return 'india', {
                    'proxy': proxy,
                    'info': info,
                    'uidai_sec': 25.0,
                    'score': 25.0,
                }
        except Exception:
            pass
        return None

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(test_one, p): p for p in pool}
        for fut in as_completed(futs):
            hit = fut.result()
            if not hit:
                continue
            kind, row = hit
            if kind == 'uidai':
                uidai_ok.append(row)
                print(f"  UIDAI {row['uidai_sec']:.1f}s {row['proxy']} {row['info'].get('city', '?')}")
            else:
                india_ok.append(row)
                print(f"  India  {row['proxy']} {row['info'].get('city', '?')}")

    uidai_ok.sort(key=lambda x: x['score'])
    used = {r['proxy'] for r in uidai_ok}
    india_ok = [r for r in india_ok if r['proxy'] not in used]
    ranked = uidai_ok + india_ok

    for p in pool:
        if len(ranked) >= max_proxies:
            break
        if p not in {r['proxy'] for r in ranked}:
            ranked.append({
                'proxy': p,
                'info': {'city': '?'},
                'score': 999.0,
                'uidai_sec': 999.0,
            })

    return ranked[:max_proxies]


def main() -> None:
    t0 = time.monotonic()
    ranked = benchmark_pool(50)
    save_ranked_proxies(ranked)
    print(f'\nDone — {len(ranked)} proxies → {RANKED_FILE}')
    if ranked:
        top = ranked[0]
        print(f"Fastest: {top['proxy']} ({top.get('info', {}).get('city', '?')}) {top['score']:.1f}s")
    print(f'Elapsed {time.monotonic() - t0:.0f}s')


if __name__ == '__main__':
    main()
