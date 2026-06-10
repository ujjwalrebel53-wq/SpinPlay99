# Rebel Panel APK

**100% built-in panel** — no PHP URL, no black screen from remote load.

The full mobile panel (devices, SMS, send, Firebase) runs from `app/src/main/assets/panel/`.

## Install

GitHub → **Releases** → download `RebelPanel.apk`

Or build:
```bash
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk RebelPanel.apk
```

## Login key (APK built-in)

Demo key included in APK:
```
RBL-DEMO01-TEST01
```

Add more keys in `app/src/main/assets/rebel_keys.json` before building, or use bot keys synced into the APK.

## Update panel UI (no new APK store listing)

Edit files in `app/src/main/assets/panel/` and rebuild APK.

## Server PHP

`panel/phone.php` is still for **browser** use. The APK does **not** load it.
