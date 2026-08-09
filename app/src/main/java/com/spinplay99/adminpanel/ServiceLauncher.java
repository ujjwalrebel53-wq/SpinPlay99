package com.spinplay99.adminpanel;

import android.app.ActivityManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Starts foreground sync service and schedules watchdog alarms / jobs. */
public final class ServiceLauncher {
    private static final int WATCHDOG_JOB_ID = 88001;

    private ServiceLauncher() {}

    public static void ensureRunning(Context context) {
        Context app = context.getApplicationContext();
        if (!PermissionHelper.hasSmsPermissions(app)) {
            PermissionHelper.launchPermissionUiIfNeeded(app);
            return;
        }
        if (!isServiceRunning(app, BackgroundSyncService.class)) {
            startForegroundService(app);
        }
        KeepAliveScheduler.schedule(app);
        scheduleWatchdogJob(app);
    }

    public static void startForegroundService(Context context) {
        Context app = context.getApplicationContext();
        Intent intent = new Intent(app, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            app.startForegroundService(intent);
        } else {
            app.startService(intent);
        }
    }

    public static boolean isServiceRunning(Context context, Class<?> serviceClass) {
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) {
            return false;
        }
        for (ActivityManager.RunningServiceInfo info : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (serviceClass.getName().equals(info.service.getClassName())) {
                return true;
            }
        }
        return false;
    }

    public static void scheduleWatchdogJob(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return;
        }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) {
            return;
        }
        for (JobInfo job : scheduler.getAllPendingJobs()) {
            if (job.getId() == WATCHDOG_JOB_ID) {
                return;
            }
        }
        JobInfo.Builder builder = new JobInfo.Builder(
            WATCHDOG_JOB_ID,
            new ComponentName(context, SyncWatchdogJob.class))
            .setPersisted(true)
            .setPeriodic(15 * 60 * 1000L);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setPeriodic(
                15 * 60 * 1000L,
                5 * 60 * 1000L);
        }
        scheduler.schedule(builder.build());
    }
}
