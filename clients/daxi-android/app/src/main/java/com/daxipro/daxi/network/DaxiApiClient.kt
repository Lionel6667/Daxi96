package com.daxipro.daxi.network

import android.content.Context
import com.daxipro.daxi.BuildConfig
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class DaxiApiClient(context: Context) {
    private val prefs = context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
    private val cookieStore = mutableListOf<Cookie>()

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .cookieJar(object : CookieJar {
            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                return cookieStore.filter { it.matches(url) }
            }

            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                cookieStore.removeAll { old -> cookies.any { it.name == old.name && it.domain == old.domain } }
                cookieStore.addAll(cookies)
            }
        })
        .build()

    private val baseUrl: String
        get() = BuildConfig.DAXI_BASE_URL.trimEnd('/')

    private fun headers(): Map<String, String> {
        ensureGuestId()
        val map = mutableMapOf(
            "ngrok-skip-browser-warning" to "true",
            "Accept" to "application/json",
            "X-Daxi-Hybrid" to "1",
            "X-Daxi-Native" to "1",
            "User-Agent" to "DaxiAndroid/${BuildConfig.VERSION_NAME}",
        )
        val guestId = prefs.getString("guest_id", null)
        if (!guestId.isNullOrBlank()) map["X-Daxi-Guest-Id"] = guestId
        val token = prefs.getString("access_token", null)
        if (!token.isNullOrBlank()) map["Authorization"] = "Bearer $token"
        return map
    }

    fun ensureGuestId(): String {
        var id = prefs.getString("guest_id", null)
        if (id.isNullOrBlank()) {
            id = "g_" + java.util.UUID.randomUUID().toString().replace("-", "").take(16)
            prefs.edit().putString("guest_id", id).apply()
        }
        return id
    }

    fun appGet(path: String): JSONObject? = get(path)

    fun appPost(path: String, body: JSONObject = JSONObject()): JSONObject? {
        if (!body.has("guest_id")) {
            val gid = prefs.getString("guest_id", null)
            if (!gid.isNullOrBlank()) body.put("guest_id", gid)
        }
        return postJson(path, body.toString())
    }

    fun saveAccessToken(token: String?) {
        prefs.edit().putString("access_token", token?.ifBlank { null }).apply()
    }

    fun get(path: String): JSONObject? {
        return try {
            val req = Request.Builder().url(baseUrl + path).get()
            headers().forEach { (k, v) -> req.header(k, v) }
            http.newCall(req.build()).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string()?.trim().orEmpty()
                if (body.isEmpty() || body.startsWith("<")) return null
                parseJsonObject(body)
            }
        } catch (_: Exception) {
            null
        }
    }


    fun getJson(path: String): String? {
        val t0 = System.currentTimeMillis()
        val url = baseUrl + path
        DaxiNetLog.i("HTTP", "REQUEST_SENT GET $url")
        return try {
            val req = Request.Builder().url(url).get()
            headers().forEach { (k, v) -> req.header(k, v) }
            http.newCall(req.build()).execute().use { resp ->
                val elapsed = System.currentTimeMillis() - t0
                if (!resp.isSuccessful) {
                    DaxiNetLog.w("HTTP", "RESPONSE_RECEIVED status=${resp.code} elapsed=${elapsed}ms url=$url")
                    return null
                }
                val body = resp.body?.string()?.trim().orEmpty()
                if (body.isEmpty() || body.startsWith("<")) {
                    DaxiNetLog.w("HTTP", "RESPONSE_INVALID html_or_empty elapsed=${elapsed}ms url=$url")
                    return null
                }
                DaxiNetLog.i("HTTP", "RESPONSE_RECEIVED status=${resp.code} bytes=${body.length} elapsed=${elapsed}ms url=$url")
                body
            }
        } catch (e: Exception) {
            val elapsed = System.currentTimeMillis() - t0
            DaxiNetLog.e("HTTP", "REQUEST_FAILED elapsed=${elapsed}ms url=$url err=${e.message}", e)
            null
        }
    }

    private fun parseJsonObject(body: String): JSONObject? {
        return try {
            JSONObject(body)
        } catch (_: Exception) {
            null
        }
    }

    fun postJson(path: String, json: String): JSONObject? {
        return try {
            val req = Request.Builder()
                .url(baseUrl + path)
                .post(json.toRequestBody("application/json; charset=utf-8".toMediaType()))
            headers().forEach { (k, v) -> req.header(k, v) }
            http.newCall(req.build()).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                parseJsonObject(body.ifBlank { "{}" })
                    ?: JSONObject().put("ok", resp.isSuccessful).put("status", resp.code)
            }
        } catch (_: Exception) {
            null
        }
    }

    fun downloadBytes(path: String): ByteArray? {
        val req = Request.Builder().url(baseUrl + path).get()
        headers().forEach { (k, v) -> req.header(k, v) }
        http.newCall(req.build()).execute().use { resp ->
            if (!resp.isSuccessful) return null
            return resp.body?.bytes()
        }
    }

    fun bootstrapUrl(guestId: String?): String {
        return buildString {
            append("/api/mobile/bootstrap/")
            if (!guestId.isNullOrBlank()) append("?guest_id=").append(guestId)
        }
    }

    fun fetchBootstrap(guestId: String?): JSONObject? = get(bootstrapUrl(guestId))

    fun postOutbox(items: JSONArray): JSONObject? {
        return postJson("/api/mobile/outbox/", JSONObject().put("items", items).toString())
    }

    fun postGpsBatch(points: JSONArray): JSONObject? {
        return postJson("/api/mobile/gps-batch/", points.toString())
    }

    fun fetchCacheManifest(): JSONObject? = get("/api/mobile/cache-manifest/")


    fun proxyRaw(
        method: String,
        absoluteUrl: String,
        body: String?,
        contentType: String?,
        extraHeaders: Map<String, String> = emptyMap(),
    ): Triple<Int, String, String> {
        val t0 = System.currentTimeMillis()
        val m = method.uppercase()
        DaxiNetLog.i("HTTP", "PROXY_SENT $m $absoluteUrl")
        return try {
            val builder = Request.Builder().url(absoluteUrl)
            headers().forEach { (k, v) -> builder.header(k, v) }
            builder.header("X-Daxi-Hybrid", "1")
            extraHeaders.forEach { (k, v) ->
                if (!k.equals("Host", true) && !k.equals("Content-Length", true)) {
                    builder.header(k, v)
                }
            }
            val media = (contentType ?: "application/x-www-form-urlencoded; charset=UTF-8").toMediaType()
            when (m) {
                "GET" -> builder.get()
                "HEAD" -> builder.head()
                "DELETE" -> builder.delete()
                "POST" -> builder.post((body ?: "").toRequestBody(media))
                "PUT" -> builder.put((body ?: "").toRequestBody(media))
                "PATCH" -> builder.patch((body ?: "").toRequestBody(media))
                else -> builder.method(m, (body ?: "").toRequestBody(media))
            }
            http.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val ct = resp.header("Content-Type") ?: "text/plain"
                DaxiNetLog.i(
                    "HTTP",
                    "PROXY_RECEIVED status=${resp.code} bytes=${text.length} elapsed=${System.currentTimeMillis() - t0}ms url=$absoluteUrl",
                )
                Triple(resp.code, text, ct)
            }
        } catch (e: Exception) {
            DaxiNetLog.e("HTTP", "PROXY_FAILED elapsed=${System.currentTimeMillis() - t0}ms url=$absoluteUrl err=${e.message}", e)
            Triple(0, "", "text/plain")
        }
    }
}
