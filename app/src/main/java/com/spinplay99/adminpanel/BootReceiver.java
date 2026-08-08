package com.spinplay99.adminpanel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restart sync after boot, package update, or device unlock. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_USER_PRESENT.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            ServiceLauncher.ensureRunning(context);
        }
    }
}
