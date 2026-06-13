package com.rebel.panel;

import android.content.Context;

import org.json.JSONObject;

import java.util.Iterator;

/**
 * Login via server — keys from Telegram bot (/genkey) stored in panel/data/rebel_keys.json.
 */
public final class RebelAuth {

    private static final String VAULT_SESSION = "session_json";

    private RebelAuth() {}

    public static String login(Context ctx, String key) {
        key = norm(key);
        if (key.isEmpty()) return err("Access key required");
        try {
            JSONObject body = new JSONObject();
            body.put("action", "login");
            body.put("key", key);
            body.put("remember", true);
            String resp = RebelAuthApi.post(ctx, body);
            JSONObject r = new JSONObject(resp);
            if (!r.optBoolean("ok", false)) {
                return err(r.optString("error", "Invalid or expired key"));
            }
            String token = r.optString("token", "");
            long exp = r.optLong("expires", 0);
            JSONObject sess = new JSONObject();
            sess.put("token", token);
            sess.put("exp", exp);
            sess.put("key", key);
            RebelVault.put(ctx, VAULT_SESSION, sess.toString());
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("token", token);
            out.put("expires", exp);
            return out.toString();
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "Network error";
            if (msg.contains("Unable to resolve") || msg.contains("failed to connect")) {
                return err("Internet required — get key from @Rebelpanelbot");
            }
            return err("Login failed — check internet");
        }
    }

    public static String checkSession(Context ctx) {
        try {
            String raw = RebelVault.get(ctx, VAULT_SESSION);
            if (raw == null || raw.isEmpty()) return err("No session");
            JSONObject s = new JSONObject(raw);
            String token = s.optString("token", "");
            if (token.isEmpty()) return err("No session");

            JSONObject body = new JSONObject();
            body.put("action", "check");
            body.put("token", token);
            String resp = RebelAuthApi.post(ctx, body);
            JSONObject r = new JSONObject(resp);
            if (!r.optBoolean("ok", false)) {
                RebelVault.put(ctx, VAULT_SESSION, "");
                return err(r.optString("error", "Session expired"));
            }
            long exp = r.optLong("expires", s.optLong("exp", 0));
            s.put("exp", exp);
            RebelVault.put(ctx, VAULT_SESSION, s.toString());
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("expires", exp);
            return out.toString();
        } catch (Exception e) {
            // Offline: allow cached session if not past local expiry
            try {
                String raw = RebelVault.get(ctx, VAULT_SESSION);
                if (raw == null || raw.isEmpty()) return err("No session");
                JSONObject s = new JSONObject(raw);
                long exp = s.optLong("exp", 0);
                if (exp > 0 && System.currentTimeMillis() / 1000L > exp) {
                    RebelVault.put(ctx, VAULT_SESSION, "");
                    return err("Session expired");
                }
                if (s.optString("token", "").isEmpty()) return err("No session");
                JSONObject out = new JSONObject();
                out.put("ok", true);
                out.put("expires", exp);
                return out.toString();
            } catch (Exception ex) {
                return err("No session");
            }
        }
    }

    public static void logout(Context ctx) {
        try {
            String raw = RebelVault.get(ctx, VAULT_SESSION);
            if (raw != null && !raw.isEmpty()) {
                JSONObject s = new JSONObject(raw);
                String token = s.optString("token", "");
                if (!token.isEmpty()) {
                    JSONObject body = new JSONObject();
                    body.put("action", "logout");
                    body.put("token", token);
                    RebelAuthApi.post(ctx, body);
                }
            }
        } catch (Exception ignored) {}
        RebelVault.put(ctx, VAULT_SESSION, "");
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

    public static void addKey(Context ctx, String key) {
        // Keys are issued by @Rebelpanelbot on server only.
    }

    public static boolean importKeysFile(Context ctx, java.io.File src) {
        return false;
    }

    private static String norm(String key) {
        return key == null ? "" : key.trim().toUpperCase(java.util.Locale.US).replaceAll("\\s+", "");
    }

    private static String err(String msg) {
        try {
            return new JSONObject().put("ok", false).put("error", msg).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"error\"}";
        }
    }
}
