package com.rebel.panel.security;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * Progressive lockout on wrong keys.
 * Prevents: offline/online brute-force of RBL-XXXX keys.
 */
public final class BruteForceGuard {

    private static final String PREFS = "rebel_brute_v1";
    private static final String K_ATTEMPTS = "attempts";
    private static final String K_LOCK_UNTIL = "lock_until";
    private static final String K_PERM = "perm_lock";

    private BruteForceGuard() {}

    private static SharedPreferences p(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isPermanentlyLocked(Context ctx) {
        return p(ctx).getBoolean(K_PERM, false);
    }

    public static boolean isLocked(Context ctx) {
        if (isPermanentlyLocked(ctx)) return true;
        return System.currentTimeMillis() < p(ctx).getLong(K_LOCK_UNTIL, 0);
    }

    public static long lockRemainingMs(Context ctx) {
        if (isPermanentlyLocked(ctx)) return Long.MAX_VALUE;
        return Math.max(0, p(ctx).getLong(K_LOCK_UNTIL, 0) - System.currentTimeMillis());
    }

    public static int getAttempts(Context ctx) {
        return p(ctx).getInt(K_ATTEMPTS, 0);
    }

    public static void onSuccess(Context ctx) {
        p(ctx).edit().putInt(K_ATTEMPTS, 0).putLong(K_LOCK_UNTIL, 0).apply();
    }

    public static LockResult onFailure(Context ctx) {
        int n = p(ctx).getInt(K_ATTEMPTS, 0) + 1;
        SharedPreferences.Editor ed = p(ctx).edit().putInt(K_ATTEMPTS, n);
        long now = System.currentTimeMillis();
        if (n >= 10) {
            ed.putBoolean(K_PERM, true);
            ed.apply();
            reportSuspicious(ctx, n);
            return new LockResult(true, true, 0, n);
        }
        if (n >= 5) {
            ed.putLong(K_LOCK_UNTIL, now + 5 * 60 * 1000L);
            ed.apply();
            reportSuspicious(ctx, n);
            return new LockResult(true, false, 5 * 60 * 1000L, n);
        }
        if (n >= 3) {
            ed.putLong(K_LOCK_UNTIL, now + 30 * 1000L);
            ed.apply();
            return new LockResult(true, false, 30 * 1000L, n);
        }
        ed.apply();
        return new LockResult(false, false, 0, n);
    }

    private static void reportSuspicious(Context ctx, int attempts) {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "report_suspicious");
                body.put("attempts", attempts);
                body.put("reason", "brute_force");
                ApiClient.postSigned(ctx, body);
            } catch (Exception ignored) {}
        }).start();
    }

    public static void permanentLock(Context ctx) {
        p(ctx).edit().putBoolean(K_PERM, true).putInt(K_ATTEMPTS, 99).apply();
    }

    public static void wipe(Context ctx) {
        p(ctx).edit().clear().apply();
    }

    public static final class LockResult {
        public final boolean locked;
        public final boolean permanent;
        public final long lockMs;
        public final int attempts;

        LockResult(boolean locked, boolean permanent, long lockMs, int attempts) {
            this.locked = locked;
            this.permanent = permanent;
            this.lockMs = lockMs;
            this.attempts = attempts;
        }
    }
}
