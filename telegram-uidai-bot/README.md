# UIDAI Live Telegram Bot

Telegram se UIDAI `retrieve-eid-uid` page kholo, **animated GIF** dekho, captcha **live reply** karo, Send OTP chalao — Rebel Adhar page bundle + Indian proxy ke saath.

## Setup

```bash
cd telegram-uidai-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# .env edit karo — TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHAT_IDS
```

### Telegram token

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token copy → `.env` me `TELEGRAM_BOT_TOKEN`
2. [@userinfobot](https://t.me/userinfobot) → apna **chat id** → `.env` me `TELEGRAM_ALLOWED_CHAT_IDS`

### Proxy (recommended)

```env
UIDAI_PROXY=http://139.167.218.162:3127
```

## Run

```bash
python bot.py
```

## Commands

| Command | Kaam |
|---------|------|
| `/start` | Help |
| `/open` | Site kholo (default name/mobile `.env` se) |
| `/open KAMAR JAHAN 7651892956` | Custom name/mobile |
| `/captcha` | Captcha image dubara bhejo |
| `/refresh` | Naya captcha load |
| `/status` | Session info |
| `/close` | Browser band |

**Flow:** `/open` → animated GIF + captcha photo → captcha text **reply** karo (jaise `6fhxdf`) → OTP logs + screenshot.

## Notes

- Bot **sirf allowed chat ids** use kar sakte hain (security).
- Ye tumhare **PC/VPS** pe chalega — token `.env` me rakho, git me mat daalo.
- Real OTP SMS tumhare number pe tab aayega jab captcha **sahi** ho.
