# Rebel Adhar v4.1 — Astik style

**Astik jaisa (video flow):** Tap → **DOB hat jata hai** → sirf **Name + Mobile + Captcha** → Send OTP.

## Kya karta hai

1. UIDAI `OR Enter Email` → `OR Enter Mobile` mode switch (Astik bookmark jaisa)
2. DOB field **hide** (`display:none`) — screen pe dikhe hi nahi
3. Backup: DOB **disable** + Angular `FormControl.disable()`
4. Send OTP se pehle DOB dubara hide/disable ensure

## Install (Kiwi)

1. Purana script delete
2. `rebel-adhar.user.js` v4.1 load karo
3. https://myaadhaar.uidai.gov.in/retrieve-eid-uid
4. **Rebel Adhar ON** → DOB field **gayab** ho (jaise video me Astik ke baad)
5. Mobile + Captcha → Send OTP

## Success logs

```
DOB hidden (Astik) | blocks:1
Astik ON done | dobHidden:true
Send OTP prep | dobHidden:true
fetch ...
```

## Download

https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js
