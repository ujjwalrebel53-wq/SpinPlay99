package com.rebel.panel.security;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Debug;

import com.rebel.panel.BuildConfig;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Runtime environment & APK integrity checks.
 * Prevents: repackaged APK, root hooks, Frida/Xposed, emulator farming, debugging.
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
        if (isDebuggerAttached()) return "debugger";
        if (isEmulator()) return "emulator";
        if (isRooted(ctx)) return "root";
        if (isFrida()) return "frida";
        if (isXposed()) return "xposed";
        if (!isSignatureValid(ctx)) return "signature";
        return null;
    }

    public static void wipeAndLogout(Context ctx) {
        SecurityPrefs.wipeAll(ctx);
        BruteForceGuard.wipe(ctx);
        DeviceFingerprint.clearCache();
        applyLock();
    }

    public static boolean isDebuggerAttached() {
        return Debug.isDebuggerConnected() || Debug.waitingForDebugger();
    }

    public static boolean isSignatureValid(Context ctx) {
        String expected = BuildConfig.REBEL_APK_SHA256;
        if (expected == null || expected.isEmpty()
                || "CHANGE_ME".equals(expected)) {
            return BuildConfig.DEBUG;
        }
        try {
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pi;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pi = pm.getPackageInfo(ctx.getPackageName(),
                        PackageManager.GET_SIGNING_CERTIFICATES);
                Signature[] sigs = pi.signingInfo.getApkContentsSigners();
                if (sigs == null || sigs.length == 0) return false;
                String actual = sha256Hex(sigs[0].toByteArray());
                return expected.equalsIgnoreCase(actual);
            } else {
                pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
                if (pi.signatures == null || pi.signatures.length == 0) return false;
                String actual = sha256Hex(pi.signatures[0].toByteArray());
                return expected.equalsIgnoreCase(actual);
            }
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isEmulator() {
        if (Build.FINGERPRINT != null && (
                Build.FINGERPRINT.startsWith("generic")
                        || Build.FINGERPRINT.contains("vbox")
                        || Build.FINGERPRINT.contains("test-keys"))) return true;
        if (Build.MODEL != null && (
                Build.MODEL.contains("google_sdk")
                        || Build.MODEL.contains("Emulator")
                        || Build.MODEL.contains("Android SDK built for x86")
                        || Build.MODEL.toLowerCase(Locale.US).contains("droid4x"))) return true;
        if (Build.MANUFACTURER != null && Build.MANUFACTURER.contains("Genymotion")) return true;
        if (Build.HARDWARE != null && (
                Build.HARDWARE.contains("goldfish")
                        || Build.HARDWARE.contains("ranchu")
                        || Build.HARDWARE.contains("vbox"))) return true;
        if (Build.PRODUCT != null && (
                Build.PRODUCT.contains("sdk_google")
                        || Build.PRODUCT.contains("sdk")
                        || Build.PRODUCT.contains("vbox86p")
                        || Build.PRODUCT.contains("emulator"))) return true;
        String[] emuFiles = {
                "/dev/socket/qemud", "/dev/qemu_pipe",
                "/system/lib/libc_malloc_debug_qemu.so",
                "/sys/qemu_trace", "/system/bin/qemu-props",
                "/data/data/com.bluestacks.appmart",
                "/data/data/com.bignox.app"
        };
        for (String p : emuFiles) if (new File(p).exists()) return true;
        return false;
    }

    public static boolean isRooted(Context ctx) {
        String[] suPaths = {
                "/system/app/Superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su",
                "/data/local/xbin/su", "/data/local/bin/su", "/system/su", "/system/bin/.ext/su",
                "/system/usr/we-need-root/su", "/cache/su", "/data/local/su"
        };
        for (String p : suPaths) if (new File(p).exists()) return true;
        try {
            if (new File("/system").canWrite()) return true;
        } catch (Exception ignored) {}
        String[] magisk = {
                "com.topjohnwu.magisk", "com.koushikdutta.superuser",
                "eu.chainfire.supersu", "com.noshufou.android.su"
        };
        PackageManager pm = ctx.getPackageManager();
        for (String pkg : magisk) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return false;
    }

    public static boolean isFrida() {
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/self/maps"))) {
            String line;
            while ((line = r.readLine()) != null) {
                String l = line.toLowerCase(Locale.US);
                if (l.contains("frida") || l.contains("gadget") || l.contains("linjector"))
                    return true;
            }
        } catch (Exception ignored) {}
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", 27042), 200);
            return true;
        } catch (Exception ignored) {}
        return false;
    }

    public static boolean isXposed() {
        try {
            ClassLoader cl = ClassLoader.getSystemClassLoader();
            cl.loadClass("de.robv.android.xposed.XposedBridge");
            return true;
        } catch (ClassNotFoundException ignored) {}
        try {
            throw new Exception("xposed");
        } catch (Exception e) {
            for (StackTraceElement ste : e.getStackTrace()) {
                if (ste.getClassName() != null
                        && ste.getClassName().toLowerCase(Locale.US).contains("xposed"))
                    return true;
            }
        }
        return false;
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data);
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
