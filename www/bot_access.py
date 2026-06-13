"""Bot access control — owner /free /lock + approved users + credits."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

log = logging.getLogger('uidai-access')

STATE_FILE = Path(__file__).parent / 'access_state.json'


def _default_approve_credits() -> int:
    try:
        return max(0, int(os.getenv('DEFAULT_APPROVE_CREDITS', '10')))
    except ValueError:
        return 10


def _credit_fetch_cost() -> int:
    try:
        return max(1, int(os.getenv('CREDIT_FETCH_COST', '1')))
    except ValueError:
        return 1


def _credit_pdf_cost() -> int:
    try:
        return max(1, int(os.getenv('CREDIT_PDF_COST', '2')))
    except ValueError:
        return 2


class AccessControl:
    """free = sabko access | locked = sirf approved + owner + credits."""

    def __init__(self, owner_id: str, env_approved: set[str]) -> None:
        self.owner_id = (owner_id or '').strip()
        base = {x.strip() for x in env_approved if x.strip()}
        self._approved: set[str] = set(base)
        self._credits: dict[str, int] = {}
        self._mode = 'locked' if base else 'free'
        self._load()

    def _load(self) -> None:
        if not STATE_FILE.exists():
            return
        try:
            data = json.loads(STATE_FILE.read_text(encoding='utf-8'))
            mode = data.get('mode')
            if mode in ('free', 'locked'):
                self._mode = mode
            for uid in data.get('approved') or []:
                if uid:
                    self._approved.add(str(uid).strip())
            raw_credits = data.get('credits') or {}
            if isinstance(raw_credits, dict):
                for uid, bal in raw_credits.items():
                    if uid:
                        self._credits[str(uid).strip()] = max(0, int(bal))
        except Exception as e:
            log.warning('access_state load fail: %s', e)

    def _save(self) -> None:
        try:
            STATE_FILE.write_text(
                json.dumps(
                    {
                        'mode': self._mode,
                        'approved': sorted(self._approved),
                        'credits': {k: self._credits[k] for k in sorted(self._credits)},
                    },
                    indent=2,
                ),
                encoding='utf-8',
            )
        except Exception as e:
            log.warning('access_state save fail: %s', e)

    def is_owner(self, user_id: str | None, chat_id: str | None) -> bool:
        if not self.owner_id:
            return False
        for cid in (user_id, chat_id):
            if cid and str(cid) == self.owner_id:
                return True
        return False

    def allowed(self, user_id: str | None, chat_id: str | None) -> bool:
        if self.is_owner(user_id, chat_id):
            return True
        if self._mode == 'free':
            return True
        for cid in (chat_id, user_id):
            if cid and str(cid) in self._approved:
                return True
        return False

    def credits_required(self) -> bool:
        """Credits apply in locked mode for approved (non-owner) users."""
        return self._mode == 'locked'

    def credit_fetch_cost(self) -> int:
        return _credit_fetch_cost()

    def credit_pdf_cost(self) -> int:
        return _credit_pdf_cost()

    def credits(self, uid: str | None) -> int:
        if not uid:
            return 0
        if self.is_owner(uid, uid):
            return 999_999
        return self._credits.get(str(uid).strip(), 0)

    def has_credits(self, user_id: str | None, chat_id: str | None, cost: int) -> bool:
        if not self.credits_required():
            return True
        if self.is_owner(user_id, chat_id):
            return True
        if not self.allowed(user_id, chat_id):
            return False
        uid = str(chat_id or user_id or '').strip()
        return self.credits(uid) >= max(1, cost)

    def add_credits(self, uid: str, amount: int) -> int:
        uid = uid.strip()
        bal = max(0, self._credits.get(uid, 0) + int(amount))
        self._credits[uid] = bal
        self._save()
        return bal

    def set_credits(self, uid: str, amount: int) -> int:
        uid = uid.strip()
        bal = max(0, int(amount))
        self._credits[uid] = bal
        self._save()
        return bal

    def use_credits(self, user_id: str | None, chat_id: str | None, cost: int) -> bool:
        if not self.credits_required():
            return True
        if self.is_owner(user_id, chat_id):
            return True
        uid = str(chat_id or user_id or '').strip()
        if uid not in self._approved:
            return False
        need = max(1, int(cost))
        bal = self._credits.get(uid, 0)
        if bal < need:
            return False
        self._credits[uid] = bal - need
        self._save()
        return True

    def set_free(self) -> None:
        self._mode = 'free'
        self._save()

    def set_locked(self) -> None:
        self._mode = 'locked'
        self._save()

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def approved_count(self) -> int:
        return len(self._approved)

    def approve(self, uid: str, *, credits: int | None = None) -> int:
        uid = uid.strip()
        self._approved.add(uid)
        if credits is not None:
            bal = self.set_credits(uid, credits)
        elif uid not in self._credits:
            bal = self.set_credits(uid, _default_approve_credits())
        else:
            bal = self._credits.get(uid, 0)
        self._save()
        return bal

    def deny(self, uid: str) -> None:
        uid = uid.strip()
        self._approved.discard(uid)
        self._credits.pop(uid, None)
        self._save()

    def status_lines(self, active_sessions: int = 0) -> list[str]:
        mode_label = '🌍 OPEN — all users' if self._mode == 'free' else '🔒 LOCKED — approved + credits'
        lines = [
            mode_label,
            f'Approved users: {self.approved_count}',
            f'Active sessions: {active_sessions}',
            f'Fetch cost: {self.credit_fetch_cost()} credit | PDF: {self.credit_pdf_cost()} credits',
        ]
        if self.owner_id:
            lines.append(f'Owner ID: {self.owner_id}')
        return lines
