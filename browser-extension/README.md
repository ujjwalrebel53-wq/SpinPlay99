# Rebel Adhar v3.0

UIDAI **Retrieve Aadhaar** page ke liye — production Angular (bina `formcontrolname`) ke saath kaam karta hai.

## Kaise kaam karta hai

1. **mat-label** se fields pehchanta hai (prod Angular mein `formcontrolname` empty hota hai)
2. **Step 1:** `OR Enter Email Address` click → DOB hide
3. **Step 2:** `OR Enter Mobile Number` click → mobile wapas, DOB hidden rehti hai
4. Fallback: mat-datepicker + Angular FormControl pe Date set

## Kiwi install

1. Purana script **delete** karo
2. Download: `rebel-adhar.user.js` (v3.0.0)
3. Kiwi → Extensions → Developer mode → + → file select
4. https://myaadhaar.uidai.gov.in/retrieve-eid-uid
5. **Rebel Adhar ON** → DOB gayab → naam + mobile + captcha → Send OTP

## Logs mein success

```
Click OR Enter Email | OR Enter Email Address
Apply done | switched:true
Submit prep | emptyDob:0
fetch ...  ← OTP API
```

## Download

```
https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/cursor/aadhaar-form-helper-extension-95e1/browser-extension/rebel-adhar.user.js
```

## Dev

```bash
node browser-extension/build-userscript.js   # bundle userscript
node browser-extension/test/run-test.js      # realistic mock test
```
