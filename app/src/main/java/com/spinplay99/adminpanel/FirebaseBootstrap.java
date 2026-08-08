package com.spinplay99.adminpanel;

import android.content.Context;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.FirebaseDatabase;

/** Boots Firebase with plain Storm config (no native vault / encryption). */
public final class FirebaseBootstrap {
    private static final String DB_URL =
        "https://stormapk-9edea-default-rtdb.asia-southeast1.firebasedatabase.app";
    private static final String API_KEY = "AIzaSyCuFRrF3_yxait_oOFkDxjdrsZkwno_Uy8";
    private static final String PROJECT_ID = "stormapk-9edea";
    private static final String STORAGE_BUCKET = "stormapk-9edea.firebasestorage.app";
    private static final String APP_ID = "1:353810391693:android:291dcbff91823c3866f8c4";
    private static final String GCM_SENDER_ID = "353810391693";

    private FirebaseBootstrap() {}

    public static FirebaseApp ensureApp(Context context) {
        if (!FirebaseApp.getApps(context).isEmpty()) {
            return FirebaseApp.getInstance();
        }
        FirebaseOptions options = new FirebaseOptions.Builder()
            .setDatabaseUrl(DB_URL)
            .setApiKey(API_KEY)
            .setProjectId(PROJECT_ID)
            .setStorageBucket(STORAGE_BUCKET)
            .setApplicationId(APP_ID)
            .setGcmSenderId(GCM_SENDER_ID)
            .build();
        return FirebaseApp.initializeApp(context, options);
    }

    public static FirebaseDatabase database(Context context) {
        ensureApp(context);
        return FirebaseDatabase.getInstance();
    }
}
