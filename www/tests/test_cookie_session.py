"""Unit tests — uidai cookie session."""
import unittest
from unittest.mock import MagicMock, patch

import requests

from uidai_cookie_session import (
    cookie_seed_enabled,
    cookie_summary,
    import_playwright_cookies,
    seed_uidai_cookies,
)


class TestCookieSession(unittest.TestCase):
    def test_cookie_summary_empty(self) -> None:
        s = requests.Session()
        self.assertEqual(cookie_summary(s)['count'], 0)

    def test_import_playwright_cookies(self) -> None:
        s = requests.Session()
        n = import_playwright_cookies(s, [
            {'name': 'test', 'value': '1', 'domain': '.uidai.gov.in', 'path': '/'},
        ])
        self.assertEqual(n, 1)
        self.assertEqual(cookie_summary(s)['count'], 1)

    @patch('uidai_cookie_session.cookie_seed_enabled', return_value=False)
    def test_seed_skipped(self, _mock: MagicMock) -> None:
        s = requests.Session()
        info = seed_uidai_cookies(s, None, page_url='https://myaadhaar.uidai.gov.in/retrieve-eid-uid')
        self.assertTrue(info.get('skipped'))

    def test_seed_enabled_default(self) -> None:
        self.assertTrue(cookie_seed_enabled())


if __name__ == '__main__':
    unittest.main()
