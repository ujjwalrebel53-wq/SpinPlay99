package com.nya.panel;

import android.content.Context;
import android.content.SharedPreferences;

final class RebelVault {

    private static final String PREFS = "nya_panel_vault";

    private RebelVault() {
    }

    static String get(Context ctx, String key) {
        return prefs(ctx).getString(key, "");
    }

    static void put(Context ctx, String key, String value) {
        prefs(ctx).edit().putString(key, value).apply();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
