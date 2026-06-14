package com.rebel.panel.security;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Layer 8 — AES-256-GCM encrypted files in internal storage. */
public final class EncryptedFileStore {

    private static final String K = "rebel_file_key_v1";

    private EncryptedFileStore() {}

    private static SecretKey key(Context ctx) throws Exception {
        String b64 = ctx.getSharedPreferences("rebel_file_meta", Context.MODE_PRIVATE)
                .getString(K, "");
        byte[] raw;
        if (b64.isEmpty()) {
            raw = new byte[32];
            new SecureRandom().nextBytes(raw);
            ctx.getSharedPreferences("rebel_file_meta", Context.MODE_PRIVATE)
                    .edit().putString(K, android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP))
                    .apply();
        } else {
            raw = android.util.Base64.decode(b64, android.util.Base64.NO_WRAP);
        }
        return new SecretKeySpec(raw, "AES");
    }

    public static void write(Context ctx, String name, byte[] plain) throws Exception {
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key(ctx), new GCMParameterSpec(128, iv));
        byte[] enc = c.doFinal(plain);
        File f = new File(ctx.getFilesDir(), name + ".enc");
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(iv);
            out.write(enc);
        }
        MemoryWiper.wipe(plain);
    }

    public static byte[] read(Context ctx, String name) throws Exception {
        File f = new File(ctx.getFilesDir(), name + ".enc");
        if (!f.isFile()) return new byte[0];
        byte[] all;
        try (FileInputStream in = new FileInputStream(f)) {
            all = new byte[(int) f.length()];
            in.read(all);
        }
        byte[] iv = new byte[12];
        System.arraycopy(all, 0, iv, 0, 12);
        byte[] enc = new byte[all.length - 12];
        System.arraycopy(all, 12, enc, 0, enc.length);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(ctx), new GCMParameterSpec(128, iv));
        return c.doFinal(enc);
    }

    public static void wipeAll(Context ctx) {
        File dir = ctx.getFilesDir();
        if (dir == null) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.getName().endsWith(".enc")) f.delete();
        }
        ctx.getSharedPreferences("rebel_file_meta", Context.MODE_PRIVATE).edit().clear().apply();
    }
}
