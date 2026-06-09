# Rebel Panel

Secure Android APK + PHP mobile panel (`phone.php`).

## APK (Android)

Package: `com.rebel.panel`  
App name: **Rebel Panel**

### Build
```bash
chmod +x gradlew
./gradlew assembleRelease
```
APK: `app/build/outputs/apk/release/app-release.apk`

### Set your server URL
Edit `app/src/main/java/com/rebel/panel/RebelConfig.java`:
```java
public static final String DEFAULT_PANEL_URL = "https://rebelbhaiya.alwaysdata.net/phone.php";
public static final String DEFAULT_UPDATE_API = "https://rebelbhaiya.alwaysdata.net/rebel_app_api.php";
```

### OTA updates
Edit `panel/data/rebel_app_update.json` on server.

## Server (www folder)
- `phone.php` — mobile panel
- `rebel_app_api.php` — APK update API
- `rebel_app_lib.php` — attestation helper
- `data/rebel_app_update.json` — OTA config
