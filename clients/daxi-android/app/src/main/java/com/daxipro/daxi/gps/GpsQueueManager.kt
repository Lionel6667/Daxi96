package com.daxipro.daxi.gps

import android.content.Context
import com.daxipro.daxi.data.local.DaxiDatabase
import com.daxipro.daxi.data.local.entity.GpsPositionEntity
import com.daxipro.daxi.network.DaxiApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class GpsQueueManager(
    private val context: Context,
    private val api: DaxiApiClient,
) {
    private val db = DaxiDatabase.get(context)

    suspend fun record(lat: Double, lng: Double, accuracy: Float?, speed: Float?, heading: Float?) =
        withContext(Dispatchers.IO) {
            db.gpsDao().insert(
                GpsPositionEntity(
                    clientId = UUID.randomUUID().toString(),
                    lat = lat,
                    lng = lng,
                    accuracy = accuracy,
                    speed = speed,
                    heading = heading,
                    recordedAt = System.currentTimeMillis(),
                    synced = false,
                ),
            )
        }

    suspend fun flush(): Int = withContext(Dispatchers.IO) {
        val pending = db.gpsDao().pending(200)
        if (pending.isEmpty()) return@withContext 0
        val arr = JSONArray()
        pending.forEach { p ->
            arr.put(
                JSONObject()
                    .put("id", p.clientId)
                    .put("lat", p.lat)
                    .put("lng", p.lng)
                    .put("accuracy", p.accuracy)
                    .put("speed", p.speed)
                    .put("heading", p.heading)
                    .put("recorded_at", p.recordedAt),
            )
        }
        val resp = api.postGpsBatch(arr) ?: return@withContext 0
        if (!resp.optBoolean("ok")) return@withContext 0
        val applied = resp.optInt("applied", pending.size)
        val ids = pending.take(applied.coerceAtLeast(0).coerceAtMost(pending.size)).map { it.clientId }
        if (ids.isNotEmpty()) db.gpsDao().markSynced(ids)
        db.gpsDao().purgeSyncedBefore(System.currentTimeMillis() - 7L * 24 * 3600 * 1000)
        applied
    }
}
