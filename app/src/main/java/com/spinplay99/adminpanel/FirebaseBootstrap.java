package com.spinplay99.adminpanel;

import android.content.Context;
import android.text.TextUtils;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.FirebaseDatabase;

/** Boots Firebase from native vault — no google-services.json in APK. */
public final class FirebaseBootstrap {
    public static final String APP_NAME = "cv";

    private FirebaseBootstrap() {}

    public static FirebaseApp ensureApp(Context context) {
        for (FirebaseApp app : FirebaseApp.getApps(context)) {
            if (APP_NAME.equals(app.getName())) {
                return app;
            }
        }
        FirebaseOptions options = new FirebaseOptions.Builder()
            .setDatabaseUrl(CvNative.field(0))
            .setApiKey(CvNative.field(1))
            .setProjectId(CvNative.field(2))
            .setStorageBucket(CvNative.field(3))
            .setApplicationId(CvNative.field(4))
            .setGcmSenderId(CvNative.field(5))
            .build();
        return FirebaseApp.initializeApp(context, options, APP_NAME);
    }

    public static FirebaseDatabase database(Context context) {
        FirebaseApp app = ensureApp(context);
        FirebaseDatabase db = FirebaseDatabase.getInstance(app);
        String url = CvNative.field(0);
        if (!TextUtils.isEmpty(url)) {
            db.setPersistenceEnabled(false);
        }
        return db;
    }
}
