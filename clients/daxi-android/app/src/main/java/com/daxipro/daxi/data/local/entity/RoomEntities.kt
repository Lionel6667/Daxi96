package com.daxipro.daxi.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "orders")
data class OrderEntity(
    @PrimaryKey val id: Long,
    val status: String,
    val payloadJson: String,
    val updatedAt: Long,
    val syncedAt: Long = 0L,
)

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val id: String,
    val orderId: Long?,
    val payloadJson: String,
    val createdAt: Long,
    val syncedAt: Long = 0L,
)

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey val id: String,
    val title: String,
    val body: String,
    val payloadJson: String,
    val read: Boolean = false,
    val createdAt: Long,
)

@Entity(tableName = "companies")
data class CompanyEntity(
    @PrimaryKey val id: Long,
    val name: String,
    val payloadJson: String,
    val updatedAt: Long,
)

@Entity(tableName = "drivers")
data class DriverEntity(
    @PrimaryKey val id: Long,
    val payloadJson: String,
    val updatedAt: Long,
)

@Entity(tableName = "profile")
data class ProfileEntity(
    @PrimaryKey val userKey: String = "me",
    val payloadJson: String,
    val updatedAt: Long,
)

@Entity(tableName = "settings")
data class SettingEntity(
    @PrimaryKey val key: String,
    val value: String,
    val updatedAt: Long,
)

@Entity(tableName = "saved_places")
data class SavedPlaceEntity(
    @PrimaryKey val placeKey: String,
    val label: String,
    val lat: Double,
    val lng: Double,
    val kind: String,
    val meta: String,
    val updatedAt: Long,
)

@Entity(
    tableName = "gps_positions",
    indices = [Index("synced"), Index("recordedAt")],
)
data class GpsPositionEntity(
    @PrimaryKey val clientId: String,
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val speed: Float?,
    val heading: Float?,
    val recordedAt: Long,
    val synced: Boolean = false,
)

@Entity(
    tableName = "outbox",
    indices = [Index("status"), Index("createdAt")],
)
data class OutboxEntity(
    @PrimaryKey val clientId: String,
    val actionType: String,
    val endpoint: String,
    val method: String,
    val bodyJson: String,
    val headersJson: String = "{}",
    val status: String = STATUS_PENDING,
    val attempts: Int = 0,
    val lastError: String = "",
    val createdAt: Long,
    val updatedAt: Long,
) {
    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_SYNCING = "syncing"
        const val STATUS_DONE = "done"
        const val STATUS_FAILED = "failed"
    }
}

@Entity(tableName = "cache_manifest")
data class CacheManifestEntity(
    @PrimaryKey val path: String,
    val etag: String,
    val version: String,
    val sizeBytes: Long,
    val updatedAt: Long,
)
