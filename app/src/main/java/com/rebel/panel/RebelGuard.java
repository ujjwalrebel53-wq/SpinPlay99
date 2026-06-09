package com.rebel.panel;

import android.content.Context;
import android.os.Debug;

/**
 * Light security — blocks debugger only (no false root blocks).
 */
public final class RebelGuard {

    public static final class Blocked extends Exception {
        public Blocked(String reason) {
            super(reason);
        }
    }

    private RebelGuard() {}

    public static void enforce(Context ctx) throws Blocked {
        if (BuildConfig.DEBUG) return;
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
            throw new Blocked("Debugger detected");
        }
    }
}
