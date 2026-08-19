package com.nya.panel;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class RebelPanelSync {

    private RebelPanelSync() {
    }

    static JSONObject syncFirebase(String panelServer, JSONObject body) {
        try {
            String base = rtrim(panelServer, '/');
            if (base.isEmpty()) {
                return error("Panel server URL not set — open menu to configure");
            }
            String url = base + "/nya.php?rebel_firebase_api=1";
            return httpJson("POST", url, body);
        } catch (Exception e) {
            return error(e.getMessage() == null ? "Sync failed" : e.getMessage());
        }
    }

    static JSONObject panelFetch(String fullUrl, String method, String jsonBody) {
        try {
            if (fullUrl == null || fullUrl.trim().isEmpty()) {
                return error("URL missing");
            }
            JSONObject body = null;
            if ("POST".equalsIgnoreCase(method) && jsonBody != null && !jsonBody.isEmpty()) {
                body = new JSONObject(jsonBody);
            }
            return httpJson(method, fullUrl.trim(), body);
        } catch (Exception e) {
            return error(e.getMessage() == null ? "Request failed" : e.getMessage());
        }
    }

    private static JSONObject httpJson(String method, String urlStr, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod(method.toUpperCase());
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("User-Agent", "NyaPanel/" + BuildConfig.VERSION_CODE);
        if (body != null) {
            conn.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        }
        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream == null) {
            conn.disconnect();
            return error("HTTP " + code);
        }
        StringBuilder raw = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                raw.append(line);
            }
        }
        conn.disconnect();
        String text = raw.toString().trim();
        if (text.isEmpty()) {
            JSONObject out = new JSONObject();
            out.put("ok", code >= 200 && code < 300);
            return out;
        }
        return new JSONObject(text);
    }

    private static JSONObject error(String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", false);
            out.put("error", message);
        } catch (Exception ignored) {
        }
        return out;
    }

    private static String rtrim(String value, char ch) {
        if (value == null) {
            return "";
        }
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == ch) {
            end--;
        }
        return value.substring(0, end);
    }
}
