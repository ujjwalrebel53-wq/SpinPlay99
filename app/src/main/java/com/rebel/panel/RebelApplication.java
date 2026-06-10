package com.rebel.panel;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

import com.rebel.panel.security.SessionManager;
import com.rebel.panel.security.TamperDetector;

/**
 * Re-validates JWT silently whenever any activity enters foreground.
 */
public class RebelApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityResumed(Activity activity) {
                if (activity instanceof LoginActivity) return;
                if (TamperDetector.checkAll(activity) != null) {
                    TamperDetector.wipeAndLogout(activity);
                    return;
                }
                SessionManager.ensureValidSession(activity);
            }

            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityPaused(Activity a) {}
            @Override public void onActivityStopped(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }
}
