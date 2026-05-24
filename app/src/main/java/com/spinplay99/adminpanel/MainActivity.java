package com.spinplay.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    // ==================== CONSTANTS ====================
    private static final String TARGET_URL = "https://spinplay99.com";
    private static final String PREFS_NAME = "SpinPlayPrefs";
    private static final String KEY_LAST_URL = "last_url";
    private static final String KEY_VISIT_COUNT = "visit_count";
    private static final String KEY_FIRST_LAUNCH = "first_launch";
    private static final int SPLASH_DURATION = 2000;
    private static final int CONNECTION_TIMEOUT = 30000;
    private static final int BACK_PRESS_DELAY = 2000;
    private static final String APP_VERSION = "1.0.0";
    private static final String APP_NAME = "SpinPlay";
    private static final int MAX_HISTORY = 50;
    private static final String DEFAULT_USER_AGENT = "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36";

    // ==================== VIEWS ====================
    private WebView webView;
    private ProgressBar progressBar;
    private RelativeLayout mainLayout;
    private RelativeLayout splashLayout;
    private LinearLayout errorLayout;
    private TextView errorTextView;
    private TextView loadingTextView;
    private TextView versionTextView;
    private FrameLayout fullscreenContainer;

    // ==================== STATE ====================
    private boolean isLoading = false;
    private boolean isError = false;
    private boolean isSplashShown = false;
    private boolean isBackPressedOnce = false;
    private boolean isFullscreen = false;
    private boolean isNetworkAvailable = false;
    private boolean isPaused = false;
    private boolean isFirstLaunch = false;
    private int visitCount = 0;
    private int loadProgress = 0;
    private long backPressedTime = 0;
    private long sessionStartTime = 0;
    private String currentUrl = "";
    private String lastUrl = "";

    // ==================== HANDLERS ====================
    private Handler mainHandler;
    private Handler splashHandler;
    private Handler networkHandler;
    private Handler progressHandler;
    private Runnable splashRunnable;
    private Runnable networkRunnable;
    private Runnable progressRunnable;
    private SharedPreferences prefs;

    // ==================== LIFECYCLE ====================

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initWindow();
        initHandlers();
        initPreferences();
        initViews();
        initWebView();
        initSplash();
        trackSession();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        isPaused = false;
        checkNetwork();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        isPaused = true;
        saveState();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        cleanupHandlers();
        cleanupWebView();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) {
            webView.restoreState(savedInstanceState);
        }
    }

    // ==================== INIT ====================

    private void initWindow() {
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );
    }

    private void initHandlers() {
        mainHandler = new Handler(Looper.getMainLooper());
        splashHandler = new Handler(Looper.getMainLooper());
        networkHandler = new Handler(Looper.getMainLooper());
        progressHandler = new Handler(Looper.getMainLooper());
    }

    private void initPreferences() {
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        isFirstLaunch = prefs.getBoolean(KEY_FIRST_LAUNCH, true);
        visitCount = prefs.getInt(KEY_VISIT_COUNT, 0);
        lastUrl = prefs.getString(KEY_LAST_URL, TARGET_URL);
    }

    private void initViews() {
        mainLayout = new RelativeLayout(this);
        mainLayout.setBackgroundColor(Color.BLACK);
        mainLayout.setLayoutParams(new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        ));

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        RelativeLayout.LayoutParams fcParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        mainLayout.addView(fullscreenContainer, fcParams);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#FF6600")));
        RelativeLayout.LayoutParams pbParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT, 8
        );
        pbParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        mainLayout.addView(progressBar, pbParams);

        errorLayout = new LinearLayout(this);
        errorLayout.setOrientation(LinearLayout.VERTICAL);
        errorLayout.setBackgroundColor(Color.BLACK);
        errorLayout.setGravity(android.view.Gravity.CENTER);
        errorLayout.setVisibility(View.GONE);
        RelativeLayout.LayoutParams elParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        mainLayout.addView(errorLayout, elParams);

        errorTextView = new TextView(this);
        errorTextView.setText("Connection Error\nPlease check your internet connection");
        errorTextView.setTextColor(Color.WHITE);
        errorTextView.setTextSize(16);
        errorTextView.setGravity(android.view.Gravity.CENTER);
        errorTextView.setPadding(40, 20, 40, 20);
        errorLayout.addView(errorTextView);

        android.widget.Button retryButton = new android.widget.Button(this);
        retryButton.setText("Retry");
        retryButton.setBackgroundColor(Color.parseColor("#FF6600"));
        retryButton.setTextColor(Color.WHITE);
        retryButton.setPadding(60, 20, 60, 20);
        retryButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retryLoad();
            }
        });
        errorLayout.addView(retryButton);

        splashLayout = new RelativeLayout(this);
        splashLayout.setBackgroundColor(Color.BLACK);
        splashLayout.setVisibility(View.VISIBLE);
        RelativeLayout.LayoutParams slParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        mainLayout.addView(splashLayout, slParams);

        loadingTextView = new TextView(this);
        loadingTextView.setText(APP_NAME);
        loadingTextView.setTextColor(Color.WHITE);
        loadingTextView.setTextSize(32);
        loadingTextView.setGravity(android.view.Gravity.CENTER);
        RelativeLayout.LayoutParams ltParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.WRAP_CONTENT,
            RelativeLayout.LayoutParams.WRAP_CONTENT
        );
        ltParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        splashLayout.addView(loadingTextView, ltParams);

        versionTextView = new TextView(this);
        versionTextView.setText("v" + APP_VERSION);
        versionTextView.setTextColor(Color.GRAY);
        versionTextView.setTextSize(12);
        versionTextView.setGravity(android.view.Gravity.CENTER);
        RelativeLayout.LayoutParams vtParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.WRAP_CONTENT,
            RelativeLayout.LayoutParams.WRAP_CONTENT
        );
        vtParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
        vtParams.addRule(RelativeLayout.CENTER_HORIZONTAL);
        vtParams.setMargins(0, 0, 0, 60);
        splashLayout.addView(versionTextView, vtParams);

        setContentView(mainLayout);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void initWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setScrollBarStyle(View.SCROLLBARS_OUTSIDE_OVERLAY);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        RelativeLayout.LayoutParams wvParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        mainLayout.addView(webView, 0, wvParams);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(true);
        settings.setTextZoom(100);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setUserAgentString(DEFAULT_USER_AGENT);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        setupWebViewClient();
        setupWebChromeClient();
        setupDownloadListener();
    }

    // ==================== WEBVIEW CLIENTS ====================

    private void setupWebViewClient() {
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                isLoading = true;
                isError = false;
                currentUrl = url;
                showProgress();
                updateProgressBar(10);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isLoading = false;
                currentUrl = url;
                lastUrl = url;
                hideProgress();
                updateProgressBar(100);
                saveLastUrl(url);
                CookieManager.getInstance().flush();
                mainHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        progressBar.setVisibility(View.GONE);
                    }
                }, 500);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    isError = true;
                    isLoading = false;
                    showError("Failed to load page");
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                if (url.startsWith("tel:") || url.startsWith("mailto:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    return true;
                }
                return false;
            }
        });
    }

    private void setupWebChromeClient() {
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
                loadProgress = newProgress;
                updateProgressBar(newProgress);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                super.onReceivedTitle(view, title);
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    request.grant(request.getResources());
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                isFullscreen = true;
                fullscreenContainer.setVisibility(View.VISIBLE);
                fullscreenContainer.addView(view);
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                isFullscreen = false;
                fullscreenContainer.setVisibility(View.GONE);
                fullscreenContainer.removeAllViews();
                webView.setVisibility(View.VISIBLE);
            }

            @Override
            public void onExceededDatabaseQuota(String url, String databaseIdentifier, long quota, long estimatedDatabaseSize, long totalQuota, WebStorage.QuotaUpdater quotaUpdater) {
                quotaUpdater.updateQuota(estimatedDatabaseSize * 2);
            }
        });
    }

    private void setupDownloadListener() {
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Cannot download file", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // ==================== SPLASH ====================

    private void initSplash() {
        splashLayout.setVisibility(View.VISIBLE);
        animateSplashText();
        splashRunnable = new Runnable() {
            @Override
            public void run() {
                hideSplash();
                loadWebsite();
            }
        };
        splashHandler.postDelayed(splashRunnable, SPLASH_DURATION);
    }

    private void animateSplashText() {
        AlphaAnimation fadeIn = new AlphaAnimation(0.0f, 1.0f);
        fadeIn.setDuration(1000);
        fadeIn.setFillAfter(true);
        loadingTextView.startAnimation(fadeIn);
        versionTextView.startAnimation(fadeIn);
    }

    private void hideSplash() {
        AlphaAnimation fadeOut = new AlphaAnimation(1.0f, 0.0f);
        fadeOut.setDuration(500);
        fadeOut.setFillAfter(true);
        fadeOut.setAnimationListener(new Animation.AnimationListener() {
            @Override public void onAnimationStart(Animation animation) {}
            @Override public void onAnimationRepeat(Animation animation) {}
            @Override
            public void onAnimationEnd(Animation animation) {
                splashLayout.setVisibility(View.GONE);
                isSplashShown = true;
            }
        });
        splashLayout.startAnimation(fadeOut);
    }

    // ==================== NETWORK ====================

    private void checkNetwork() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            isNetworkAvailable = activeNetwork != null && activeNetwork.isConnectedOrConnecting();
        }
    }

    private boolean isConnected() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnected();
        }
        return false;
    }

    // ==================== LOADING ====================

    private void loadWebsite() {
        if (isConnected()) {
            webView.loadUrl(TARGET_URL);
        } else {
            showError("No internet connection");
        }
    }

    private void retryLoad() {
        hideError();
        checkNetwork();
        if (isConnected()) {
            webView.loadUrl(TARGET_URL);
        } else {
            showError("Still no internet connection");
        }
    }

    private void showProgress() {
        progressBar.setVisibility(View.VISIBLE);
        progressBar.setProgress(0);
    }

    private void hideProgress() {
        progressHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                progressBar.setProgress(100);
            }
        }, 200);
    }

    private void updateProgressBar(final int progress) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                progressBar.setProgress(progress);
                if (progress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    private void showError(String message) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                errorTextView.setText(message);
                errorLayout.setVisibility(View.VISIBLE);
                progressBar.setVisibility(View.GONE);
            }
        });
    }

    private void hideError() {
        errorLayout.setVisibility(View.GONE);
    }

    // ==================== STATE ====================

    private void saveState() {
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_LAST_URL, lastUrl);
        editor.putInt(KEY_VISIT_COUNT, visitCount);
        editor.putBoolean(KEY_FIRST_LAUNCH, false);
        editor.apply();
    }

    private void saveLastUrl(String url) {
        lastUrl = url;
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_LAST_URL, url);
        editor.apply();
    }

    private void trackSession() {
        sessionStartTime = System.currentTimeMillis();
        visitCount++;
        SharedPreferences.Editor editor = prefs.edit();
        editor.putInt(KEY_VISIT_COUNT, visitCount);
        editor.apply();
    }

    // ==================== CLEANUP ====================

    private void cleanupHandlers() {
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
        if (splashHandler != null) splashHandler.removeCallbacksAndMessages(null);
        if (networkHandler != null) networkHandler.removeCallbacksAndMessages(null);
        if (progressHandler != null) progressHandler.removeCallbacksAndMessages(null);
    }

    private void cleanupWebView() {
        if (webView != null) {
            webView.clearHistory();
            webView.clearCache(true);
            webView.loadUrl("about:blank");
            webView.onPause();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
    }

    // ==================== BACK PRESS ====================

    @Override
    public void onBackPressed() {
        if (isFullscreen) {
            webView.getSettings().setJavaScriptEnabled(true);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (isBackPressedOnce) {
            super.onBackPressed();
            return;
        }
        isBackPressedOnce = true;
        Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                isBackPressedOnce = false;
            }
        }, BACK_PRESS_DELAY);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            onBackPressed();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
