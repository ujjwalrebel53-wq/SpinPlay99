package com.rebel.panel;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private LinearLayout errorPanel;
    private TextView errorText;
    private SecureWebViewClient secureClient;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pageLoaded = false;
    private boolean securityOk = false;
    private Runnable loadTimeout;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF050508);
            getWindow().setNavigationBarColor(0xFF050508);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        enableHighRefreshRate();

        webView = findViewById(R.id.webview);
        errorPanel = findViewById(R.id.error_panel);
        errorText = findViewById(R.id.error_text);
        Button retryBtn = findViewById(R.id.retry_btn);
        retryBtn.setOnClickListener(v -> startPanel());

        try {
            RebelGuard.enforce(this);
            securityOk = true;
        } catch (RebelGuard.Blocked e) {
            showFatal(e.getMessage());
            return;
        }

        setupWebView();
        RebelUpdateManager.check(this, new RebelUpdateManager.Callback() {
            @Override
            public void onPanelUrl(String url, int panelVersion) {
                if (url != null && !url.isEmpty()) {
                    RebelConfig.setPanelUrl(MainActivity.this, url);
                    try {
                        String host = android.net.Uri.parse(url).getHost();
                        if (host != null) secureClient.addAllowedHost(host);
                    } catch (Exception ignored) {}
                }
            }
            @Override
            public void onForceApkUpdate(String apkUrl, String message) {
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Update Required")
                    .setMessage(message)
                    .setCancelable(false)
                    .setPositiveButton("Update", (d, w) -> RebelUpdateManager.openApkInstall(MainActivity.this, apkUrl))
                    .show();
            }
            @Override
            public void onError(String msg) { /* use cached URL */ }
        });

        startPanel();
    }

    private void startPanel() {
        if (!securityOk) return;
        pageLoaded = false;
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);

        String url = RebelConfig.getPanelUrl(this);
        try {
            String host = android.net.Uri.parse(url).getHost();
            if (host != null) secureClient.addAllowedHost(host);
        } catch (Exception ignored) {}

        if (loadTimeout != null) handler.removeCallbacks(loadTimeout);
        loadTimeout = () -> {
            if (!pageLoaded) showError("Panel load timeout.\nCheck internet or panel URL in RebelConfig.");
        };
        handler.postDelayed(loadTimeout, 20000);

        Map<String, String> headers = new HashMap<>();
        headers.put(RebelAttest.HEADER, RebelAttest.buildHeader(this));
        headers.put("X-Rebel-Device", RebelAttest.deviceIdHash(this));
        webView.loadUrl(url, headers);
    }

    private void enableHighRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            Display display = getDisplay();
            if (display == null) return;
            float bestHz = 60f;
            int bestMode = 0;
            for (Display.Mode mode : display.getSupportedModes()) {
                if (mode.getRefreshRate() > bestHz) {
                    bestHz = mode.getRefreshRate();
                    bestMode = mode.getModeId();
                }
            }
            if (bestMode != 0 && bestHz >= 90f) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.preferredDisplayModeId = bestMode;
                getWindow().setAttributes(lp);
            }
        } catch (Exception ignored) {}
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setLoadsImagesAutomatically(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            s.setOffscreenPreRaster(true);
        }
        s.setUserAgentString(s.getUserAgentString() + " " + RebelConfig.APP_USER_AGENT_TAG);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        }

        webView.setBackgroundColor(0xFF050508);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        secureClient = new SecureWebViewClient(this);
        webView.setWebViewClient(secureClient);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new RebelBridge(), "RebelAndroid");
    }

    void onPageReady() {
        pageLoaded = true;
        if (loadTimeout != null) handler.removeCallbacks(loadTimeout);
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        injectBridge();
    }

    void onLoadError(String message) {
        if (loadTimeout != null) handler.removeCallbacks(loadTimeout);
        showError(message);
    }

    private void showError(String message) {
        webView.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
        errorText.setText(message);
    }

    void onBlockedNavigation(String url) {
        Toast.makeText(this, "Blocked URL", Toast.LENGTH_SHORT).show();
    }

    private void injectBridge() {
        webView.evaluateJavascript(
            "(function(){if(window.__rebelApk)return;window.__rebelApk=true;"
                + "document.documentElement.style.background='#050508';"
                + "document.body.style.background='#050508';"
                + "var f=window.fetch;window.fetch=function(u,o){o=o||{};o.headers=o.headers||{};"
                + "if(o.headers instanceof Headers){o.headers.set('X-Rebel-Attest',RebelAndroid.getAttest());o.headers.set('X-Rebel-Device',RebelAndroid.getDevice());}"
                + "else{o.headers['X-Rebel-Attest']=RebelAndroid.getAttest();o.headers['X-Rebel-Device']=RebelAndroid.getDevice();}"
                + "return f(u,o);};})();", null);
    }

    private void showFatal(String reason) {
        new AlertDialog.Builder(this)
            .setTitle("Rebel Panel")
            .setMessage("Security: " + reason)
            .setCancelable(false)
            .setPositiveButton("Exit", (d, w) -> finish())
            .show();
    }

    @Override
    public void onBackPressed() {
        if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            String url = webView.getUrl();
            if (url != null && url.toLowerCase(Locale.US).contains("phone.php")) {
                new AlertDialog.Builder(this)
                    .setTitle("Exit Rebel Panel?")
                    .setPositiveButton("Yes", (d, w) -> finish())
                    .setNegativeButton("No", null)
                    .show();
            } else {
                webView.goBack();
            }
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (loadTimeout != null) handler.removeCallbacks(loadTimeout);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    public class RebelBridge {
        @JavascriptInterface
        public String getAttest() {
            return RebelAttest.buildHeader(MainActivity.this);
        }
        @JavascriptInterface
        public String getDevice() {
            return RebelAttest.deviceIdHash(MainActivity.this);
        }
        @JavascriptInterface
        public int getApkVersion() {
            return RebelConfig.APK_VERSION_CODE;
        }
    }
}
