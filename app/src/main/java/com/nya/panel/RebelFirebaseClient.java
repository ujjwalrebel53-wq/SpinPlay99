package com.nya.panel;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class RebelFirebaseClient {

    private RebelFirebaseClient() {
    }

    static JSONObject request(String method, String baseUrl, String authKey, String path, JSONObject data)
            throws Exception {
        String full = rtrim(baseUrl, '/') + '/' + ltrim(path, '/') + ".json";
        if (authKey != null && !authKey.isEmpty()) {
            full += "?auth=" + URLEncoder.encode(authKey, "UTF-8");
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(full).openConnection();
        conn.setRequestMethod(method.toUpperCase());
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(12000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");

        if (data != null) {
            conn.setDoOutput(true);
            byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        }

        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream == null) {
            conn.disconnect();
            return null;
        }

        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
        }
        conn.disconnect();

        if (code != 200 && code != 201) {
            return null;
        }

        String raw = body.toString().trim();
        if (raw.isEmpty() || "null".equals(raw)) {
            return new JSONObject();
        }
        return new JSONObject(raw);
    }

    private static String rtrim(String value, char ch) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == ch) {
            end--;
        }
        return value.substring(0, end);
    }

    private static String ltrim(String value, char ch) {
        int start = 0;
        while (start < value.length() && value.charAt(start) == ch) {
            start++;
        }
        return value.substring(start);
    }
}
