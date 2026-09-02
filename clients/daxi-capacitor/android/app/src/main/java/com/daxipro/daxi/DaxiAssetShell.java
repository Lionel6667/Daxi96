package com.daxipro.daxi;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

final class DaxiAssetShell {
    private DaxiAssetShell() {}

    static boolean isCapacitorInternal(Uri uri) {
        if (uri == null) {
            return false;
        }
        String path = uri.getPath();
        if (path == null) {
            path = "";
        }
        String lower = path.toLowerCase();
        return lower.contains("_capacitor")
            || lower.contains("cordova")
            || lower.startsWith("/plugins/")
            || "capacitor".equalsIgnoreCase(uri.getScheme());
    }

    static boolean isDaxiHost(Uri uri) {
        if (uri == null) {
            return false;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        return "daxipro.com".equals(host) || "www.daxipro.com".equals(host);
    }

    static boolean isPassthroughPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        String p = path.toLowerCase();
        if (p.startsWith("/api/") || p.equals("/api")
            || p.startsWith("/htmx/") || p.equals("/htmx")
            || p.startsWith("/ws/") || p.equals("/ws")
            || p.startsWith("/accounts/") || p.equals("/accounts")
            || p.startsWith("/media/") || p.equals("/media")
            || p.startsWith("/admin-dashboard")
            || p.startsWith("/admin/")) {
            return true;
        }
        return false;
    }

    static String mapRoleDocumentPath(String path) {
        if (path == null || path.isEmpty()) {
            return null;
        }
        String p = path.toLowerCase();
        if (p.equals("/driver") || p.equals("/driver/")) {
            return "/driver/index.html";
        }
        if (p.equals("/driver/login") || p.equals("/driver/login/")) {
            return "/driver/login/index.html";
        }
        if (p.equals("/entreprise") || p.equals("/entreprise/")) {
            return "/entreprise/index.html";
        }
        if (p.startsWith("/entreprise/dashboard")) {
            return "/entreprise/dashboard/index.html";
        }
        return null;
    }

    /** Assets absents du bundle local : fallback réseau quand online. */
    static boolean isRemoteFallbackPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        String p = path.toLowerCase();
        return p.startsWith("/static/")
            || p.startsWith("/media/")
            || p.startsWith("/assets/")
            || p.startsWith("/villes/");
    }

    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        if (context == null || request == null) {
            return null;
        }
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return null;
        }
        Uri uri = request.getUrl();
        if (uri == null || !isDaxiHost(uri)) {
            return null;
        }
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        String roleDoc = mapRoleDocumentPath(path);
        if (roleDoc != null) {
            path = roleDoc;
        }
        if (path.contains("..") || isPassthroughPath(path) || isCapacitorInternal(uri)) {
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

    static WebResourceResponse unavailable(String message) {
        String json = "{\"ok\":false,\"offline\":true,\"error\":\"" + message.replace("\"", "'") + "\"}";
        ByteArrayInputStream in = new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Content-Type", "application/json; charset=utf-8");
        if (Build.VERSION.SDK_INT >= 21) {
            return new WebResourceResponse("application/json", "utf-8", 503, "Unavailable", headers, in);
        }
        return new WebResourceResponse("application/json", "utf-8", in);
    }

    private static boolean isDocument(String path) {
        String p = path.toLowerCase();
        return p.equals("/index.html") || p.endsWith(".html") || path.endsWith("/");
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
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".html")) return "text/html";
        return "application/octet-stream";
    }
}
