package com.rebel.panel.security;

import android.content.Context;

import com.rebel.panel.BuildConfig;

/**
 * Central RASP gate — all 18 layers orchestrated.
 */
public final class SecurityOrchestrator {

    public enum Threat { NONE, WARN, CRITICAL }

    private SecurityOrchestrator() {}

    public static Threat evaluate(Context ctx) {
        if (IntegrityChecker.getCrackReason(ctx) != null) return Threat.CRITICAL;
        if (DeviceBanManager.isLocallyBanned(ctx)) return Threat.CRITICAL;
        if (AntiDebug.detected()) return Threat.CRITICAL;
        if (HookDetector.detected()) return Threat.CRITICAL;
        if (EmulatorDetector.detected(ctx)) return Threat.CRITICAL;
        if (RootDetector.detected(ctx)) return Threat.CRITICAL;
        if (!IntegrityChecker.verify(ctx)) return Threat.CRITICAL;
        if (!NativeGuard.isSafe()) return Threat.CRITICAL;
        if (ProxyDetector.mitmProxyActive() && BuildConfig.SSL_PIN_ENFORCE) return Threat.CRITICAL;
        if (!ApkPacker.verifyAssets(ctx)) return Threat.WARN;
        if (ThreatReporter.isKilled(ctx)) return Threat.CRITICAL;
        return Threat.NONE;
    }

    public static boolean gate(Context ctx) {
        if (DeviceBanManager.isBanScreenShowing()) return false;
        if (!DeviceBanManager.gate(ctx)) return false;
        Threat t = evaluate(ctx);
        if (t == Threat.NONE) return true;
        if (t == Threat.WARN) {
            ThreatReporter.report(ctx, "warn", "asset_integrity");
            return true;
        }
        handleCritical(ctx, "rasp");
        return false;
    }

    public static void handleCritical(Context ctx, String reason) {
        if (DeviceBanManager.isBanScreenShowing()) return;
        String crack = IntegrityChecker.getCrackReason(ctx);
        if (crack != null) {
            DeviceBanManager.enforceCrackBan(ctx, crack);
            return;
        }
        ThreatReporter.report(ctx, "critical", reason);
        // Do not wipe login session on transient RASP hits — only short lock.
        TamperDetector.applyLock();
    }
}
