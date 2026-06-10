package com.rebel.panel.security;

import android.content.Context;

import org.json.JSONObject;

/** Layer 13/18 — silent threat telemetry + kill switch poll. */
public final class ThreatReporter {

    private ThreatReporter() {}

    public static void report(Context ctx, String threat, String detail) {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "threat_report");
                body.put("threat", threat);
                body.put("detail", detail);
                body.put("root", RootDetector.detected(ctx));
                body.put("emulator", EmulatorDetector.detected(ctx));
                body.put("debugger", AntiDebug.detected());
                body.put("hooks", HookDetector.detected());
                body.put("apk_version", com.rebel.panel.BuildConfig.VERSION_CODE);
                ApiClient.postSigned(ctx, body);
            } catch (Exception ignored) {}
        }).start();
    }

    public static boolean isKilled(Context ctx) {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "heartbeat");
            body.put("access_token", SecurityPrefs.getAccessJwt(ctx));
            JSONObject resp = ApiClient.postSigned(ctx, body);
            if (resp.optBoolean("kill", false)) return true;
            if (resp.optInt("min_apk_version", 0) > com.rebel.panel.BuildConfig.VERSION_CODE) return true;
            return false;
        } catch (Exception e) {
            return false;
        }
    }
}
