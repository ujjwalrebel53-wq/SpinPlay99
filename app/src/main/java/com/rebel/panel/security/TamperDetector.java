package com.rebel.panel.security;

import android.content.Context;

/**
 * Facade for tamper checks — delegates to layered detectors (Layers 2-6).
 */
public final class TamperDetector {

    public static final int LOCK_SECONDS = 60;
    private static volatile long lockUntilMs = 0;

    private TamperDetector() {}

    public static boolean isLocked() {
        return System.currentTimeMillis() < lockUntilMs;
    }

    public static long lockRemainingMs() {
        return Math.max(0, lockUntilMs - System.currentTimeMillis());
    }

    public static void applyLock() {
        lockUntilMs = System.currentTimeMillis() + LOCK_SECONDS * 1000L;
    }

    public static boolean isEnvironmentSafe(Context ctx) {
        return checkAll(ctx) == null;
    }

    public static String checkAll(Context ctx) {
        if (isLocked()) return "locked";
        if (AntiDebug.detected()) return "debugger";
        if (EmulatorDetector.detected(ctx)) return "emulator";
        if (RootDetector.detected(ctx)) return "root";
        if (HookDetector.detected()) return "hooks";
        if (!IntegrityChecker.verify(ctx)) return "integrity";
        if (!NativeGuard.isSafe()) return "native";
        return null;
    }

    public static boolean isSignatureValid(Context ctx) {
        return IntegrityChecker.verifyApkSignature(ctx);
    }

    public static void wipeAndLogout(Context ctx) {
        SecurityPrefs.wipeAll(ctx);
        BruteForceGuard.wipe(ctx);
        SecretsManager.wipe(ctx);
        EncryptedFileStore.wipeAll(ctx);
        DeviceFingerprint.clearCache();
        applyLock();
    }

    // Legacy API used by older code paths
    public static boolean isDebuggerAttached() { return AntiDebug.detected(); }
    public static boolean isEmulator() { return EmulatorDetector.detected(null); }
    public static boolean isRooted(Context ctx) { return RootDetector.detected(ctx); }
    public static boolean isFrida() { return HookDetector.detected(); }
    public static boolean isXposed() { return HookDetector.detected(); }
}
