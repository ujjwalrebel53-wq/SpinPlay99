package com.rebel.panel;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.rebel.panel.security.SessionManager;

/**
 * Hidden WebView that loads the panel and fetches Firebase data during login boot animation.
 */
public final class PanelPreloader {

    private static WebView preloadView;

    private PanelPreloader() {}

    @SuppressLint("SetJavaScriptEnabled")
    public static void start(Activity activity) {
        if (preloadView != null || !SessionManager.hasValidLocalSession(activity)) return;
        FrameLayout root = activity.findViewById(R.id.login_root);
        if (root == null) return;

        preloadView = new WebView(activity);
        preloadView.setVisibility(View.GONE);
        preloadView.setLayoutParams(new FrameLayout.LayoutParams(1, 1));
        preloadView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings s = preloadView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        }
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        preloadView.setBackgroundColor(0xFF050508);
        preloadView.setWebViewClient(new WebViewClient());
        preloadView.setWebChromeClient(new WebChromeClient());
        preloadView.addJavascriptInterface(new PreloadBridge(activity), "RebelAndroid");
        root.addView(preloadView);
        preloadView.loadUrl(RebelPanelPaths.panelIndexUrl(activity) + "?preload=1");
    }

    public static void destroy() {
        if (preloadView == null) return;
        ViewGroup parent = (ViewGroup) preloadView.getParent();
        if (parent != null) parent.removeView(preloadView);
        preloadView.destroy();
        preloadView = null;
    }

    private static final class PreloadBridge {
        private final Activity activity;

        PreloadBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean isPreload() {
            return true;
        }

        @JavascriptInterface
        public boolean splashAlreadyShown() {
            return true;
        }

        @JavascriptInterface
        public String checkSession() {
            return RebelAuth.checkSession(activity);
        }

        @JavascriptInterface
        public String getAutoTokenConfig() {
            return RebelAuth.getAutoTokenConfig(activity);
        }

        @JavascriptInterface
        public String saveAutoTokenConfig(String json) {
            return RebelAuth.saveAutoTokenConfig(activity, json);
        }

        @JavascriptInterface
        public String panelApi(String json) {
            return RebelAuth.panelApi(activity, json);
        }

        @JavascriptInterface
        public String getAccessKey() {
            return com.rebel.panel.security.SecurityPrefs.getAccessKey(activity);
        }
    }
}
