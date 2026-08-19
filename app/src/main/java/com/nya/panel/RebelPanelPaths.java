package com.nya.panel;

import android.content.Context;

import com.nya.panel.security.SecureAssetVault;

import java.io.File;

public final class RebelPanelPaths {

    public static final int BUNDLED_PANEL_VERSION = 1;
    public static final int MIN_FULL_PANEL_VERSION = 1;

    private RebelPanelPaths() {
    }

    public static String otaManifestUrl(Context ctx) {
        String custom = RebelVault.get(ctx, "ota_manifest_url");
        if (custom != null && !custom.trim().isEmpty()) {
            return custom.trim();
        }
        String server = panelServerUrl(ctx);
        if (server.isEmpty()) {
            return "";
        }
        return server + "/panel_ota.json";
    }

    public static String panelServerUrl(Context ctx) {
        String stored = RebelVault.get(ctx, "panel_server_url");
        if (stored != null && !stored.trim().isEmpty()) {
            return rtrim(stored.trim(), '/');
        }
        String def = BuildConfig.DEFAULT_PANEL_SERVER;
        return def == null ? "" : rtrim(def.trim(), '/');
    }

    public static void setPanelServerUrl(Context ctx, String url) {
        RebelVault.put(ctx, "panel_server_url", rtrim(url == null ? "" : url.trim(), '/'));
    }

    public static File otaDir(Context ctx) {
        return new File(ctx.getFilesDir(), "panel_ota");
    }

    public static File otaFile(Context ctx, String name) {
        return new File(otaDir(ctx), name);
    }

    public static String panelAssetUrl(Context ctx, String name) {
        clearStaleOtaIfNeeded(ctx);
        File ota = otaFile(ctx, name);
        int otaVer = activePanelVersion(ctx);
        if (ota.exists() && ota.length() > 0 && otaVer >= MIN_FULL_PANEL_VERSION) {
            return "file://" + ota.getAbsolutePath();
        }
        if (SecureAssetVault.usesEncryptedBundle()) {
            File secure = SecureAssetVault.ensurePanelReady(ctx);
            if (secure != null) {
                return "file://" + new File(secure, name).getAbsolutePath();
            }
        }
        return "file:///android_asset/panel/" + name;
    }

    public static String panelIndexUrl(Context ctx) {
        return panelAssetUrl(ctx, "index.html");
    }

    public static void clearStaleOtaIfNeeded(Context ctx) {
        int otaVer = activePanelVersion(ctx);
        if (otaVer >= MIN_FULL_PANEL_VERSION) {
            return;
        }
        File dir = otaDir(ctx);
        if (!dir.exists()) {
            return;
        }
        File[] files = dir.listFiles();
        if (files == null) {
            return;
        }
        for (File f : files) {
            f.delete();
        }
        RebelVault.put(ctx, "ota_panel_version", String.valueOf(BUNDLED_PANEL_VERSION));
    }

    public static int activePanelVersion(Context ctx) {
        String v = RebelVault.get(ctx, "ota_panel_version");
        if (v != null && !v.isEmpty()) {
            try {
                int parsed = Integer.parseInt(v);
                if (parsed >= MIN_FULL_PANEL_VERSION) {
                    return parsed;
                }
            } catch (Exception ignored) {
            }
        }
        File ota = otaFile(ctx, "index.html");
        if (ota.exists() && ota.length() > 0) {
            return 1;
        }
        return BUNDLED_PANEL_VERSION;
    }

    private static String rtrim(String value, char ch) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == ch) {
            end--;
        }
        return value.substring(0, end);
    }
}
