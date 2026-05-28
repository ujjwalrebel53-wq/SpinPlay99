# Rebel Panel — Native Android APK

Dedicated **native** admin app for the Rebel Panel dashboard. No WebView — built with Android UI + Firebase Realtime Database SDK.

## Features

- Native login screen (`admin` / `rebel2024`)
- Real-time device list (online/offline, battery, SMS count)
- Per-device tabs: SMS, Calls, Contacts, SIM, Permissions, Send SMS, Forwarding
- Same Firebase backend as the web panel (`spinplay99` RTDB)

## Build

```bash
./gradlew assembleRelease
```

APK: `app/build/outputs/apk/release/app-release.apk`

## Package

- `com.rebel.panel`
- Version `3.0-native`
