@SuppressLint("SetJavaScriptEnabled")
private void setupWebView() {
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setLoadWithOverviewMode(true);
    settings.setUseWideViewPort(true);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setSupportZoom(false);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
    settings.setDatabaseEnabled(true);
    settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setGeolocationEnabled(true);
    settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NARROW_COLUMNS);

    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    webView.addJavascriptInterface(new AndroidBridge(), "Android");

    webView.setWebViewClient(new WebViewClient() {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (!isReady) progressBar.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            progressBar.setVisibility(View.GONE);
            swipeRefresh.setRefreshing(false);
            isReady = true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (!url.contains("spinplay99.com")) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception e) { view.loadUrl(url); }
                return true;
            }
            return false;
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            super.onReceivedError(view, errorCode, description, failingUrl);
            progressBar.setVisibility(View.GONE);
            swipeRefresh.setRefreshing(false);
        }
    });

    webView.setWebChromeClient(new WebChromeClient() {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            if (!isReady) {
                progressBar.setProgress(newProgress);
                if (newProgress > 80) progressBar.setVisibility(View.GONE);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
            MainActivity.this.filePathCallback = filePathCallback;
            try { startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST); }
            catch (Exception e) { MainActivity.this.filePathCallback = null; return false; }
            return true;
        }
    });
}
