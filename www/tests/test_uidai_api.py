"""Unit tests — uidai_api (no network)."""
import json
import unittest

from uidai_api import (
    BOT_ENGINE_VERSION,
    PLACEHOLDER_NAME,
    build_download_otp_payload,
    build_download_pdf_payload,
    build_otp_payload,
    extract_aadhaar_number,
    is_skip_name,
    normalize_name,
    parse_download_response,
    parse_uidai_response,
    summarize_logs,
)


class TestUidaiApi(unittest.TestCase):
    def test_version(self) -> None:
        self.assertEqual(BOT_ENGINE_VERSION, '2.6.2')

    def test_captcha_bypass_payload(self) -> None:
        p = build_otp_payload(
            name='Mr',
            mobile='7651892956',
            captcha='',
            captcha_txn_id='txn-abc',
            captcha_bypass=True,
        )
        self.assertIsNone(p['captcha'])
        self.assertEqual(p['captchaTxnId'], 'txn-abc')

    def test_build_download_payloads(self) -> None:
        otp_p = build_download_otp_payload(
            uid='123456789012',
            captcha='Ab12',
            captcha_txn_id='txn-1',
        )
        self.assertEqual(otp_p['uid'], '123456789012')
        self.assertIsNone(otp_p['otp'])
        pdf_p = build_download_pdf_payload(
            uid='123456789012',
            captcha='ab12',
            captcha_txn_id='txn-1',
            otp='482910',
            otp_txn_id='otp-txn',
        )
        self.assertEqual(pdf_p['otp'], '482910')

    def test_extract_aadhaar_number(self) -> None:
        self.assertEqual(
            extract_aadhaar_number({'data': {'uid': '123456789012'}}),
            '123456789012',
        )

    def test_parse_download_otp(self) -> None:
        body = json.dumps({'messageEnglish': 'OTP sent to registered mobile', 'otpTxnId': 'x'})
        ok, _, extra = parse_download_response(200, body)
        self.assertTrue(ok)
        self.assertEqual(extra.get('reason'), 'download_otp_sent')

    def test_normalize_name_skip(self) -> None:
        self.assertEqual(normalize_name('skip'), PLACEHOLDER_NAME)
        self.assertEqual(normalize_name('Mr'), PLACEHOLDER_NAME)
        self.assertEqual(normalize_name('mr.'), PLACEHOLDER_NAME)
        self.assertTrue(is_skip_name('?'))

    def test_normalize_name_real(self) -> None:
        self.assertEqual(normalize_name('kamar jahan'), 'KAMAR JAHAN')

    def test_build_otp_payload(self) -> None:
        p = build_otp_payload(
            name='KAMAR JAHAN',
            mobile='7651892956',
            captcha='Ab12cd',
            captcha_txn_id='txn123',
            option='UID',
        )
        self.assertEqual(p['dob'], None)
        self.assertEqual(p['captcha'], 'ab12cd')
        self.assertEqual(p['captchaTxnId'], 'txn123')
        self.assertIsNone(p['otp'])

    def test_parse_otp_success(self) -> None:
        body = json.dumps({
            'messageEnglish': 'OTP sent successfully to registered mobile number',
            'status': 200,
        })
        ok, msg, _ = parse_uidai_response(200, body)
        self.assertTrue(ok)
        self.assertIn('OTP sent', msg)

    def test_parse_invalid_captcha(self) -> None:
        body = json.dumps({
            'errorCode': 'REU_VAL_CAP_INF_007',
            'errorDetails': {
                'messageEnglish': 'You have entered an invalid Captcha. Please enter the correct Captcha to proceed.',
            },
            'status': 400,
        })
        ok, msg, extra = parse_uidai_response(200, body)
        self.assertFalse(ok)
        self.assertEqual(extra.get('reason'), 'invalid_captcha')

    def test_parse_captcha_expired(self) -> None:
        body = json.dumps({
            'errorDetails': {'messageEnglish': 'Captcha timed out. Please refresh the captcha'},
        })
        ok, _, extra = parse_uidai_response(200, body)
        self.assertFalse(ok)
        self.assertEqual(extra.get('reason'), 'captcha_expired')

    def test_summarize_logs(self) -> None:
        logs = [{'l': 'info', 'm': 'test', 'd': {'a': 1}}]
        s = summarize_logs(logs)
        self.assertIn('[info] test', s)

    def test_parse_retrieve_success(self) -> None:
        body = json.dumps({
            'messageEnglish': 'Your Aadhaar number has been sent to your registered mobile number',
        })
        ok, _, extra = parse_uidai_response(200, body)
        self.assertTrue(ok)
        self.assertEqual(extra.get('reason'), 'retrieve_ok')

    def test_parse_invalid_otp(self) -> None:
        body = json.dumps({
            'errorDetails': {'messageEnglish': 'Invalid OTP entered. Please try again.'},
        })
        ok, _, extra = parse_uidai_response(200, body)
        self.assertFalse(ok)
        self.assertEqual(extra.get('reason'), 'invalid_otp')


if __name__ == '__main__':
    unittest.main()
