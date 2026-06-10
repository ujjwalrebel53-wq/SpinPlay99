package com.rebel.panel.security;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

/** Layer 13 — continuous runtime self-protection. */
public final class RaspMonitor {

    private static final long INTERVAL_MS = 4000L;
    private static Handler handler;
    private static Context appCtx;

    private RaspMonitor() {}

    public static void start(Context ctx) {
        appCtx = ctx.getApplicationContext();
        if (handler != null) return;
        handler = new Handler(Looper.getMainLooper());
        handler.post(tick);
    }

    private static final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (appCtx == null) return;
            SecurityOrchestrator.Threat t = SecurityOrchestrator.evaluate(appCtx);
            if (t == SecurityOrchestrator.Threat.CRITICAL) {
                SecurityOrchestrator.handleCritical(appCtx, "rasp_loop");
            }
            if (handler != null) handler.postDelayed(this, INTERVAL_MS);
        }
    };

    public static void stop() {
        if (handler != null) handler.removeCallbacks(tick);
        handler = null;
    }
}
