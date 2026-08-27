package com.daxipro.daxi.offline

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Télécharge le bootstrap DAXI (commandes, chauffeurs, carte Haïti) pour usage hors ligne.
 */
class OfflineSyncManager(
    private val context: Context,
    private val baseUrl: String,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val offlineDir: File
        get() = File(context.filesDir, "offline").also { it.mkdirs() }

    suspend fun syncBootstrap(guestId: String? = null): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = buildString {
                append(baseUrl.trimEnd('/'))
                append("/api/mobile/bootstrap/")
                if (!guestId.isNullOrBlank()) append("?guest_id=").append(guestId)
            }
            val reqBuilder = Request.Builder().url(url).get()
                if (baseUrl.contains("ngrok")) {
                    reqBuilder.header("ngrok-skip-browser-warning", "true")
                }
                val resp = client.newCall(reqBuilder.build()).execute()
            if (!resp.isSuccessful) return@withContext false
            val body = resp.body?.string() ?: return@withContext false
            File(offlineDir, "bootstrap.json").writeText(body)
            OfflineWebCache(context).saveBootstrapJson(body)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun readBootstrapJson(): String? {
        val f = File(offlineDir, "bootstrap.json")
        return if (f.exists()) f.readText() else null
    }
}
