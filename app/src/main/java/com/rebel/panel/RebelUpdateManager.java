package com.rebel.panel;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * OTA: panel URL updates without new APK + optional forced APK update.
 */
public final class RebelUpdateManager {

    public interface Callback {
        void onPanelUrl(String url, int panelVersion);
        void onForceApkUpdate(String apkUrl, String message);
        void onError(String msg);
    }

    private RebelUpdateManager() {}

    public static void check(final Context ctx, final Callback cb) {
        new Thread(() -> {
            Handler main = new Handler(Looper.getMainLooper());
            try {
                String api = RebelConfig.getUpdateApi(ctx);
                URL u = new URL(api + (api.contains("?") ? "&" : "?") + "action=manifest&v=" + RebelConfig.APK_VERSION_CODE);
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(12000);
                c.setReadTimeout(12000);
                c.setRequestProperty("User-Agent", RebelConfig.APP_USER_AGENT_TAG);
                c.setRequestProperty(RebelAttest.HEADER, RebelAttest.buildHeader(ctx));
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                BufferedReader r = new BufferedReader(new InputStreamReader(
                    code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                JSONObject j = new JSONObject(sb.toString());
                if (!j.optBoolean("ok", false)) {
                    main.post(() -> cb.onError(j.optString("error", "Update check failed")));
                    return;
                }
                final String panelUrl = j.optString("panel_url", RebelConfig.getPanelUrl(ctx));
                final int panelVer = j.optInt("panel_version", 0);
                final int minApk = j.optInt("min_apk_version", 1);
                final String apkUrl = j.optString("apk_url", "");
                final String msg = j.optString("message", "Update required");
                final boolean force = j.optBoolean("force_update", false);

                if (panelUrl != null && !panelUrl.isEmpty()) {
                    RebelConfig.setPanelUrl(ctx, panelUrl);
                }

                if (force && minApk > RebelConfig.APK_VERSION_CODE && apkUrl != null && !apkUrl.isEmpty()) {
                    main.post(() -> cb.onForceApkUpdate(apkUrl, msg));
                    return;
                }
                main.post(() -> cb.onPanelUrl(RebelConfig.getPanelUrl(ctx), panelVer));
            } catch (Exception e) {
                main.post(() -> cb.onPanelUrl(RebelConfig.getPanelUrl(ctx), 0));
            }
        }).start();
    }

    public static void openApkInstall(Context ctx, String apkUrl) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception ignored) {}
    }
}
