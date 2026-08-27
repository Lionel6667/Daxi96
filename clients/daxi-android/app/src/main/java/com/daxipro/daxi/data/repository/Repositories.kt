package com.daxipro.daxi.data.repository

import android.content.Context
import com.daxipro.daxi.data.local.DaxiDatabase
import com.daxipro.daxi.data.local.entity.DriverEntity
import com.daxipro.daxi.data.local.entity.OrderEntity
import com.daxipro.daxi.data.local.entity.OutboxEntity
import com.daxipro.daxi.data.local.entity.ProfileEntity
import com.daxipro.daxi.data.local.entity.SavedPlaceEntity
import com.daxipro.daxi.network.DaxiApiClient
import com.daxipro.daxi.offline.OfflineWebCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class BootstrapRepository(
    private val context: Context,
    private val api: DaxiApiClient,
) {
    private val db = DaxiDatabase.get(context)
    private val webCache = OfflineWebCache(context)

    suspend fun syncFromNetwork(guestId: String?): Boolean = withContext(Dispatchers.IO) {
        try {
            val data = api.fetchBootstrap(guestId) ?: return@withContext false
            if (!data.optBoolean("ok")) return@withContext false
            persistBootstrap(data)
            val offlineDir = java.io.File(context.filesDir, "offline").also { it.mkdirs() }
            java.io.File(offlineDir, "bootstrap.json").writeText(data.toString())
            webCache.saveBootstrapJson(data.toString())
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun persistBootstrap(data: JSONObject) = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val orders = data.optJSONArray("orders") ?: JSONArray()
        val orderEntities = mutableListOf<OrderEntity>()
        for (i in 0 until orders.length()) {
            val o = orders.optJSONObject(i) ?: continue
            val id = o.optLong("id", 0L)
            if (id <= 0L) continue
            orderEntities.add(
                OrderEntity(
                    id = id,
                    status = o.optString("status"),
                    payloadJson = o.toString(),
                    updatedAt = now,
                ),
            )
        }
        db.orderDao().clear()
        if (orderEntities.isNotEmpty()) db.orderDao().upsertAll(orderEntities)

        val drivers = data.optJSONArray("drivers") ?: JSONArray()
        val driverEntities = mutableListOf<DriverEntity>()
        for (i in 0 until drivers.length()) {
            val d = drivers.optJSONObject(i) ?: continue
            val id = d.optLong("id", 0L)
            if (id <= 0L) continue
            driverEntities.add(DriverEntity(id = id, payloadJson = d.toString(), updatedAt = now))
        }
        if (driverEntities.isNotEmpty()) db.driverDao().upsertAll(driverEntities)

        val user = data.optJSONObject("user")
        if (user != null) {
            db.profileDao().upsert(ProfileEntity(payloadJson = user.toString(), updatedAt = now))
        }

        val places = data.optJSONArray("saved_places")
        if (places != null) {
            val placeEntities = mutableListOf<SavedPlaceEntity>()
            for (i in 0 until places.length()) {
                val p = places.optJSONObject(i) ?: continue
                val lat = p.optDouble("lat")
                val lng = p.optDouble("lng")
                val key = "${lat}|${lng}"
                placeEntities.add(
                    SavedPlaceEntity(
                        placeKey = key,
                        label = p.optString("label"),
                        lat = lat,
                        lng = lng,
                        kind = p.optString("kind"),
                        meta = p.optString("meta"),
                        updatedAt = now,
                    ),
                )
            }
            if (placeEntities.isNotEmpty()) db.savedPlaceDao().upsertAll(placeEntities)
        }
    }

    fun readBootstrapJson(): String? {
        val offline = java.io.File(context.filesDir, "offline/bootstrap.json")
        if (offline.exists()) return offline.readText()
        return webCache.bundledBootstrapJson()
    }
}

class OutboxRepository(private val context: Context) {
    private val db = DaxiDatabase.get(context)

    suspend fun enqueue(
        actionType: String,
        endpoint: String,
        method: String,
        bodyJson: String,
        headersJson: String = "{}",
        clientId: String = UUID.randomUUID().toString(),
    ): String = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        db.outboxDao().insert(
            OutboxEntity(
                clientId = clientId,
                actionType = actionType,
                endpoint = endpoint,
                method = method.uppercase(),
                bodyJson = bodyJson,
                headersJson = headersJson,
                status = OutboxEntity.STATUS_PENDING,
                createdAt = now,
                updatedAt = now,
            ),
        )
        clientId
    }

    suspend fun pendingCount(): Int = withContext(Dispatchers.IO) {
        db.outboxDao().pendingCount()
    }

    suspend fun pending(limit: Int = 50): List<OutboxEntity> = withContext(Dispatchers.IO) {
        db.outboxDao().pending(limit)
    }

    suspend fun mark(item: OutboxEntity, status: String, error: String = "", attempts: Int = item.attempts) =
        withContext(Dispatchers.IO) {
        db.outboxDao().updateStatus(
            id = item.clientId,
            status = status,
            attempts = attempts,
            error = error,
            updatedAt = System.currentTimeMillis(),
        )
    }

    suspend fun clearAll() = withContext(Dispatchers.IO) {
        db.outboxDao().deleteAll()
    }
}
