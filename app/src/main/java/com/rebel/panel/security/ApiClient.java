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
 * HTTPS client for secure auth API.
 */
public final class ApiClient {

    public static final String API_URL =
            "https://rebelbhaiya.alwaysdata.net/rebel_secure_api.php";
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    private static volatile OkHttpClient pinnedClient;
    private static volatile OkHttpClient plainClient;

    private ApiClient() {}

    private static OkHttpClient plainClient() {
        if (plainClient != null) return plainClient;
        synchronized (ApiClient.class) {
            if (plainClient != null) return plainClient;
            plainClient = new OkHttpClient.Builder()
                    .connectTimeout(25, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .build();
            return plainClient;
        }
    }

    private static OkHttpClient pinnedClient() {
        if (pinnedClient != null) return pinnedClient;
        synchronized (ApiClient.class) {
            if (pinnedClient != null) return pinnedClient;
            OkHttpClient.Builder b = new OkHttpClient.Builder()
                    .connectTimeout(25, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS);
            if (BuildConfig.SSL_PIN_ENFORCE) {
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
            pinnedClient = b.build();
            return pinnedClient;
        }
    }

    public static JSONObject postSigned(Context ctx, JSONObject body) throws IOException {
        long ts = System.currentTimeMillis() / 1000L;
        String fp = DeviceFingerprint.get(ctx);
        try {
            if (!body.has("nonce")) body.put("nonce", java.util.UUID.randomUUID().toString());
            if (!body.has("apk_version")) body.put("apk_version", BuildConfig.VERSION_CODE);
        } catch (Exception ignored) {}

        final String bodyJson = body.toString();
        JSONObject envelope = new JSONObject();
        try {
            envelope.put("ts", ts);
            envelope.put("device_fp", fp);
            envelope.put("body_json", bodyJson);
            envelope.put("body", body);
            envelope.put("sig", HmacSigner.sign(ts, fp, bodyJson));
        } catch (Exception e) {
            throw new IOException("sign_failed");
        }

        String payload = envelope.toString();
        Request req = new Request.Builder()
                .url(API_URL)
                .post(RequestBody.create(payload, JSON))
                .header("Content-Type", "application/json; charset=utf-8")
                .header("User-Agent", "RebelPanel/" + BuildConfig.VERSION_NAME)
                .header("X-Rebel-Device", fp)
                .build();

        IOException last = null;
        OkHttpClient[] clients = BuildConfig.SSL_PIN_ENFORCE
                ? new OkHttpClient[]{pinnedClient(), plainClient()}
                : new OkHttpClient[]{plainClient()};

        for (OkHttpClient client : clients) {
            try (Response resp = client.newCall(req).execute()) {
                String text = resp.body() != null ? resp.body().string() : "";
                if (text.isEmpty()) {
                    last = new IOException("empty_response");
                    continue;
                }
                return new JSONObject(text);
            } catch (IOException e) {
                last = e;
            } catch (Exception e) {
                last = new IOException(e.getMessage() != null ? e.getMessage() : "parse_error");
            }
        }
        if (last != null) throw last;
        throw new IOException("network_unreachable");
    }
}
