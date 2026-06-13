package com.rebel.panel.security;

import android.util.Base64;

import com.rebel.panel.BuildConfig;

import java.nio.charset.StandardCharsets;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HMAC-SHA256 request signing — prevents replay/forgery of API calls. */
public final class HmacSigner {

    private HmacSigner() {}

    public static String sign(long ts, String deviceFp, String bodyJson) {
        String payload = ts + ":" + deviceFp + ":" + (bodyJson == null ? "" : bodyJson);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    BuildConfig.REBEL_APP_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)),
                    Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}
