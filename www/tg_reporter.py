"""Telegram steps — kam edit = fast."""

from __future__ import annotations

import logging
import time

log = logging.getLogger('tg-reporter')


class TelegramReporter:
    def __init__(self, msg, name: str, mobile: str, title: str = 'UIDAI Turbo') -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.proxy_line = ''
        self._steps: list[str] = []
        self._total = 6
        self._logs: list[str] = []
        self._footer = ''
        self._last = 0.0

    def _body(self) -> str:
        lines = [f'⚡ {self.title}', f'{self.name} / {self.mobile}']
        if self.proxy_line:
            lines.append(self.proxy_line)
        lines.append('')
        for i, s in enumerate(self._steps):
            lines.append(f'{i + 1}/{self._total} {s}')
        for j in range(len(self._steps), self._total):
            lines.append(f'{j + 1}/{self._total} ⏳')
        if self._logs:
            lines.extend(['', *self._logs[-6:]])
        if self._footer:
            lines.extend(['', self._footer])
        return '\n'.join(lines)[:4000]

    async def _push(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last < 0.35:
            return
        try:
            await self._msg.edit_text(self._body())
            self._last = now
        except Exception as e:
            if 'not modified' not in str(e).lower():
                log.debug('edit: %s', e)

    async def log(self, line: str) -> None:
        if line and str(line).strip():
            self._logs.append(str(line).strip()[-200])
            if len(self._logs) > 8:
                self._logs = self._logs[-8:]
            await self._push()

    async def set_proxy(self, line: str) -> None:
        self.proxy_line = line
        await self._push(force=True)

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = total
        while len(self._steps) < n - 1:
            self._steps.append('✅ …')
        if n - 1 < len(self._steps):
            self._steps[n - 1] = f'🔄 {text}'
        else:
            self._steps.append(f'🔄 {text}')
        await self._push(force=True)

    async def done(self, final: str) -> None:
        self._steps = [f'✅ {s.lstrip("✅🔄⏳ ")}' for s in self._steps]
        self._footer = final
        await self._push(force=True)

    async def fail(self, err: str) -> None:
        self._footer = f'❌ {err}'
        await self._push(force=True)

    def start_heartbeat(self, _label: str = '') -> None:
        pass  # turbo — heartbeat band, slow karta tha

    def stop_heartbeat(self) -> None:
        pass

    async def close(self) -> None:
        pass
