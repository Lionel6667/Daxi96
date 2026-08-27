package com.daxipro.daxi;

import android.content.res.Configuration;
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
    private int ngrokLoadAttempts = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        skipNgrokBrowserWarning();
    }

    
    private void skipNgrokBrowserWarning() {
        if (getBridge() == null) {
            return;
        }
        String serverUrl = getBridge().getServerUrl();
        WebView webView = getBridge().getWebView();
        if (webView == null || serverUrl == null) {
            return;
        }
        String host = serverUrl.toLowerCase();
        if (!host.contains("ngrok")) {
            return;
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("ngrok-skip-browser-warning", "true");
        String url = serverUrl.endsWith("/") ? serverUrl : serverUrl + "/";
        webView.post(() -> {
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request == null || !request.isForMainFrame()) {
                        return;
                    }
                    retryNgrokLoad(view, url, headers);
                }
            });
            webView.loadUrl(url, headers);
        });
    }

    private void retryNgrokLoad(WebView view, String url, Map<String, String> headers) {
        if (ngrokLoadAttempts >= 4 || view == null) {
            return;
        }
        ngrokLoadAttempts += 1;
        long delay = 700L * ngrokLoadAttempts;
        mainHandler.postDelayed(() -> view.loadUrl(url, headers), delay);
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
