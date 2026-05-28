# Rebel Panel APK

Android app that wraps the **Rebel Panel** admin dashboard (`panel/sex.php`) for fast mobile access.

## Features

- Panel HTML bundled inside the APK (`assets/rebel_panel/`) for instant offline UI load
- Firebase real-time dashboard (devices, SMS, calls, contacts) via WebView
- Short splash screen (~1.2s) then straight to the panel
- Pull-to-refresh to reload
- Fallback: loads from GitHub raw URL if local assets fail

## Build

```bash
./gradlew assembleRelease
```

APK output: `app/build/outputs/apk/release/app-release.apk`

## Login

Default panel login: `admin` / `rebel2024` (as configured in the panel HTML).

## Panel source

- Bundled: `app/src/main/assets/rebel_panel/index.html`
- Server copy: `panel/sex.php`
