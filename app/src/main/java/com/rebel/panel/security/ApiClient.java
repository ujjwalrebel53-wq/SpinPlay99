package com.rebel.panel.security;

import android.content.Context;

import com.rebel.panel.BuildConfig;

import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.CertificatePinner;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Pinned HTTPS client for auth API only.
 * Prevents: MITM proxy interception of keys/JWT (Charles, mitmproxy).
 */
public final class ApiClient {

    public static final String API_URL =
            "https://rebelbhaiya.alwaysdata.net/rebel_secure_api.php";
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    private static volatile OkHttpClient client;

    private ApiClient() {}

    public static OkHttpClient getClient() {
        if (client != null) return client;
        synchronized (ApiClient.class) {
            if (client != null) return client;
            OkHttpClient.Builder b = new OkHttpClient.Builder()
                    .connectTimeout(20, TimeUnit.SECONDS)
                    .readTimeout(25, TimeUnit.SECONDS)
                    .writeTimeout(25, TimeUnit.SECONDS);
            if (!BuildConfig.DEBUG || BuildConfig.SSL_PIN_ENFORCE) {
                CertificatePinner.Builder pin = new CertificatePinner.Builder();
                String primary = BuildConfig.SSL_PIN_PRIMARY;
                String backup = BuildConfig.SSL_PIN_BACKUP;
                if (primary != null && !primary.isEmpty() && !"CHANGE_ME".equals(primary)) {
                    pin.add("rebelbhaiya.alwaysdata.net", primary);
                }
                if (backup != null && !backup.isEmpty() && !"CHANGE_ME".equals(backup)) {
                    pin.add("rebelbhaiya.alwaysdata.net", backup);
                }
                b.certificatePinner(pin.build());
            }
            client = b.build();
            return client;
        }
    }

    public static JSONObject postSigned(Context ctx, JSONObject body) throws IOException {
        long ts = System.currentTimeMillis() / 1000L;
        String fp = DeviceFingerprint.get(ctx);
        String json = body.toString();
        JSONObject envelope = new JSONObject();
        try {
            envelope.put("ts", ts);
            envelope.put("device_fp", fp);
            envelope.put("sig", HmacSigner.sign(ts, fp, json));
            envelope.put("body", body);
        } catch (Exception e) {
            throw new IOException("sign");
        }
        Request req = new Request.Builder()
                .url(API_URL)
                .post(RequestBody.create(envelope.toString(), JSON))
                .header("User-Agent", "RebelPanel/" + BuildConfig.VERSION_NAME)
                .header("X-Rebel-Device", fp)
                .build();
        try (Response resp = getClient().newCall(req).execute()) {
            String text = resp.body() != null ? resp.body().string() : "";
            if (text.isEmpty()) throw new IOException("empty");
            return new JSONObject(text);
        } catch (Exception e) {
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException(e);
        }
    }
}
