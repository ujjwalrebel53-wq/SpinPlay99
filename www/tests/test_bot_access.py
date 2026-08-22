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
        self.assertEqual(bal, 3)
        self.assertTrue(ac.has_credits('222', '222', 1))

    def test_approve_with_custom_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        bal = ac.approve('333', credits=25)
        self.assertEqual(bal, 25)

    def test_use_credits_deducts(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        ac.approve('444', credits=5)
        self.assertTrue(ac.use_credits('444', '444', 1))
        self.assertEqual(ac.credits('444'), 4)

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

    def test_record_user_persists_profile(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.record_user('999', username='Rebel_babyyy', full_name='Rebel Baby')
        self.assertEqual(ac.get_user('999')['username'], 'Rebel_babyyy')
        self.assertEqual(ac.get_user('999')['full_name'], 'Rebel Baby')
        ac2 = bot_access.AccessControl('111', set())
        self.assertEqual(ac2.user_label('999'), '@Rebel_babyyy (Rebel Baby)')

    def test_new_user_gets_starter_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        starter = ac.record_user('777', username='newbie')
        self.assertEqual(starter, 3)
        self.assertEqual(ac.credits('777'), 3)
        self.assertTrue(ac.allowed('777', '777'))
        again = ac.record_user('777', username='newbie')
        self.assertEqual(again, 0)
        self.assertEqual(ac.credits('777'), 3)

    def test_gift_all_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.record_user('222')
        ac.record_user('333')
        results = ac.gift_all_credits(5)
        self.assertEqual(len(results), 2)
        self.assertEqual(ac.credits('222'), 8)
        self.assertEqual(ac.credits('333'), 8)

    def test_pdf_cost_default_one(self) -> None:
        ac = bot_access.AccessControl('111', set())
        self.assertEqual(ac.credit_fetch_cost(), 1)
        self.assertEqual(ac.credit_pdf_cost(), 1)

    def test_ban_blocks_access(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        ac.record_user('222', username='baduser')
        ac.ban('222')
        self.assertTrue(ac.is_banned('222'))
        self.assertFalse(ac.allowed('222', '222'))
        self.assertEqual(ac.credits('222'), 0)

    def test_unban_restores_access_with_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.set_locked()
        ac.record_user('333')
        ac.add_credits('333', 5)
        ac.ban('333')
        ac.unban('333')
        ac.add_credits('333', 2)
        self.assertFalse(ac.is_banned('333'))
        self.assertTrue(ac.allowed('333', '333'))

    def test_remove_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.add_credits('444', 10)
        bal = ac.remove_credits('444', 3)
        self.assertEqual(bal, 7)

    def test_persist_credits(self) -> None:
        ac = bot_access.AccessControl('111', set())
        ac.approve('555', credits=7)
        data = json.loads(self.state.read_text(encoding='utf-8'))
        self.assertEqual(data['credits']['555'], 7)
        ac2 = bot_access.AccessControl('111', set())
        self.assertEqual(ac2.credits('555'), 7)


if __name__ == '__main__':
    unittest.main()
