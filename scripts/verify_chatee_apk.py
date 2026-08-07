#!/usr/bin/env python3
"""Verify release APK does not contain plaintext Storm Firebase strings."""
import sys
import zipfile

LEAKS = [
    "stormapk-9edea",
    "AIzaSyCuFRrF3_yxait_oOFkDxjdrsZkwno_Uy8",
    "stormapk-9edea-default-rtdb",
    "google-services.json",
]

apk = sys.argv[1] if len(sys.argv) > 1 else "app/build/outputs/apk/release/app-release.apk"
z = zipfile.ZipFile(apk)
found = []
for name in z.namelist():
    if name.endswith((".dex", ".xml", ".json", ".txt", ".html", ".properties")):
        try:
            data = z.read(name)
        except Exception:
            continue
        text = data.decode("utf-8", errors="ignore")
        for needle in LEAKS:
            if needle in text:
                found.append((needle, name))
print(f"Checked: {apk}")
if found:
    print("LEAKS FOUND:")
    for n, f in found:
        print(f"  {n} in {f}")
    sys.exit(1)
print("OK — no plaintext Storm Firebase markers in scanned APK entries")
