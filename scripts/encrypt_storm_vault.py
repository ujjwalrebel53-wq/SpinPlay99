#!/usr/bin/env python3
"""Generate split XOR blobs for native Firebase vault."""
import os
import secrets

OUT = os.path.join(
    os.path.dirname(__file__), "..", "app", "src", "main", "cpp", "storm_secrets.h"
)

FIELDS = [
    ("url", "https://stormapk-9edea-default-rtdb.asia-southeast1.firebasedatabase.app"),
    ("api", "AIzaSyCuFRrF3_yxait_oOFkDxjdrsZkwno_Uy8"),
    ("pid", "stormapk-9edea"),
    ("bid", "stormapk-9edea.firebasestorage.app"),
    ("aid", "1:353810391693:android:291dcbff91823c3866f8c4"),
    ("sid", "353810391693"),
    ("dom", "stormapk-9edea.firebaseapp.com"),
]

TABLE = secrets.token_bytes(512)


def obf(data: bytes) -> list[int]:
    return [data[i] ^ TABLE[i % len(TABLE)] for i in range(len(data))]


def emit_array(name: str, values: list[int]) -> str:
    lines = [f"static const unsigned char {name}[] = {{"]
    for i in range(0, len(values), 12):
        chunk = values[i:i + 12]
        lines.append("  " + ", ".join(f"0x{v:02x}" for v in chunk) + ",")
    lines.append("};")
    lines.append(f"static const unsigned int {name}_len = {len(values)};")
    return "\n".join(lines)


parts = []
parts.append("// Auto-generated native vault — do not edit\n#pragma once\n\n")
parts.append(emit_array("kCvTable", list(TABLE)))
parts.append("")

for idx, (name, val) in enumerate(FIELDS):
    enc = obf(val.encode("utf-8"))
  # split into two arrays to avoid contiguous plaintext in binary
    half = len(enc) // 2
    a_name = f"kCv_{idx}a"
    b_name = f"kCv_{idx}b"
    parts.append(emit_array(a_name, enc[:half]))
    parts.append("")
    parts.append(emit_array(b_name, enc[half:]))
    parts.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

print(f"Wrote {OUT}")
