"""Rebel Aadhaar — terminal loading UI with live spinner."""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any, Literal

TerminalMode = Literal['fetch', 'pdf', 'captcha']

_LOADING_MSG_BY_CHAT: dict[int, Any] = {}
_LOADING_SCREEN_BY_CHAT: dict[int, 'LoadingScreen'] = {}

SPINNERS = ('◐', '◓', '◑', '◒')

TERMINAL_FETCH: tuple[str, ...] = (
    '[+] Mode 1 Selected.',
    '[?] Select Network Provider...',
    '[+] Securing Connection...',
    '[+] Auth Key Dispatched!',
    '[+] Validating Key...',
    '[+] Elevating Security Level...',
    '[+] Link Established. Authentication Required!',
    '[+] Evaluating Key...',
    '[+] Authorization Accepted. Payload Ready.',
    '[+] SUCCESS! OPERATION COMPLETE.',
)

TERMINAL_PDF: tuple[str, ...] = (
    '[+] Mode 2 Selected.',
    '[?] Select Network Provider...',
    '[+] Securing Connection...',
    '[+] Auth Key Dispatched!',
    '[+] Validating Key...',
    '[+] Elevating Security Level...',
    '[+] Link Established. Authentication Required!',
    '[+] Evaluating Key...',
    '[+] Authorization Accepted. Payload Ready.',
    '[+] Auth Key 2 Requested!',
    '[+] Downloading Payload...',
    '[+] SUCCESS! OPERATION COMPLETE.',
)

TERMINAL_CAPTCHA: tuple[str, ...] = (
    '[+] Captcha module active.',
    '[+] Connecting to UIDAI gateway...',
    '[+] Fetching captcha image...',
    '[+] Rendering secure image...',
    '[+] Captcha ready — reply with text.',
)

_STEP_HINTS: dict[str, int] = {
    'mode': 0,
    'network': 1,
    'connection': 2,
    'captcha': 3,
    'otp': 4,
    'validat': 5,
    'secur': 6,
    'link': 7,
    'evaluat': 8,
    'author': 9,
    'auth key 2': 10,
    'download': 11,
    'payload': 11,
    'complete': 12,
    'success': 12,
    'render': 3,
    'fetch': 2,
}


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
    return '❌ Request failed. Try /fetch again in a moment.'


def _terminal_lines(mode: TerminalMode) -> tuple[str, ...]:
    if mode == 'pdf':
        return TERMINAL_PDF
    if mode == 'captcha':
        return TERMINAL_CAPTCHA
    return TERMINAL_FETCH


def _step_index(mode: TerminalMode, n: int, total: int, raw: str) -> int:
    lines = _terminal_lines(mode)
    if n <= 0:
        return 0
    if n >= total and total > 0:
        return len(lines) - 1
    low = (raw or '').strip().lower()
    for hint, idx in _STEP_HINTS.items():
        if hint in low:
            return min(idx, len(lines) - 1)
    ratio = n / max(total, 1)
    return min(int(ratio * len(lines)), len(lines) - 1)


async def dismiss_loading_screen(chat_id: int) -> None:
    screen = _LOADING_SCREEN_BY_CHAT.pop(chat_id, None)
    if screen is not None:
        await screen._stop_spinner()
    old = _LOADING_MSG_BY_CHAT.pop(chat_id, None)
    if old is None:
        return
    try:
        await old.delete()
    except Exception:
        pass


async def create_loading_screen(
    message,
    chat_id: int,
    mobile: str,
    *,
    mode: TerminalMode = 'fetch',
    name: str = '',
) -> 'LoadingScreen':
    await dismiss_loading_screen(chat_id)
    sent = await message.reply_text('⏳')
    _LOADING_MSG_BY_CHAT[chat_id] = sent
    screen = LoadingScreen(sent, mobile, mode=mode, name=name)
    _LOADING_SCREEN_BY_CHAT[chat_id] = screen
    await screen.show()
    return screen


class LoadingScreen:
    """Terminal panel — spinner keeps rotating until done/fail."""

    _SPIN_INTERVAL = 0.42

    def __init__(
        self,
        msg,
        mobile: str,
        *,
        mode: TerminalMode = 'fetch',
        name: str = '',
        title: str = '',
        subtitle: str = '',
    ) -> None:
        self._msg = msg
        self.mobile = (mobile or '').strip()
        self.name = name
        self.mode = mode
        self.title = title
        self.subtitle = subtitle
        self._lines: list[str] = []
        self._current = 0
        self._total = 10
        self._status = 'loading'
        self._footer = ''
        self._started = time.monotonic()
        self._spin_frame = 0
        self._animating = False
        self._anim_task: asyncio.Task | None = None

    def _spinner_line(self) -> str:
        if self._status == 'done':
            return '✓ Complete'
        if self._status == 'fail':
            return '✗ Stopped'
        ch = SPINNERS[self._spin_frame % len(SPINNERS)]
        labels = {
            'captcha': 'Loading captcha',
            'pdf': 'PDF operation',
            'fetch': 'Fetch operation',
        }
        return f'{ch} {labels.get(self.mode, "Processing")}…'

    async def _start_spinner(self) -> None:
        if self._animating:
            return
        self._animating = True
        self._anim_task = asyncio.create_task(self._spin_loop())

    async def _stop_spinner(self) -> None:
        self._animating = False
        if self._anim_task and not self._anim_task.done():
            self._anim_task.cancel()
            try:
                await self._anim_task
            except asyncio.CancelledError:
                pass
        self._anim_task = None

    async def _spin_loop(self) -> None:
        try:
            while self._animating:
                self._spin_frame += 1
                if self._status == 'loading' and self._lines:
                    lines = _terminal_lines(self.mode)
                    pulse = self._spin_frame % max(len(lines), 1)
                    if pulse < len(lines) and lines[pulse] not in self._lines:
                        self._lines = list(lines[: max(len(self._lines), pulse + 1)])
                await self._render()
                await asyncio.sleep(self._SPIN_INTERVAL)
        except asyncio.CancelledError:
            return

    async def show(self) -> None:
        lines = _terminal_lines(self.mode)
        self._lines = [lines[0]] if lines else []
        await self._start_spinner()
        await self._render()

    async def log_detail(self, line: str) -> None:
        return

    async def update(self, n: int, total: int, text: str = '') -> None:
        self._total = max(total, 1)
        self._current = n
        idx = _step_index(self.mode, n, total, text)
        lines = _terminal_lines(self.mode)
        self._lines = list(lines[: idx + 1])
        await self._render()

    async def done(self, final: str = '') -> None:
        await self._stop_spinner()
        self._status = 'done'
        self._lines = list(_terminal_lines(self.mode))
        self._footer = final
        await self._render()

    async def fail(self, err: str = '') -> None:
        await self._stop_spinner()
        self._status = 'fail'
        if not self._lines:
            lines = _terminal_lines(self.mode)
            self._lines = [lines[0]] if lines else ['[!] Error']
        self._footer = err
        await self._render()

    async def _render(self) -> None:
        target = self.mobile or '—'
        elapsed = int(time.monotonic() - self._started)
        body = [
            self._spinner_line(),
            f'  {elapsed}s elapsed',
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            f'[📡] TARGET:  {target}',
            '━━━━━━━━━━━━━━━━━━━━',
            '[⚡️] LIVE TERMINAL:',
        ]
        body.extend(self._lines)
        if self._status == 'fail' and self._footer:
            body.extend(['', f'[!] {self._footer[:200]}'])
        elif self._footer and self._status == 'done':
            body.extend(['', self._footer[:400]])
        try:
            await self._msg.edit_text('\n'.join(body)[:4000])
        except Exception:
            pass
