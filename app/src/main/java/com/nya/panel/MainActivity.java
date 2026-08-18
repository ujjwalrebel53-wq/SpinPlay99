package com.nya.panel;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isReady = false;
    private boolean panelLoaded = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFFadcf9f);
            getWindow().setNavigationBarColor(0xFF546b4d);
        }

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress_bar);
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle("");
            getSupportActionBar().setDisplayShowTitleEnabled(false);
        }

        setupWebView();
        RebelPanelPaths.clearStaleOtaIfNeeded(this);
        runOtaCheck(false);
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
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            settings.setAllowUniversalAccessFromFileURLs(true);
        }
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
                if (!isReady) {
                    progressBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                isReady = true;
                injectBootConfig();
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
                    if (newProgress > 85) {
                        progressBar.setVisibility(View.GONE);
                    }
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, 1001);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void runJs(String fn) {
        if (webView == null) return;
        webView.evaluateJavascript("try{" + fn + "}catch(e){}", null);
    }

    private void injectBootConfig() {
        String server = RebelPanelPaths.panelServerUrl(this).replace("'", "\\'");
        String js = "(function(){window.REBEL_NATIVE_APP=true;window.NYA_APK=true;"
                + "document.body.classList.add('nya-apk-shell');"
                + "window.PANEL_SERVER_URL='" + server + "';"
                + "if(typeof nyaGetPanelServer==='function')nyaGetPanelServer();})();";
        webView.evaluateJavascript(js, null);
    }

    private void loadPanelFresh() {
        webView.clearCache(true);
        int ver = RebelPanelPaths.activePanelVersion(this);
        webView.loadUrl(RebelPanelPaths.panelIndexUrl(this) + "?pv=" + ver + "&_=" + System.currentTimeMillis());
        panelLoaded = true;
    }

    private void runOtaCheck(boolean force) {
        RebelOtaManager.checkAndUpdate(this, force, new RebelOtaManager.Callback() {
            @Override
            public void onUpdated(int newVersion, String message) {
                Toast.makeText(MainActivity.this, message + " (v" + newVersion + ")", Toast.LENGTH_SHORT).show();
                loadPanelFresh();
            }

            @Override
            public void onNoUpdate() {
                if (!panelLoaded) {
                    loadPanelFresh();
                } else if (force) {
                    int ver = RebelPanelPaths.activePanelVersion(MainActivity.this);
                    Toast.makeText(MainActivity.this, "Panel already latest (v" + ver + ")", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String msg) {
                if (!panelLoaded) {
                    loadPanelFresh();
                }
                if (msg != null && msg.startsWith("New APK required")) {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                } else if (force && msg != null) {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private boolean shouldStayInWebView(String url) {
        if (url == null || url.isEmpty()) {
            return true;
        }
        if (url.startsWith("file://")) {
            return true;
        }
        if (url.startsWith("javascript:") || url.startsWith("about:")) {
            return true;
        }
        if (url.contains("firebaseio.com") || url.contains("firebasedatabase.app")) {
            return true;
        }
        if (url.contains("googleapis.com") || url.contains("gstatic.com")) {
            return true;
        }
        String server = RebelPanelPaths.panelServerUrl(this);
        if (!server.isEmpty()) {
            try {
                String host = Uri.parse(server).getHost();
                if (host != null && url.contains(host)) {
                    return true;
                }
            } catch (Exception ignored) {
            }
        }
        return url.endsWith(".php") || url.contains("/nya.php");
    }

    private void promptPanelServer() {
        EditText input = new EditText(this);
        input.setHint("https://yourdomain.com/rebel-panel");
        input.setText(RebelPanelPaths.panelServerUrl(this));
        input.setSingleLine(true);
        new AlertDialog.Builder(this)
                .setTitle("Panel Server (nya.php)")
                .setMessage("Firebase sync aur OTA updates ke liye server URL.")
                .setView(input)
                .setPositiveButton("Save", (d, w) -> {
                    RebelPanelPaths.setPanelServerUrl(this, input.getText().toString().trim());
                    Toast.makeText(this, "Server saved", Toast.LENGTH_SHORT).show();
                    injectBootConfig();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "Panel Server");
        menu.add(0, 2, 0, "Firebase Projects");
        menu.add(0, 3, 0, "Auto Token");
        menu.add(0, 4, 0, "Check OTA Update");
        menu.add(0, 5, 0, "Reload Panel");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case 1:
                promptPanelServer();
                return true;
            case 2:
                runJs("openFbSheet()");
                return true;
            case 3:
                runJs("openAutoTokenSheet()");
                return true;
            case 4:
                runOtaCheck(true);
                return true;
            case 5:
                loadPanelFresh();
                return true;
            default:
                return super.onOptionsItemSelected(item);
        }
    }

    private void handlePanelBackPress() {
        if (webView == null) return;
        final boolean[] handled = {false};
        final Object lock = new Object();
        webView.evaluateJavascript(
                "(function(){return typeof nyaHandleBack==='function'&&nyaHandleBack();})();",
                value -> {
                    synchronized (lock) {
                        handled[0] = "true".equals(value);
                        lock.notifyAll();
                    }
                });
        synchronized (lock) {
            try {
                lock.wait(350);
            } catch (InterruptedException ignored) {
            }
        }
        if (handled[0]) return;
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Exit Nya Panel?")
                .setMessage("Close the app?")
                .setPositiveButton("Yes", (dialog, which) -> finish())
                .setNegativeButton("No", null)
                .show();
    }

    @Override
    public void onBackPressed() {
        handlePanelBackPress();
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
            return "nya-panel-native-" + BuildConfig.VERSION_NAME;
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
        public String getPanelServerUrl() {
            return RebelPanelPaths.panelServerUrl(MainActivity.this);
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
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
            mainHandler.post(() -> runOtaCheck(true));
        }

        @JavascriptInterface
        public String apiPost(String endpoint, String jsonBody) {
            try {
                JSONObject body = new JSONObject(jsonBody == null || jsonBody.isEmpty() ? "{}" : jsonBody);
                JSONObject result;
                if ("rebel_send_sms".equals(endpoint)) {
                    result = RebelPanelApi.sendSms(body);
                } else if ("rebel_fetch_sms".equals(endpoint)) {
                    result = RebelPanelApi.fetchSms(body);
                } else {
                    result = new JSONObject();
                    result.put("ok", false);
                    result.put("error", "Unknown endpoint: " + endpoint);
                }
                return result.toString();
            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("ok", false);
                    err.put("error", e.getMessage() == null ? "Native API failed" : e.getMessage());
                    return err.toString();
                } catch (Exception ignored) {
                    return "{\"ok\":false,\"error\":\"Native API failed\"}";
                }
            }
        }

        @JavascriptInterface
        public String syncFirebase(String jsonBody) {
            try {
                JSONObject body = new JSONObject(jsonBody == null || jsonBody.isEmpty() ? "{}" : jsonBody);
                if (!body.has("action")) {
                    body.put("action", "add");
                }
                JSONObject result = RebelPanelSync.syncFirebase(
                        RebelPanelPaths.panelServerUrl(MainActivity.this), body);
                return result.toString();
            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("ok", false);
                    err.put("error", e.getMessage() == null ? "Sync failed" : e.getMessage());
                    return err.toString();
                } catch (Exception ignored) {
                    return "{\"ok\":false,\"error\":\"Sync failed\"}";
                }
            }
        }

        @JavascriptInterface
        public String panelFetch(String jsonPayload) {
            try {
                JSONObject req = new JSONObject(jsonPayload == null || jsonPayload.isEmpty() ? "{}" : jsonPayload);
                String url = req.optString("url", "");
                String method = req.optString("method", "GET");
                String body = req.optString("body", "");
                JSONObject result = RebelPanelSync.panelFetch(url, method, body);
                return result.toString();
            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("ok", false);
                    err.put("error", e.getMessage() == null ? "Fetch failed" : e.getMessage());
                    return err.toString();
                } catch (Exception ignored) {
                    return "{\"ok\":false,\"error\":\"Fetch failed\"}";
                }
            }
        }
    }
}
