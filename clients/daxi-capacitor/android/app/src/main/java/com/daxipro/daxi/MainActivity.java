package com.daxipro.daxi;

import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.HashMap;
import java.util.Map;


public class MainActivity extends BridgeActivity {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int siteLoadAttempts = 0;
    private boolean consumedDeepLink = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        installRetryClient();
        mainHandler.postDelayed(() -> loadDeepLink(getIntent()), 250);
        watchBlankFirstLoad();
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
                webView.loadUrl("https://daxipro.com/");
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

    private void installRetryClient() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.post(() -> webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request == null || !request.isForMainFrame() || view == null) {
                    return;
                }
                retrySiteLoad(view, request.getUrl() != null ? request.getUrl().toString() : null);
            }
        }));
    }

    private void retrySiteLoad(WebView view, String url) {
        if (siteLoadAttempts >= 4 || view == null) {
            return;
        }
        String target = url;
        if (target == null || target.isEmpty()) {
            target = "https://daxipro.com/";
        }
        siteLoadAttempts += 1;
        long delay = 600L * siteLoadAttempts;
        String loadUrl = target;
        mainHandler.postDelayed(() -> view.loadUrl(loadUrl), delay);
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBars();
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
