"""Telegram steps + live logs."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

log = logging.getLogger('tg-reporter')


class TelegramReporter:
    def __init__(self, msg, name: str, mobile: str, title: str = 'UIDAI Live') -> None:
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
        self._flush_task: asyncio.Task | None = None

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
            lines.extend(['', '📋 Live logs:', *self._logs[-14:]])
        if self._footer:
            lines.extend(['', self._footer])
        return '\n'.join(lines)[:4000]

    async def _push(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last < 0.3:
            return
        try:
            await self._msg.edit_text(self._body())
            self._last = now
        except Exception as e:
            err = str(e).lower()
            if 'not modified' not in err and 'exactly the same' not in err:
                log.debug('edit fail: %s', e)

    async def _flush_later(self) -> None:
        await asyncio.sleep(0.35)
        await self._push(force=True)
        self._flush_task = None

    async def log(self, line: str) -> None:
        if not line or not str(line).strip():
            return
        ts = datetime.now().strftime('%H:%M:%S')
        self._logs.append(f'{ts} {str(line).strip()}'[-240])
        if len(self._logs) > 30:
            self._logs = self._logs[-30:]
        if not self._flush_task or self._flush_task.done():
            self._flush_task = asyncio.create_task(self._flush_later())

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


class ReporterLogHandler(logging.Handler):
    """Terminal logging → Telegram live logs."""

    def __init__(self) -> None:
        super().__init__(logging.INFO)
        self._reporter: TelegramReporter | None = None
        self.setFormatter(logging.Formatter('%(name)s: %(message)s'))

    def set_reporter(self, reporter: TelegramReporter | None) -> None:
        self._reporter = reporter

    def emit(self, record: logging.LogRecord) -> None:
        if not self._reporter:
            return
        try:
            line = self.format(record)
            loop = asyncio.get_running_loop()
            loop.create_task(self._reporter.log(line))
        except Exception:
            pass
