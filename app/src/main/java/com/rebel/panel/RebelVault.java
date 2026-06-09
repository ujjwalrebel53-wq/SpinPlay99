package com.rebel.panel;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.spec.KeySpec;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Local vault: PBKDF2-HMAC-SHA256 with 50,000 iterations + AES-256-GCM.
 */
public final class RebelVault {

    private static final String PREFS = "rebel_vault_v1";
    private static final String SALT_KEY = "_salt";
    private static final int PBKDF2_ITERATIONS = 50_000;
    private static final int KEY_BITS = 256;
    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;

    private RebelVault() {}

    public static void put(Context ctx, String key, String value) {
        try {
            byte[] salt = getOrCreateSalt(ctx);
            SecretKey sk = deriveKey(ctx, salt);
            byte[] iv = new byte[GCM_IV_BYTES];
            new SecureRandom().nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, sk, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] enc = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] blob = new byte[iv.length + enc.length];
            System.arraycopy(iv, 0, blob, 0, iv.length);
            System.arraycopy(enc, 0, blob, iv.length, enc.length);
            prefs(ctx).edit().putString(encKey(key), Base64.encodeToString(blob, Base64.NO_WRAP)).apply();
        } catch (Exception ignored) {
            prefs(ctx).edit().putString(encKey(key), value).apply();
        }
    }

    public static String get(Context ctx, String key) {
        String blob = prefs(ctx).getString(encKey(key), null);
        if (blob == null) return null;
        try {
            byte[] raw = Base64.decode(blob, Base64.NO_WRAP);
            if (raw.length <= GCM_IV_BYTES) return null;
            byte[] iv = new byte[GCM_IV_BYTES];
            byte[] enc = new byte[raw.length - GCM_IV_BYTES];
            System.arraycopy(raw, 0, iv, 0, GCM_IV_BYTES);
            System.arraycopy(raw, GCM_IV_BYTES, enc, 0, enc.length);
            SecretKey sk = deriveKey(ctx, getOrCreateSalt(ctx));
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, sk, new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(c.doFinal(enc), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return blob;
        }
    }

    public static String getDeviceSecret(Context ctx) {
        String k = "device_secret";
        String v = get(ctx, k);
        if (v != null && v.length() >= 32) return v;
        byte[] b = new byte[32];
        new SecureRandom().nextBytes(b);
        v = Base64.encodeToString(b, Base64.NO_WRAP);
        put(ctx, k, v);
        return v;
    }

    private static String encKey(String key) {
        return "e_" + key;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static byte[] getOrCreateSalt(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String s = p.getString(SALT_KEY, null);
        if (s != null) return Base64.decode(s, Base64.NO_WRAP);
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        p.edit().putString(SALT_KEY, Base64.encodeToString(salt, Base64.NO_WRAP)).apply();
        return salt;
    }

    private static SecretKey deriveKey(Context ctx, byte[] salt) throws Exception {
        String seed = Build.FINGERPRINT + "|" + Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
        KeySpec spec = new PBEKeySpec(seed.toCharArray(), salt, PBKDF2_ITERATIONS, KEY_BITS);
        SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        return new SecretKeySpec(f.generateSecret(spec).getEncoded(), "AES");
    }
}
