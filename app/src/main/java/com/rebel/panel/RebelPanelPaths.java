package com.rebel.panel;

import android.content.Context;

import com.rebel.panel.security.SecureAssetVault;

import java.io.File;

public final class RebelPanelPaths {

    /** Bundled panel with sex.php features (device tabs, aadhar, forward, etc.) */
    public static final int BUNDLED_PANEL_VERSION = 15;
    public static final int MIN_FULL_PANEL_VERSION = 11;
    public static final String OTA_MANIFEST_URL =
        "https://rebelbhaiya.alwaysdata.net/panel_ota.json";

    private RebelPanelPaths() {}

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

    /** Old OTA panels lacked sex.php features — wipe so bundled v8 loads. */
    public static void clearStaleOtaIfNeeded(Context ctx) {
        int otaVer = activePanelVersion(ctx);
        if (otaVer >= MIN_FULL_PANEL_VERSION) return;
        File dir = otaDir(ctx);
        if (!dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            try {
                f.delete();
            } catch (Exception ignored) {}
        }
        RebelVault.put(ctx, "ota_panel_version", String.valueOf(BUNDLED_PANEL_VERSION));
    }

    public static int activePanelVersion(Context ctx) {
        String v = RebelVault.get(ctx, "ota_panel_version");
        if (v != null && !v.isEmpty()) {
            try {
                int parsed = Integer.parseInt(v);
                if (parsed >= MIN_FULL_PANEL_VERSION) return parsed;
            } catch (Exception ignored) {}
        }
        File ota = otaFile(ctx, "index.html");
        if (ota.exists() && ota.length() > 0) {
            return 1;
        }
        return BUNDLED_PANEL_VERSION;
    }
}
