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
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://daxipro.com/";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int siteLoadAttempts = 0;
    private boolean consumedDeepLink = false;
    private String lastGoodUrl = SITE;
    private boolean deviceOnline = true;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        installWebClient();
        watchNetwork();
        mainHandler.postDelayed(() -> loadDeepLink(getIntent()), 250);
        watchBlankFirstLoad();
    }

    @Override
    protected void onDestroy() {
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
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        consumedDeepLink = true;
        lastGoodUrl = url;
        webView.post(() -> webView.loadUrl(url));
    }

    private void watchBlankFirstLoad() {
        mainHandler.postDelayed(() -> {
            if (consumedDeepLink || getBridge() == null) {
                return;
            }
            WebView webView = getBridge().getWebView();
            if (webView == null) {
                return;
            }
            String current = webView.getUrl();
            if (current == null || current.isEmpty() || "about:blank".equals(current)) {
                if (isDeviceOnline()) {
                    webView.loadUrl(SITE);
                }
            }
        }, 1600);
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
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            applyCacheMode(webView, isDeviceOnline());
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    if (url != null && url.startsWith("http") && url.contains("daxipro.com")) {
                        lastGoodUrl = url;
                        siteLoadAttempts = 0;
                    }
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && request.isForMainFrame() && !isDeviceOnline()) {
                        Uri uri = request.getUrl();
                        if (isDaxiHttp(uri)) {
                            return true;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (!isDeviceOnline() && url != null && url.startsWith("http")) {
                        return true;
                    }
                    return super.shouldOverrideUrlLoading(view, url);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request == null || !request.isForMainFrame() || view == null) {
                        super.onReceivedError(view, request, error);
                        return;
                    }
                    if (!isDeviceOnline() || isNetworkError(error)) {
                        stayOnCachedShell(view);
                        return;
                    }
                    super.onReceivedError(view, request, error);
                    retrySiteLoad(view, request.getUrl() != null ? request.getUrl().toString() : null);
                }
            });
        });
    }

    private boolean isDaxiHttp(Uri uri) {
        if (uri == null) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return false;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        return "daxipro.com".equals(host) || "www.daxipro.com".equals(host);
    }

    private boolean isNetworkError(WebResourceError error) {
        if (error == null) {
            return !isDeviceOnline();
        }
        int code = error.getErrorCode();
        return code == WebView.ERROR_HOST_LOOKUP
            || code == WebView.ERROR_CONNECT
            || code == WebView.ERROR_TIMEOUT
            || code == WebView.ERROR_IO
            || code == WebView.ERROR_FAILED_SSL_HANDSHAKE
            || code == WebView.ERROR_UNKNOWN;
    }

    private void stayOnCachedShell(WebView view) {
        applyCacheMode(view, false);
        view.post(() -> {
            String current = view.getUrl();
            boolean stillOnSite = current != null
                && current.contains("daxipro.com")
                && !current.startsWith("data:")
                && !current.contains("chromewebdata");
            if (stillOnSite) {
                notifyJsOffline(view);
                return;
            }
            if (view.canGoBack()) {
                view.goBack();
                notifyJsOffline(view);
                return;
            }
            view.loadUrl(lastGoodUrl != null ? lastGoodUrl : SITE);
            notifyJsOffline(view);
        });
    }

    private void notifyJsOffline(WebView view) {
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
        }
    }

    private boolean isDeviceOnline() {
        ConnectivityManager cm = connectivityManager;
        if (cm == null) {
            cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        }
        if (cm == null) {
            return true;
        }
        if (Build.VERSION.SDK_INT >= 23) {
            Network network = cm.getActiveNetwork();
            if (network == null) {
                return false;
            }
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && (
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    || caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                    || caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            );
        }
        android.net.NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    private void retrySiteLoad(WebView view, String url) {
        if (siteLoadAttempts >= 4 || view == null || !isDeviceOnline()) {
            return;
        }
        String target = url;
        if (target == null || target.isEmpty()) {
            target = SITE;
        }
        siteLoadAttempts += 1;
        long delay = 600L * siteLoadAttempts;
        String loadUrl = target;
        mainHandler.postDelayed(() -> {
            if (isDeviceOnline()) {
                view.loadUrl(loadUrl);
            }
        }, delay);
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
