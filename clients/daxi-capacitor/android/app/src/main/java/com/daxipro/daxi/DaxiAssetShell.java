package com.daxipro.daxi;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import android.webkit.MimeTypeMap;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;


final class DaxiAssetShell {
    private DaxiAssetShell() {}

    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        if (context == null || request == null) {
            return null;
        }
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return null;
        }
        Uri uri = request.getUrl();
        if (uri == null) {
            return null;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        if (!"daxipro.com".equals(host) && !"www.daxipro.com".equals(host)) {
            return null;
        }
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        if (path.contains("..") || path.startsWith("/api/") || path.startsWith("/ws/") || path.startsWith("/htmx/")) {
            return null;
        }
        String asset = "public" + path;
        AssetManager assets = context.getAssets();
        InputStream stream = open(assets, asset);
        if (stream == null && isDocument(path)) {
            stream = open(assets, "public/index.html");
            path = "/index.html";
        }
        if (stream == null) {
            if (isDocument(path)) {
                return html(fallbackHtml());
            }
            return null;
        }
        String mime = guessMime(path);
        String encoding = isText(mime) ? "utf-8" : null;
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "public, max-age=86400");
        headers.put("Access-Control-Allow-Origin", "*");
        if (Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse(mime, encoding, 200, "OK", headers, stream);
        }
        return new WebResourceResponse(mime, encoding, stream);
    }

    private static boolean isDocument(String path) {
        String p = path.toLowerCase();
        return p.equals("/index.html") || p.endsWith(".html") || p.equals("/driver/") || path.endsWith("/");
    }

    private static InputStream open(AssetManager assets, String name) {
        try {
            return assets.open(name);
        } catch (IOException e) {
            return null;
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("xml");
    }

    private static String guessMime(String path) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(path.replace(" ", "%20"));
        if (ext != null && !ext.isEmpty()) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            if (mime != null) {
                return mime;
            }
        }
        String lower = path.toLowerCase();
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".html")) return "text/html";
        return "application/octet-stream";
    }

    private static WebResourceResponse html(String html) {
        ByteArrayInputStream in = new ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        if (Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers, in);
        }
        return new WebResourceResponse("text/html", "utf-8", in);
    }

    static String fallbackHtml() {
        return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<title>DAXI</title><style>body{margin:0;background:#070B14;color:#e2e8f0;"
            + "font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;"
            + "justify-content:center;text-align:center;padding:24px}h1{color:#f5c14b}</style></head>"
            + "<body><div><h1>DAXI</h1><p>Hors ligne — la dernière version de l’app reste disponible "
            + "dès qu’une page a été ouverte en ligne.</p></div></body></html>";
    }
}
