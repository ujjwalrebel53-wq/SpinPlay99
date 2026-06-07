# Astik Helper — myAadhaar Form

Retrieve Aadhaar page par **DOB hide** + **Mobile/Email mode**.

## Name optional (Mr)

- Name field **required nahi** rahega (client-side)
- Khud naam likh sakte ho **ya sirf `Mr`**
- Khali chhodoge aur **Send OTP** dabayoge → auto **`Mr`** fill hoga
- **Note:** UIDAI server galat naam par OTP nahi bhej sakta — ye sirf form validation ease karta hai

## ⭐ Kiwi / Phone ke liye BEST (userscript)

Extension se zyada reliable:

1. Download file: **`rebel-adhar.user.js`**
2. Kiwi → **⋮ → Extensions** → Developer mode **ON**
3. **+ (from .zip/.crx/.user.js)** → `rebel-adhar.user.js` select karo
4. https://myaadhaar.uidai.gov.in/retrieve-eid-uid kholo
5. Screen par **red button** dikhega: `DOB Hide: OFF` → tap → **ON**
6. DOB field hide ho jayegi

## PC Chrome / Edge (extension)

1. `chrome://extensions` ya `edge://extensions`
2. Developer mode **ON**
3. **Load unpacked** → `browser-extension` folder
4. UIDAI retrieve page kholo → toggle ON

## Download

Branch ZIP:
https://github.com/ujjwalrebel53-wq/SpinPlay99/archive/refs/heads/cursor/aadhaar-form-helper-extension-95e1.zip

Direct userscript:
https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js

## Tested

- Mock UIDAI Angular form: **DOB hide PASS**
- Live UIDAI: India network / browser par test karo (server geo-block ho sakta hai)

## Files

| File | Use |
|------|-----|
| `rebel-adhar.user.js` | **Kiwi / mobile — Rebel Adhar (use this)** |
| `manifest.json` + `content.js` | Chrome/Edge extension |
| `core-logic.js` | Shared hide logic |

## Note

Sirf apne registered details ke saath use karo. OTP Indian mobile par aayega.
