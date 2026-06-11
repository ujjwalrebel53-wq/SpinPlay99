"""UIDAI audio captcha — fetch + optional Whisper decode (foreign VPS friendly)."""

from __future__ import annotations

import base64
import io
import logging
import os
import re
import tempfile
from typing import Any

log = logging.getLogger('audio-captcha')

_WHISPER_MODEL = None


def whisper_enabled() -> bool:
    return os.getenv('UIDAI_WHISPER', '0').strip().lower() in ('1', 'true', 'yes', 'on')


def _load_whisper():
    global _WHISPER_MODEL
    if _WHISPER_MODEL is not None:
        return _WHISPER_MODEL
    if not whisper_enabled():
        return None
    try:
        import whisper  # type: ignore

        model_name = os.getenv('UIDAI_WHISPER_MODEL', 'base').strip() or 'base'
        log.info('Loading Whisper model %s…', model_name)
        _WHISPER_MODEL = whisper.load_model(model_name)
        return _WHISPER_MODEL
    except Exception as e:
        log.warning('Whisper unavailable: %s', e)
        return None


def normalize_captcha_text(text: str) -> str:
    t = re.sub(r'[^a-zA-Z0-9]', '', (text or '').strip().lower())
    return t[:8]


def decode_audio_captcha(audio_bytes: bytes, *, mime: str = 'audio/wav') -> str | None:
    """Return captcha letters/digits from audio bytes, or None if STT unavailable."""
    if not audio_bytes or len(audio_bytes) < 100:
        return None

    model = _load_whisper()
    if model is None:
        return None

    suffix = '.wav'
    if 'mpeg' in mime or audio_bytes[:3] == b'ID3' or audio_bytes[:2] == b'\xff\xfb':
        suffix = '.mp3'

    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            path = tmp.name

        result = model.transcribe(path, language='en', fp16=False)
        raw = str(result.get('text') or '')
        cap = normalize_captcha_text(raw)
        if len(cap) >= 4:
            log.info('Whisper captcha: %s -> %s', raw[:40], cap)
            return cap
        log.warning('Whisper too short: %r', raw)
        return None
    except Exception as e:
        log.warning('Whisper decode fail: %s', e)
        return None
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


def parse_captcha_generation(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize captcha API JSON — image/audio txn ids."""
    txn = (
        data.get('captchaTxnId')
        or data.get('captchaTxnID')
        or data.get('transactionId')
        or data.get('txnId')
        or _deep(data, 'data', 'captchaTxnId')
    )
    image_b64 = (
        data.get('captchaImage')
        or data.get('image')
        or data.get('captcha')
        or _deep(data, 'data', 'captchaImage')
    )
    audio_b64 = (
        data.get('audioCaptcha')
        or data.get('audio')
        or data.get('audioBase64')
        or _deep(data, 'data', 'audioCaptcha')
    )
    audio_mime = str(data.get('audioMime') or data.get('mimeType') or 'audio/wav')

    image_png = b''
    if image_b64:
        image_png = _b64_bytes(image_b64)
    audio_bytes = b''
    if audio_b64:
        audio_bytes = _b64_bytes(audio_b64)

    return {
        'captchaTxnId': str(txn).strip() if txn else '',
        'image_png': image_png,
        'audio_bytes': audio_bytes,
        'audio_mime': audio_mime,
        'raw': data,
    }


def _deep(obj: Any, *keys: str) -> Any:
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def _b64_bytes(val: Any) -> bytes:
    if isinstance(val, bytes):
        return val
    s = str(val or '').strip()
    if s.startswith('data:'):
        s = s.split(',', 1)[-1]
    try:
        return base64.b64decode(s)
    except Exception:
        return b''


def audio_to_wav_bytes(audio_bytes: bytes, mime: str = 'audio/wav') -> bytes:
    """Convert mp3/other to wav when pydub+ffmpeg available."""
    if not audio_bytes:
        return b''
    if mime.endswith('wav') or audio_bytes[:4] == b'RIFF':
        return audio_bytes
    try:
        from pydub import AudioSegment  # type: ignore

        fmt = 'mp3' if 'mpeg' in mime or audio_bytes[:3] == b'ID3' else 'mp3'
        seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        out = io.BytesIO()
        seg.export(out, format='wav')
        return out.getvalue()
    except Exception as e:
        log.debug('pydub convert skip: %s', e)
        return audio_bytes
