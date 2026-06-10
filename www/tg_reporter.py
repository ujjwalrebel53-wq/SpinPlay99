"""Telegram live steps + terminal logs ek message me."""

from __future__ import annotations

import logging
from datetime import datetime


class TelegramReporter:
    """Steps + saare terminal logs Telegram pe."""

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
        self._max_logs = 25

    async def log(self, line: str) -> None:
        ts = datetime.now().strftime('%H:%M:%S')
        self._logs.append(f'{ts} {line}'[-300])
        if len(self._logs) > self._max_logs:
            self._logs = self._logs[-self._max_logs :]
        await self._render()

    async def set_proxy(self, line: str) -> None:
        self.proxy_line = line
        await self._render()

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = total
        if n > len(self._steps):
            self._steps.extend([''] * (n - len(self._steps)))
        if n >= 1:
            for i in range(n - 1):
                if i < len(self._steps) and self._steps[i] and not self._steps[i].startswith('✅'):
                    self._steps[i] = '✅ ' + self._steps[i].lstrip('✅🔄⏳ ')
        self._current = n
        idx = n - 1
        if idx < len(self._steps):
            self._steps[idx] = f'🔄 {text}'
        else:
            self._steps.append(f'🔄 {text}')
        await self._render()

    async def done(self, final: str) -> None:
        for i, s in enumerate(self._steps):
            body = s.lstrip('✅🔄⏳ ')
            self._steps[i] = '✅ ' + body
        await self._render(final)

    async def fail(self, err: str) -> None:
        if self._steps and self._current >= 1:
            idx = self._current - 1
            body = self._steps[idx].lstrip('✅🔄⏳ ')
            self._steps[idx] = f'❌ {body}'
        await self._render(err)

    async def _render(self, footer: str = '') -> None:
        lines = [f'🚀 {self.title}', f'👤 {self.name} / 📱 {self.mobile}']
        if self.proxy_line:
            lines.append(self.proxy_line)
        lines.append('')
        for i, s in enumerate(self._steps):
            lines.append(f'{i + 1}/{self._total} {s}')
        for j in range(len(self._steps), self._total):
            lines.append(f'{j + 1}/{self._total} ⏳ …')
        if self._logs:
            lines.extend(['', '📋 Terminal logs:', *self._logs[-12:]])
        if footer:
            lines.extend(['', footer])
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception:
            pass


class ReporterLogHandler(logging.Handler):
    """Python logging → TelegramReporter."""

    def __init__(self, reporter: TelegramReporter | None = None) -> None:
        super().__init__(logging.INFO)
        self._reporter = reporter
        self.setFormatter(logging.Formatter('%(levelname)s %(name)s: %(message)s'))

    def set_reporter(self, reporter: TelegramReporter | None) -> None:
        self._reporter = reporter

    def emit(self, record: logging.LogRecord) -> None:
        if not self._reporter:
            return
        try:
            import asyncio
            line = self.format(record)
            asyncio.get_running_loop().create_task(self._reporter.log(line))
        except Exception:
            pass
