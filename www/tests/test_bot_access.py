"""Unit tests — bot_access credits (no network)."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import bot_access


class TestBotAccess(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / 'access_state.json'
        self.patcher = patch.object(bot_access, 'STATE_FILE', self.state)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tmp.cleanup()

    def test_approve_grants_default_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        bal = ac.approve('222')
        self.assertEqual(bal, 10)
        self.assertTrue(ac.has_credits('222', '222', 1))

    def test_approve_with_custom_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        bal = ac.approve('333', credits=25)
        self.assertEqual(bal, 25)

    def test_use_credits_deducts(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        ac.approve('444', credits=5)
        self.assertTrue(ac.use_credits('444', '444', 2))
        self.assertEqual(ac.credits('444'), 3)

    def test_owner_unlimited(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        self.assertTrue(ac.has_credits('111', '111', 999))
        self.assertTrue(ac.use_credits('111', '111', 999))

    def test_free_mode_skips_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_free()
        self.assertFalse(ac.credits_required())
        self.assertTrue(ac.use_credits('999', '999', 50))

    def test_persist_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.approve('555', credits=7)
        data = json.loads(self.state.read_text(encoding='utf-8'))
        self.assertEqual(data['credits']['555'], 7)
        ac2 = bot_access.AccessControl('111', set())
        self.assertEqual(ac2.credits('555'), 7)


if __name__ == '__main__':
    unittest.main()
