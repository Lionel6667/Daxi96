package com.daxipro.daxi.network

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit

/**
 * Proxifie /api/ et /htmx/ vers le serveur live quand la WebView charge le shell file://.
 * GET/HEAD uniquement — POST/PUT/PATCH passent via fetch/XHR patché (absUrl).
 */
object LiveRequestInterceptor {

    private val client = OkHttpClient.Builder()
        .followRedirects(true)
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    fun intercept(request: WebResourceRequest, liveBase: String): WebResourceResponse? {
        val method = request.method.uppercase()
        val path = request.url.encodedPath ?: return null

        if (method != "GET" && method != "HEAD") {
            if (path.startsWith("/api/") || path.startsWith("/htmx/")) {
                DaxiNetLog.i("Interceptor", "PASS_THROUGH method=$method path=$path (non intercepté)")
            }
            return null
        }
        if (!path.startsWith("/api/") && !path.startsWith("/htmx/")) return null

        val host = request.url.host.orEmpty()
        val liveHost = runCatching { java.net.URI(liveBase).host }.getOrNull().orEmpty()
        if (liveHost.isNotEmpty() && host == liveHost) return null

        val root = liveBase.trimEnd('/')
        val query = request.url.encodedQuery?.let { "?$it" }.orEmpty()
        val url = root + path + query
        val t0 = System.currentTimeMillis()

        DaxiNetLog.i("Interceptor", "REQUEST_INTERCEPTED GET $url")

        return try {
            val builder = Request.Builder().url(url)
            val headers = request.requestHeaders
            for ((key, value) in headers) {
                if (key.equals("Host", ignoreCase = true)) continue
                builder.header(key, value)
            }
            if (root.contains("ngrok")) {
                builder.header("ngrok-skip-browser-warning", "true")
            }
            when (method) {
                "GET" -> builder.get()
                else -> builder.head()
            }
            val response = client.newCall(builder.build()).execute()
            val elapsed = System.currentTimeMillis() - t0
            val body = response.body ?: return null
            val bytes = body.bytes()
            DaxiNetLog.i(
                "Interceptor",
                "RESPONSE_RECEIVED status=${response.code} bytes=${bytes.size} elapsed=${elapsed}ms url=$url",
            )
            val contentType = response.header("Content-Type") ?: guessMime(path)
            val mime = contentType.substringBefore(";").trim()
            val encoding = if (isTextMime(mime)) "utf-8" else null
            val respHeaders = response.headers.toMultimap().mapValues { it.value.firstOrNull() ?: "" }
            WebResourceResponse(
                mime,
                encoding,
                response.code,
                response.message.ifBlank { "OK" },
                respHeaders,
                ByteArrayInputStream(bytes),
            )
        } catch (e: Exception) {
            val elapsed = System.currentTimeMillis() - t0
            DaxiNetLog.e("Interceptor", "REQUEST_FAILED elapsed=${elapsed}ms url=$url err=${e.message}", e)
            null
        }
    }

    private fun isTextMime(mime: String): Boolean {
        return mime.startsWith("text/") ||
            mime.contains("json") ||
            mime.contains("javascript") ||
            mime.contains("xml")
    }

    private fun guessMime(path: String): String = when {
        path.endsWith(".json") -> "application/json"
        path.endsWith(".js") -> "application/javascript"
        else -> "text/html"
    }
}
