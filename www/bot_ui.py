"""Professional Telegram loading UI — user-facing messages, no raw logs."""

from __future__ import annotations

import re
from typing import Any


def humanize_step(raw: str) -> str:
    """Technical browser steps → clean user labels."""
    t = (raw or '').strip()
    low = t.lower()
    if not t:
        return 'Processing…'
    if '24h session' in low or 'reuse' in low or 'reload skip' in low:
        return 'Reusing active session'
    if 'vpn' in low or 'proxy' in low or ('indian' in low and 'connect' in low):
        return 'Secure connection'
    if 'chromium' in low or 'browser' in low:
        return 'Secure browser ready'
    if 'uidai' in low and ('open' in low or 'load' in low or 'site' in low):
        return 'Opening UIDAI portal'
    if 'retry' in low:
        return 'Retrying connection'
    if 'form' in low:
        return 'Preparing form'
    if 'naam' in low or 'name' in low:
        return 'Entering name'
    if 'mobile bhara' in low or 'mobile:' in low:
        return 'Entering mobile number'
    if 'captcha' in low:
        if 'ready' in low or 'txn=' in low:
            return 'Captcha ready'
        if 'missing' in low:
            return 'Captcha refresh needed'
        if 'fill' in low:
            return 'Verifying captcha'
        if 'issue' in low or 'refresh' in low:
            return 'Captcha verification'
        return 'Loading captcha'
    if 'otp bhej' in low or 'otp sms' in low or 'otp sent' in low:
        return 'Sending OTP to mobile'
    if 'otp verify' in low or 'otp:' in low:
        return 'Verifying OTP'
    if 'uidai api' in low or 'uidai ko' in low:
        return 'Contacting UIDAI servers'
    if 'retrieve' in low or 'aadhaar' in low:
        return 'Retrieving Aadhaar details'
    if 'sms' in low and 'check' in low:
        return 'Check your registered mobile'
    if 'network' in low:
        return 'Connection issue'
    if 'galat otp' in low:
        return 'Invalid OTP'
    if 'done' in low:
        return 'Finishing up'
    if 'python engine' in low:
        return 'System ready'
    t = re.sub(r'\(txn=[^)]+\)', '', t)
    t = re.sub(r'v\d+\.\d+\.\d+', '', t).strip(' —')
    return t[:48] if t else 'Processing…'


def uidai_user_message(result: dict[str, Any], *, kind: str) -> str:
    """Clean user message from API result — logs server pe rehte hain."""
    if kind == 'otp' and result.get('otp_ok'):
        return '📱 OTP aapke mobile pe bhej diya gaya. 6 digit code yahan reply karo.'

    if kind == 'retrieve' and result.get('retrieve_ok'):
        return '📲 Aadhaar number aapke registered mobile pe SMS se bhej diya gaya. Phone check karo.'

    logs = result.get('logs') or []
    for item in reversed(logs):
        data = item.get('d')
        if not isinstance(data, dict):
            continue
        reason = data.get('reason')
        msg = str(data.get('msg') or '')
        if reason == 'invalid_captcha':
            return '❌ Galat captcha. /refresh karke naya captcha lo aur dubara try karo.'
        if reason == 'captcha_expired':
            return '⏱ Captcha expire ho gaya. /refresh karo aur dubara bharo.'
        if reason == 'invalid_otp':
            return '❌ Galat OTP. Sahi 6 digit code dubara bhejo.'
        if reason == 'otp_sent':
            return '📱 OTP mobile pe bhej diya gaya.'
        if reason == 'retrieve_ok':
            return '📲 Registered mobile pe SMS check karo.'
        if msg:
            if re.search(r'invalid.*captcha', msg, re.I):
                return '❌ Galat captcha — /refresh karo.'
            if re.search(r'invalid.*otp', msg, re.I):
                return '❌ Galat OTP — dubara try karo.'
            if re.search(r'otp.*sent', msg, re.I):
                return '📱 OTP bhej diya gaya.'

    if kind == 'otp':
        return '❌ OTP nahi bheja ja saka. Captcha sahi hai? /refresh try karo.'
    return '❌ Request fail. Thodi der baad /open dubara try karo.'


class LoadingScreen:
    """Single editable Telegram message — progress bar + clean steps."""

    def __init__(
        self,
        msg,
        name: str,
        mobile: str,
        *,
        title: str = 'Rebel Aadhaar',
        subtitle: str = 'UIDAI Secure Retrieve',
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

    def _bar(self, pct: int) -> str:
        pct = max(0, min(100, pct))
        filled = round(pct / 10)
        return '▰' * filled + '▱' * (10 - filled)

    async def update(self, n: int, total: int, text: str) -> None:
        self._total = max(total, 1)
        self._current = n
        label = humanize_step(text)
        if n > len(self._steps):
            self._steps.extend([''] * (n - len(self._steps)))
        if n >= 1:
            for i in range(n - 1):
                if i < len(self._steps) and self._steps[i]:
                    self._steps[i] = f'✓ {self._steps[i].lstrip("✓✗› ")}'
        idx = n - 1
        if idx < len(self._steps):
            self._steps[idx] = f'› {label}'
        else:
            self._steps.append(f'› {label}')
        await self._render()

    async def done(self, final: str = '') -> None:
        self._status = 'done'
        for i, s in enumerate(self._steps):
            self._steps[i] = f'✓ {s.lstrip("✓✗› ")}'
        self._footer = final
        await self._render()

    async def fail(self, err: str) -> None:
        self._status = 'fail'
        if self._steps and self._current >= 1:
            idx = self._current - 1
            self._steps[idx] = f'✗ {self._steps[idx].lstrip("✓✗› ")}'
        self._footer = err
        await self._render()

    async def _render(self) -> None:
        pct = int((self._current / self._total) * 100) if self._total else 0
        if self._status == 'done':
            pct = 100
        icon = '⏳' if self._status == 'loading' else ('✅' if self._status == 'done' else '⚠️')

        lines = [
            '━━━━━━━━━━━━━━━━━━━━',
            f'  {icon} {self.title}',
            f'  {self.subtitle}',
            '━━━━━━━━━━━━━━━━━━━━',
            '',
            f'👤 {self.name}',
            f'📱 {self.mobile}',
            '',
            f'{self._bar(pct)}  {pct}%',
            '',
        ]
        for s in self._steps[-6:]:
            if s:
                lines.append(s)
        if self._footer:
            lines.extend(['', self._footer])
        try:
            await self._msg.edit_text('\n'.join(lines)[:4000])
        except Exception:
            pass
