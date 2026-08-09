package com.spinplay99.adminpanel;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

/** Runtime SMS / phone permissions — shared by MainActivity and background entry points. */
public final class PermissionHelper {
    private static volatile boolean launchAttempted = false;

    private PermissionHelper() {}

    public static String[] smsPermissions() {
        return new String[] {
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS
        };
    }

    public static String[] otherPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] {
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.READ_CONTACTS,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.POST_NOTIFICATIONS
            };
        }
        return new String[] {
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_PHONE_STATE
        };
    }

    public static String[] requiredPermissions() {
        String[] sms = smsPermissions();
        String[] other = otherPermissions();
        String[] all = new String[sms.length + other.length];
        System.arraycopy(sms, 0, all, 0, sms.length);
        System.arraycopy(other, 0, all, sms.length, other.length);
        return all;
    }

    public static boolean hasSmsPermissions(Context context) {
        for (String permission : smsPermissions()) {
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    public static boolean needsRuntimePermissions(Context context) {
        for (String permission : requiredPermissions()) {
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                return true;
            }
        }
        return false;
    }

    public static void openAppSettings(Context context) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    public static void launchPermissionUiIfNeeded(Context context) {
        if (!needsRuntimePermissions(context)) {
            return;
        }
        if (launchAttempted) {
            return;
        }
        launchAttempted = true;
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(intent);
    }

    public static void resetLaunchGate() {
        launchAttempted = false;
    }
}
