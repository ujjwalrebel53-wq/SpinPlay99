package com.rebel.panel;

import android.content.Context;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * HMAC attestation for server-side login/API — bypass blocked without valid token.
 */
public final class RebelAttest {

    public static final String HEADER = "X-Rebel-Attest";

    private RebelAttest() {}

    public static String buildHeader(Context ctx) {
        long ts = System.currentTimeMillis() / 1000L;
        String secret = BuildConfig.REBEL_APP_SECRET;
        String payload = ts + ":" + RebelConfig.APK_VERSION_CODE;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sig = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String h = Base64.encodeToString(sig, Base64.NO_WRAP);
            return ts + ":" + h;
        } catch (Exception e) {
            return ts + ":fail";
        }
    }

    public static String deviceIdHash(Context ctx) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(RebelVault.getDeviceSecret(ctx).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", d[i]));
            return sb.toString();
        } catch (Exception e) {
            return "unknown";
        }
    }
}
