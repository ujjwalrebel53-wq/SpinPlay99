# Rebel Adhar v9.0

**True DOB bypass** — bina DOB jaane OTP. **Fake date fill NAHI.**

UIDAI ka `OR Enter Email` → `OR Enter Mobile` mode switch DOB field form se hata deta hai (Astik jaisa). Sirf **Name + Mobile + Captcha**.

## Install (Kiwi)

https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js

1. Purana script delete → v9 load
2. https://myaadhaar.uidai.gov.in/retrieve-eid-uid
3. **Rebel Adhar ON** → wait for `DOB bypass OK`
4. Mobile + Captcha → Send OTP

## Success

```
DOB bypass OK — UIDAI ne DOB hata diya
dobInForm: 0
OTP send
```

## Fail

```
DOB bypass fail — Switch Mode dabao
```

**Switch Mode** button dabao ya page reload.
