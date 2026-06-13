package com.rebel.panel.security;

import android.content.Context;

import org.json.JSONObject;

/**
 * Layer 11 — fetch rotated secrets from server post-auth (no hardcoded runtime secrets).
 */
public final class SecretsManager {

    private static final String PREFS = "rebel_secrets_enc";
    private static volatile String cachedApiSalt = "";

    private SecretsManager() {}

    public static void fetchAfterAuth(Context ctx) {
        if (!SessionManager.hasValidLocalSession(ctx)) return;
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "fetch_secrets");
                body.put("access_token", SecurityPrefs.getAccessJwt(ctx));
                JSONObject resp = ApiClient.postSigned(ctx, body);
                if (resp.optBoolean("ok", false)) {
                    String salt = resp.optString("api_salt", "");
                    cachedApiSalt = salt;
                    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                            .edit().putString("salt", salt).apply();
                }
            } catch (Exception ignored) {}
        }).start();
    }

    public static String apiSalt(Context ctx) {
        if (!cachedApiSalt.isEmpty()) return cachedApiSalt;
        cachedApiSalt = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("salt", "");
        if (cachedApiSalt.isEmpty()) {
            try {
                return NativeGuard.nativeGetSecret();
            } catch (Exception e) {
                return "";
            }
        }
        return cachedApiSalt;
    }

    public static void wipe(Context ctx) {
        cachedApiSalt = "";
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
