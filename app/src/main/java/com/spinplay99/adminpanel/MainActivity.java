package com.spinplay99.adminpanel;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
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

import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean isReady = false;
    private String panelUrl;
    private String panelHost;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        panelUrl = getString(R.string.panel_url).trim();
        panelHost = Uri.parse(panelUrl).getHost();

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress_bar);
        swipeRefresh = findViewById(R.id.swipe_refresh);

        setupWebView();
        setupSwipeRefresh();
        webView.loadUrl(panelUrl);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new RebelAndroidBridge(), "RebelAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!isReady) progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
                isReady = true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (shouldStayInWebView(url)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    view.loadUrl(url);
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (!isReady) {
                    progressBar.setProgress(newProgress);
                    if (newProgress > 85) progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), 1001);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private boolean shouldStayInWebView(String url) {
        if (url == null || url.isEmpty()) return true;
        if (url.startsWith("javascript:") || url.startsWith("about:")) return true;
        if (url.contains(panelHost)) return true;
        if (url.contains("firebaseio.com") || url.contains("firebasedatabase.app")) return true;
        if (url.contains("googleapis.com") || url.contains("gstatic.com")) return true;
        if (url.contains("githubusercontent.com")) return true;
        if (url.contains("spinplay99.com")) return true;
        return url.endsWith(".php") || url.contains("/mobile.php") || url.contains("/admin.php");
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(0xFFFF3C3C, 0xFFFF9500, 0xFF00FF9D);
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Exit Rebel Panel?")
            .setMessage("Close the app?")
            .setPositiveButton("Yes", (dialog, which) -> finish())
            .setNegativeButton("No", null)
            .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && filePathCallback != null) {
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
        super.onDestroy();
    }

    public class RebelAndroidBridge {
        @JavascriptInterface
        public String getAttest() {
            return "rebel-panel-mobile-2.0";
        }

        @JavascriptInterface
        public String getDevice() {
            try {
                return Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            } catch (Exception e) {
                return "android";
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }
}
