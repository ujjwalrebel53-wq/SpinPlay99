package com.rebel.panel.security;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

/**
 * EncryptedSharedPreferences backed by Android Keystore.
 * Prevents: JWT/token theft via backup, root file reads, adb backup extraction.
 */
public final class SecurityPrefs {

    private static final String FILE = "rebel_secure_v2";
    private static final String K_ACCESS = "access_jwt";
    private static final String K_REFRESH = "refresh_jwt";
    private static final String K_ACCESS_EXP = "access_exp";
    private static final String K_REFRESH_EXP = "refresh_exp";

    private SecurityPrefs() {}

    private static SharedPreferences prefs(Context ctx) throws Exception {
        MasterKey mk = new MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                ctx, FILE, mk,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    public static void saveTokens(Context ctx, String accessJwt, long accessExp,
                                  String refreshJwt, long refreshExp) {
        try {
            prefs(ctx).edit()
                    .putString(K_ACCESS, accessJwt)
                    .putLong(K_ACCESS_EXP, accessExp)
                    .putString(K_REFRESH, refreshJwt)
                    .putLong(K_REFRESH_EXP, refreshExp)
                    .apply();
        } catch (Exception ignored) {}
    }

    public static String getAccessJwt(Context ctx) {
        try {
            return prefs(ctx).getString(K_ACCESS, "");
        } catch (Exception e) {
            return "";
        }
    }

    public static String getRefreshJwt(Context ctx) {
        try {
            return prefs(ctx).getString(K_REFRESH, "");
        } catch (Exception e) {
            return "";
        }
    }

    public static long getAccessExp(Context ctx) {
        try {
            return prefs(ctx).getLong(K_ACCESS_EXP, 0);
        } catch (Exception e) {
            return 0;
        }
    }

    public static long getRefreshExp(Context ctx) {
        try {
            return prefs(ctx).getLong(K_REFRESH_EXP, 0);
        } catch (Exception e) {
            return 0;
        }
    }

    public static void wipeAll(Context ctx) {
        try {
            prefs(ctx).edit().clear().apply();
        } catch (Exception ignored) {}
        try {
            ctx.getSharedPreferences("rebel_brute_v1", Context.MODE_PRIVATE).edit().clear().apply();
        } catch (Exception ignored) {}
    }
}
