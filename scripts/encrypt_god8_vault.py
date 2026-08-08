#!/usr/bin/env python3
"""Generate native Firebase vault blobs for god8-208ac Chatee APK."""
import os
import secrets

OUT = os.path.join(
    os.path.dirname(__file__), "..", "app", "src", "main", "cpp", "storm_secrets.h"
)

FIELDS = [
    ("url", "https://god8-208ac-default-rtdb.asia-southeast1.firebasedatabase.app"),
    ("api", "AIzaSyAUMQiQExYiF_FdetBg7OrSKHp0di7JdjM"),
    ("pid", "god8-208ac"),
    ("bid", "god8-208ac.firebasestorage.app"),
    ("aid", "1:298028302827:android:55a43383024e987e5cd9ae"),
    ("sid", "298028302827"),
    ("dom", "god8-208ac.firebaseapp.com"),
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
parts.append("// Auto-generated native vault — god8-208ac\n#pragma once\n\n")
parts.append(emit_array("kCvTable", list(TABLE)))
parts.append("")

for idx, (name, val) in enumerate(FIELDS):
    enc = obf(val.encode("utf-8"))
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
