#!/usr/bin/env python3
"""Mock UIDAI — full aadhar flow + log listener + captcha media (100% offline)."""
from __future__ import annotations

import asyncio
import base64
import json
import uuid
from unittest.mock import MagicMock, patch

from aadhar import AadharSession, run_aadhar, send_captcha_to_bot


FAKE_AUDIO = base64.b64encode(b'ID3fake_mp3_audio_data_' * 20).decode()
FAKE_PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'x' * 300).decode()


def _mock_response(status: int, data: dict) -> MagicMock:
    m = MagicMock()
    m.status_code = status
    m.text = json.dumps(data)
    m.json.return_value = data
    return m


def _route_post(url: str, **_kwargs) -> MagicMock:
    payload = _kwargs.get('payload') or _kwargs.get('json') or {}
    if 'audioCaptcha' in url:
        return _mock_response(200, {
            'transactionId': 'txn-audio-123456',
            'audioBase64': FAKE_AUDIO,
            'captchaImage': FAKE_PNG,
        })
    if 'captchaService' in url:
        return _mock_response(200, {
            'captchaTxnId': 'txn-img-999',
            'captchaImage': FAKE_PNG,
        })
    if 'retrieveEidUid' in url:
        if payload.get('otp'):
            return _mock_response(200, {
                'status': 'Success',
                'responseData': {'eidNumber': '12345678901234'},
            })
        return _mock_response(200, {
            'status': 'Success',
            'responseData': {'otpTxnId': 'otp-txn-phase1'},
        })
    if 'generate/aadhaar/otp' in url:
        return _mock_response(200, {
            'status': 'Success',
            'txnId': 'otp-txn-phase2',
        })
    if 'downloadAadhaarService' in url:
        pdf_b64 = base64.b64encode(b'%PDF-1.4 fake pdf content').decode()
        return _mock_response(200, {
            'status': 'Success',
            'data': {'aadhaarPdf': pdf_b64},
        })
    return _mock_response(500, {'status': 'Error', 'message': 'unknown url'})


async def test_full_flow_mock() -> bool:
    print('\n=== Mock full 2-OTP flow ===')
    logs: list[str] = []

    with patch.object(AadharSession, '_post', side_effect=lambda url, **kw: _route_post(url, **kw)):
        sess = AadharSession(on_log=logs.append)
        sess.setup('KAMAR JAHAN', '7651892956', '01/01/1991')

        r1 = await run_aadhar(sess.phase1_start)
        assert r1.get('needs_captcha'), r1
        assert len(r1.get('audio_bytes') or b'') > 50, 'audio missing'
        assert len(r1.get('image_png') or b'') > 50, 'image missing'
        assert r1.get('captcha_txn_id'), 'txn missing'
        print(f'  Phase1 captcha fetched — logs:{len(logs)} audio:{len(r1["audio_bytes"])}B')

        r1b = await run_aadhar(sess.phase1_otp_manual, 'ab12cd')
        assert r1b.get('otp_ok'), r1b
        print('  Phase1 OTP sent (manual captcha)')

        v1 = await run_aadhar(sess.phase1_verify, '482910')
        assert v1.get('retrieve_ok') and v1.get('eid'), v1
        print(f'  EID: {v1["eid"]}')

        r2 = await run_aadhar(sess.phase2_start)
        assert r2.get('needs_captcha'), r2
        r2b = await run_aadhar(sess.phase2_otp_manual, 'xy34zw')
        assert r2b.get('otp_ok'), r2b
        print('  Phase2 OTP sent (manual captcha)')

        dl = await run_aadhar(sess.phase2_download, '593021')
        assert dl.get('download_ok') and dl.get('pdf_bytes'), dl
        print(f'  PDF: {len(dl["pdf_bytes"])} bytes')
        print(f'  Total logs: {len(logs)} lines')
    print('  PASS')
    return True


async def test_loading_screen_logs() -> bool:
    print('\n=== Loading screen + log listener ===')
    from bot_ui import LoadingScreen

    class FakeMsg:
        text = ''
        async def edit_text(self, t: str) -> None:
            self.text = t

    msg = FakeMsg()
    progress = LoadingScreen(msg, 'KAMAR JAHAN', '7651892956', title='2-OTP PDF', subtitle='Test')
    loop = asyncio.get_running_loop()
    captured: list[str] = []

    def on_log(line: str) -> None:
        captured.append(line)
        asyncio.run_coroutine_threadsafe(progress.log_detail(line), loop)

    with patch.object(AadharSession, '_post', side_effect=lambda url, **kw: _route_post(url, **kw)):
        sess = AadharSession(on_log=on_log)
        await run_aadhar(sess.setup, 'KAMAR JAHAN', '7651892956')
        await run_aadhar(sess.phase1_start)
        await asyncio.sleep(0.4)

    ok = 'Logs' in msg.text and len(captured) >= 8 and 'Audio Captcha' in ''.join(captured)
    print(f'  screen:{len(msg.text)}ch logs:{len(captured)}')
    print(f'  {"PASS" if ok else "FAIL"}')
    return ok


async def test_captcha_send_mock() -> bool:
    print('\n=== Captcha to bot (mock update) ===')
    sent: list[str] = []

    class FakeMessage:
        async def reply_audio(self, **kw):
            sent.append(f'audio:{len(kw.get("audio", b""))}')
        async def reply_photo(self, **kw):
            sent.append(f'photo:{len(kw.get("photo", b""))}')
        async def reply_text(self, t):
            sent.append(f'text:{t[:30]}')

    class FakeUpdate:
        message = FakeMessage()

    result = {
        'captcha_text': 'ab12cd',
        'captcha_txn_id': 'txn-abc',
        'audio_bytes': base64.b64decode(FAKE_AUDIO),
        'image_png': base64.b64decode(FAKE_PNG),
    }
    await send_captcha_to_bot(FakeUpdate(), result, phase='Phase 1')
    ok = any('audio' in s for s in sent) and any('photo' in s for s in sent)
    print(f'  sent: {sent}')
    print(f'  {"PASS" if ok else "FAIL"}')
    return ok


async def main() -> int:
    print('Aadhar MOCK test suite (100% flow verification)')
    tests = [
        await test_full_flow_mock(),
        await test_loading_screen_logs(),
        await test_captcha_send_mock(),
    ]
    passed = sum(tests)
    print(f'\n=== MOCK RESULT: {passed}/{len(tests)} ===')
    return 0 if all(tests) else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
