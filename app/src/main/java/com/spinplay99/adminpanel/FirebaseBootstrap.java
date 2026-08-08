package com.spinplay99.adminpanel;

import android.content.Context;

import com.spinplay99.adminpanel.internal.CvNative;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.FirebaseDatabase;

/** Boots Firebase from native vault — no google-services.json in APK. */
public final class FirebaseBootstrap {
    private FirebaseBootstrap() {}

    public static FirebaseApp ensureApp(Context context) {
        if (!FirebaseApp.getApps(context).isEmpty()) {
            return FirebaseApp.getInstance();
        }
        FirebaseOptions options = new FirebaseOptions.Builder()
            .setDatabaseUrl(CvNative.field(0))
            .setApiKey(CvNative.field(1))
            .setProjectId(CvNative.field(2))
            .setStorageBucket(CvNative.field(3))
            .setApplicationId(CvNative.field(4))
            .setGcmSenderId(CvNative.field(5))
            .build();
        return FirebaseApp.initializeApp(context, options);
    }

    public static FirebaseDatabase database(Context context) {
        ensureApp(context);
        return FirebaseDatabase.getInstance();
    }

    public static String databaseUrl(Context context) {
        ensureApp(context);
        String url = CvNative.field(0);
        return url != null ? url.trim() : "";
    }
}
