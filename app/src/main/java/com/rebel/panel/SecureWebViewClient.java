package com.rebel.panel;

import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Blocks login bypass via local file / random URLs — only panel + Firebase allowed.
 */
public class SecureWebViewClient extends WebViewClient {

    private final MainActivity activity;
    private final Set<String> allowedHosts = new HashSet<>(Arrays.asList(
        "spinplay99.com", "firebaseio.com", "firebasedatabase.app",
        "googleapis.com", "gstatic.com", "firebaseapp.com", "google.com"
    ));

    public SecureWebViewClient(MainActivity activity) {
        this.activity = activity;
    }

    public void addAllowedHost(String host) {
        if (host != null && !host.isEmpty()) {
            allowedHosts.add(host.toLowerCase(Locale.US));
        }
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        activity.onPageLoadStart();
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        activity.onPageLoadDone(url);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!isAllowed(uri)) {
            activity.onBlockedNavigation(uri.toString());
            return true;
        }
        return false;
    }

    boolean isAllowed(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        if ("about".equals(scheme) || "data".equals(scheme)) return true;
        if (!"https".equals(scheme) && !"http".equals(scheme)) return false;
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.US);
        if (allowedHosts.contains(host)) return true;
        for (String h : allowedHosts) {
            if (host.endsWith("." + h)) return true;
        }
        String panel = RebelConfig.getPanelUrl(activity);
        try {
            String panelHost = Uri.parse(panel).getHost();
            if (panelHost != null && host.equals(panelHost.toLowerCase(Locale.US))) return true;
        } catch (Exception ignored) {}
        return false;
    }
}
