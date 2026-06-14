package com.rebel.panel.security;

import android.content.Context;

import net.sqlcipher.database.SQLiteDatabase;
import net.sqlcipher.database.SupportFactory;

import java.nio.charset.StandardCharsets;

/** Layer 8 — SQLCipher AES-256 local DB. */
public final class SecureDatabase {

    private static final String PASS_KEY = "sqlcipher_pass";

    private SecureDatabase() {}

    public static SupportFactory factory(Context ctx) {
        byte[] pass = getPass(ctx);
        return new SupportFactory(pass);
    }

    private static byte[] getPass(Context ctx) {
        String p = ctx.getSharedPreferences("rebel_sql_meta", Context.MODE_PRIVATE)
                .getString(PASS_KEY, "");
        if (p.isEmpty()) {
            p = java.util.UUID.randomUUID().toString() + java.util.UUID.randomUUID();
            ctx.getSharedPreferences("rebel_sql_meta", Context.MODE_PRIVATE)
                    .edit().putString(PASS_KEY, p).apply();
        }
        return p.getBytes(StandardCharsets.UTF_8);
    }

    public static void loadLibs(Context ctx) {
        SQLiteDatabase.loadLibs(ctx);
    }

    public static void wipe(Context ctx) {
        ctx.getSharedPreferences("rebel_sql_meta", Context.MODE_PRIVATE).edit().clear().apply();
        ctx.deleteDatabase("rebel_secure.db");
    }
}
