package com.rebel.panel;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private SecureWebViewClient secureClient;
    private String panelUrl = RebelConfig.DEFAULT_PANEL_URL;
    private boolean securityOk = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#050508"));
        swipeRefresh = new SwipeRefreshLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        FrameLayout.LayoutParams pb = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 8);
        pb.topMargin = 0;
        swipeRefresh.addView(webView, lp);
        root.addView(swipeRefresh, lp);
        root.addView(progressBar, pb);
        setContentView(root);

        try {
            RebelGuard.enforce(this);
            securityOk = true;
        } catch (RebelGuard.Blocked e) {
            showFatal(e.getMessage());
            return;
        }

        setupWebView();
        swipeRefresh.setColorSchemeColors(0xFFFF3C3C, 0xFFFF9500);
        swipeRefresh.setOnRefreshListener(() -> RebelUpdateManager.check(this, updateCallback()));

        RebelUpdateManager.check(this, updateCallback());
    }

    private RebelUpdateManager.Callback updateCallback() {
        return new RebelUpdateManager.Callback() {
            @Override
            public void onPanelUrl(String url, int panelVersion) {
                panelUrl = url;
                try {
                    String host = android.net.Uri.parse(url).getHost();
                    if (host != null) secureClient.addAllowedHost(host);
                } catch (Exception ignored) {}
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
                loadPanel(RebelConfig.getPanelUrl(MainActivity.this), 0);
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(true);
        }
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " " + RebelConfig.APP_USER_AGENT_TAG);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        secureClient = new SecureWebViewClient(this);
        webView.setWebViewClient(secureClient);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }
        });
        webView.addJavascriptInterface(new RebelBridge(), "RebelAndroid");
    }

    private void loadPanel(String url, int panelVersion) {
        if (!securityOk) return;
        String bust = panelVersion > 0 ? ("?v=" + panelVersion) : ("?t=" + (System.currentTimeMillis() / 60000L));
        String full = url.contains("?") ? (url + "&_rv=" + panelVersion) : (url + bust);
        Map<String, String> headers = new HashMap<>();
        headers.put(RebelAttest.HEADER, RebelAttest.buildHeader(this));
        headers.put("X-Rebel-Device", RebelAttest.deviceIdHash(this));
        webView.loadUrl(full, headers);
    }

    void onPageLoadStart() {
        progressBar.setVisibility(View.VISIBLE);
    }

    void onPageLoadDone(String url) {
        progressBar.setVisibility(View.GONE);
        swipeRefresh.setRefreshing(false);
        injectSecureBridge();
    }

    void onBlockedNavigation(String url) {
        Toast.makeText(this, "Blocked unsafe URL", Toast.LENGTH_SHORT).show();
    }

    private void injectSecureBridge() {
        String js = "(function(){"
            + "if(window.__rebelApk)return;"
            + "window.__rebelApk=true;"
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
