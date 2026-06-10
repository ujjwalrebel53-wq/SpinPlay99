package com.rebel.panel;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.security.BruteForceGuard;
import com.rebel.panel.security.DeviceBanManager;
import com.rebel.panel.security.IntegrityChecker;
import com.rebel.panel.security.KeyValidator;
import com.rebel.panel.security.SessionManager;
import com.rebel.panel.security.TamperDetector;

import org.json.JSONObject;

/**
 * LAUNCHER — boot splash every open, then login or panel.
 */
public class LoginActivity extends AppCompatActivity {

    public static final String EXTRA_SPLASH_DONE = "splash_done";

    private static final long BOOT_SPLASH_MS = 2600L;

    private WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean routedAfterBoot;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (DeviceBanManager.isLocallyBanned(this) || IntegrityChecker.getCrackReason(this) != null) {
            if (!DeviceBanManager.gate(this)) return;
        }
        if (!DeviceBanManager.gate(this)) return;
        DeviceBanManager.gateAsync(this);

        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF050508);
            getWindow().setNavigationBarColor(0xFF050508);
        }

        setContentView(R.layout.activity_login);
        setupWebView();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        webView = findViewById(R.id.login_webview);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        }
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.setBackgroundColor(0xFF050508);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new LoginBridge(), "RebelLogin");
        webView.loadUrl("file:///android_asset/panel/login.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (DeviceBanManager.isLocallyBanned(this) || DeviceBanManager.isBanScreenShowing()) {
            DeviceBanManager.launchBanScreen(this);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void routeAfterBoot() {
        if (routedAfterBoot || isFinishing()) return;
        routedAfterBoot = true;
        if (SessionManager.hasValidLocalSession(this)) {
            openMain();
        }
    }

    private void openMain() {
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra(EXTRA_SPLASH_DONE, true);
        startActivity(i);
        finish();
    }

    private final class LoginBridge {

        @JavascriptInterface
        public void bootFinished() {
            handler.post(() -> {
                if (SessionManager.hasValidLocalSession(LoginActivity.this)) {
                    routeAfterBoot();
                } else {
                    routedAfterBoot = true;
                    if (webView != null) {
                        webView.evaluateJavascript("showLogin()", null);
                    }
                }
            });
        }

        @JavascriptInterface
        public String login(String key) {
            if (BruteForceGuard.isPermanentlyLocked(LoginActivity.this)) {
                return jsonFail("Device locked", true, "Contact admin");
            }
            if (BruteForceGuard.isLocked(LoginActivity.this) || TamperDetector.isLocked()) {
                long ms = Math.max(BruteForceGuard.lockRemainingMs(LoginActivity.this),
                        TamperDetector.lockRemainingMs());
                return jsonFail("Try again later", true, "Wait " + (ms / 1000) + "s");
            }
            if (!DeviceBanManager.gate(LoginActivity.this)) {
                return jsonFail("Device banned", true, "");
            }
            KeyValidator.Result r = KeyValidator.login(LoginActivity.this, key);
            if (r.ok) {
                try {
                    return new JSONObject()
                            .put("ok", true)
                            .put("token", r.accessJwt)
                            .put("expires", r.accessExp)
                            .toString();
                } catch (Exception e) {
                    return jsonFail("Login failed", false, "");
                }
            }
            return jsonFail(r.error != null ? r.error : "Invalid key", false, "");
        }

        @JavascriptInterface
        public void onSuccess() {
            runOnUiThread(LoginActivity.this::openMain);
        }

        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                if (webView == null) return;
                if (SessionManager.hasValidLocalSession(LoginActivity.this)) return;
                long ms = Math.max(BruteForceGuard.lockRemainingMs(LoginActivity.this),
                        TamperDetector.lockRemainingMs());
                if (ms > 0) {
                    webView.evaluateJavascript(
                            "document.getElementById('lockMsg').textContent='Try again in "
                                    + (ms / 1000) + "s';document.getElementById('lockMsg').style.display='block';",
                            null);
                }
            });
        }

        private String jsonFail(String err, boolean locked, String lockMsg) {
            try {
                return new JSONObject()
                        .put("ok", false)
                        .put("error", err)
                        .put("locked", locked)
                        .put("lockMsg", lockMsg)
                        .toString();
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"error\"}";
            }
        }
    }
}
