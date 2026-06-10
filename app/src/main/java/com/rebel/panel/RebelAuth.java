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
 * Offline key login — keys from APK assets + OTA rebel_keys.json; usage state in vault.
 *
 * Key JSON per entry:
 *   "active": true/false
 *   "used": false          — set true after login (auto)
 *   "uses": 0              — times used (counter, start at 0)
 *   "max_uses": 1          — optional; 0 = unlimited logins
 */
public final class RebelAuth {

    private static final String VAULT_SESSION = "session_json";
    private static final String VAULT_KEY_STATE = "key_state_json";
    private static final String VAULT_EXTRA_KEYS = "extra_keys_json";

    private RebelAuth() {}

    public static String login(Context ctx, String key) {
        key = norm(key);
        if (key.isEmpty()) return err("Access key required");
        try {
            JSONObject keys = loadKeys(ctx);
            if (!keys.has(key)) return err("Invalid or expired key");
            JSONObject row = keys.getJSONObject(key);
            if (!row.optBoolean("active", true)) return err("Invalid or expired key");

            int timesUsed = row.optInt("uses", 0);
            int maxUses = row.optInt("max_uses", 1);
            if (row.optBoolean("used", false)) return err("Key already used");
            if (maxUses > 0 && timesUsed >= maxUses) return err("Key already used");

            timesUsed++;
            row.put("used", maxUses == 1);
            row.put("uses", timesUsed);
            row.put("used_at", System.currentTimeMillis() / 1000L);
            saveKeyState(ctx, key, row);

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
            JSONObject extra = loadExtraKeys(ctx);
            if (!extra.has(key)) {
                JSONObject row = new JSONObject();
                row.put("active", true);
                row.put("used", false);
                row.put("uses", 0);
                row.put("max_uses", 1);
                extra.put(key, row);
                RebelVault.put(ctx, VAULT_EXTRA_KEYS, new JSONObject().put("keys", extra).toString());
            }
        } catch (Exception ignored) {}
    }

    /** OTA downloaded rebel_keys.json — read on next loadKeys(). */
    public static boolean importKeysFile(Context ctx, File src) {
        return src != null && src.isFile() && src.length() > 0;
    }

    private static JSONObject loadKeys(Context ctx) throws Exception {
        JSONObject catalog = loadKeyCatalog(ctx);
        JSONObject state = loadKeyState(ctx);
        JSONObject merged = new JSONObject();
        Iterator<String> it = catalog.keys();
        while (it.hasNext()) {
            String k = it.next();
            JSONObject row = new JSONObject(catalog.getJSONObject(k).toString());
            if (state.has(k)) {
                JSONObject st = state.getJSONObject(k);
                boolean adminReset = !row.optBoolean("used", false) && row.optInt("uses", 0) == 0;
                if (!adminReset) {
                    if (st.has("used")) row.put("used", st.getBoolean("used"));
                    if (st.has("uses")) row.put("uses", st.getInt("uses"));
                    if (st.has("used_at")) row.put("used_at", st.getLong("used_at"));
                }
            }
            merged.put(k, row);
        }
        return merged;
    }

    /** APK assets + OTA file + runtime extra keys. */
    private static JSONObject loadKeyCatalog(Context ctx) throws Exception {
        JSONObject keys = new JSONObject();
        mergeCatalogFile(keys, readAssetJson(ctx, "rebel_keys.json"));
        File otaKeys = new File(ctx.getFilesDir(), "panel_ota/rebel_keys.json");
        if (otaKeys.isFile() && otaKeys.length() > 0) {
            mergeCatalogFile(keys, readJsonFile(otaKeys));
        }
        JSONObject extra = loadExtraKeys(ctx);
        Iterator<String> ex = extra.keys();
        while (ex.hasNext()) {
            String k = ex.next();
            keys.put(k, extra.getJSONObject(k));
        }
        return keys;
    }

    private static void mergeCatalogFile(JSONObject into, JSONObject file) throws Exception {
        if (file == null) return;
        JSONObject block = file.optJSONObject("keys");
        if (block == null && file.length() > 0 && !file.has("keys")) {
            block = file;
        }
        if (block == null) return;
        Iterator<String> it = block.keys();
        while (it.hasNext()) {
            String rawKey = it.next();
            String k = norm(rawKey);
            if (k.isEmpty()) continue;
            into.put(k, block.getJSONObject(rawKey));
        }
    }

    private static JSONObject readAssetJson(Context ctx, String name) throws Exception {
        InputStream in = ctx.getAssets().open(name);
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        return new JSONObject(sb.toString());
    }

    private static JSONObject readJsonFile(File file) throws Exception {
        byte[] buf = new byte[(int) file.length()];
        try (FileInputStream in = new FileInputStream(file)) {
            in.read(buf);
        }
        return new JSONObject(new String(buf, StandardCharsets.UTF_8));
    }

    private static JSONObject loadExtraKeys(Context ctx) throws Exception {
        String raw = RebelVault.get(ctx, VAULT_EXTRA_KEYS);
        if (raw == null || raw.isEmpty()) return new JSONObject();
        JSONObject o = new JSONObject(raw);
        return o.optJSONObject("keys") != null ? o.getJSONObject("keys") : new JSONObject();
    }

    private static JSONObject loadKeyState(Context ctx) throws Exception {
        String raw = RebelVault.get(ctx, VAULT_KEY_STATE);
        if (raw != null && !raw.isEmpty()) {
            JSONObject o = new JSONObject(raw);
            if (o.optJSONObject("keys") != null) return o.getJSONObject("keys");
        }
        // Legacy vault (keys_json) — migrate used state only
        String legacy = RebelVault.get(ctx, "keys_json");
        if (legacy == null || legacy.isEmpty()) return new JSONObject();
        JSONObject o = new JSONObject(legacy);
        JSONObject vk = o.optJSONObject("keys");
        if (vk == null) return new JSONObject();
        JSONObject state = new JSONObject();
        Iterator<String> it = vk.keys();
        while (it.hasNext()) {
            String k = it.next();
            JSONObject row = vk.getJSONObject(k);
            JSONObject st = new JSONObject();
            st.put("used", row.optBoolean("used", false));
            st.put("uses", row.optInt("uses", 0));
            if (row.has("used_at")) st.put("used_at", row.getLong("used_at"));
            state.put(k, st);
        }
        return state;
    }

    private static void saveKeyState(Context ctx, String key, JSONObject row) throws Exception {
        JSONObject state = loadKeyState(ctx);
        JSONObject keys = state.length() > 0 ? state : new JSONObject();
        JSONObject st = new JSONObject();
        st.put("used", row.optBoolean("used", false));
        st.put("uses", row.optInt("uses", 0));
        if (row.has("used_at")) st.put("used_at", row.getLong("used_at"));
        keys.put(key, st);
        RebelVault.put(ctx, VAULT_KEY_STATE, new JSONObject().put("keys", keys).toString());
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
