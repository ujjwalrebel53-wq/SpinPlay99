package com.rebel.panel.security;

import java.io.BufferedReader;
import java.io.FileReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Locale;

/** Layer 6 — Frida, Xposed, LSPosed, memory hooks. */
public final class HookDetector {

    private HookDetector() {}

    public static boolean detected() {
        return frida() || xposed() || suspiciousMaps();
    }

    private static boolean frida() {
        for (int port : new int[]{27042, 27043, 27049}) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress("127.0.0.1", port), 150);
                return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static boolean xposed() {
        String[] cls = {
                "de.robv.android.xposed.XposedBridge",
                "org.lsposed.lspd.core.Main",
                "io.github.lsposed.lspd.core.Main"
        };
        for (String c : cls) {
            try {
                ClassLoader.getSystemClassLoader().loadClass(c);
                return true;
            } catch (ClassNotFoundException ignored) {}
        }
        return false;
    }

    private static boolean suspiciousMaps() {
        try (BufferedReader r = new BufferedReader(new FileReader("/proc/self/maps"))) {
            String line;
            while ((line = r.readLine()) != null) {
                String l = line.toLowerCase(Locale.US);
                if (l.contains("frida") || l.contains("xposed") || l.contains("substrate")
                        || l.contains("gadget") || l.contains("lsposed"))
                    return true;
            }
        } catch (Exception ignored) {}
        return false;
    }
}
