package com.rebel.panel.security;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Unique device fingerprint: Android ID + hardware props → SHA-256.
 * Prevents: key sharing across phones (one key = one device).
 */
public final class DeviceFingerprint {

    private static volatile String cached;

    private DeviceFingerprint() {}

    public static String get(Context ctx) {
        if (cached != null) return cached;
        synchronized (DeviceFingerprint.class) {
            if (cached != null) return cached;
            String androidId = "";
            try {
                androidId = Settings.Secure.getString(
                        ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
                if (androidId == null) androidId = "";
            } catch (Exception ignored) {}
            String raw = androidId + "|"
                    + Build.HARDWARE + "|"
                    + Build.BOARD + "|"
                    + Build.BRAND + "|"
                    + Build.DEVICE;
            cached = sha256Hex(raw);
            return cached;
        }
    }

    public static void clearCache() {
        cached = null;
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return sha256HexFallback(input);
        }
    }

    private static String sha256HexFallback(String input) {
        return Integer.toHexString(input.hashCode());
    }
}
