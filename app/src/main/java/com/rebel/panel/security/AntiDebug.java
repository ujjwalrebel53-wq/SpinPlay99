package com.rebel.panel.security;

import android.os.Debug;

import java.io.BufferedReader;
import java.io.FileReader;
import java.net.InetSocketAddress;
import java.net.Socket;

/** Layer 3 — debugger + JDWP detection. */
public final class AntiDebug {

    private AntiDebug() {}

    public static boolean detected() {
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true;
        if (jdwpPortOpen()) return true;
        if (tracerPid()) return true;
        try {
            return NativeGuard.nativeAntiDebug();
        } catch (Throwable t) {
            return false;
        }
    }

    private static boolean jdwpPortOpen() {
        for (int port : new int[]{8000, 8700, 5005}) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("127.0.0.1", port), 150);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static boolean tracerPid() {
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/self/status"))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.startsWith("TracerPid:")) {
                    int pid = Integer.parseInt(line.replaceAll("[^0-9]", ""));
                    return pid > 0;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }
}
