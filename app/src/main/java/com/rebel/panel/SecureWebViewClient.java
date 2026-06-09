package com.rebel.panel;

import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class SecureWebViewClient extends WebViewClient {

    private final MainActivity activity;
    private final Set<String> allowedHosts = new HashSet<>(Arrays.asList(
        "firebaseio.com", "firebasedatabase.app", "googleapis.com",
        "gstatic.com", "firebaseapp.com", "google.com", "githubusercontent.com"
    ));

    public SecureWebViewClient(MainActivity activity) {
        this.activity = activity;
        String host = hostOf(RebelConfig.getPanelUrl(activity));
        if (host != null) allowedHosts.add(host);
    }

    public void addAllowedHost(String host) {
        if (host != null && !host.isEmpty()) {
            allowedHosts.add(host.toLowerCase(Locale.US));
        }
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        view.setBackgroundColor(0xFF050508);
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            activity.onPageReady();
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        activity.onPageReady();
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request == null || !request.isForMainFrame()) return;
        String msg = "Cannot load panel";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null) {
            msg = error.getDescription() != null ? error.getDescription().toString() : msg;
        }
        activity.onLoadError(msg + "\n\nURL: " + RebelConfig.getPanelUrl(activity));
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        if (request != null && request.isForMainFrame() && errorResponse != null && errorResponse.getStatusCode() >= 400) {
            activity.onLoadError("Server error " + errorResponse.getStatusCode()
                + "\n\nURL: " + RebelConfig.getPanelUrl(activity));
        }
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

    private boolean isAllowed(Uri uri) {
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
        return false;
    }

    private static String hostOf(String url) {
        try {
            return Uri.parse(url).getHost();
        } catch (Exception e) {
            return null;
        }
    }
}
