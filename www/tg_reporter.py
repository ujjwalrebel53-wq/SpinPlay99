"""UIDAI Live Load — classic 8-step Telegram UI."""

from __future__ import annotations

import logging

log = logging.getLogger('tg-reporter')


class TelegramReporter:
    """Pehle wala 🚀 UIDAI Live Load format — 8 steps."""

    def __init__(self, msg, name: str, mobile: str, title: str = 'UIDAI Live Load') -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.proxy_line = ''
        self._steps: list[str] = []
        self._current = 0
        self._total = 8

    async def set_proxy(self, line: str) -> None:
        self.proxy_line = line
        await self._render()

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
        await self._render()

    async def log(self, line: str) -> None:
        """Sirf server log — UI me nahi (clean 8-step view)."""
        if line:
            log.info('live: %s', line)

    async def done(self, final: str) -> None:
        for i, s in enumerate(self._steps):
            body = s.lstrip('✅🔄⏳❌ ')
            self._steps[i] = f'✅ {body}'
        await self._render(final)

    async def fail(self, err: str) -> None:
        if self._steps and self._current >= 1:
            idx = self._current - 1
            body = self._steps[idx].lstrip('✅🔄⏳❌ ')
            self._steps[idx] = f'❌ {body}'
        await self._render(err)

    async def _render(self, footer: str = '') -> None:
        lines = [
            f'🚀 {self.title}',
            f'👤 {self.name} / 📱 {self.mobile}',
        ]
        if self.proxy_line:
            lines.append(self.proxy_line)
        lines.append('')
        for i, s in enumerate(self._steps):
            lines.append(f'{i + 1}/{self._total} {s}')
        for j in range(len(self._steps), self._total):
            lines.append(f'{j + 1}/{self._total} ⏳ …')
        if footer:
            lines.extend(['', footer])
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception as e:
            if 'not modified' not in str(e).lower():
                log.debug('edit: %s', e)


class ReporterLogHandler(logging.Handler):
    """Server bot.log ke liye — Telegram UI clean rahe."""

    def __init__(self) -> None:
        super().__init__(logging.INFO)
        self.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))

    def set_reporter(self, reporter: TelegramReporter | None) -> None:
        pass

    def emit(self, record: logging.LogRecord) -> None:
        pass
