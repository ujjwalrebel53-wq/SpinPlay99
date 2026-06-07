# Rebel Adhar v2.2

**Astik jaisa kaam** — UIDAI ka official **OR Enter Email** mode switch.

## Problem kya tha?

Pehle wale version DOB ko CSS se chhupa dete the, lekin Angular form andar se DOB maangta rehta tha — isliye **Send OTP pe koi API call nahi hoti thi**.

v2.2 pehle UIDAI ka **OR Enter Email** link click karta hai (Astik jaisa). Agar link na mile to safe fallback: sirf DOB validator clear + hide.

## Kiwi Browser install

1. Purana script hatao (Extensions → delete)
2. Naya download: `rebel-adhar.user.js`
3. Kiwi → ⋮ → Extensions → Developer mode ON → + → file select
4. https://myaadhaar.uidai.gov.in/retrieve-eid-uid kholo
5. **Rebel Adhar ON** dabao
6. DOB gayab hona chahiye + **OR Enter Email** area dikhe
7. **Asli naam** (Mr mat likho) + **registered mobile** + captcha → Send OTP

## Buttons

| Button | Kaam |
|--------|------|
| Rebel Adhar ON/OFF | Main toggle |
| Switch Mode | Dob ab bhi dikhe to manually mode switch |
| Logs | Debug panel |

## Download link

```
https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js
```

## Logs mein kya dekho

- `Click near mobile` ya `Click mode switch` = sahi link mila
- `After switch ok:true` = mode switch success
- `fetch` / `xhr` line = OTP API call gayi
- `NO API CALL` = Switch Mode dabao, page reload, asli naam use karo
