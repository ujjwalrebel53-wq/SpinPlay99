package com.rebel.panel;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private FrameLayout splash;
    private SecureWebViewClient secureClient;
    private String panelUrl = RebelConfig.DEFAULT_PANEL_URL;
    private boolean securityOk = false;
    private boolean firstPaintDone = false;
    private String loadedUrl = "";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF050508);
            getWindow().setNavigationBarColor(0xFF050508);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        enableHighRefreshRate();

        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        splash = findViewById(R.id.splash);

        try {
            RebelGuard.enforce(this);
            securityOk = true;
        } catch (RebelGuard.Blocked e) {
            showFatal(e.getMessage());
            return;
        }

        setupWebView();

        panelUrl = RebelConfig.getPanelUrl(this);
        try {
            String host = android.net.Uri.parse(panelUrl).getHost();
            if (host != null) secureClient.addAllowedHost(host);
        } catch (Exception ignored) {}

        loadPanel(panelUrl, 0);
        RebelUpdateManager.check(this, updateCallback());
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
                lp.preferredRefreshRate = bestHz;
                getWindow().setAttributes(lp);
            }
        } catch (Exception ignored) {}
    }

    private RebelUpdateManager.Callback updateCallback() {
        return new RebelUpdateManager.Callback() {
            @Override
            public void onPanelUrl(String url, int panelVersion) {
                if (url == null || url.isEmpty()) return;
                if (url.equals(panelUrl) && firstPaintDone) return;
                panelUrl = url;
                try {
                    String host = android.net.Uri.parse(url).getHost();
                    if (host != null) secureClient.addAllowedHost(host);
                } catch (Exception ignored) {}
                if (!firstPaintDone) return;
                loadPanel(url, panelVersion);
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
            public void onError(String msg) {
                /* keep current panel — no reload flash */
            }
        };
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
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            s.setOffscreenPreRaster(true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(true);
        }
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " " + RebelConfig.APP_USER_AGENT_TAG);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        webView.setBackgroundColor(0xFF050508);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        secureClient = new SecureWebViewClient(this);
        webView.setWebViewClient(secureClient);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new RebelBridge(), "RebelAndroid");
    }

    private void loadPanel(String url, int panelVersion) {
        if (!securityOk || url == null || url.isEmpty()) return;
        String bust = panelVersion > 0 ? ("?v=" + panelVersion) : ("?t=" + (System.currentTimeMillis() / 60000L));
        String full = url.contains("?") ? (url + "&_rv=" + panelVersion) : (url + bust);
        if (full.equals(loadedUrl)) return;
        loadedUrl = full;
        Map<String, String> headers = new HashMap<>();
        headers.put(RebelAttest.HEADER, RebelAttest.buildHeader(this));
        headers.put("X-Rebel-Device", RebelAttest.deviceIdHash(this));
        webView.loadUrl(full, headers);
    }

    void onPageVisible() {
        if (firstPaintDone) return;
        firstPaintDone = true;
        hideSplash();
        injectSecureBridge();
    }

    void onPageLoadDone(String url) {
        if (!firstPaintDone) {
            firstPaintDone = true;
            hideSplash();
        }
        injectSecureBridge();
    }

    private void hideSplash() {
        if (splash == null || splash.getVisibility() != View.VISIBLE) return;
        splash.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            splash.setVisibility(View.GONE);
            splash.setAlpha(1f);
        }).start();
    }

    void onBlockedNavigation(String url) {
        Toast.makeText(this, "Blocked unsafe URL", Toast.LENGTH_SHORT).show();
    }

    private void injectSecureBridge() {
        String js = "(function(){"
            + "if(window.__rebelApk)return;"
            + "window.__rebelApk=true;"
            + "document.documentElement.style.background='#050508';"
            + "document.body.style.background='#050508';"
            + "var _f=window.fetch;"
            + "window.fetch=function(u,o){"
            + "o=o||{};o.headers=o.headers||{};"
            + "if(o.headers instanceof Headers){o.headers.set('X-Rebel-Attest',RebelAndroid.getAttest());o.headers.set('X-Rebel-Device',RebelAndroid.getDevice());}"
            + "else{o.headers['X-Rebel-Attest']=RebelAndroid.getAttest();o.headers['X-Rebel-Device']=RebelAndroid.getDevice();}"
            + "return _f(u,o);};"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    private void showFatal(String reason) {
        new AlertDialog.Builder(this)
            .setTitle("Rebel Panel")
            .setMessage("Security check failed: " + reason)
            .setCancelable(false)
            .setPositiveButton("Exit", (d, w) -> finish())
            .show();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
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
