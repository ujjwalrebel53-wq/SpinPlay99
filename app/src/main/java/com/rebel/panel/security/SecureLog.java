package com.rebel.panel.security;

import com.rebel.panel.BuildConfig;

/** Layer 9 — stripped in release via ProGuard + runtime guard. */
public final class SecureLog {

    private SecureLog() {}

    public static void d(String tag, String msg) {
        if (BuildConfig.DEBUG) android.util.Log.d(tag, mask(msg));
    }

    public static void e(String tag, String msg) {
        if (BuildConfig.DEBUG) android.util.Log.e(tag, mask(msg));
    }

    private static String mask(String msg) {
        if (msg == null) return "";
        return msg.replaceAll("(?i)(key|token|jwt|secret|password)=[^&\\s]+", "$1=***");
    }
}
