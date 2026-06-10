package com.rebel.panel.security;

import android.content.Context;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * JWT session lifecycle: local checks + silent server re-validation.
 */
public final class SessionManager {

    private static volatile long lastSilentCheckMs = 0;
    private static final long SILENT_INTERVAL_MS = 45_000L;

    private SessionManager() {}

    public static boolean hasValidLocalSession(Context ctx) {
        String jwt = SecurityPrefs.getAccessJwt(ctx);
        if (jwt.isEmpty()) return false;
        if (!jwtDeviceMatches(jwt, DeviceFingerprint.get(ctx))) return false;
        long exp = SecurityPrefs.getAccessExp(ctx);
        if (exp > 0 && System.currentTimeMillis() / 1000L > exp) {
            return tryRefresh(ctx);
        }
        return true;
    }

    /** Strict check — used before sensitive operations. */
    public static boolean ensureValidSession(Context ctx) {
        if (!hasValidLocalSession(ctx)) {
            if (!tryRefresh(ctx)) return false;
        }
        long now = System.currentTimeMillis();
        if (now - lastSilentCheckMs > SILENT_INTERVAL_MS) {
            lastSilentCheckMs = now;
            if (!KeyValidator.validateWithServer(ctx)) {
                if (!tryRefresh(ctx)) return false;
                if (!KeyValidator.validateWithServer(ctx)) return false;
            }
        }
        return hasValidLocalSession(ctx);
    }

    /** Background server ping — never logs user out on network fail. */
    public static void ensureValidSessionSoft(Context ctx) {
        if (!hasValidLocalSession(ctx)) return;
        long now = System.currentTimeMillis();
        if (now - lastSilentCheckMs < SILENT_INTERVAL_MS) return;
        lastSilentCheckMs = now;
        new Thread(() -> {
            try {
                if (!KeyValidator.validateWithServer(ctx)) tryRefresh(ctx);
            } catch (Exception ignored) {}
        }).start();
    }

    public static void logout(Context ctx) {
        try {
            String jwt = SecurityPrefs.getAccessJwt(ctx);
            if (!jwt.isEmpty()) {
                JSONObject body = new JSONObject();
                body.put("action", "logout");
                body.put("access_token", jwt);
                ApiClient.postSigned(ctx, body);
            }
        } catch (Exception ignored) {}
        SecurityPrefs.wipeAll(ctx);
        lastSilentCheckMs = 0;
    }

    public static String sessionJsonForBridge(Context ctx) {
        try {
            if (!hasValidLocalSession(ctx)) {
                return new JSONObject().put("ok", false).put("error", "No session").toString();
            }
            return new JSONObject()
                    .put("ok", true)
                    .put("token", SecurityPrefs.getAccessJwt(ctx))
                    .put("expires", SecurityPrefs.getAccessExp(ctx))
                    .toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"No session\"}";
        }
    }

    private static boolean tryRefresh(Context ctx) {
        long refreshExp = SecurityPrefs.getRefreshExp(ctx);
        if (refreshExp > 0 && System.currentTimeMillis() / 1000L > refreshExp) return false;
        String refresh = SecurityPrefs.getRefreshJwt(ctx);
        if (refresh.isEmpty()) return false;
        if (!jwtDeviceMatches(refresh, DeviceFingerprint.get(ctx))) return false;
        return KeyValidator.refreshTokens(ctx);
    }

    private static boolean jwtDeviceMatches(String jwt, String deviceFp) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return false;
            String payload = new String(Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING),
                    StandardCharsets.UTF_8);
            JSONObject o = new JSONObject(payload);
            String dfp = o.optString("dfp", "");
            return !dfp.isEmpty() && dfp.equals(deviceFp);
        } catch (Exception e) {
            return false;
        }
    }
}
