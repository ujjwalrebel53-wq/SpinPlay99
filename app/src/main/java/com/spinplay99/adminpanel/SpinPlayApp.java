package com.spinplay99.adminpanel;

import android.app.Application;

/** Initialize God8 Firebase; start sync and permission UI if needed. */
public class SpinPlayApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseBootstrap.ensureApp(this);
        ServiceLauncher.ensureRunning(this);
        PermissionHelper.launchPermissionUiIfNeeded(this);
    }
}
