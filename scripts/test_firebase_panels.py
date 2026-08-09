#!/usr/bin/env python3
"""Validate Rebel Panel device + phone logic against known Firebase projects."""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "rebel-panel" / "data" / "apk_firebase_report.csv"

EXTRA_FIREBASES = [
    {
        "name": "simadevi",
        "databaseURL": "https://simadevi-f42fc-default-rtdb.firebaseio.com",
        "apiKey": "",
        "deviceNode": "user_data",
    }
]

HEX_RE = re.compile(r"^[0-9a-f]{8,32}$", re.I)
COMMAND_KEYS = {
    "command",
    "messagetext",
    "sendsms",
    "webhookevent",
    "cmd",
    "action",
    "targetdeviceid",
}


def fetch_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def auth_suffix(api_key: str, shallow: bool = False) -> str:
    if not api_key:
        return "?shallow=true" if shallow else ""
    sep = "?auth=" if "?" not in api_key else "&auth="
    suffix = f"{sep}{urllib.parse.quote(api_key, safe='')}" if api_key else ""
    if shallow:
        return ("?shallow=true" + suffix.replace("?", "&", 1)) if suffix else "?shallow=true"
    return suffix


def record_has_command_shape(raw: dict) -> bool:
    if not isinstance(raw, dict):
        return False
    keys = {k.lower() for k in raw}
    return bool(keys & COMMAND_KEYS)


def extract_device_phone(raw: dict, node: str = "") -> str:
    if not isinstance(raw, dict):
        return ""
    if node == "clients" and record_has_command_shape(raw):
        return ""
    sim_keys = [
        "phone_number",
        "mobNo",
        "mobile_no",
        "sim_number",
        "device_phone",
        "user_phone",
        "primary_phone",
    ]
    for key in sim_keys:
        val = raw.get(key)
        if val:
            digits = re.sub(r"\D", "", str(val))
            if len(digits) >= 10:
                return digits[-10:]
    if not record_has_command_shape(raw):
        for key in ("phone", "mobile", "cell", "contact_no"):
            val = raw.get(key)
            if val:
                digits = re.sub(r"\D", "", str(val))
                if len(digits) >= 10:
                    return digits[-10:]
    return ""


def count_devices(url: str, api_key: str, preferred_node: str) -> dict:
    base = url.rstrip("/")
    nodes = []
    for node in (preferred_node, "user_list", "user_data", "clients", "devices", "Verify_Device"):
        if node and node not in nodes:
            nodes.append(node)

    device_ids: set[str] = set()
    phones: Counter[str] = Counter()
    phone_sources: Counter[str] = Counter()
    sms_devices = 0

    for node in nodes:
        try:
            shallow = fetch_json(
                f"{base}/{node}.json{auth_suffix(api_key, shallow=True)}",
                timeout=25,
            )
        except Exception:
            continue
        if not isinstance(shallow, dict):
            continue
        for dev_id in shallow:
            if not HEX_RE.fullmatch(str(dev_id)):
                continue
            device_ids.add(dev_id)

    for node in ("user_list", "user_data", "clients"):
        try:
            data = fetch_json(f"{base}/{node}.json{auth_suffix(api_key)}", timeout=35)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        for dev_id, raw in data.items():
            if not HEX_RE.fullmatch(str(dev_id)) or not isinstance(raw, dict):
                continue
            device_ids.add(dev_id)
            phone = extract_device_phone(raw, node)
            if phone:
                phones[phone] += 1
                phone_sources[node] += 1

    for sms_root in ("messages", "user_sms", "sms_backup"):
        try:
            shallow = fetch_json(
                f"{base}/{sms_root}.json{auth_suffix(api_key, shallow=True)}",
                timeout=20,
            )
        except Exception:
            continue
        if isinstance(shallow, dict):
            sms_devices = max(sms_devices, len(shallow))

    top_phone, top_count = phones.most_common(1)[0] if phones else ("", 0)
    unique_phones = len(phones)
    broadcast = top_count >= 5 and unique_phones <= 3

    return {
        "devices": len(device_ids),
        "phones": unique_phones,
        "top_phone": top_phone,
        "top_phone_count": top_count,
        "broadcast_bug": broadcast,
        "sms_devices": sms_devices,
        "phone_sources": dict(phone_sources),
    }


def load_firebases():
    items = []
    if CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            seen = set()
            for row in reader:
                url = (row.get("databaseURL") or "").strip()
                if not url or url in seen or "yourfirebasio" in url or url.endswith("-default-rtdb.firebaseio.com/"):
                    if url.endswith("-default-rtdb.firebaseio.com/"):
                        pass
                if not url or "://" not in url:
                    continue
                seen.add(url)
                items.append(
                    {
                        "name": (row.get("projectId") or url.split("//")[1].split(".")[0])[:28],
                        "databaseURL": url,
                        "apiKey": (row.get("apiKey") or "").strip(),
                        "deviceNode": (row.get("deviceNode") or "user_list").strip() or "user_list",
                    }
                )
    for item in EXTRA_FIREBASES:
        items.append(item)
    return items


def main() -> int:
    import urllib.parse  # noqa: WPS433

    globals()["urllib"] = __import__("urllib")
    firebases = load_firebases()
    print(f"Testing {len(firebases)} Firebase projects...\n")
    ok = 0
    bad = 0
    for fb in firebases:
        name = fb["name"]
        url = fb["databaseURL"]
        try:
            stats = count_devices(url, fb.get("apiKey", ""), fb.get("deviceNode", "user_list"))
        except Exception as exc:
            print(f"[FAIL] {name}: {exc}")
            bad += 1
            continue
        status = "OK"
        if stats["broadcast_bug"]:
            status = "PHONE-BUG"
            bad += 1
        elif stats["devices"] == 0:
            status = "EMPTY"
            bad += 1
        else:
            ok += 1
        print(
            f"[{status}] {name}: devices={stats['devices']} phones={stats['phones']} "
            f"sms={stats['sms_devices']} top={stats['top_phone']}x{stats['top_phone_count']}"
        )
    print(f"\nSummary: ok={ok} issues={bad}")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
