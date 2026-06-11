# UIDAI Live Telegram Bot (v2 — Python-first)

Telegram se UIDAI `retrieve-eid-uid` page kholo, captcha **live reply** karo, OTP bhejo — **bina extension bundle**, direct API (`dob: null`).

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

### Telegram token

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token copy
2. [@userinfobot](https://t.me/userinfobot) → apna chat id

### Proxy (recommended)

```env
UIDAI_PROXY=auto
# ya apna: UIDAI_PROXY=http://ip:port
```

## Commands

| Command | Kaam |
|---------|------|
| `/open` | Naam → mobile → site + captcha |
| `/open 7651892956` | Sirf mobile — **24h session reuse** (reload skip ⚡) |
| `/open KAMAR JAHAN 7651892956` | Seedha naam + mobile |
| `/open fresh 7651892956` | Pura naya page load (force reload) |
| `/captcha` | Captcha image dubara |
| `/refresh` | Naya captcha |
| `/status` | Session + captchaTxnId + 24h TTL |
| `/close` | Browser band |

**Flow:** `/open` → naam → mobile → captcha → OTP SMS → **6 digit OTP reply** → Aadhaar/EID registered mobile pe SMS.

### 24h persistent session (v2.3)

Pehli baar `/open` se UIDAI page khulta hai. Uske baad **24 ghante** tak dubara `/open MOBILE` karoge to poora site reload nahi hoga — same browser tab reuse, sirf naam/mobile + naya captcha.

- `/open fresh MOBILE` — pura naya load chahiye ho to
- Background keepalive har 10 min (env: `UIDAI_KEEPALIVE_MIN`, `UIDAI_SESSION_HOURS`)

## Architecture (v2)

| File | Role |
|------|------|
| `uidai_api.py` | OTP payload, headers, UIDAI response parse |
| `react_extract.py` | ~20 lines JS — `captchaTxnID` from React fiber |
| `browser_session.py` | Playwright page load + captcha screenshot |
| `proxy_india.py` | Indian proxy auto-pick |

Extension `page-bundle.js` **ab bot ke liye zaroori nahi** — sirf manual browser use ke liye optional.

## VPS update

```bash
cd www
BASE="https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/www"
for f in bot.py browser_session.py uidai_api.py react_extract.py run_all_tests.py; do
  wget -O "$f" "$BASE/$f"
done
mkdir -p tests
wget -O tests/test_uidai_api.py "$BASE/tests/test_uidai_api.py"
touch tests/__init__.py
pkill -9 -f bot.py
source .venv/bin/activate
nohup python bot.py > bot.log 2>&1 &
```

### Self-test (www ke andar)

```bash
cd www
source .venv/bin/activate
python3 run_all_tests.py
```
