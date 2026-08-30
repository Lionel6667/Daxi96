package com.daxipro.daxi.offline

import com.daxipro.daxi.BuildConfig
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit


class OfflineWebCache(private val context: Context) {

    private val prefetchClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private val shellDir: File
        get() = File(context.filesDir, "daxi-shell").also { it.mkdirs() }

    private val webCacheDir: File
        get() = File(context.filesDir, "webcache").also { it.mkdirs() }

    fun ensureBundledShellCopied() {
        val marker = File(shellDir, ".bundled_ok")
        val wanted = BuildConfig.VERSION_NAME + "_shell_v2"
        if (marker.exists() && marker.readText() == wanted) return
        val items = context.assets.list("daxi-shell") ?: emptyArray()
        for (name in items) {
            copyAssetFile("daxi-shell/$name", File(shellDir, name))
        }
        marker.writeText(wanted)
    }

    fun ensureBundledWebCacheCopied() {
        val marker = File(webCacheDir, ".bundled_ok")
        val wanted = BuildConfig.VERSION_NAME + "_offline_v10"
        if (marker.exists() && marker.readText() == wanted) return
        copyAssetTree("webcache", webCacheDir)
        marker.writeText(wanted)
    }

    fun bundledBootstrapJson(): String {
        ensureBundledShellCopied()
        val f = File(shellDir, "bootstrap.json")
        if (f.exists()) return f.readText()
        return context.assets.open("daxi-shell/bootstrap.json").bufferedReader().use { it.readText() }
    }

    fun offlineShellUrl(): String {
        ensureBundledShellCopied()
        return fileUrl(File(shellDir, "index.html"))
    }

    fun hasWebCache(): Boolean {
        ensureBundledWebCacheCopied()
        return File(webCacheDir, "index.html").exists()
    }

    fun webCacheUrl(): String? {
        ensureBundledWebCacheCopied()
        val f = File(webCacheDir, "index.html")
        return if (f.exists()) fileUrl(f) else null
    }


    fun bestOfflineUrl(): String {
        if (hasBundledWebCacheAsset()) {
            return "file:///android_asset/webcache/index.html"
        }
        return webCacheUrl() ?: offlineShellUrl()
    }

    private fun hasBundledWebCacheAsset(): Boolean {
        return try {
            context.assets.open("webcache/index.html").close()
            true
        } catch (_: Exception) {
            false
        }
    }

    fun saveBootstrapJson(json: String) {
        ensureBundledShellCopied()
        File(shellDir, "bootstrap.json").writeText(json)
    }

    fun syncLiveSiteSnapshot(baseUrl: String): Boolean {
        val root = baseUrl.trimEnd('/')
        val paths = listOf(
            "/",
            "/assets/css/vubez2-core.css",
            "/assets/css/vubez2-body.css",
            "/assets/css/remixicon-vubez2.css",
            "/assets/fonts/remixicon.woff2",
            "/assets/css/tailwind-vubez2.css",
            "/static/js/daxi-lazy-loader.js",
            "/static/js/daxi-offline.js",
            "/static/js/daxi-countdown.js",
            "/static/js/daxi-intro.js",
            "/static/js/daxi-guest-id.js",
            "/static/js/daxi-app-api.js",
            "/static/js/daxi-realtime.js",
            "/static/js/daxi-map-placeholder.js",
            "/static/js/daxi-main-map-dual.js",
            "/static/js/daxi-network-state.js",
            "/static/js/vubez2/vubez2-inline-02.js",
            "/static/js/vubez2/vubez2-inline-03.js",
            "/static/js/vubez2/vubez2-inline-04.js",
            "/static/js/vubez2/vubez2-inline-05.js",
            "/static/js/vubez2/vubez2-inline-06.js",
            "/static/js/vubez2/vubez2-inline-07.js",
            "/assets/images/daxi-icon-gold.png",
            "/assets/images/daxi-logo-gold.png",
            "/assets/images/daxi-logo-gold.webp",
            "/assets/images/daxi-logo-dark.png",
            "/assets/images/daxi-logo-dark.webp",
            "/assets/images/daxi-map-placeholder-dark.webp",
            "/assets/images/img20.png",
            "/assets/images/img87.jpg",
            "/assets/images/img97.jpg",
            "/assets/images/img47.jpg",
            "/assets/images/img77.jfif",
            "/assets/images/img67.jpg",
            "/assets/images/img.jpg",
            "/assets/images/img6.jpg",
            "/assets/images/img7.jpg",
            "/assets/images/img8.jpg",
            "/assets/images/img12.jpg",
            "/assets/images/img13.webp.jpg",
            "/assets/images/img15.webp.jpg",
            "/assets/images/img113.jpg",
            "/gps-precision-engine.js",
            "/daxi-frequent-routes-data.js",
            "/daxi-frequent-routes-map.js",
            "/daxi-haiti-explorer-data.js",
            "/daxi-haiti-explorer-map.js",
            "/manifest.json",
        )
        var ok = false
        for (path in paths) {
            try {
                val reqBuilder = Request.Builder().url(root + path).get()
                if (root.contains("ngrok")) {
                    reqBuilder.header("ngrok-skip-browser-warning", "true")
                }
                val resp = prefetchClient.newCall(reqBuilder.build()).execute()
                if (!resp.isSuccessful) continue
                val body = resp.body?.bytes() ?: continue
                writeCacheBytes(path, body)
                ok = true
            } catch (_: Exception) {
            }
        }
        if (ok) {
            context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
                .edit()
                .putLong("webcache_at", System.currentTimeMillis())
                .apply()
        }
        return ok
    }

    fun isWebCacheReady(): Boolean {
        val marker = File(webCacheDir, ".bundled_ok")
        return marker.exists() && File(webCacheDir, "index.html").exists()
    }


    fun interceptCacheFirst(request: WebResourceRequest): WebResourceResponse? {
        val path = requestPath(request) ?: return null
        val file = cacheFileForPath(path)
        if (file.exists()) return responseFromFile(file)
        return responseFromAsset(path)
    }


    fun prefetchPaths(liveBase: String, paths: List<String>) {
        val root = liveBase.trimEnd('/')
        for (path in paths) {
            if (!shouldCachePath(path)) continue
            val file = cacheFileForPath(path)
            if (file.exists()) continue
            try {
                val reqBuilder = Request.Builder().url(root + path).get()
                if (root.contains("ngrok")) {
                    reqBuilder.header("ngrok-skip-browser-warning", "true")
                }
                val resp = prefetchClient.newCall(reqBuilder.build()).execute()
                if (!resp.isSuccessful) continue
                val bytes = resp.body?.bytes() ?: continue
                writeCacheBytes(path, bytes)
            } catch (_: Exception) {
            }
        }
    }

    private fun requestPath(request: WebResourceRequest): String? {
        val raw = request.url.toString()
        val marker = "/webcache/"
        val idx = raw.indexOf(marker)
        if (idx >= 0) {
            val sub = raw.substring(idx + marker.length).substringBefore('?').substringBefore('#')
            return if (sub.isEmpty()) "/" else "/$sub"
        }
        val path = request.url.encodedPath ?: return null
        if (path.isBlank()) return "/"
        return path
    }

    private fun shouldCachePath(path: String): Boolean {
        if (path.startsWith("/htmx/") || path.startsWith("/api/")) return false
        val lower = path.lowercase()
        return lower.endsWith(".js") || lower.endsWith(".css") || lower.endsWith(".png") ||
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") ||
            lower.endsWith(".jfif") || lower.endsWith(".svg") || lower.endsWith(".woff2") ||
            lower.endsWith(".woff") || lower.endsWith(".json") || path == "/" ||
            lower.endsWith(".html")
    }

    private fun responseFromAsset(path: String): WebResourceResponse? {
        val rel = when {
            path.isEmpty() || path == "/" -> "index.html"
            else -> path.trimStart('/')
        }
        return try {
            val stream = context.assets.open("webcache/$rel")
            val mime = guessMime(rel.substringAfterLast('/'))
            val encoding = if (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")) {
                "utf-8"
            } else {
                null
            }
            WebResourceResponse(mime, encoding, stream)
        } catch (_: Exception) {
            null
        }
    }

    private fun responseFromFile(file: File): WebResourceResponse {
        val mime = guessMime(file.name)
        val encoding = if (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")) {
            "utf-8"
        } else {
            null
        }
        return WebResourceResponse(mime, encoding, FileInputStream(file))
    }

    fun interceptIfCached(request: WebResourceRequest, baseUrl: String): WebResourceResponse? {
        return interceptCacheFirst(request)
    }

    private fun cacheFileForPath(path: String): File {
        val rel = when {
            path.isEmpty() || path == "/" -> "index.html"
            else -> path.trimStart('/')
        }
        return File(webCacheDir, rel.replace('/', File.separatorChar))
    }

    private fun writeCacheBytes(path: String, bytes: ByteArray) {
        val file = cacheFileForPath(path)
        file.parentFile?.mkdirs()
        file.writeBytes(bytes)
    }

    private fun fileUrl(file: File): String = "file://${file.absolutePath}"

    private fun guessMime(name: String): String = when {
        name.endsWith(".js") -> "application/javascript"
        name.endsWith(".css") -> "text/css"
        name.endsWith(".json") -> "application/json"
        name.endsWith(".png") -> "image/png"
        name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".jfif") -> "image/jpeg"
        name.endsWith(".svg") -> "image/svg+xml"
        name.endsWith(".webp") -> "image/webp"
        else -> "text/html"
    }

    private fun copyAssetTree(assetPath: String, targetDir: File) {
        val items = context.assets.list(assetPath) ?: return
        if (items.isEmpty()) {
            copyAssetFile(assetPath, File(targetDir, assetPath.substringAfterLast('/')))
            return
        }
        for (name in items) {
            val sub = "$assetPath/$name"
            val children = context.assets.list(sub)
            if (children.isNullOrEmpty()) {
                copyAssetFile(sub, File(targetDir, name))
            } else {
                copyAssetTree(sub, File(targetDir, name))
            }
        }
    }

    private fun copyAssetFile(assetPath: String, outFile: File) {
        outFile.parentFile?.mkdirs()
        context.assets.open(assetPath).use { input ->
            FileOutputStream(outFile).use { output -> input.copyTo(output) }
        }
    }
}
