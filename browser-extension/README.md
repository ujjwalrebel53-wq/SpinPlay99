# Rebel Adhar v5.0 — Astik UI + OTP fix

**Astik jaisa (video flow):** Tap → **DOB hat jata hai** → sirf **Name + Mobile + Captcha** → Send OTP.

## Kya karta hai

1. UIDAI `OR Enter Email` → `OR Enter Mobile` mode switch (Astik bookmark jaisa)
2. DOB field **hide** (`display:none`) — screen pe dikhe hi nahi
3. **OTP fix**: Angular form me DOB silently `01/01/1990` + validators clear (user fill nahi karta)
4. Send OTP click pe sirf Angular patch — DOM change nahi (pehle isse API block hoti thi)
5. Network log: **fetch + xhr** dono

## Install (Kiwi)

1. Purana script delete
2. `rebel-adhar.user.js` v5.0 load karo
3. https://myaadhaar.uidai.gov.in/retrieve-eid-uid
4. **Rebel Adhar ON** → DOB field **gayab** ho (jaise video me Astik ke baad)
5. Mobile + Captcha → Send OTP

## Success logs

```
DOB hidden (Astik) | blocks:1
Astik ON done | dobHidden:true
Send OTP prep | formOk:true
fetch/xhr ... (OTP API)

OTP na aaye → **Copy Debug** button dabao, text mujhe bhejo
fetch ...
```

## Download

https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js
