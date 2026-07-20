# Rebel Panel

Telegram bot + mobile web panel for device management.

## Files

| File | Purpose |
|------|---------|
| `rebel.py` | Telegram bot |
| `mobile.php` | Mobile web panel |
| `rebel_bot_lib.php` | Key/session auth (required by mobile.php) |
| `rebel_keys.json` | Auto-created key store |

## Setup

1. Upload all files to your PHP host (AlwaysData, etc.)
2. Install Python deps: `pip install pyTelegramBotAPI aiohttp aiofiles`
3. Run bot: `python rebel.py`
4. Generate a web access key (see below) and login on `mobile.php`

## Generate access key

Create a key manually or via PHP:

```php
<?php
require 'rebel_bot_lib.php';
echo rebel_create_key('web', 1, 30);
```

Or add `/genkey` command to `rebel.py` (recommended).

## Notes

- `mobile.php` auth endpoint: `?rebel_auth=1`
- APK keys (`APK-...`) cannot login on web — use `WEB-...` keys
- Keep `rebel_keys.json` writable by PHP
