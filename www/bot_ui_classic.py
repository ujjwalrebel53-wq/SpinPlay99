"""Classic loading screen — v2.5 Rebel Aadhaar UI (spinner + wave bar)."""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any

from uidai_api import uidai_fast

SPINNERS = ('◐', '◓', '◑', '◒')
WAVE = ('▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂')


def humanize_step(raw: str) -> str:
    t = (raw or '').strip()
    low = t.lower()
    if not t:
        return 'Processing'
    if 'session active' in low or 'reuse' in low or 'skip reload' in low:
        return 'Active session detected'
    if 'chromium' in low or 'browser' in low:
        return 'Browser engine ready'
    if 'uidai' in low and ('open' in low or 'load' in low):
        return 'UIDAI portal online'
    if 'retry' in low:
        return 'Retrying connection'
    if 'form' in low or 'updating' in low:
        return 'Preparing secure form'
    if 'name' in low:
        return 'Applying name'
    if 'mobile' in low:
        return 'Applying mobile number'
    if 'pre-loaded' in low or 'cached' in low or 'instant' in low:
        return 'Instant captcha delivery'
    if 'captcha' in low:
        if 'refresh' in low:
            return 'Refreshing captcha'
        if 'ready' in low:
            return 'Captcha ready'
        return 'Loading captcha'
    if 'otp' in low:
        return 'OTP verification'
    if 'retrieve' in low or 'aadhaar' in low:
        return 'Retrieving Aadhaar'
    if 'network' in low or 'direct' in low:
        return 'Network check'
    if 'engine' in low:
        return 'System initialized'
    t = re.sub(r'\(txn=[^)]+\)', '', t)
    t = re.sub(r'v\d+\.\d+\.\d+', '', t).strip(' —')
    return t[:42] if t else 'Processing'


def uidai_user_message(result: dict[str, Any], *, kind: str) -> str:
    if kind == 'otp' and result.get('otp_ok'):
        return '📱 OTP sent to your mobile. Reply with the 6-digit code here.'

    if kind == 'download_otp' and result.get('otp_ok'):
        return '📱 OTP 2 sent — reply with the 6-digit code for PDF download.'

    if kind == 'download' and result.get('download_ok'):
        return '✅ e-Aadhaar PDF ready — check the document below.'

    if kind == 'retrieve' and result.get('retrieve_ok'):
        eid = result.get('eid') or ''
        a_name = result.get('aadhaar_name') or ''
        if eid and kind == 'retrieve':
            lines = ['✅ Phase 1 complete — EID retrieved.']
            if a_name:
                lines.append(f'👤 Name: {a_name}')
            lines.append('📱 OTP 2 will be sent for PDF download.')
            return '\n'.join(lines)
        return '📲 Aadhaar number sent via SMS to your registered mobile. Check your phone.'

    logs = result.get('logs') or []
    for item in reversed(logs):
        data = item.get('d')
        if not isinstance(data, dict):
            continue
        reason = data.get('reason')
        msg = str(data.get('msg') or '')
        if reason == 'invalid_captcha':
            return '❌ Invalid captcha. Use /refresh and try again.'
        if reason == 'captcha_expired':
            return '⏱ Captcha expired. Use /refresh and enter a new one.'
        if reason == 'invalid_otp':
            return '❌ Invalid OTP. Send the correct 6-digit code.'
        if reason == 'otp_sent':
            return '📱 OTP sent to your mobile.'
        if reason == 'retrieve_ok':
            return '📲 Check SMS on your registered mobile.'
        if msg:
            if re.search(r'invalid.*captcha', msg, re.I):
                return '❌ Invalid captcha — use /refresh.'
            if re.search(r'invalid.*otp', msg, re.I):
                return '❌ Invalid OTP — try again.'
            if re.search(r'otp.*sent', msg, re.I):
                return '📱 OTP sent successfully.'

    if kind == 'otp':
        return '❌ Could not send OTP. Verify captcha or use /refresh.'
    return '❌ Request failed. Try /open again in a moment.'


class LoadingScreen:
    """Animated progress panel — spinner + wave bar."""

    def __init__(
        self,
        msg,
        name: str,
        mobile: str,
        *,
        title: str = 'Rebel Aadhaar',
        subtitle: str = 'Secure UIDAI Gateway',
    ) -> None:
        self._msg = msg
        self.name = name
        self.mobile = mobile
        self.title = title
        self.subtitle = subtitle
        self._steps: list[str] = []
        self._current = 0
        self._total = 8
        self._status = 'loading'
        self._footer = ''
        self._detail_logs: list[str] = []
        self._frame = 0
        self._started = time.monotonic()
        self._debounce_task: asyncio.Task | None = None
        self._debounce_sec = 0.22 if uidai_fast() else 0.45

    async def _flush_render(self) -> None:
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()
            try:
                await self._debounce_task
            except asyncio.CancelledError:
                pass
        self._debounce_task = None
        await self._render()

    async def _debounced_render(self) -> None:
        try:
            await asyncio.sleep(self._debounce_sec)
            await self._render()
        except asyncio.CancelledError:
            return

    async def log_detail(self, line: str) -> None:
        t = (line or '').strip()
        if not t:
            return
        self._detail_logs.append(t[:120])
        if len(self._detail_logs) > 6:
            self._detail_logs = self._detail_logs[-6:]
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()
        self._debounce_task = asyncio.create_task(self._debounced_render())

    def _spinner(self) -> str:
        self._frame += 1
        return SPINNERS[self._frame % len(SPINNERS)]

    def _wave_bar(self, pct: int) -> str:
        pct = max(0, min(100, pct))
        pos = int((pct / 100) * (len(WAVE) - 1))
        idx = (pos + self._frame) % len(WAVE)
        return ''.join(WAVE[(idx + i) % len(WAVE)] for i in range(10))

    def _elapsed(self) -> str:
        return f'{int(time.monotonic() - self._started)}s'

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = max(total, 1)
        self._current = n
        label = humanize_step(text)
        if n > len(self._steps):
            self._steps.extend([''] * (n - len(self._steps)))
        if n >= 1:
            for i in range(n - 1):
                if i < len(self._steps) and self._steps[i]:
                    self._steps[i] = f'✓ {self._steps[i].lstrip("✓✗▸ ")}'
        idx = n - 1
        line = f'▸ {label}'
        if idx < len(self._steps):
            self._steps[idx] = line
        else:
            self._steps.append(line)
        await self._flush_render()

    async def done(self, final: str = '') -> None:
        self._status = 'done'
        for i, s in enumerate(self._steps):
            self._steps[i] = f'✓ {s.lstrip("✓✗▸ ")}'
        self._footer = final
        await self._flush_render()

    async def fail(self, err: str) -> None:
        self._status = 'fail'
        if self._current < 1:
            self._current = 1
            if not self._steps:
                self._steps.append('▸ Request')
        if self._steps and self._current >= 1:
            idx = self._current - 1
            self._steps[idx] = f'✗ {self._steps[idx].lstrip("✓✗▸ ")}'
        self._footer = err
        await self._flush_render()

    async def _render(self) -> None:
        pct = int((self._current / self._total) * 100) if self._total else 0
        if self._status == 'done':
            pct = 100

        if self._status == 'loading':
            head = f'{self._spinner()} {self.title}'
            state = 'INITIALIZING'
        elif self._status == 'done':
            head = f'✓ {self.title}'
            state = 'COMPLETE'
        else:
            head = f'⚠ {self.title}'
            state = 'ATTENTION'

        lines = [
            '╔══════════════════════════╗',
            f'║  {head[:24]:<24}║',
            f'║  {self.subtitle[:24]:<24}║',
            '╠══════════════════════════╣',
            f'  Status │ {state}',
            f'  Elapsed │ {self._elapsed()}',
            '',
            f'  {self._wave_bar(pct)}  {pct}%',
            '',
            f'  Name   {self.name}',
            f'  Mobile {self.mobile}',
            '',
        ]
        for s in self._steps[-5:]:
            if s:
                lines.append(f'  {s}')
        for d in self._detail_logs[-3:]:
            lines.append(f'  · {d[:60]}')
        if self._footer:
            lines.extend(['', f'  {self._footer}'])
        lines.append('╚══════════════════════════╝')
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception:
            pass
