"""Telegram live steps + logs — throttle + heartbeat (hang fix)."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

log = logging.getLogger('tg-reporter')


class TelegramReporter:
    def __init__(self, msg, name: str, mobile: str, title: str = 'UIDAI Live Load') -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.proxy_line = ''
        self._steps: list[str] = []
        self._current = 0
        self._total = 8
        self._logs: list[str] = []
        self._footer = ''
        self._max_logs = 20
        self._last_edit = 0.0
        self._edit_gap = 0.55
        self._heartbeat_task: asyncio.Task | None = None
        self._tick = 0
        self._closed = False

    def _text(self) -> str:
        lines = [f'🚀 {self.title}', f'👤 {self.name} / 📱 {self.mobile}']
        if self.proxy_line:
            lines.append(self.proxy_line)
        lines.append('')
        if self._steps:
            for i, s in enumerate(self._steps):
                lines.append(f'{i + 1}/{self._total} {s}')
            for j in range(len(self._steps), self._total):
                lines.append(f'{j + 1}/{self._total} ⏳ …')
        else:
            lines.append('🔄 Shuru ho raha hai…')
        if self._logs:
            lines.extend(['', '📋 Logs:', *self._logs[-10:]])
        if self._footer:
            lines.extend(['', self._footer])
        return '\n'.join(lines)[:4000]

    async def _flush(self, force: bool = False) -> None:
        if self._closed:
            return
        now = time.monotonic()
        if not force and now - self._last_edit < self._edit_gap:
            return
        try:
            await self._msg.edit_text(self._text())
            self._last_edit = time.monotonic()
        except Exception as e:
            err = str(e).lower()
            if 'not modified' not in err and 'exactly the same' not in err:
                log.warning('telegram edit fail: %s', e)

    async def log(self, line: str) -> None:
        if not line or not str(line).strip():
            return
        ts = datetime.now().strftime('%H:%M:%S')
        self._logs.append(f'{ts} {str(line).strip()}'[-280])
        if len(self._logs) > self._max_logs:
            self._logs = self._logs[-self._max_logs :]
        await self._flush()

    async def set_proxy(self, line: str) -> None:
        self.proxy_line = line
        await self._flush(force=True)

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = total
        if n > len(self._steps):
            self._steps.extend([''] * (n - len(self._steps)))
        if n >= 1:
            for i in range(n - 1):
                if i < len(self._steps) and self._steps[i]:
                    body = self._steps[i].lstrip('✅🔄⏳❌ ')
                    self._steps[i] = f'✅ {body}'
        self._current = n
        idx = n - 1
        mark = f'🔄 {text}'
        if idx < len(self._steps):
            self._steps[idx] = mark
        else:
            self._steps.append(mark)
        await self._flush(force=(n == 1))

    async def done(self, final: str) -> None:
        self.stop_heartbeat()
        for i, s in enumerate(self._steps):
            body = s.lstrip('✅🔄⏳❌ ')
            self._steps[i] = f'✅ {body}'
        self._footer = final
        await self._flush(force=True)

    async def fail(self, err: str) -> None:
        self.stop_heartbeat()
        if self._steps and self._current >= 1:
            idx = self._current - 1
            body = self._steps[idx].lstrip('✅🔄⏳❌ ')
            self._steps[idx] = f'❌ {body}'
        self._footer = err
        await self._flush(force=True)

    def start_heartbeat(self, label: str = 'Kaam chal raha hai') -> None:
        self.stop_heartbeat()
        self._heartbeat_task = asyncio.create_task(self._heartbeat(label))

    def stop_heartbeat(self) -> None:
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
        self._heartbeat_task = None

    async def close(self) -> None:
        self._closed = True
        self.stop_heartbeat()

    async def _heartbeat(self, label: str) -> None:
        try:
            while True:
                await asyncio.sleep(4)
                self._tick += 1
                if self._current >= 1 and self._current <= len(self._steps):
                    idx = self._current - 1
                    base = self._steps[idx].lstrip('✅🔄⏳❌ ')
                    self._steps[idx] = f'🔄 {base} ({self._tick * 4}s)'
                else:
                    await self.log(f'{label}… {self._tick * 4}s')
                await self._flush(force=True)
        except asyncio.CancelledError:
            pass
