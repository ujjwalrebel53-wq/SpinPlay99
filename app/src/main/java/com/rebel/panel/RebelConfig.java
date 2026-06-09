package com.rebel.panel;

import android.content.Context;

/**
 * Rebel Panel APK config.
 * CHANGE panel URL below to your server before building release APK.
 */
public final class RebelConfig {

    public static final String DEFAULT_PANEL_URL = "https://rebelbhaiya.alwaysdata.net/phone.php";
    public static final String DEFAULT_UPDATE_API = "https://rebelbhaiya.alwaysdata.net/rebel_app_api.php";
    public static final String APP_USER_AGENT_TAG = "RebelPanel/1.1";
    public static final int APK_VERSION_CODE = 5;

    private static final String VAULT_PANEL = "panel_url";
    private static final String VAULT_UPDATE = "update_api";

    private RebelConfig() {}

    public static String getPanelUrl(Context ctx) {
        String v = RebelVault.get(ctx, VAULT_PANEL);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_PANEL_URL;
    }

    public static String getUpdateApi(Context ctx) {
        String v = RebelVault.get(ctx, VAULT_UPDATE);
        return (v != null && !v.isEmpty()) ? v : DEFAULT_UPDATE_API;
    }

    public static void setPanelUrl(Context ctx, String url) {
        if (url != null && !url.isEmpty()) RebelVault.put(ctx, VAULT_PANEL, url);
    }

    public static void setUpdateApi(Context ctx, String url) {
        if (url != null && !url.isEmpty()) RebelVault.put(ctx, VAULT_UPDATE, url);
    }
}
