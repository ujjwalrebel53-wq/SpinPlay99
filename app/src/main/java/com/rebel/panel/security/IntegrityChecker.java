package com.rebel.panel.security;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import com.rebel.panel.BuildConfig;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Layer 2 — APK signature + DEX checksum integrity. */
public final class IntegrityChecker {

    private IntegrityChecker() {}

    public static boolean verify(Context ctx) {
        if (!verifyApkSignature(ctx)) return false;
        return verifyDexCrc(ctx);
    }

    /** @return null if OK, else crack reason for ban screen + server. */
    public static String getCrackReason(Context ctx) {
        if (BuildConfig.DEBUG) {
            String expected = BuildConfig.REBEL_APK_SHA256;
            if (expected == null || expected.isEmpty() || "CHANGE_ME".equals(expected)) {
                return null;
            }
        }
        if (!verifyApkSignature(ctx)) return "apk_resigned";
        if (!verifyDexCrc(ctx)) return "dex_tampered";
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
        String expected = BuildConfig.REBEL_APK_SHA256;
        if (expected == null || expected.isEmpty() || "CHANGE_ME".equals(expected)) {
            return BuildConfig.DEBUG;
        }
        try {
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pi;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                Signature[] sigs = pi.signingInfo.getApkContentsSigners();
                if (sigs == null || sigs.length == 0) return false;
                return expected.equalsIgnoreCase(sha256Hex(sigs[0].toByteArray()));
            } else {
                pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
                if (pi.signatures == null || pi.signatures.length == 0) return false;
                return expected.equalsIgnoreCase(sha256Hex(pi.signatures[0].toByteArray()));
            }
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean verifyDexCrc(Context ctx) {
        try {
            String apk = ctx.getApplicationInfo().sourceDir;
            long crc = 0;
            try (ZipFile zf = new ZipFile(apk)) {
                ZipEntry e = zf.getEntry("classes.dex");
                if (e == null) return false;
                crc = e.getCrc();
            }
            if (crc == 0) return false;
            String key = "dex_crc_v" + BuildConfig.VERSION_CODE;
            String stored = ctx.getSharedPreferences("rebel_integrity", Context.MODE_PRIVATE)
                    .getString(key, "");
            if (stored.isEmpty()) {
                ctx.getSharedPreferences("rebel_integrity", Context.MODE_PRIVATE)
                        .edit().putString(key, String.valueOf(crc)).apply();
                return true;
            }
            return stored.equals(String.valueOf(crc));
        } catch (Exception e) {
            return BuildConfig.DEBUG;
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
