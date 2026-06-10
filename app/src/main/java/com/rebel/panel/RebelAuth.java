package com.rebel.panel;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import android.util.Base64;
import java.util.Iterator;
import java.util.Locale;

/**
 * Offline key login — no PHP server. Keys from assets/rebel_keys.json + vault.
 */
public final class RebelAuth {

    private static final String VAULT_SESSION = "session_json";
    private static final String VAULT_KEYS = "keys_json";

    private RebelAuth() {}

    public static String login(Context ctx, String key) {
        key = norm(key);
        if (key.isEmpty()) return err("Access key required");
        try {
            JSONObject keys = loadKeys(ctx);
            if (!keys.has(key)) return err("Invalid or expired key");
            JSONObject row = keys.getJSONObject(key);
            if (row.optBoolean("used", false) || row.optInt("uses", 0) >= 1) {
                return err("Key already used");
            }
            if (!row.optBoolean("active", true)) return err("Invalid or expired key");
            row.put("used", true);
            row.put("uses", 1);
            row.put("used_at", System.currentTimeMillis() / 1000L);
            saveKeys(ctx, keys);

            String token = genToken();
            long exp = System.currentTimeMillis() / 1000L + 86400L * 30L;
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
            return err("Login failed");
        }
    }

    public static String checkSession(Context ctx) {
        try {
            String raw = RebelVault.get(ctx, VAULT_SESSION);
            if (raw == null || raw.isEmpty()) return err("No session");
            JSONObject s = new JSONObject(raw);
            long exp = s.optLong("exp", 0);
            if (exp > 0 && System.currentTimeMillis() / 1000L > exp) {
                RebelVault.put(ctx, VAULT_SESSION, "");
                return err("Session expired");
            }
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("expires", exp);
            return out.toString();
        } catch (Exception e) {
            return err("No session");
        }
    }

    public static void logout(Context ctx) {
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
        key = norm(key);
        if (key.isEmpty()) return;
        try {
            JSONObject keys = loadKeys(ctx);
            if (!keys.has(key)) {
                JSONObject row = new JSONObject();
                row.put("active", true);
                row.put("used", false);
                row.put("uses", 0);
                keys.put(key, row);
                saveKeys(ctx, keys);
            }
        } catch (Exception ignored) {}
    }

    /** OTA: merge keys from downloaded rebel_keys.json into vault. */
    public static boolean importKeysFile(Context ctx, File src) {
        if (src == null || !src.isFile() || src.length() == 0) return false;
        try {
            JSONObject incoming = readJsonFile(src);
            JSONObject incomingKeys = incoming.optJSONObject("keys");
            if (incomingKeys == null) return false;
            JSONObject keys = loadKeys(ctx);
            Iterator<String> it = incomingKeys.keys();
            while (it.hasNext()) {
                String k = it.next();
                keys.put(k, incomingKeys.getJSONObject(k));
            }
            saveKeys(ctx, keys);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static JSONObject readJsonFile(File file) throws Exception {
        byte[] buf = new byte[(int) file.length()];
        try (FileInputStream in = new FileInputStream(file)) {
            in.read(buf);
        }
        return new JSONObject(new String(buf, StandardCharsets.UTF_8));
    }

    private static JSONObject loadKeys(Context ctx) throws Exception {
        String vault = RebelVault.get(ctx, VAULT_KEYS);
        JSONObject keys = new JSONObject();
        if (vault != null && !vault.isEmpty()) {
            JSONObject v = new JSONObject(vault);
            JSONObject vk = v.optJSONObject("keys");
            if (vk != null) {
                Iterator<String> it = vk.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    keys.put(k, vk.getJSONObject(k));
                }
            }
        }
        InputStream in = ctx.getAssets().open("rebel_keys.json");
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        JSONObject asset = new JSONObject(sb.toString());
        JSONObject ak = asset.optJSONObject("keys");
        if (ak != null) {
            Iterator<String> it = ak.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (!keys.has(k)) keys.put(k, ak.getJSONObject(k));
            }
        }
        return keys;
    }

    private static void saveKeys(Context ctx, JSONObject keys) throws Exception {
        RebelVault.put(ctx, VAULT_KEYS, new JSONObject().put("keys", keys).toString());
    }

    private static String norm(String key) {
        return key == null ? "" : key.trim().toUpperCase(Locale.US).replaceAll("\\s+", "");
    }

    private static String genToken() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static String err(String msg) {
        try {
            return new JSONObject().put("ok", false).put("error", msg).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"error\"}";
        }
    }
}
