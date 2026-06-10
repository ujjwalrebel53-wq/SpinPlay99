package com.rebel.panel;

import android.content.Context;

import java.io.File;

public final class RebelPanelPaths {

    public static final int BUNDLED_PANEL_VERSION = 1;
    public static final String OTA_MANIFEST_URL =
        "https://rebelbhaiya.alwaysdata.net/panel_ota.json";

    private RebelPanelPaths() {}

    public static File otaDir(Context ctx) {
        return new File(ctx.getFilesDir(), "panel_ota");
    }

    public static File otaFile(Context ctx, String name) {
        return new File(otaDir(ctx), name);
    }

    public static String panelIndexUrl(Context ctx) {
        return panelIndexUrl(ctx, false);
    }

    public static String panelIndexUrl(Context ctx, boolean fastBoot) {
        File ota = otaFile(ctx, "index.html");
        String base;
        if (ota.exists() && ota.length() > 0) {
            base = "file://" + ota.getAbsolutePath();
        } else {
            base = "file:///android_asset/panel/index.html";
        }
        return fastBoot ? base + (base.contains("?") ? "&" : "?") + "fastBoot=1" : base;
    }

    public static int activePanelVersion(Context ctx) {
        String v = RebelVault.get(ctx, "ota_panel_version");
        if (v != null && !v.isEmpty()) {
            try {
                return Integer.parseInt(v);
            } catch (Exception ignored) {}
        }
        File ota = otaFile(ctx, "index.html");
        if (ota.exists()) return 1;
        return BUNDLED_PANEL_VERSION;
    }
}
