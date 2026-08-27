package com.daxipro.daxi.network

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit

/**
 * Proxifie les tuiles carte (Carto / OSM) via OkHttp.
 * Nécessaire depuis le shell file:// : le WebView charge mal / bloque souvent
 * les <img> HTTPS cross-origin, ce qui laisse un fond noir.
 */
object MapTileInterceptor {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val tileHosts = setOf(
        "basemaps.cartocdn.com",
        "a.basemaps.cartocdn.com",
        "b.basemaps.cartocdn.com",
        "c.basemaps.cartocdn.com",
        "d.basemaps.cartocdn.com",
        "tile.openstreetmap.org",
        "a.tile.openstreetmap.org",
        "b.tile.openstreetmap.org",
        "c.tile.openstreetmap.org",
    )

    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        if (request.method.uppercase() != "GET") return null
        val host = request.url.host?.lowercase().orEmpty()
        if (host.isEmpty()) return null
        val isTileHost = tileHosts.any { host == it || host.endsWith(".$it") } ||
            host.contains("cartocdn.com") ||
            host.contains("tile.openstreetmap.org")
        if (!isTileHost) return null
        val path = request.url.encodedPath.orEmpty()
        if (!path.endsWith(".png") && !path.contains("/tiles/") && !path.matches(Regex(".*/\\d+/\\d+/\\d+(\\.(png|jpg|jpeg))?$"))) {
            // still allow typical xyz tile paths without extension
            if (!path.matches(Regex(".*/\\d+/\\d+/\\d+$"))) return null
        }

        val url = request.url.toString()
        val t0 = System.currentTimeMillis()
        return try {
            val httpReq = Request.Builder()
                .url(url)
                .get()
                .header("User-Agent", "DaxiAndroid/MapTiles")
                .header("Accept", "image/png,image/*;q=0.8,*/*;q=0.5")
                .build()
            client.newCall(httpReq).execute().use { resp ->
                val bytes = resp.body?.bytes() ?: return null
                if (!resp.isSuccessful || bytes.isEmpty()) {
                    DaxiNetLog.w("MapTile", "FAIL status=${resp.code} elapsed=${System.currentTimeMillis() - t0}ms $url")
                    return null
                }
                val mime = resp.header("Content-Type")?.substringBefore(";")?.trim()
                    ?: if (url.contains(".jpg")) "image/jpeg" else "image/png"
                DaxiNetLog.i("MapTile", "OK bytes=${bytes.size} elapsed=${System.currentTimeMillis() - t0}ms $url")
                WebResourceResponse(
                    mime,
                    null,
                    resp.code,
                    resp.message.ifBlank { "OK" },
                    mapOf("Access-Control-Allow-Origin" to "*"),
                    ByteArrayInputStream(bytes),
                )
            }
        } catch (e: Exception) {
            DaxiNetLog.e("MapTile", "ERR elapsed=${System.currentTimeMillis() - t0}ms $url ${e.message}", e)
            null
        }
    }
}
