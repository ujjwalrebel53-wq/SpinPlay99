package com.rebel.panel.security;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import com.rebel.panel.BuildConfig;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Layer 2 — APK signature + DEX checksum integrity (baseline on first install). */
public final class IntegrityChecker {

    private static final String PREFS = "rebel_integrity";

    private IntegrityChecker() {}

    public static boolean verify(Context ctx) {
        return getCrackReason(ctx) == null;
    }

    /**
     * Crack = signature or DEX changed AFTER first legitimate install baseline.
     * First install always passes and records baseline (no false ban from wrong BuildConfig hash).
     */
    public static String getCrackReason(Context ctx) {
        String sig = checkSignatureTamper(ctx);
        if (sig != null) return sig;
        return checkDexTamper(ctx);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String checkSignatureTamper(Context ctx) {
        String current = currentCertSha256(ctx);
        if (current.isEmpty()) return null;

        SharedPreferences sp = prefs(ctx);
        String baseline = sp.getString("cert_sha256", "");
        if (baseline.isEmpty()) {
            sp.edit().putString("cert_sha256", current).apply();
            return null;
        }
        if (!baseline.equalsIgnoreCase(current)) return "apk_resigned";
        return null;
    }

    private static String checkDexTamper(Context ctx) {
        long crc = readPrimaryDexCrc(ctx);
        if (crc == 0) return null;

        String key = "dex_crc_v" + BuildConfig.VERSION_CODE;
        SharedPreferences sp = prefs(ctx);
        String stored = sp.getString(key, "");
        if (stored.isEmpty()) {
            sp.edit().putString(key, String.valueOf(crc)).apply();
            return null;
        }
        if (!stored.equals(String.valueOf(crc))) return "dex_tampered";
        return null;
    }

    public static String currentCertSha256(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pi;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                Signature[] sigs = pi.signingInfo.getApkContentsSigners();
                if (sigs == null || sigs.length == 0) return "";
                return sha256Hex(sigs[0].toByteArray());
            }
            pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
            if (pi.signatures == null || pi.signatures.length == 0) return "";
            return sha256Hex(pi.signatures[0].toByteArray());
        } catch (Exception e) {
            return "";
        }
    }

    public static boolean verifyApkSignature(Context ctx) {
        return checkSignatureTamper(ctx) == null;
    }

    public static boolean verifyDexCrc(Context ctx) {
        return checkDexTamper(ctx) == null;
    }

    private static long readPrimaryDexCrc(Context ctx) {
        try {
            String apk = ctx.getApplicationInfo().sourceDir;
            try (ZipFile zf = new ZipFile(apk)) {
                ZipEntry e = zf.getEntry("classes.dex");
                if (e == null) return 0;
                return e.getCrc();
            }
        } catch (Exception e) {
            return 0;
        }
    }

    public static String sha256File(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            return sha256Hex(md.digest());
        } catch (Exception e) {
            return "";
        }
    }

    private static String sha256Hex(byte[] data) {
        StringBuilder sb = new StringBuilder();
        for (byte b : data) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
