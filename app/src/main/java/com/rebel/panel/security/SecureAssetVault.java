package com.rebel.panel.security;

import android.content.Context;

import com.rebel.panel.BuildConfig;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Layer 17 — AES-256-GCM encrypted panel bundle inside APK.
 * Release builds ship only rbl_pack/*.bin; plaintext panel is decrypted to app-private storage at runtime.
 */
public final class SecureAssetVault {

    private static final byte[] MAGIC = {'R', 'B', 'L', '1'};
    private static final String PACK_ASSET_DIR = "rbl_pack";
    private static final String CACHE_DIR = "panel_secure";
    private static final String META = "rebel_vault_meta";

    private SecureAssetVault() {}

    public static boolean usesEncryptedBundle() {
        return !BuildConfig.DEBUG;
    }

    public static synchronized File ensurePanelReady(Context ctx) {
        if (!usesEncryptedBundle()) {
            return null;
        }
        File cache = new File(ctx.getFilesDir(), CACHE_DIR);
        int ver = BuildConfig.VERSION_CODE;
        if (ctx.getSharedPreferences(META, Context.MODE_PRIVATE).getInt("v", 0) == ver
                && new File(cache, "index.html").isFile()) {
            return cache;
        }
        wipeCache(cache);
        cache.mkdirs();
        try {
            unpackBundle(ctx, cache);
            ctx.getSharedPreferences(META, Context.MODE_PRIVATE).edit().putInt("v", ver).apply();
            return cache;
        } catch (Exception e) {
            wipeCache(cache);
            return null;
        }
    }

    private static void unpackBundle(Context ctx, File cache) throws Exception {
        byte[] key = deriveKey(BuildConfig.VERSION_CODE);
        byte[] manifestEnc = readAssetBytes(ctx, PACK_ASSET_DIR + "/manifest.bin");
        byte[] manifestPlain = decrypt(key, manifestEnc);
        JSONObject root = new JSONObject(new String(manifestPlain, "UTF-8"));
        JSONArray files = root.getJSONArray("f");
        for (int i = 0; i < files.length(); i++) {
            JSONObject entry = files.getJSONObject(i);
            String rel = entry.getString("p");
            String blob = entry.getString("b");
            byte[] plain = decrypt(key, readAssetBytes(ctx, PACK_ASSET_DIR + "/" + blob));
            File out = new File(cache, rel);
            File parent = out.getParentFile();
            if (parent != null) parent.mkdirs();
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(plain);
            }
            MemoryWiper.wipe(plain);
        }
        MemoryWiper.wipe(manifestPlain);
        MemoryWiper.wipe(key);
    }

    private static byte[] deriveKey(int versionCode) throws Exception {
        byte[] secret = NativeGuard.nativeGetAssetSeed();
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(secret);
        md.update("rebel_panel_assets_v2".getBytes("UTF-8"));
        md.update(String.valueOf(versionCode).getBytes("UTF-8"));
        return md.digest();
    }

    private static byte[] readAssetBytes(Context ctx, String path) throws Exception {
        try (InputStream in = ctx.getAssets().open(path);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static byte[] decrypt(byte[] key, byte[] blob) throws Exception {
        if (blob.length < MAGIC.length + 12 + 16) throw new IllegalArgumentException("bad blob");
        for (int i = 0; i < MAGIC.length; i++) {
            if (blob[i] != MAGIC[i]) throw new IllegalArgumentException("bad magic");
        }
        byte[] iv = Arrays.copyOfRange(blob, MAGIC.length, MAGIC.length + 12);
        byte[] enc = Arrays.copyOfRange(blob, MAGIC.length + 12, blob.length);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        return c.doFinal(enc);
    }

    private static void wipeCache(File cache) {
        if (!cache.exists()) return;
        File[] kids = cache.listFiles();
        if (kids != null) {
            for (File f : kids) deleteRecursive(f);
        }
    }

    private static void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        f.delete();
    }
}
