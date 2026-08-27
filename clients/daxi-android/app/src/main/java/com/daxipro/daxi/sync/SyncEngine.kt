package com.daxipro.daxi.sync

import android.content.Context
import com.daxipro.daxi.data.local.entity.OutboxEntity
import com.daxipro.daxi.data.repository.BootstrapRepository
import com.daxipro.daxi.data.repository.OutboxRepository
import com.daxipro.daxi.gps.GpsQueueManager
import com.daxipro.daxi.maps.OfflineMapManager
import com.daxipro.daxi.BuildConfig
import com.daxipro.daxi.network.DaxiApiClient
import com.daxipro.daxi.offline.OfflineWebCache
import com.daxipro.daxi.offline.SmartCacheManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class OutboxProcessor(
    private val outboxRepository: OutboxRepository,
    private val api: DaxiApiClient,
) {
    suspend fun flush(): Int = withContext(Dispatchers.IO) {
        val pending = outboxRepository.pending(50)
        if (pending.isEmpty()) return@withContext 0
        val batch = JSONArray()
        pending.forEach { item ->
            val payload = try {
                JSONObject(item.bodyJson)
            } catch (_: Exception) {
                JSONObject()
            }
            if (!payload.has("path") && item.endpoint.isNotBlank()) {
                payload.put("path", item.endpoint)
            }
            batch.put(
                JSONObject()
                    .put("id", item.clientId)
                    .put("type", item.actionType)
                    .put("payload", payload),
            )
        }
        val resp = api.postOutbox(batch) ?: run {
            pending.forEach { markFailed(it, "network_error") }
            return@withContext 0
        }
        if (!resp.optBoolean("ok")) {
            pending.forEach { markFailed(it, resp.optString("error", "server_error")) }
            return@withContext 0
        }
        val results = resp.optJSONArray("results") ?: JSONArray()
        var ok = 0
        for (i in 0 until results.length()) {
            val r = results.optJSONObject(i) ?: continue
            val id = r.optString("id")
            val item = pending.find { it.clientId == id } ?: continue
            if (r.optBoolean("ok")) {
                outboxRepository.mark(item, OutboxEntity.STATUS_DONE)
                ok++
            } else {
                markFailed(item, r.optString("error", "failed"))
            }
        }
        ok
    }

    private suspend fun markFailed(item: OutboxEntity, error: String) {
        val nextAttempts = item.attempts + 1
        val status = if (nextAttempts >= 8) OutboxEntity.STATUS_FAILED else OutboxEntity.STATUS_PENDING
        outboxRepository.mark(item, status, error, nextAttempts)
    }
}

class SyncEngine(private val context: Context) {
    private val api = DaxiApiClient(context)
    private val prefs = context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
    private val bootstrapRepository = BootstrapRepository(context, api)
    private val outboxRepository = OutboxRepository(context)
    private val gpsQueue = GpsQueueManager(context, api)
    private val webCache = OfflineWebCache(context)
    private val smartCache = SmartCacheManager(context, api, webCache)
    private val mapManager = OfflineMapManager(context, api)
    private val outboxProcessor = OutboxProcessor(outboxRepository, api)

    suspend fun syncBootstrapOnly(guestId: String?): Boolean = withContext(Dispatchers.IO) {
        try {
            bootstrapRepository.syncFromNetwork(guestId)
        } catch (_: Exception) {
            false
        }
    }

    suspend fun runHeavySync(): SyncResult = withContext(Dispatchers.IO) {
        try {
            val bootstrapJson = bootstrapRepository.readBootstrapJson()
            if (bootstrapJson != null) {
                try {
                    mapManager.syncPacksFromBootstrap(JSONObject(bootstrapJson))
                } catch (_: Exception) {
                }
            }
            val outbox = outboxProcessor.flush()
            val gps = gpsQueue.flush()
            val cacheDelta = smartCache.syncDelta()
            val cacheSnapshot = webCache.syncLiveSiteSnapshot(BuildConfig.DAXI_BASE_URL)
            SyncResult(
                bootstrapOk = bootstrapJson != null,
                outboxSynced = outbox,
                gpsSynced = gps,
                cacheFilesUpdated = cacheDelta,
                cacheSnapshot = cacheSnapshot,
            )
        } catch (_: Exception) {
            SyncResult(false, 0, 0, 0, false)
        }
    }

    suspend fun runFullSync(): SyncResult = withContext(Dispatchers.IO) {
        try {
            val guestId = prefs.getString("guest_id", null)
            val bootstrapOk = bootstrapRepository.syncFromNetwork(guestId)
            runHeavySync().copy(bootstrapOk = bootstrapOk)
        } catch (_: Exception) {
            SyncResult(false, 0, 0, 0, false)
        }
    }
}

data class SyncResult(
    val bootstrapOk: Boolean,
    val outboxSynced: Int,
    val gpsSynced: Int,
    val cacheFilesUpdated: Int,
    val cacheSnapshot: Boolean,
)
