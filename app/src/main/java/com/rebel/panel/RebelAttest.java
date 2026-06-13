package com.rebel.panel;

import android.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/** HMAC attestation for phone.php?rebel_auth (matches rebel_app_lib.php). */
public final class RebelAttest {

    private RebelAttest() {}

    public static String headerValue() {
        long ts = System.currentTimeMillis() / 1000L;
        int ver = BuildConfig.VERSION_CODE;
        String payload = ts + ":" + ver;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    BuildConfig.REBEL_APP_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String sig = Base64.encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)),
                    Base64.NO_WRAP);
            return ts + ":" + sig;
        } catch (Exception e) {
            return ts + ":";
        }
    }
}
