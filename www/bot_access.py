"""Bot access control — owner /free /lock + approved users."""

from __future__ import annotations

import json
import logging
from pathlib import Path

log = logging.getLogger('uidai-access')

STATE_FILE = Path(__file__).parent / 'access_state.json'


class AccessControl:
    """free = sabko access | locked = sirf approved + owner."""

    def __init__(self, owner_id: str, env_approved: set[str]) -> None:
        self.owner_id = (owner_id or '').strip()
        base = {x.strip() for x in env_approved if x.strip()}
        self._approved: set[str] = set(base)
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
        except Exception as e:
            log.warning('access_state load fail: %s', e)

    def _save(self) -> None:
        try:
            STATE_FILE.write_text(
                json.dumps({'mode': self._mode, 'approved': sorted(self._approved)}, indent=2),
                encoding='utf-8',
            )
        except Exception as e:
            log.warning('access_state save fail: %s', e)

    def is_owner(self, user_id: str | None, chat_id: str | None) -> bool:
        if not self.owner_id:
            return False
        for cid in (user_id, chat_id):
            if cid and cid == self.owner_id:
                return True
        return False

    def allowed(self, user_id: str | None, chat_id: str | None) -> bool:
        if self.is_owner(user_id, chat_id):
            return True
        if self._mode == 'free':
            return True
        for cid in (chat_id, user_id):
            if cid and cid in self._approved:
                return True
        return False

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

    def approve(self, uid: str) -> None:
        self._approved.add(uid.strip())
        self._save()

    def deny(self, uid: str) -> None:
        self._approved.discard(uid.strip())
        self._save()

    def status_lines(self, active_sessions: int = 0) -> list[str]:
        mode_label = '🌍 OPEN — all users' if self._mode == 'free' else '🔒 LOCKED — approved only'
        lines = [
            mode_label,
            f'Approved users: {self.approved_count}',
            f'Active sessions: {active_sessions}',
        ]
        if self.owner_id:
            lines.append(f'Owner ID: {self.owner_id}')
        return lines
