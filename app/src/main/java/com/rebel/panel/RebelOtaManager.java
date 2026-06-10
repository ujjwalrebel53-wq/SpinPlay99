package com.rebel.panel;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * OTA: download panel files from panel_ota.json on your server.
 */
public final class RebelOtaManager {

    public interface Callback {
        void onUpdated(int newVersion, String message);
        void onNoUpdate();
        void onError(String msg);
    }

    private RebelOtaManager() {}

    public static void checkAndUpdate(final Context ctx, final Callback cb) {
        new Thread(() -> {
            Handler main = new Handler(Looper.getMainLooper());
            try {
                String raw = httpGet(RebelPanelPaths.OTA_MANIFEST_URL);
                JSONObject m = new JSONObject(raw);
                if (!m.optBoolean("ok", false)) {
                    main.post(() -> cb.onError("OTA manifest invalid"));
                    return;
                }
                int remoteVer = m.optInt("panel_version", 0);
                int localVer = RebelPanelPaths.activePanelVersion(ctx);
                int minApk = m.optInt("min_apk_version", 1);
                if (minApk > BuildConfig.VERSION_CODE) {
                    String apkUrl = m.optString("apk_url", "");
                    main.post(() -> cb.onError("New APK required: " + apkUrl));
                    return;
                }
                if (remoteVer <= localVer && hasOtaPanel(ctx)) {
                    main.post(cb::onNoUpdate);
                    return;
                }
                JSONObject files = m.optJSONObject("files");
                if (files == null || files.length() == 0) {
                    main.post(cb::onNoUpdate);
                    return;
                }
                File dir = RebelPanelPaths.otaDir(ctx);
                if (!dir.exists() && !dir.mkdirs()) {
                    main.post(() -> cb.onError("Cannot create OTA folder"));
                    return;
                }
                Iterator<String> it = files.keys();
                while (it.hasNext()) {
                    String name = it.next();
                    String fileUrl = files.optString(name, "");
                    if (fileUrl.isEmpty()) continue;
                    downloadTo(fileUrl, RebelPanelPaths.otaFile(ctx, name));
                }
                String keysUrl = m.optString("keys_url", "");
                if (!keysUrl.isEmpty()) {
                    File keysFile = RebelPanelPaths.otaFile(ctx, "rebel_keys.json");
                    downloadTo(keysUrl, keysFile);
                    RebelAuth.importKeysFile(ctx, keysFile);
                }
                RebelVault.put(ctx, "ota_panel_version", String.valueOf(remoteVer));
                String msg = m.optString("message", "Panel updated");
                main.post(() -> cb.onUpdated(remoteVer, msg));
            } catch (Exception e) {
                main.post(() -> cb.onNoUpdate());
            }
        }).start();
    }

    private static boolean hasOtaPanel(Context ctx) {
        File f = RebelPanelPaths.otaFile(ctx, "index.html");
        return f.exists() && f.length() > 0;
    }

    private static String httpGet(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "RebelPanel-OTA/" + BuildConfig.VERSION_CODE);
        c.setRequestMethod("GET");
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        return sb.toString();
    }

    private static void downloadTo(String urlStr, File dest) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "RebelPanel-OTA/" + BuildConfig.VERSION_CODE);
        InputStream in = c.getInputStream();
        File tmp = new File(dest.getAbsolutePath() + ".tmp");
        FileOutputStream out = new FileOutputStream(tmp);
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
        out.close();
        in.close();
        if (dest.exists() && !dest.delete()) throw new Exception("Cannot replace " + dest.getName());
        if (!tmp.renameTo(dest)) throw new Exception("Cannot save " + dest.getName());
    }
}
