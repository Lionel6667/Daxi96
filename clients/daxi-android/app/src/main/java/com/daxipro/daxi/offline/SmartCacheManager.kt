package com.daxipro.daxi.offline

import android.content.Context
import com.daxipro.daxi.data.local.DaxiDatabase
import com.daxipro.daxi.data.local.entity.CacheManifestEntity
import com.daxipro.daxi.network.DaxiApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File


class SmartCacheManager(
    private val context: Context,
    private val api: DaxiApiClient,
    private val webCache: OfflineWebCache,
) {
    private val db = DaxiDatabase.get(context)

    suspend fun syncDelta(): Int = withContext(Dispatchers.IO) {
        val manifest = api.fetchCacheManifest() ?: return@withContext 0
        if (!manifest.optBoolean("ok")) return@withContext 0
        val files = manifest.optJSONObject("files") ?: return@withContext 0
        var updated = 0
        val now = System.currentTimeMillis()
        val entries = mutableListOf<CacheManifestEntity>()
        val keys = files.keys()
        while (keys.hasNext()) {
            val path = keys.next()
            val meta = files.optJSONObject(path) ?: continue
            val etag = meta.optString("etag", meta.optString("version", ""))
            if (etag.isBlank()) continue
            val local = db.cacheManifestDao().get(path)
            if (local != null && local.etag == etag) continue
            val bytes = api.downloadBytes(path) ?: continue
            writeCacheFile(path, bytes)
            entries.add(
                CacheManifestEntity(
                    path = path,
                    etag = etag,
                    version = meta.optString("version", etag),
                    sizeBytes = bytes.size.toLong(),
                    updatedAt = now,
                ),
            )
            updated++
        }
        if (entries.isNotEmpty()) db.cacheManifestDao().upsertAll(entries)
        updated
    }

    private fun writeCacheFile(path: String, bytes: ByteArray) {
        val rel = when {
            path.isEmpty() || path == "/" -> "index.html"
            else -> path.trimStart('/')
        }
        val file = File(context.filesDir, "webcache/$rel")
        file.parentFile?.mkdirs()
        file.writeBytes(bytes)
    }
}
