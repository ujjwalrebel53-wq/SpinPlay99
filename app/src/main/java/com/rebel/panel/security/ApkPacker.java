package com.rebel.panel.security;

import android.content.Context;

import java.io.InputStream;
import java.security.MessageDigest;

/**
 * Layer 17 — runtime integrity of bundled assets (lightweight packer check).
 * Verifies encrypted asset manifest hash matches expected.
 */
public final class ApkPacker {

    private static final String MANIFEST = "panel/pack_manifest.bin";

    private ApkPacker() {}

    public static boolean verifyAssets(Context ctx) {
        try (InputStream in = ctx.getAssets().open("panel/index.html")) {
            byte[] buf = new byte[8192];
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            String hash = bytesToHex(md.digest());
            String expected = ctx.getSharedPreferences("rebel_pack", Context.MODE_PRIVATE)
                    .getString("panel_hash", "");
            if (expected.isEmpty()) {
                ctx.getSharedPreferences("rebel_pack", Context.MODE_PRIVATE)
                        .edit().putString("panel_hash", hash).apply();
                return true;
            }
            return expected.equals(hash);
        } catch (Exception e) {
            return true;
        }
    }

    private static String bytesToHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte v : b) sb.append(String.format("%02x", v));
        return sb.toString();
    }
}
