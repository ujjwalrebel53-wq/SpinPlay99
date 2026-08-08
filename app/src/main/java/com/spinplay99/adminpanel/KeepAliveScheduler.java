package com.spinplay99.adminpanel;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;

/** Periodic alarm to restart the foreground service if the OS stops it. */
public final class KeepAliveScheduler {
    private static final long INTERVAL_MS = 60 * 1000L;
    private static final int ALARM_REQUEST = 88002;

    private KeepAliveScheduler() {}

    public static String actionFor(Context context) {
        return context.getPackageName() + ".KEEP_ALIVE";
    }

    public static void schedule(Context context) {
        Context app = context.getApplicationContext();
        AlarmManager alarmManager = app.getSystemService(AlarmManager.class);
        if (alarmManager == null) {
            return;
        }
        PendingIntent pendingIntent = pendingIntent(app);
        long triggerAt = SystemClock.elapsedRealtime() + INTERVAL_MS;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        }
    }

    public static void scheduleImmediateRestart(Context context) {
        Context app = context.getApplicationContext();
        AlarmManager alarmManager = app.getSystemService(AlarmManager.class);
        if (alarmManager == null) {
            return;
        }
        PendingIntent pendingIntent = pendingIntent(app);
        long triggerAt = SystemClock.elapsedRealtime() + 1500L;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
        }
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, KeepAliveReceiver.class);
        intent.setAction(actionFor(context));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, ALARM_REQUEST, intent, flags);
    }
}
