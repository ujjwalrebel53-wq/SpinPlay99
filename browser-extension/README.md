# Rebel Adhar v2.3

**DOB hide + Angular bypass** — real UIDAI page par "OR Enter Email" link aksar nahi milta, isliye v2.3 **hidden dummy DOB** (`01/01/1990`) set karke Angular ko satisfy karta hai.

## Problem kya tha?

Sirf DOB CSS se hide karne se Angular andar se form invalid rehta tha → **Send OTP pe API call nahi hoti**.

v2.3:
1. Toggle link dhundhta hai (shadow DOM + DOB/mobile ke paas)
2. Toggle na mile to **DOB bypass**: chhupa ke dummy value + Angular FormControl sync
3. Send OTP se **pehle** form prepare karta hai (capture phase)

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
