package com.rebel.panel;

import android.content.Context;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Bot keys live on server (rebel_keys.json) — same as phone.php / @Rebelpanelbot. */
public final class RebelAuthApi {

    static final String AUTH_URL =
            "https://rebelbhaiya.alwaysdata.net/phone.php?rebel_auth=1";

    private RebelAuthApi() {}

    public static String post(Context ctx, JSONObject body) throws Exception {
        String urlStr = AUTH_URL + "&v=" + BuildConfig.VERSION_CODE;
        URL url = new URL(urlStr);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(25000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "RebelPanel/" + BuildConfig.VERSION_NAME);
        c.setRequestProperty("X-Rebel-Attest", RebelAttest.headerValue());
        try {
            String dev = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
            if (dev != null && !dev.isEmpty()) {
                c.setRequestProperty("X-Rebel-Device", dev);
            }
        } catch (Exception ignored) {}
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream out = c.getOutputStream()) {
            out.write(bytes);
        }
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        String resp = sb.toString();
        if (resp.isEmpty()) throw new Exception("Server error (" + code + ")");
        return resp;
    }
}
