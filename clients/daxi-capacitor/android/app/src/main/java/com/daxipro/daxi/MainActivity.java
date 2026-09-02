package com.daxipro.daxi;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "DAXI_BOOT";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long t0;
    private volatile boolean deviceOnline = false;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        t0 = SystemClock.elapsedRealtime();
        Log.i(TAG, "T0 android-start");
        super.onCreate(savedInstanceState);
        Log.i(TAG, "T1 capacitor-super " + ms() + "ms");
        applySystemBars();
        installWebClient();
        watchNetwork();
        mainHandler.postDelayed(() -> loadDeepLink(getIntent()), 250);
    }

    private long ms() {
        return SystemClock.elapsedRealtime() - t0;
    }

    @Override
    public void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadDeepLink(intent);
    }

    private void loadDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) {
            return;
        }
        Uri data = intent.getData();
        if (data == null) {
            return;
        }
        String url = toSiteUrl(data);
        if (url == null) {
            return;
        }
        Uri parsed = Uri.parse(url);
        String path = parsed.getPath() == null ? "/" : parsed.getPath();
        if ("/".equals(path) || path.isEmpty()) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        if (!isDeviceOnline() || !DaxiAssetShell.isPassthroughPath(path)) {
            notifyJsDeepLink(webView, url);
            return;
        }
        webView.post(() -> webView.loadUrl(url));
    }

    private String toSiteUrl(Uri data) {
        String scheme = data.getScheme() == null ? "" : data.getScheme().toLowerCase();
        if ("daxi".equals(scheme)) {
            String host = data.getHost() == null ? "" : data.getHost();
            String path = data.getPath() == null ? "" : data.getPath();
            String query = data.getQuery() == null ? "" : ("?" + data.getQuery());
            String hash = data.getFragment() == null ? "" : ("#" + data.getFragment());
            String rest = host + path;
            if (!rest.startsWith("/")) {
                rest = "/" + rest;
            }
            return "https://daxipro.com" + rest + query + hash;
        }
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            return null;
        }
        String host = data.getHost() == null ? "" : data.getHost().toLowerCase();
        if (!"daxipro.com".equals(host) && !"www.daxipro.com".equals(host)) {
            return null;
        }
        return data.toString();
    }

    private void installWebClient() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.post(() -> {
            Log.i(TAG, "T2 webview-ready " + ms() + "ms");
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            applyCacheMode(webView, isDeviceOnline());
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request == null) {
                        return super.shouldInterceptRequest(view, request);
                    }
                    Uri uri = request.getUrl();
                    if (DaxiAssetShell.isCapacitorInternal(uri)) {
                        return super.shouldInterceptRequest(view, request);
                    }
                    String path = uri == null || uri.getPath() == null ? "" : uri.getPath();
                    if (DaxiAssetShell.isDaxiHost(uri) && DaxiAssetShell.isPassthroughPath(path)) {
                        if (!isDeviceOnline()) {
                            return DaxiAssetShell.unavailable("offline");
                        }
                        return null;
                    }
                    if (DaxiAssetShell.isDaxiHost(uri)) {
                        WebResourceResponse local = DaxiAssetShell.serve(getApplicationContext(), request);
                        if (local != null) {
                            return local;
                        }
                        if (DaxiAssetShell.isRemoteFallbackPath(path)) {
                            if (!isDeviceOnline()) {
                                return DaxiAssetShell.unavailable("offline");
                            }
                            return null;
                        }
                    }
                    WebResourceResponse cap = super.shouldInterceptRequest(view, request);
                    if (cap != null) {
                        return cap;
                    }
                    return DaxiAssetShell.serve(getApplicationContext(), request);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    Log.i(TAG, "T3 html-loaded " + ms() + "ms url=" + url);
                    if (!isDeviceOnline()) {
                        notifyJsOffline(view);
                    }
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && request.isForMainFrame() && !isDeviceOnline()) {
                        Uri uri = request.getUrl();
                        if (DaxiAssetShell.isDaxiHost(uri) && DaxiAssetShell.isPassthroughPath(uri.getPath())) {
                            notifyJsOffline(view);
                            return true;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request == null || !request.isForMainFrame() || view == null) {
                        super.onReceivedError(view, request, error);
                        return;
                    }
                    if (!isDeviceOnline() || isNetworkError(error)) {
                        notifyJsOffline(view);
                        return;
                    }
                    super.onReceivedError(view, request, error);
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    if (view != null && !isDeviceOnline()) {
                        notifyJsOffline(view);
                        return;
                    }
                    super.onReceivedError(view, errorCode, description, failingUrl);
                }
            });
        });
    }

    private boolean isNetworkError(WebResourceError error) {
        if (error == null) {
            return !isDeviceOnline();
        }
        int code = error.getErrorCode();
        return code == android.webkit.WebViewClient.ERROR_HOST_LOOKUP
            || code == android.webkit.WebViewClient.ERROR_CONNECT
            || code == android.webkit.WebViewClient.ERROR_TIMEOUT
            || code == android.webkit.WebViewClient.ERROR_IO
            || code == android.webkit.WebViewClient.ERROR_FAILED_SSL_HANDSHAKE
            || code == android.webkit.WebViewClient.ERROR_UNKNOWN;
    }

    private void notifyJsDeepLink(WebView view, String url) {
        String safe = url.replace("\\", "\\\\").replace("'", "\\'");
        view.evaluateJavascript(
            "(function(){try{if(window.DaxiDeepLink&&DaxiDeepLink.handle)DaxiDeepLink.handle('" + safe + "');}catch(e){}})();",
            null
        );
    }

    private void notifyJsOffline(WebView view) {
        if (view == null) {
            return;
        }
        view.evaluateJavascript(
            "(function(){"
                + "window._daxiNativeOnline=false;"
                + "try{window.dispatchEvent(new Event('offline'));}catch(e){}"
                + "if(window.DaxiOffline){"
                + "if(DaxiOffline.applyCachedUi)DaxiOffline.applyCachedUi('active');"
                + "if(DaxiOffline.ensureOfflineMap)DaxiOffline.ensureOfflineMap();"
                + "}"
                + "})();",
            null
        );
    }

    private void applyCacheMode(WebView view, boolean online) {
        if (view == null) {
            return;
        }
        view.getSettings().setCacheMode(
            online ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK
        );
    }

    private void watchNetwork() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            return;
        }
        deviceOnline = isDeviceOnline();
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                mainHandler.post(() -> onConnectivityChanged(true));
            }

            @Override
            public void onLost(Network network) {
                mainHandler.post(() -> onConnectivityChanged(isDeviceOnline()));
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                boolean online = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                mainHandler.post(() -> onConnectivityChanged(online));
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            } else {
                connectivityManager.registerNetworkCallback(new NetworkRequest.Builder().build(), networkCallback);
            }
        } catch (Exception ignored) {}
    }

    private void onConnectivityChanged(boolean online) {
        if (deviceOnline == online) {
            return;
        }
        deviceOnline = online;
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        applyCacheMode(webView, online);
        if (!online) {
            notifyJsOffline(webView);
        } else {
            webView.evaluateJavascript(
                "(function(){window._daxiNativeOnline=true;try{window.dispatchEvent(new Event('online'));}catch(e){}})();",
                null
            );
        }
    }

    private boolean isDeviceOnline() {
        ConnectivityManager cm = connectivityManager;
        if (cm == null) {
            cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        }
        if (cm == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= 23) {
            Network network = cm.getActiveNetwork();
            if (network == null) {
                return false;
            }
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null) {
                return false;
            }
            return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        android.net.NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBars();
        if (getBridge() != null && getBridge().getWebView() != null) {
            applyCacheMode(getBridge().getWebView(), isDeviceOnline());
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBars();
    }

    private void applySystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        int night = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean dark = night == Configuration.UI_MODE_NIGHT_YES;
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
        if (c != null) {
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
        }
        int color = getResources().getColor(R.color.daxi_nav_bar, getTheme());
        getWindow().setNavigationBarColor(color);
        getWindow().setStatusBarColor(getResources().getColor(R.color.daxi_status_bar, getTheme()));
    }
}
