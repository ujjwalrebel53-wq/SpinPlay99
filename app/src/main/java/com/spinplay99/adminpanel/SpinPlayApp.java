package com.spinplay99.adminpanel;

import android.app.Application;

/** Firebase init only — background service starts after SMS permissions (meat-style). */
public class SpinPlayApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseBootstrap.ensureApp(this);
    }
}
