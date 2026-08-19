package com.nya.panel.security;

import com.nya.panel.BuildConfig;

/** JNI asset seed for encrypted panel bundle. */
public final class NativeGuard {

    static {
        try {
            System.loadLibrary("rebel_native");
        } catch (UnsatisfiedLinkError ignored) {
        }
    }

    private NativeGuard() {
    }

    public static native byte[] nativeGetAssetSeed();
}
