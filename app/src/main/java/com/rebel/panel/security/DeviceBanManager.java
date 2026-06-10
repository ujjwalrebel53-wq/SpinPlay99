package com.rebel.panel.security;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.rebel.panel.CrackBanActivity;

import org.json.JSONObject;

/**
 * Permanent device ban for cracked / re-signed APKs.
 * Local flag survives session wipe; server ban blocks panel API forever.
 */
public final class DeviceBanManager {

    private static final String PREFS = "rebel_crack_ban_v1";
    private static final String K_BANNED = "banned";
    private static final String K_REASON = "reason";
    private static final String K_AT = "banned_at";

    public static final String MSG_CRACK_BAN =
            "Fuck you bitch! You have tried to crack the APK.\n\n"
                    + "Your device is permanently banned from Rebel Panel.";

    private DeviceBanManager() {}

    private static SharedPreferences p(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isLocallyBanned(Context ctx) {
        return p(ctx).getBoolean(K_BANNED, false);
    }

    public static String localBanReason(Context ctx) {
        return p(ctx).getString(K_REASON, "apk_crack");
    }

    public static void markLocalBan(Context ctx, String reason) {
        p(ctx).edit()
                .putBoolean(K_BANNED, true)
                .putString(K_REASON, reason)
                .putLong(K_AT, System.currentTimeMillis())
                .apply();
    }

    /** Report crack to server and permanently ban this device fingerprint. */
    public static void reportCrackBanToServer(Context ctx, String reason) {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "crack_ban");
            body.put("reason", reason);
            body.put("resigned", !IntegrityChecker.verifyApkSignature(ctx));
            body.put("dex_tampered", !IntegrityChecker.verifyDexCrc(ctx));
            body.put("apk_sig", IntegrityChecker.currentCertSha256(ctx));
            ApiClient.postSigned(ctx, body);
        } catch (Exception ignored) {}
    }

    public static boolean isServerBanned(Context ctx) {
        try {
            JSONObject body = new JSONObject();
            body.put("action", "ban_check");
            JSONObject resp = ApiClient.postSigned(ctx, body);
            return resp.optBoolean("banned", false);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Full crack response: local ban, server ban, wipe secrets, show ban screen.
     * @return false — caller must block all further UI.
     */
    public static boolean enforceCrackBan(Context ctx, String reason) {
        if (isLocallyBanned(ctx)) {
            launchBanScreen(ctx);
            return false;
        }
        String crackReason = reason != null ? reason : IntegrityChecker.getCrackReason(ctx);
        if (crackReason == null) return true;

        markLocalBan(ctx, crackReason);
        new Thread(() -> reportCrackBanToServer(ctx, crackReason)).start();
        SecurityPrefs.wipeAll(ctx);
        SecretsManager.wipe(ctx);
        EncryptedFileStore.wipeAll(ctx);
        SecureDatabase.wipe(ctx);
        TamperDetector.wipeAndLogout(ctx);
        BruteForceGuard.permanentLock(ctx);
        launchBanScreen(ctx);
        return false;
    }

    /** Check local + server ban, or fresh crack detection. */
    public static boolean gate(Context ctx) {
        if (isLocallyBanned(ctx)) {
            launchBanScreen(ctx);
            return false;
        }
        String crack = IntegrityChecker.getCrackReason(ctx);
        if (crack != null) return enforceCrackBan(ctx, crack);
        if (isServerBanned(ctx)) {
            markLocalBan(ctx, "server_banned");
            BruteForceGuard.permanentLock(ctx);
            launchBanScreen(ctx);
            return false;
        }
        return true;
    }

    public static void launchBanScreen(Context ctx) {
        Intent i = new Intent(ctx, CrackBanActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        ctx.startActivity(i);
    }
}
