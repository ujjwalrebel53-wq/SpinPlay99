"""Rebel Aadhaar — terminal loading UI with live spinner."""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any, Literal

from uidai_api import is_skip_name

TerminalMode = Literal['fetch', 'pdf', 'captcha']

_LOADING_MSG_BY_CHAT: dict[int, Any] = {}
_LOADING_SCREEN_BY_CHAT: dict[int, 'LoadingScreen'] = {}
_SCRIPT_TICKERS: dict[int, asyncio.Task] = {}

SPINNERS = ('◐', '◓', '◑', '◒')

TERMINAL_FETCH: tuple[str, ...] = (
    '[+] Mode 1 Selected.',
    '[?] Select Network Provider...',
    '[+] Securing Connection...',
    '[+] Auth Key Dispatched!',
    '[+] Validating Key...',
    '[+] Elevating Security Level...',
    '[+] Link Established. Authentication Required!',
    '[+] Captcha ready — reply with text.',
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
    '[+] Captcha ready — reply with text.',
    '[+] Evaluating Key...',
    '[+] Authorization Accepted. Payload Ready.',
    '[+] Auth Key 2 Requested!',
    '[+] Captcha 2 ready — reply with text.',
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
        a_name = str(result.get('aadhaar_name') or '').strip()
        if a_name and not is_skip_name(a_name):
            return (
                f'👤 Name: {a_name}\n'
                '📱 OTP 2 sent — reply with the 6-digit code for PDF download.'
            )
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
    ticker = _SCRIPT_TICKERS.pop(chat_id, None)
    if ticker and not ticker.done():
        ticker.cancel()
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


async def shutdown_all_loading() -> None:
    """Cancel every live terminal panel — call on bot shutdown."""
    for cid in list(_LOADING_SCREEN_BY_CHAT.keys()):
        try:
            await dismiss_loading_screen(cid)
        except Exception:
            pass
    for ticker in list(_SCRIPT_TICKERS.values()):
        if ticker and not ticker.done():
            ticker.cancel()
    _SCRIPT_TICKERS.clear()


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


def get_loading_screen(chat_id: int) -> LoadingScreen | None:
    return _LOADING_SCREEN_BY_CHAT.get(chat_id)


async def get_or_create_loading_screen(
    message,
    chat_id: int,
    mobile: str,
    *,
    mode: TerminalMode = 'fetch',
    name: str = '',
) -> LoadingScreen:
    """Reuse session terminal — stays open until OTP phase completes."""
    existing = _LOADING_SCREEN_BY_CHAT.get(chat_id)
    if existing is not None and _LOADING_MSG_BY_CHAT.get(chat_id) is not None:
        existing.mobile = (mobile or '').strip() or existing.mobile
        if name:
            existing.name = name
        existing.mode = mode
        return existing
    return await create_loading_screen(message, chat_id, mobile, mode=mode, name=name)


class LoadingScreen:
    """Terminal panel — spinner keeps rotating until done/fail."""

    # Telegram editMessageText ~1/s per chat — faster edits trigger HTTP 429.
    _SPIN_INTERVAL = 2.0
    _MIN_EDIT_GAP = 1.85

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
        self._last_edit_body = ''
        self._last_edit_mono = 0.0
        self._edit_lock = asyncio.Lock()
        self._phase = 'boot'
        self._script_idx = 0
        self._hold_captcha = False
        self._captcha_dispatched = False

    def _script_lines(self) -> tuple[str, ...]:
        return _terminal_lines(self.mode)

    def start_script_ticker(self, *, interval: float = 0.22) -> None:
        """Animate terminal script lines until captcha wait."""
        chat_id = self._chat_id()
        if chat_id is None:
            return
        old = _SCRIPT_TICKERS.pop(chat_id, None)
        if old and not old.done():
            old.cancel()

        async def _loop() -> None:
            try:
                script = self._script_lines()
                while self._animating:
                    if self._script_idx >= len(script):
                        break
                    line = script[self._script_idx]
                    if line not in self._lines:
                        self._lines.append(line)
                        await self._render()
                    if 'captcha ready' in line.lower():
                        self._phase = 'captcha_wait'
                    self._script_idx += 1
                    await asyncio.sleep(interval)
            except asyncio.CancelledError:
                return

        _SCRIPT_TICKERS[chat_id] = asyncio.create_task(_loop())

    def _chat_id(self) -> int | None:
        if hasattr(self._msg, 'chat') and self._msg.chat:
            return self._msg.chat.id
        for cid, scr in _LOADING_SCREEN_BY_CHAT.items():
            if scr is self:
                return cid
        return None

    async def on_captcha_dispatched(self) -> None:
        """Captcha image sent — terminal keeps accumulating backend steps."""
        self._captcha_dispatched = True
        self._phase = 'captcha_wait'
        line = '[+] Captcha sent — reply with text'
        if line not in self._lines:
            self._lines.append(line)
        self._footer = 'Reply with captcha (4–8 chars)'
        await self._render(force=True)

    async def hold_for_captcha(self, hint: str = '') -> None:
        """Keep panel open after captcha image — wait for user text."""
        self._hold_captcha = True
        self._phase = 'captcha_wait'
        if '[+] Captcha ready' not in '\n'.join(self._lines) and not self._captcha_dispatched:
            self._lines.append('[+] Captcha ready — reply with text')
        self._footer = hint or 'Reply with captcha (4–8 chars)'
        await self._render(force=True)

    async def append_milestone(self, text: str = '', *, footer: str = '') -> None:
        """Add a milestone line without closing the terminal."""
        label = (text or '').strip()
        if label:
            step_line = label if label.startswith('[') else f'[+] {label}'
            if not self._lines or self._lines[-1] != step_line:
                self._lines.append(step_line)
        if footer:
            self._footer = footer
        if self._status == 'done':
            self._status = 'loading'
        if not self._animating:
            await self._start_spinner()
        if not _SCRIPT_TICKERS.get(self._chat_id() or -1):
            self.start_script_ticker()
        await self._render(force=True)

    async def advance_after_captcha(self, step_text: str = 'OTP request') -> None:
        """User submitted captcha — continue session terminal."""
        chat_id = self._chat_id()
        if chat_id is not None:
            ticker = _SCRIPT_TICKERS.pop(chat_id, None)
            if ticker and not ticker.done():
                ticker.cancel()
        self._hold_captcha = False
        self._phase = 'otp'
        script = self._script_lines()
        while self._script_idx < len(script) and 'captcha ready' in script[self._script_idx].lower():
            self._script_idx += 1
        self._push_step_line(self._current + 1, max(self._total, 3), step_text)
        self._footer = ''
        if self._status == 'done':
            self._status = 'loading'
        if not self._animating:
            await self._start_spinner()
        self.start_script_ticker()
        await self._render(force=True)


    async def mark_instant(self) -> None:
        """Pool hot — form filled without slow browser."""
        if '[+] Instant form fill ⚡' not in self._lines:
            self._lines.append('[+] Instant form fill ⚡')
        await self._render(force=True)

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
                await self._render()
                await asyncio.sleep(self._SPIN_INTERVAL)
        except asyncio.CancelledError:
            return

    def _mode_start_line(self) -> str:
        labels = {
            'fetch': '[+] Aadhaar SMS fetch started',
            'pdf': '[+] e-Aadhaar PDF flow started',
            'captcha': '[+] Captcha session started',
        }
        return labels.get(self.mode, '[+] Operation started')

    def _push_step_line(self, n: int, total: int, text: str) -> None:
        """Append one real progress line — never repeat the same line twice."""
        label = (text or '').strip()
        if not label:
            label = f'Step {n}/{total}'
        step_line = f'[{n}/{total}] {label}'
        if self._lines and self._lines[-1] == step_line:
            return
        self._lines.append(step_line)

    async def show(self) -> None:
        self._lines = [self._mode_start_line()]
        await self._start_spinner()
        await self._render()

    async def log_detail(self, line: str) -> None:
        return

    async def update(self, n: int, total: int, text: str = '') -> None:
        self._total = max(total, 1)
        self._current = n
        self._push_step_line(n, total, text)
        await self._render()

    async def done(self, final: str = '', *, dismiss: bool = True) -> None:
        await self._stop_spinner()
        self._status = 'done'
        if self._lines and self._lines[-1] != '[+] Done':
            self._lines.append('[+] Done')
        self._footer = final
        await self._render(force=True)
        if dismiss:
            chat_id = None
            for cid, scr in list(_LOADING_SCREEN_BY_CHAT.items()):
                if scr is self:
                    chat_id = cid
                    break
            if chat_id is not None:
                await asyncio.sleep(0.5)
                await dismiss_loading_screen(chat_id)

    async def fail(self, err: str = '', *, dismiss: bool = False) -> None:
        await self._stop_spinner()
        self._status = 'fail'
        if not self._lines:
            self._lines = [self._mode_start_line()]
        if self._lines[-1] != '[!] Stopped':
            self._lines.append('[!] Stopped')
        self._footer = err
        await self._render(force=True)
        if dismiss:
            chat_id = None
            for cid, scr in list(_LOADING_SCREEN_BY_CHAT.items()):
                if scr is self:
                    chat_id = cid
                    break
            if chat_id is not None:
                await dismiss_loading_screen(chat_id)

    def _panel_text(self) -> str:
        target = self.mobile or '—'
        elapsed = int(time.monotonic() - self._started)
        body = [
            self._spinner_line(),
            f'  {elapsed}s elapsed',
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            f'[📡] TARGET:  {target}',
        ]
        display_name = (self.name or '').strip()
        if display_name and not is_skip_name(display_name):
            body.append(f'[👤] NAME:    {display_name}')
        body.extend([
            '━━━━━━━━━━━━━━━━━━━━',
            '[⚡️] LIVE TERMINAL:',
        ])
        body.extend(self._lines)
        if self._status == 'fail' and self._footer:
            body.extend(['', f'[!] {self._footer[:200]}'])
        elif self._footer:
            body.extend(['', self._footer[:400]])
        return '\n'.join(body)[:4000]

    async def _render(self, *, force: bool = False) -> None:
        text = self._panel_text()
        if not force and text == self._last_edit_body:
            return
        async with self._edit_lock:
            if not force:
                wait = self._MIN_EDIT_GAP - (time.monotonic() - self._last_edit_mono)
                if wait > 0:
                    await asyncio.sleep(wait)
            try:
                await self._msg.edit_text(text)
                self._last_edit_body = text
                self._last_edit_mono = time.monotonic()
            except Exception as exc:
                err = str(exc).lower()
                if '429' in err or 'too many requests' in err or 'retry after' in err:
                    self._last_edit_mono = time.monotonic() + 2.0
                    await asyncio.sleep(3.0)
                retry_after = getattr(exc, 'retry_after', None)
                if retry_after:
                    await asyncio.sleep(float(retry_after) + 0.5)
