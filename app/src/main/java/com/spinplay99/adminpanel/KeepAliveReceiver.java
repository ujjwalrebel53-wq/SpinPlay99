package com.spinplay99.adminpanel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarm tick — restart foreground sync and schedule the next watchdog alarm. */
public class KeepAliveReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ServiceLauncher.ensureRunning(context);
        KeepAliveScheduler.schedule(context);
    }
}
