package com.rebel.panel.security;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import android.telephony.TelephonyManager;

import java.io.File;
import java.util.Locale;

/** Layer 4 — emulator detection via props, files, sensors. */
public final class EmulatorDetector {

    private EmulatorDetector() {}

    public static boolean detected(Context ctx) {
        if (buildProps()) return true;
        if (emuFiles()) return true;
        if (missingSensors(ctx)) return true;
        if (fakeImei(ctx)) return true;
        return false;
    }

    private static boolean buildProps() {
        if (Build.FINGERPRINT != null && (
                Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("vbox")
                        || Build.FINGERPRINT.contains("test-keys"))) return true;
        if (Build.MODEL != null && (Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("google_sdk") || Build.MODEL.contains("Android SDK")))
            return true;
        if (Build.HARDWARE != null && (Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("vbox")))
            return true;
        if (Build.PRODUCT != null && Build.PRODUCT.contains("sdk")) return true;
        return false;
    }

    private static boolean emuFiles() {
        String[] paths = {
                "/dev/socket/qemud", "/dev/qemu_pipe", "/sys/qemu_trace",
                "/data/data/com.bluestacks.appmart", "/data/data/com.bignox.app",
                "/data/data/com.vphone.launcher", "/fstab.andy", "/mnt/windows/BstSharedFolder"
        };
        for (String p : paths) if (new File(p).exists()) return true;
        return false;
    }

    private static boolean missingSensors(Context ctx) {
        SensorManager sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        if (sm == null) return true;
        boolean gyro = false, accel = false;
        for (Sensor s : sm.getSensorList(Sensor.TYPE_ALL)) {
            if (s.getType() == Sensor.TYPE_GYROSCOPE) gyro = true;
            if (s.getType() == Sensor.TYPE_ACCELEROMETER) accel = true;
        }
        return !(gyro && accel);
    }

    private static boolean fakeImei(Context ctx) {
        try {
            TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm == null) return false;
            String id = tm.getDeviceId();
            if (id == null) return false;
            return id.equals("000000000000000") || id.toLowerCase(Locale.US).contains("emulator");
        } catch (Exception e) {
            return false;
        }
    }
}
