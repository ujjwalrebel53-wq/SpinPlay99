package com.rebel.panel;

import android.content.Context;

import com.rebel.panel.security.ApiClient;
import com.rebel.panel.security.KeyValidator;
import com.rebel.panel.security.SecurityPrefs;
import com.rebel.panel.security.SessionManager;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * WebView bridge — panel inside MainActivity uses this for session + server APIs.
 */
public final class RebelAuth {

    private static final String PANEL_BASE = "https://rebelbhaiya.alwaysdata.net/";
    private static final OkHttpClient HTTP = new OkHttpClient.Builder()
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(35, TimeUnit.SECONDS)
            .build();

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

    /** Proxy panel APIs (aadhar, sms_token) from WebView. */
    public static String panelApi(Context ctx, String json) {
        try {
            JSONObject req = new JSONObject(json != null ? json : "{}");
            String type = req.optString("type", "");
            if ("aadhar".equals(type)) {
                return fetchAadhar(req.optString("num", ""));
            }
            if ("sms_token".equals(type)) {
                JSONObject body = new JSONObject();
                body.put("action", "sms_token");
                body.put("sub_action", req.optString("sub_action", "get"));
                body.put("access_token", SecurityPrefs.getAccessJwt(ctx));
                Iterator<String> it = req.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    if ("type".equals(k) || "sub_action".equals(k)) continue;
                    body.put(k, req.get(k));
                }
                return ApiClient.postSigned(ctx, body).toString();
            }
            return err("Unknown API type");
        } catch (Exception e) {
            return err(e.getMessage() != null ? e.getMessage() : "API error");
        }
    }

    private static String fetchAadhar(String num) {
        try {
            String digits = num.replaceAll("\\D", "");
            if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
            if (digits.length() < 10) return err("Valid 10-digit mobile required");
            String url = PANEL_BASE + "sex.php?aadhar_api=1&num=" + digits;
            Request req = new Request.Builder().url(url)
                    .header("Accept", "application/json")
                    .header("User-Agent", "RebelPanel/APK")
                    .get().build();
            try (Response res = HTTP.newCall(req).execute()) {
                String body = res.body() != null ? res.body().string() : "";
                if (!res.isSuccessful()) {
                    return err("Aadhar API error " + res.code());
                }
                return body;
            }
        } catch (Exception e) {
            return err(e.getMessage() != null ? e.getMessage() : "Lookup failed");
        }
    }

    public static String getAutoTokenConfig(Context ctx) {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "sms_token");
            body.put("sub_action", "get");
            body.put("access_token", SecurityPrefs.getAccessJwt(ctx));
            JSONObject res = ApiClient.postSigned(ctx, body);
            if (res.optBoolean("ok")) {
                return new JSONObject()
                        .put("ok", true)
                        .put("config", res.optJSONObject("config"))
                        .put("log", res.optJSONArray("log"))
                        .toString();
            }
        } catch (Exception ignored) {}
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
            JSONObject body = new JSONObject(json != null ? json : "{}");
            JSONObject apiBody = new JSONObject();
            apiBody.put("action", "sms_token");
            apiBody.put("sub_action", "save");
            apiBody.put("access_token", SecurityPrefs.getAccessJwt(ctx));
            Iterator<String> it = body.keys();
            while (it.hasNext()) {
                String k = it.next();
                if ("action".equals(k) || "token".equals(k)) continue;
                apiBody.put(k, body.get(k));
            }
            JSONObject res = ApiClient.postSigned(ctx, apiBody);
            if (res.optBoolean("ok")) {
                JSONObject cfg = res.optJSONObject("config");
                if (cfg != null) RebelVault.put(ctx, "auto_token_cfg", cfg.toString());
                return res.toString();
            }
            return res.toString();
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
