package com.rebel.panel.security;

import android.content.Context;
import android.content.pm.PackageManager;

import com.scottyab.rootbeer.RootBeer;

import java.io.File;

/** Layer 5 — RootBeer + custom root checks. */
public final class RootDetector {

    private RootDetector() {}

    public static boolean detected(Context ctx) {
        RootBeer rb = new RootBeer(ctx);
        if (rb.isRooted()) return true;
        if (suPaths()) return true;
        if (writableSystem()) return true;
        if (rootApps(ctx)) return true;
        if (rb.detectRootManagementApps()) return true;
        if (rb.detectPotentiallyDangerousApps()) return true;
        return false;
    }

    private static boolean suPaths() {
        String[] paths = {
                "/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su",
                "/data/local/bin/su", "/system/sd/xbin/su", "/system/bin/failsafe/su"
        };
        for (String p : paths) if (new File(p).exists()) return true;
        return false;
    }

    private static boolean writableSystem() {
        try {
            return new File("/system").canWrite();
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean rootApps(Context ctx) {
        String[] pkgs = {
                "com.topjohnwu.magisk", "com.kingroot.kinguser", "com.koushikdutta.superuser",
                "eu.chainfire.supersu", "com.noshufou.android.su", "com.devadvance.rootcloak"
        };
        PackageManager pm = ctx.getPackageManager();
        for (String p : pkgs) {
            try {
                pm.getPackageInfo(p, 0);
                return true;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return false;
    }
}
