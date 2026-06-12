"""Unlock UIDAI e-Aadhaar PDF — name + DOB year password."""

from __future__ import annotations

import io
import re
from typing import Any

from uidai_api import generate_pdf_password, is_skip_name, normalize_dob, normalize_name

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


def build_pdf_password_candidates(
    names: list[str | None],
    dob: str | None,
) -> list[str]:
    """UIDAI PDF passwords to try — first 4 name letters CAPS + birth year."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        if not raw or is_skip_name(raw):
            continue
        pwd = generate_pdf_password(raw, dob)
        if pwd and pwd not in seen:
            seen.add(pwd)
            out.append(pwd)
        if dob:
            year = dob.strip().split('/')[-1]
            short = generate_pdf_password(raw, None)
            if year and len(short) >= 4:
                alt = short[:4] + year
                if alt not in seen:
                    seen.add(alt)
                    out.append(alt)
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
