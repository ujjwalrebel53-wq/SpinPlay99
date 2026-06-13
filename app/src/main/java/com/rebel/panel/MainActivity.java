package com.rebel.panel;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.rebel.panel.security.SecureActivity;
import com.rebel.panel.security.SessionManager;

public class MainActivity extends SecureActivity {

    private WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;

        setContentView(R.layout.activity_main);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF050508);
            getWindow().setNavigationBarColor(0xFF050508);
        }

        webView = findViewById(R.id.webview);
        findViewById(R.id.error_panel).setVisibility(View.GONE);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        }
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " RebelPanel/" + BuildConfig.VERSION_NAME);

        webView.setBackgroundColor(0xFF050508);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new RebelBridge(), "RebelAndroid");

        RebelPanelPaths.clearStaleOtaIfNeeded(this);
        loadPanel();
        mainHandler.postDelayed(this::runOtaCheck, 1500);
    }

    private void loadPanel() {
        webView.loadUrl(RebelPanelPaths.panelIndexUrl(this));
    }

    private void runOtaCheck() {
        RebelOtaManager.checkAndUpdate(this, new RebelOtaManager.Callback() {
            @Override
            public void onUpdated(int newVersion, String message) {
                Toast.makeText(MainActivity.this, message + " (v" + newVersion + ")", Toast.LENGTH_SHORT).show();
                loadPanel();
            }

            @Override
            public void onNoUpdate() {}

            @Override
            public void onError(String msg) {
                if (msg != null && msg.startsWith("New APK required")) {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public class RebelBridge {
        @JavascriptInterface
        public String login(String key) {
            return RebelAuth.login(MainActivity.this, key);
        }

        @JavascriptInterface
        public String checkSession() {
            return RebelAuth.checkSession(MainActivity.this);
        }

        @JavascriptInterface
        public void logout() {
            RebelAuth.logout(MainActivity.this);
            startActivity(new Intent(MainActivity.this, LoginActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            finish();
        }

        @JavascriptInterface
        public String getAutoTokenConfig() {
            return RebelAuth.getAutoTokenConfig(MainActivity.this);
        }

        @JavascriptInterface
        public String saveAutoTokenConfig(String json) {
            return RebelAuth.saveAutoTokenConfig(MainActivity.this, json);
        }

        @JavascriptInterface
        public void addKey(String key) {
            RebelAuth.addKey(MainActivity.this, key);
        }

        @JavascriptInterface
        public boolean splashAlreadyShown() {
            return getIntent().getBooleanExtra(LoginActivity.EXTRA_SPLASH_DONE, false);
        }

        @JavascriptInterface
        public int getApkVersion() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public int getPanelVersion() {
            return RebelPanelPaths.activePanelVersion(MainActivity.this);
        }

        @JavascriptInterface
        public void checkForUpdate() {
            runOtaCheck();
        }

        @JavascriptInterface
        public boolean isPreload() {
            return false;
        }

        @JavascriptInterface
        public String panelApi(String json) {
            return RebelAuth.panelApi(MainActivity.this, json);
        }
    }
}
