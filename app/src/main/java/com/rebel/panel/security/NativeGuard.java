package com.rebel.panel.security;

import com.rebel.panel.BuildConfig;

/** Layer 10 — JNI anti-debug, secrets, Java env integrity. */
public final class NativeGuard {

    static {
        try {
            System.loadLibrary("rebel_native");
        } catch (UnsatisfiedLinkError ignored) {}
    }

    private NativeGuard() {}

    public static native boolean nativeAntiDebug();

    public static native long nativeTimingStart();

    public static native boolean nativeTimingCheck(long start, long maxMs);

    public static native String nativeGetSecret();

    public static native boolean nativeVerifyJavaEnv();

    public static native byte[] nativeGetAssetSeed();

    public static boolean isSafe() {
        try {
            if (!nativeVerifyJavaEnv()) return false;
            if (nativeAntiDebug()) return false;
            long t = nativeTimingStart();
            int x = 0;
            for (int i = 0; i < 1000; i++) x += i;
            return !nativeTimingCheck(t, 5000);
        } catch (UnsatisfiedLinkError e) {
            return BuildConfig.DEBUG;
        }
    }
}
