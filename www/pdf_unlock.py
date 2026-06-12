"""Unlock UIDAI e-Aadhaar PDF — name prefix + birth year (1920–2020 brute)."""

from __future__ import annotations

import io
import os
import re
from typing import Any

from uidai_api import generate_pdf_password, is_skip_name, normalize_dob, normalize_name

DEFAULT_YEAR_MIN = 1920
DEFAULT_YEAR_MAX = 2020

_NAME_KEYS = (
    'name', 'fullName', 'FullName', 'residentName', 'aadhaarName',
    'nameOnAadhaar', 'nameOnCard', 'customerName', 'applicantName',
    'poiName', 'userName', 'holderName',
)
_DOB_KEYS = (
    'dob', 'dateOfBirth', 'DateOfBirth', 'birthDate', 'birthYear',
    'yob', 'YoB', 'yearOfBirth',
)


def _looks_like_name(val: str) -> bool:
    t = (val or '').strip()
    if len(t) < 3 or len(t) > 80:
        return False
    if is_skip_name(t):
        return False
    if re.fullmatch(r'[\d\s/\-]+', t):
        return False
    return bool(re.search(r'[A-Za-z]', t))


def _normalize_dob_value(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    m = re.fullmatch(r'(\d{2})[/-](\d{2})[/-](\d{4})', s)
    if m:
        return f'{m.group(1)}/{m.group(2)}/{m.group(3)}'
    m2 = re.fullmatch(r'(\d{4})[/-](\d{2})[/-](\d{2})', s)
    if m2:
        return f'{m2.group(3)}/{m2.group(2)}/{m2.group(1)}'
    m3 = re.fullmatch(r'(\d{4})', s)
    if m3:
        return f'01/01/{m3.group(1)}'
    return normalize_dob(s)


def extract_resident_name(data: dict[str, Any] | None) -> str | None:
    """Name on Aadhaar from UIDAI JSON (retrieve / download responses)."""
    if not isinstance(data, dict):
        return None
    for key in _NAME_KEYS:
        val = data.get(key)
        if val and _looks_like_name(str(val)):
            return normalize_name(str(val))
    for nested_key in ('data', 'response', 'responseData', 'result', 'resident', 'poi', 'demographic'):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            found = extract_resident_name(nested)
            if found:
                return found
    return None


def extract_resident_dob(data: dict[str, Any] | None) -> str | None:
    if not isinstance(data, dict):
        return None
    for key in _DOB_KEYS:
        val = data.get(key)
        if val is not None and str(val).strip():
            norm = _normalize_dob_value(val)
            if norm:
                return norm
    for nested_key in ('data', 'response', 'responseData', 'result', 'resident', 'poi', 'demographic'):
        nested = data.get(nested_key)
        if isinstance(nested, dict):
            found = extract_resident_dob(nested)
            if found:
                return found
    return None


def extract_resident_profile(data: dict[str, Any] | None) -> dict[str, str | None]:
    return {
        'name': extract_resident_name(data),
        'dob': extract_resident_dob(data),
    }


def resolve_aadhaar_name(
    *,
    api_name: str | None = None,
    form_name: str = '',
    env_name: str = '',
) -> str:
    """Best name for PDF password — API > real form name > .env UIDAI_NAME > Mr."""
    for candidate in (api_name, form_name, env_name):
        if candidate and not is_skip_name(candidate):
            return normalize_name(candidate)
    return normalize_name(form_name or 'Mr')


def resolve_aadhaar_dob(
    *,
    api_dob: str | None = None,
    form_dob: str | None = None,
) -> str | None:
    for candidate in (api_dob, form_dob):
        norm = normalize_dob(candidate) if candidate else None
        if norm:
            return norm
    return None


def pdf_name_prefix(name: str) -> str:
    """First 4 name letters CAPS — UIDAI e-Aadhaar PDF password prefix."""
    name_clean = re.sub(r'\s+', '', normalize_name(name))
    first_4 = name_clean[:4].upper()
    if len(first_4) < 4:
        first_4 = first_4 + ('A' * (4 - len(first_4)))
    return first_4


def year_range() -> tuple[int, int]:
    try:
        y_min = int(os.getenv('UIDAI_PDF_YEAR_MIN', str(DEFAULT_YEAR_MIN)))
        y_max = int(os.getenv('UIDAI_PDF_YEAR_MAX', str(DEFAULT_YEAR_MAX)))
    except ValueError:
        return DEFAULT_YEAR_MIN, DEFAULT_YEAR_MAX
    if y_min > y_max:
        y_min, y_max = y_max, y_min
    return max(1900, y_min), min(2030, y_max)


def collect_name_prefixes(names: list[str | None]) -> list[str]:
    prefixes: list[str] = []
    for raw in names:
        if not raw or is_skip_name(raw):
            continue
        prefix = pdf_name_prefix(raw)
        if prefix not in prefixes:
            prefixes.append(prefix)
    return prefixes


def build_year_bruteforce_passwords(
    names: list[str | None],
    *,
    year_min: int | None = None,
    year_max: int | None = None,
) -> list[str]:
    """NAME4 + 1920…2020 — UIDAI default when DOB unknown."""
    y_min, y_max = year_range()
    if year_min is not None:
        y_min = year_min
    if year_max is not None:
        y_max = year_max
    seen: set[str] = set()
    out: list[str] = []
    for prefix in collect_name_prefixes(names):
        for year in range(y_min, y_max + 1):
            pwd = f'{prefix}{year}'
            if pwd not in seen:
                seen.add(pwd)
                out.append(pwd)
    return out


def build_pdf_password_candidates(
    names: list[str | None],
    dob: str | None,
) -> list[str]:
    """
    Try known DOB year first, then brute NAME4+1920…2020.
    """
    seen: set[str] = set()
    out: list[str] = []

    def add(pwd: str) -> None:
        if pwd and pwd not in seen:
            seen.add(pwd)
            out.append(pwd)

    for raw in names:
        if not raw or is_skip_name(raw):
            continue
        if dob:
            add(generate_pdf_password(raw, dob))
        add(generate_pdf_password(raw, None))

    for pwd in build_year_bruteforce_passwords(names):
        add(pwd)
    return out


def unlock_eaadhaar_pdf(
    pdf_bytes: bytes,
    passwords: list[str],
) -> tuple[bytes | None, str | None]:
    """Decrypt e-Aadhaar PDF. Returns (unlocked_bytes, password_used)."""
    if not pdf_bytes:
        return None, None
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return None, None

    for pwd in passwords:
        if not pwd:
            continue
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            if reader.is_encrypted:
                if reader.decrypt(pwd) == 0:
                    continue
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            return buf.getvalue(), pwd
        except Exception:
            continue
    return None, None
