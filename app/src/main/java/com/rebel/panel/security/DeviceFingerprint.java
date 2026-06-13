package com.rebel.panel.security;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.telephony.TelephonyManager;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Layer 15 — device fingerprint + StrongBox alias + SIM/hardware binding.
 */
public final class DeviceFingerprint {

    private static volatile String cached;

    private DeviceFingerprint() {}

    public static String get(Context ctx) {
        if (cached != null) return cached;
        synchronized (DeviceFingerprint.class) {
            if (cached != null) return cached;
            StrongBoxKeys.ensureKey(ctx);
            String androidId = safeAndroidId(ctx);
            String sim = safeSim(ctx);
            String sb = StrongBoxKeys.alias();
            String raw = androidId + "|"
                    + Build.HARDWARE + "|"
                    + Build.BOARD + "|"
                    + Build.BRAND + "|"
                    + Build.DEVICE + "|"
                    + sim + "|"
                    + sb;
            cached = sha256Hex(raw);
            return cached;
        }
    }

    public static void clearCache() {
        cached = null;
    }

    private static String safeAndroidId(Context ctx) {
        try {
            String id = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
            return id != null ? id : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static String safeSim(Context ctx) {
        try {
            TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm == null) return "";
            String sub = tm.getSimSerialNumber();
            return sub != null ? sub : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
