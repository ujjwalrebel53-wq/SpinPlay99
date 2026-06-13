package com.rebel.panel;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import com.rebel.panel.security.DeviceBanManager;
import com.rebel.panel.security.IntegrityChecker;
import com.rebel.panel.security.RaspMonitor;
import com.rebel.panel.security.SecureDatabase;
import com.rebel.panel.security.SecurityOrchestrator;
import com.rebel.panel.security.SessionManager;

public class RebelApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            SecureDatabase.loadLibs(this);
        } catch (Throwable ignored) {}
        IntegrityChecker.migrateBaselinesOnUpgrade(this);
        RaspMonitor.start(this);
        prewarmWebView();

        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityResumed(Activity activity) {
                if (activity instanceof LoginActivity || activity instanceof CrackBanActivity) return;
                if (DeviceBanManager.isLocallyBanned(activity) || DeviceBanManager.isBanScreenShowing()) return;
                if (!SecurityOrchestrator.gate(activity)) return;
                SessionManager.ensureValidSessionSoft(activity);
            }

            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityPaused(Activity a) {}
            @Override public void onActivityStopped(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }

    /** Warm Chromium so first LoginActivity WebView paints faster. */
    private void prewarmWebView() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                WebView w = new WebView(getApplicationContext());
                w.getSettings().setJavaScriptEnabled(true);
                w.destroy();
            } catch (Throwable ignored) {}
        });
    }
}
