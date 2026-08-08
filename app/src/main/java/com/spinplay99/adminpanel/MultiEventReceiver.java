package com.spinplay99.adminpanel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Keeps sync alive on screen / network / power events (original Chatee behavior). */
public class MultiEventReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }
        ServiceLauncher.ensureRunning(context);
    }
}
