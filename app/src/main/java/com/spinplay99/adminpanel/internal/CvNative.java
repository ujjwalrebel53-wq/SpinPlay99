package com.spinplay99.adminpanel.internal;

/** Native vault — Firebase strings only from JNI (no Java literals). */
public final class CvNative {
    private CvNative() {}

    private static boolean loaded;

    private static void load() {
        if (loaded) return;
        System.loadLibrary("cv_core");
        loaded = true;
    }

    public static String field(int id) {
        load();
        return n0(id);
    }

    private static native String n0(int id);
}
