# UIDAI Live Telegram Bot

Telegram se UIDAI `retrieve-eid-uid` page kholo, **animated GIF** dekho, captcha **live reply** karo, Send OTP chalao — Rebel Adhar page bundle + Indian proxy ke saath.

## Setup

```bash
cd www
bash setup.sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
python bot.py
```

`setup.sh` puchega token + chat id — **nano ki zaroorat nahi.**

Seedha paste karna ho:

```bash
bash setup.sh "123456:ABC-token" "987654321"
```

### Telegram token kahan se

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token copy
2. [@userinfobot](https://t.me/userinfobot) → apna chat id

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
| `/open` | Pehle naam puchega, phir mobile, phir site khulegi |
| `/open KAMAR JAHAN 7651892956` | Seedha naam + mobile ke saath kholo |
| `/captcha` | Captcha image dubara bhejo |
| `/refresh` | Naya captcha load |
| `/status` | Session info |
| `/close` | Browser band |

**Flow:** `/open` → naam → mobile → **live loading steps** (VPN India + har step) → captcha photo → captcha reply → OTP live steps + logs.

**VPN:** `.env` me `UIDAI_PROXY=auto` — bot India proxy khud dhundh ke connect karega (city/IP dikhega).

## Notes

- Bot **sirf allowed chat ids** use kar sakte hain (security).
- Ye tumhare **PC/VPS** pe chalega — token `.env` me rakho, git me mat daalo.
- Real OTP SMS tumhare number pe tab aayega jab captcha **sahi** ho.
