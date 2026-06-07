# Astik Helper — Browser Extension

myAadhaar **Retrieve Aadhaar** page par Astik jaisa kaam karta hai: **Date of Birth hide** karke **Mobile / Email mode** enable karta hai.

## Install (Chrome / Edge / Brave)

1. Repo se `browser-extension` folder download karo (ya clone karo).
2. Browser mein kholo:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. **Developer mode** ON karo (top-right).
4. **Load unpacked** dabao.
5. `browser-extension` folder select karo.

Extension toolbar mein dikhega.

## Use kaise karein

1. Ye page kholo: https://myaadhaar.uidai.gov.in/retrieve-eid-uid
2. Extension icon par click karo.
3. **DOB hide mode** toggle **ON** karo.
4. Page par blue bar dikhegi: `Astik Helper ON`
5. DOB field gayab ho jayegi; Mobile / Email option active ho jayega.
6. Normal form chahiye ho to toggle **OFF** karo.

## Kya karta hai

| Action | Result |
|--------|--------|
| Toggle ON | DOB field + label hide |
| Toggle ON | "OR Enter Email" jaisa option try karta hai |
| Toggle ON | Mobile / Email fields visible |
| Toggle OFF | Form wapas normal |

## Files

- `manifest.json` — Extension config (Manifest V3)
- `content.js` — Page par DOM change (hide/show fields)
- `content.css` — Hidden fields + ON indicator bar
- `popup.html` / `popup.js` — Toolbar popup UI
- `background.js` — Badge ON/OFF

## Note

- Yeh sirf **aapke browser mein page ko modify** karta hai — UIDAI server par kuch change nahi hota.
- Galat details par OTP nahi aayega; server-side validation same rehti hai.
- Sirf apne registered mobile/email ke saath use karo.

## Firefox

Firefox Manifest V3 support limited hai. Abhi Chrome/Edge/Brave ke liye optimized hai.
