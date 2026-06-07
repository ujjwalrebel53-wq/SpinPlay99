# Rebel Adhar v4.0 — Astik style

**Astik jaisa:** Tap → **DOB disable** → user sirf **mobile + captcha** (naam bhi) → Send OTP.

## Kya karta hai

1. DOB input + calendar button **disabled** (gray, fill nahi karna)
2. Angular `FormControl.disable()` on DOB — validation skip
3. Optional: UIDAI `OR Enter Email` link click (agar mile)
4. Send OTP se pehle DOB dubara disable ensure

## Install (Kiwi)

1. Purana script delete
2. `rebel-adhar.user.js` v4.0 load karo
3. https://myaadhaar.uidai.gov.in/retrieve-eid-uid
4. **Rebel Adhar ON** → DOB gray/disabled dikhe
5. Mobile + Captcha → Send OTP

## Success logs

```
DOB disabled (Astik) | blocks:1
Astik ON done | dobDisabled:true
Send OTP prep | dobDisabled:true
fetch ...
```

## Download

https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js
