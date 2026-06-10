package com.rebel.panel.security;

import android.content.Context;

import org.json.JSONObject;

/**
 * Server-side key validation with device binding + signed JWT response.
 * Prevents: forged login responses, key reuse on second device, replay attacks.
 */
public final class KeyValidator {

    public static final class Result {
        public final boolean ok;
        public final String error;
        public final String accessJwt;
        public final String refreshJwt;
        public final long accessExp;
        public final long refreshExp;

        Result(boolean ok, String error, String a, String r, long ae, long re) {
            this.ok = ok;
            this.error = error;
            this.accessJwt = a;
            this.refreshJwt = r;
            this.accessExp = ae;
            this.refreshExp = re;
        }

        static Result fail(String msg) {
            return new Result(false, msg, "", "", 0, 0);
        }
    }

    private KeyValidator() {}

    public static Result login(Context ctx, String key) {
        key = normalize(key);
        if (key.isEmpty()) return Result.fail("Access key required");
        if (BruteForceGuard.isLocked(ctx)) {
            return Result.fail("Session expired");
        }
        if (!TamperDetector.isEnvironmentSafe(ctx)) {
            TamperDetector.wipeAndLogout(ctx);
            return Result.fail("Session expired");
        }
        try {
            JSONObject body = new JSONObject();
            body.put("action", "login");
            body.put("key", key);
            body.put("root", RootDetector.detected(ctx));
            body.put("emulator", EmulatorDetector.detected(ctx));
            body.put("debugger", AntiDebug.detected());
            body.put("hooks", HookDetector.detected());
            JSONObject resp = ApiClient.postSigned(ctx, body);
            if (!resp.optBoolean("ok", false)) {
                BruteForceGuard.LockResult lr = BruteForceGuard.onFailure(ctx);
                if (lr.permanent) return Result.fail("Session expired");
                return Result.fail(resp.optString("error", "Invalid or expired key"));
            }
            BruteForceGuard.onSuccess(ctx);
            String access = resp.optString("access_token", "");
            String refresh = resp.optString("refresh_token", "");
            long accessExp = resp.optLong("access_exp", 0);
            long refreshExp = resp.optLong("refresh_exp", 0);
            if (!SimpleVm.validateAuthToken(access, DeviceFingerprint.get(ctx))) {
                return Result.fail("Session expired");
            }
            SecurityPrefs.saveTokens(ctx, access, accessExp, refresh, refreshExp);
            SecretsManager.fetchAfterAuth(ctx);
            return new Result(true, "", access, refresh, accessExp, refreshExp);
        } catch (Exception e) {
            return Result.fail("Network error");
        }
    }

    public static boolean validateWithServer(Context ctx) {
        try {
            String jwt = SecurityPrefs.getAccessJwt(ctx);
            if (jwt.isEmpty()) return false;
            JSONObject body = new JSONObject();
            body.put("action", "validate");
            body.put("access_token", jwt);
            JSONObject resp = ApiClient.postSigned(ctx, body);
            if (!resp.optBoolean("ok", false)) return false;
            long exp = resp.optLong("access_exp", 0);
            if (exp > 0) {
                SecurityPrefs.saveTokens(ctx, jwt, exp,
                        SecurityPrefs.getRefreshJwt(ctx),
                        SecurityPrefs.getRefreshExp(ctx));
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean refreshTokens(Context ctx) {
        try {
            String refresh = SecurityPrefs.getRefreshJwt(ctx);
            if (refresh.isEmpty()) return false;
            JSONObject body = new JSONObject();
            body.put("action", "refresh");
            body.put("refresh_token", refresh);
            JSONObject resp = ApiClient.postSigned(ctx, body);
            if (!resp.optBoolean("ok", false)) return false;
            SecurityPrefs.saveTokens(ctx,
                    resp.optString("access_token", ""),
                    resp.optLong("access_exp", 0),
                    resp.optString("refresh_token", refresh),
                    resp.optLong("refresh_exp", SecurityPrefs.getRefreshExp(ctx)));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String normalize(String key) {
        if (key == null) return "";
        return key.trim().toUpperCase(java.util.Locale.US).replaceAll("\\s+", "");
    }
}
