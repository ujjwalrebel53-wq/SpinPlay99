"""Unit tests — uidai cookie session."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests

from uidai_cookie_session import (
    apply_cookie_jar_to_session,
    apply_isolated_baked_cookies,
    bootstrap_uidai_session,
    baked_session_ready,
    cookie_jar_ready,
    cookie_persist_enabled,
    cookie_seed_enabled,
    cookie_summary,
    export_session_cookies,
    get_isolated_baked_cookies,
    get_isolated_storage_state,
    import_playwright_cookies,
    load_cookie_jar,
    mark_cookie_jar_bootstrapped,
    save_cookie_jar,
    seed_uidai_cookies,
)


class TestCookieSession(unittest.TestCase):
    def _no_baked(self):
        return patch('uidai_cookie_session.baked_session_ready', return_value=False)

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

    def test_export_and_apply_jar(self) -> None:
        s = requests.Session()
        import_playwright_cookies(s, [
            {'name': 'a', 'value': '1', 'domain': '.uidai.gov.in', 'path': '/'},
            {'name': 'b', 'value': '2', 'domain': '.uidai.gov.in', 'path': '/'},
        ])
        exported = export_session_cookies(s)
        self.assertEqual(len(exported), 2)
        s2 = requests.Session()
        n = apply_cookie_jar_to_session(s2, exported)
        self.assertEqual(n, 2)
        self.assertEqual(cookie_summary(s2)['count'], 2)

    def test_save_load_cookie_jar(self) -> None:
        with self._no_baked(), patch('uidai_cookie_session.load_cookie_jar', wraps=load_cookie_jar), tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'uidai_cookies.json'
            with patch('uidai_cookie_session.COOKIE_JAR_FILE', path), patch('uidai_cookie_session.baked_session_ready', return_value=False):
                s = requests.Session()
                import_playwright_cookies(s, [
                    {'name': 'sid', 'value': 'abc', 'domain': '.uidai.gov.in', 'path': '/'},
                ])
                with patch('uidai_cookie_session.cookie_persist_enabled', return_value=True):
                    save_cookie_jar(s)
                self.assertTrue(path.exists())
                with patch('uidai_cookie_session.cookie_persist_enabled', return_value=True):
                    loaded = load_cookie_jar()
                self.assertEqual(len(loaded), 1)
                self.assertEqual(loaded[0]['name'], 'sid')

    @patch('uidai_cookie_session.cookie_seed_enabled', return_value=False)
    def test_seed_skipped(self, _mock: MagicMock) -> None:
        s = requests.Session()
        info = seed_uidai_cookies(s, None, page_url='https://myaadhaar.uidai.gov.in/retrieve-eid-uid')
        self.assertTrue(info.get('skipped'))

    @patch('uidai_cookie_session.baked_session_ready', return_value=False)
    @patch('uidai_cookie_session.cookie_jar_ready', return_value=False)
    @patch('uidai_cookie_session.seed_uidai_cookies')
    @patch('uidai_cookie_session.load_cookie_jar', return_value=[{'name': 'x', 'value': '1', 'domain': '', 'path': '/'}])
    @patch('uidai_cookie_session.cookie_persist_enabled', return_value=True)
    def test_bootstrap_loads_then_seeds(
        self,
        _persist: MagicMock,
        _load: MagicMock,
        mock_seed: MagicMock,
        _jar: MagicMock,
        _no_baked: MagicMock,
    ) -> None:
        mock_seed.return_value = {'count': 2, 'loaded_from_disk': 1}
        s = requests.Session()
        info = bootstrap_uidai_session(s)
        mock_seed.assert_called_once()
        self.assertEqual(info.get('count'), 2)

    @patch('uidai_cookie_session.baked_session_ready', return_value=False)
    def test_cookie_jar_ready_bootstrapped(self, _no_baked: MagicMock) -> None:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'uidai_cookies.json'
            with patch('uidai_cookie_session.COOKIE_JAR_FILE', path):
                self.assertFalse(cookie_jar_ready())
                s = requests.Session()
                import_playwright_cookies(s, [
                    {'name': 'sid', 'value': 'abc', 'domain': '.uidai.gov.in', 'path': '/'},
                ])
                with patch('uidai_cookie_session.cookie_persist_enabled', return_value=True):
                    save_cookie_jar(s, bootstrapped=True)
                with patch('uidai_cookie_session.cookie_persist_enabled', return_value=True):
                    self.assertTrue(cookie_jar_ready())

    def test_mark_bootstrapped_forever(self) -> None:
        with self._no_baked(), tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'uidai_cookies.json'
            with patch('uidai_cookie_session.COOKIE_JAR_FILE', path):
                s = requests.Session()
                import_playwright_cookies(s, [
                    {'name': 'a', 'value': '1', 'domain': '.uidai.gov.in', 'path': '/'},
                ])
                with patch('uidai_cookie_session.cookie_persist_enabled', return_value=True):
                    mark_cookie_jar_bootstrapped(s)
                data = json.loads(path.read_text())
                self.assertTrue(data.get('forever'))
                self.assertTrue(data.get('bootstrapped'))

    def test_baked_session_isolated_copy(self) -> None:
        path = Path(__file__).resolve().parent.parent / 'uidai_baked_session.json'
        if not path.exists():
            self.skipTest('uidai_baked_session.json missing')
        with patch('uidai_cookie_session.BAKED_SESSION_FILE', path):
            from uidai_cookie_session import load_baked_session
            load_baked_session(reload=True)
            self.assertTrue(baked_session_ready())
            a = get_isolated_baked_cookies()
            b = get_isolated_baked_cookies()
            self.assertEqual(a, b)
            a[0]['value'] = 'mutated'
            self.assertNotEqual(a[0]['value'], b[0]['value'])
            state = get_isolated_storage_state()
            self.assertIsNotNone(state)
            self.assertIn('cookies', state)

    def test_baked_http_session_isolated(self) -> None:
        path = Path(__file__).resolve().parent.parent / 'uidai_baked_session.json'
        if not path.exists():
            self.skipTest('uidai_baked_session.json missing')
        with patch('uidai_cookie_session.BAKED_SESSION_FILE', path):
            from uidai_cookie_session import load_baked_session
            load_baked_session(reload=True)
            s1 = requests.Session()
            s2 = requests.Session()
            apply_isolated_baked_cookies(s1)
            apply_isolated_baked_cookies(s2)
            self.assertGreater(cookie_summary(s1)['count'], 0)
            self.assertEqual(cookie_summary(s1)['count'], cookie_summary(s2)['count'])

    def test_seed_enabled_default(self) -> None:
        self.assertTrue(cookie_seed_enabled())
        self.assertTrue(cookie_persist_enabled())


if __name__ == '__main__':
    unittest.main()
