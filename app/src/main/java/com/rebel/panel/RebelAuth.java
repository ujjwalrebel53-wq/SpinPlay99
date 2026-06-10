package com.rebel.panel;

import android.content.Context;

import com.rebel.panel.security.KeyValidator;
import com.rebel.panel.security.SessionManager;

import org.json.JSONObject;

import java.util.Iterator;

/**
 * WebView bridge — panel inside MainActivity uses this for session + login fallback.
 */
public final class RebelAuth {

    private RebelAuth() {}

    public static String login(Context ctx, String key) {
        KeyValidator.Result r = KeyValidator.login(ctx, key);
        if (r.ok) {
            try {
                return new JSONObject()
                        .put("ok", true)
                        .put("token", r.accessJwt)
                        .put("expires", r.accessExp)
                        .toString();
            } catch (Exception e) {
                return err("Login failed");
            }
        }
        return err(r.error != null ? r.error : "Invalid key");
    }

    public static String checkSession(Context ctx) {
        if (!SessionManager.hasValidLocalSession(ctx)) {
            return err("No session");
        }
        return SessionManager.sessionJsonForBridge(ctx);
    }

    public static void logout(Context ctx) {
        SessionManager.logout(ctx);
        RebelVault.put(ctx, "auto_token_cfg", "");
    }

    public static String getAutoTokenConfig(Context ctx) {
        String v = RebelVault.get(ctx, "auto_token_cfg");
        if (v == null || v.isEmpty()) {
            try {
                return new JSONObject().put("ok", true).put("config", new JSONObject().put("enabled", false)).toString();
            } catch (Exception e) {
                return "{\"ok\":true,\"config\":{\"enabled\":false}}";
            }
        }
        try {
            return new JSONObject().put("ok", true).put("config", new JSONObject(v)).toString();
        } catch (Exception e) {
            return "{\"ok\":true,\"config\":{\"enabled\":false}}";
        }
    }

    public static String saveAutoTokenConfig(Context ctx, String json) {
        try {
            JSONObject body = new JSONObject(json);
            JSONObject cur = new JSONObject();
            String old = RebelVault.get(ctx, "auto_token_cfg");
            if (old != null && !old.isEmpty()) cur = new JSONObject(old);
            Iterator<String> it = body.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (!"action".equals(k) && !"token".equals(k)) cur.put(k, body.get(k));
            }
            RebelVault.put(ctx, "auto_token_cfg", cur.toString());
            return "{\"ok\":true}";
        } catch (Exception e) {
            return err("Save failed");
        }
    }

    public static void addKey(Context ctx, String key) {}

    public static boolean importKeysFile(Context ctx, java.io.File src) {
        return false;
    }

    private static String err(String msg) {
        try {
            return new JSONObject().put("ok", false).put("error", msg).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"error\"}";
        }
    }
}
