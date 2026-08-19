#!/usr/bin/env python3
"""Encrypt panel assets for release APK — plaintext never ships in the bundle."""
import hashlib
import json
import os
import struct
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"RBL1"
SALT = b"rebel_panel_assets_v2"


def native_secret() -> bytes:
    enc = bytes([
        0x43, 0x52, 0x40, 0x5f, 0x41, 0x50, 0x50, 0x5f,
        0x53, 0x33, 0x43, 0x52, 0x33, 0x54,
    ])
    return bytes(b ^ 0x23 for b in enc)


def derive_key(version_code: int) -> bytes:
    seed = native_secret() + SALT + str(version_code).encode("utf-8")
    return hashlib.sha256(seed).digest()


def encrypt_blob(key: bytes, plain: bytes) -> bytes:
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, plain, None)
    return MAGIC + iv + ct


def walk_panel(panel_dir: str):
    for root, _, files in os.walk(panel_dir):
        for name in sorted(files):
            path = os.path.join(root, name)
            rel = os.path.relpath(path, panel_dir).replace("\\", "/")
            with open(path, "rb") as f:
                yield rel, f.read()


def main():
    if len(sys.argv) != 4:
        print("usage: pack_encrypted_assets.py <panel_dir> <out_dir> <version_code>", file=sys.stderr)
        sys.exit(1)
    panel_dir, out_dir, version_code = sys.argv[1], sys.argv[2], int(sys.argv[3])
    pack_dir = os.path.join(out_dir, "rbl_pack")
    os.makedirs(pack_dir, exist_ok=True)
    key = derive_key(version_code)
    entries = []
    for rel, data in walk_panel(panel_dir):
        blob = encrypt_blob(key, data)
        blob_name = hashlib.sha256(rel.encode("utf-8")).hexdigest()[:32] + ".bin"
        with open(os.path.join(pack_dir, blob_name), "wb") as f:
            f.write(blob)
        entries.append({"p": rel, "b": blob_name, "s": len(data)})
    manifest_plain = json.dumps({"v": version_code, "f": entries}, separators=(",", ":")).encode("utf-8")
    manifest_enc = encrypt_blob(key, manifest_plain)
    with open(os.path.join(pack_dir, "manifest.bin"), "wb") as f:
        f.write(manifest_enc)
    print(f"packed {len(entries)} files -> {pack_dir}")


if __name__ == "__main__":
    main()
