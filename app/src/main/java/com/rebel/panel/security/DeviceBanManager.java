package com.rebel.panel.security;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.rebel.panel.CrackBanActivity;

import org.json.JSONObject;

/**
 * Permanent device ban for cracked / re-signed APKs.
 */
public final class DeviceBanManager {

    private static final String PREFS = "rebel_crack_ban_v1";
    private static final String K_BANNED = "banned";
    private static final String K_REASON = "reason";
    private static final String K_AT = "banned_at";

    private static volatile boolean banScreenShowing = false;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    public static final String MSG_CRACK_BAN =
            "Fuck you bitch! You have tried to crack the APK.\n\n"
                    + "Your device is permanently banned from Rebel Panel.";

    private DeviceBanManager() {}

    private static SharedPreferences p(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isBanScreenShowing() {
        return banScreenShowing;
    }

    public static void setBanScreenShowing(boolean showing) {
        banScreenShowing = showing;
    }

    public static boolean isLocallyBanned(Context ctx) {
        return p(ctx).getBoolean(K_BANNED, false);
    }

    public static void markLocalBan(Context ctx, String reason) {
        p(ctx).edit()
                .putBoolean(K_BANNED, true)
                .putString(K_REASON, reason)
                .putLong(K_AT, System.currentTimeMillis())
                .apply();
    }

    public static void reportCrackBanToServer(Context ctx, String reason) {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "crack_ban");
            body.put("reason", reason);
            body.put("resigned", "apk_resigned".equals(reason));
            body.put("dex_tampered", "dex_tampered".equals(reason));
            body.put("apk_sig", IntegrityChecker.currentCertSha256(ctx));
            ApiClient.postSigned(ctx, body);
        } catch (Exception ignored) {}
    }

    private static void pollServerBanAsync(Context ctx) {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "ban_check");
                JSONObject resp = ApiClient.postSigned(ctx, body);
                if (resp.optBoolean("banned", false) && !isLocallyBanned(ctx)) {
                    markLocalBan(ctx, "server_banned");
                    BruteForceGuard.permanentLock(ctx);
                    launchBanScreen(ctx);
                }
            } catch (Exception ignored) {}
        }).start();
    }

    public static boolean enforceCrackBan(Context ctx, String reason) {
        if (isBanScreenShowing()) return false;

        String crackReason = reason;
        if (crackReason == null) crackReason = IntegrityChecker.getCrackReason(ctx);
        if (crackReason == null && !isLocallyBanned(ctx)) return true;

        if (!isLocallyBanned(ctx)) {
            final String banReason = crackReason != null ? crackReason : "apk_crack";
            markLocalBan(ctx, banReason);
            new Thread(() -> reportCrackBanToServer(ctx, banReason)).start();
            SecurityPrefs.wipeAll(ctx);
            SecretsManager.wipe(ctx);
            EncryptedFileStore.wipeAll(ctx);
            SecureDatabase.wipe(ctx);
            TamperDetector.wipeAndLogout(ctx);
            BruteForceGuard.permanentLock(ctx);
        }
        launchBanScreen(ctx);
        return false;
    }

    public static boolean gate(Context ctx) {
        if (isBanScreenShowing()) return false;
        if (isLocallyBanned(ctx)) {
            launchBanScreen(ctx);
            return false;
        }
        String crack = IntegrityChecker.getCrackReason(ctx);
        if (crack != null) return enforceCrackBan(ctx, crack);
        return true;
    }

    public static void gateAsync(Context ctx) {
        if (!isLocallyBanned(ctx) && !isBanScreenShowing()) {
            pollServerBanAsync(ctx);
        }
    }

    /** Safe launch — never finishAffinity() during onCreate (causes crash). */
    public static void launchBanScreen(Context ctx) {
        if (banScreenShowing) return;
        banScreenShowing = true;

        Runnable open = () -> {
            try {
                Intent i = new Intent(ctx, CrackBanActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) {
                banScreenShowing = false;
            }
        };

        MAIN.post(() -> {
            open.run();
            if (ctx instanceof Activity) {
                Activity a = (Activity) ctx;
                if (!a.isFinishing() && !a.isDestroyed()) {
                    a.finish();
                }
            }
        });
    }
}
