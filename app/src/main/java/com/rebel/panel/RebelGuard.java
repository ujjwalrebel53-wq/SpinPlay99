package com.rebel.panel;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Debug;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Anti-tamper, anti-debug, root/emulator checks.
 */
public final class RebelGuard {

    public static final class Blocked extends Exception {
        public Blocked(String reason) {
            super(reason);
        }
    }

    private RebelGuard() {}

    public static void enforce(Context ctx) throws Blocked {
        if (BuildConfig.DEBUG) {
            return;
        }
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
            throw new Blocked("Debugger detected");
        }
        if (isEmulator()) {
            throw new Blocked("Emulator not allowed");
        }
        if (isRooted()) {
            throw new Blocked("Rooted device blocked");
        }
        if (!verifySignature(ctx)) {
            throw new Blocked("APK signature invalid");
        }
        if (isFridaLikely()) {
            throw new Blocked("Hook framework detected");
        }
    }

    private static boolean verifySignature(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(),
                Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) {
                sigs = pi.signingInfo.getApkContentsSigners();
            } else if (pi.signatures != null) {
                sigs = pi.signatures;
            } else {
                return false;
            }
            if (sigs == null || sigs.length == 0) return false;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(sigs[0].toByteArray());
            String hex = bytesToHex(hash);
            String expected = BuildConfig.REBEL_APK_SHA256;
            if (expected == null || expected.isEmpty() || "CHANGE_ME".equals(expected)) {
                return true;
            }
            return expected.equalsIgnoreCase(hex);
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isRooted() {
        String[] paths = {
            "/system/app/Superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su",
            "/data/local/xbin/su", "/data/local/bin/su", "/system/sd/xbin/su",
            "/system/bin/failsafe/su", "/data/local/su", "/su/bin/su"
        };
        for (String p : paths) {
            if (new File(p).exists()) return true;
        }
        return canExec("su");
    }

    private static boolean isEmulator() {
        String f = Build.FINGERPRINT.toLowerCase(Locale.US);
        String m = Build.MODEL.toLowerCase(Locale.US);
        String man = Build.MANUFACTURER.toLowerCase(Locale.US);
        return f.contains("generic") || f.contains("unknown") || m.contains("google_sdk")
            || m.contains("emulator") || m.contains("android sdk built for x86")
            || man.contains("genymotion") || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"));
    }

    private static boolean isFridaLikely() {
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(new File("/proc/self/maps").toURI().toURL().openStream()));
            String line;
            while ((line = r.readLine()) != null) {
                String l = line.toLowerCase(Locale.US);
                if (l.contains("frida") || l.contains("xposed") || l.contains("substrate")) {
                    r.close();
                    return true;
                }
            }
            r.close();
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean canExec(String cmd) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"which", cmd});
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            boolean ok = r.readLine() != null;
            r.close();
            return ok;
        } catch (Exception e) {
            return false;
        }
    }

    private static String bytesToHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.US, "%02x", x));
        return sb.toString();
    }
}
