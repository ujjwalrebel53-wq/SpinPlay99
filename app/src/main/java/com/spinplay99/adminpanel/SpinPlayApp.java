package com.spinplay99.adminpanel;

import android.app.Application;

/** Initialize Storm Firebase before any ContentProvider / service runs. */
public class SpinPlayApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseBootstrap.ensureApp(this);
        ServiceLauncher.ensureRunning(this);
    }
}
