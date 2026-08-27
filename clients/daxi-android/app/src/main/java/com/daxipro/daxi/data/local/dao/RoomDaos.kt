package com.daxipro.daxi.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.daxipro.daxi.data.local.entity.CacheManifestEntity
import com.daxipro.daxi.data.local.entity.CompanyEntity
import com.daxipro.daxi.data.local.entity.DriverEntity
import com.daxipro.daxi.data.local.entity.GpsPositionEntity
import com.daxipro.daxi.data.local.entity.MessageEntity
import com.daxipro.daxi.data.local.entity.NotificationEntity
import com.daxipro.daxi.data.local.entity.OrderEntity
import com.daxipro.daxi.data.local.entity.OutboxEntity
import com.daxipro.daxi.data.local.entity.ProfileEntity
import com.daxipro.daxi.data.local.entity.SavedPlaceEntity
import com.daxipro.daxi.data.local.entity.SettingEntity

@Dao
interface OrderDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<OrderEntity>)

    @Query("SELECT * FROM orders ORDER BY updatedAt DESC")
    suspend fun getAll(): List<OrderEntity>

    @Query("DELETE FROM orders")
    suspend fun clear()
}

@Dao
interface MessageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<MessageEntity>)

    @Query("SELECT * FROM messages ORDER BY createdAt DESC LIMIT :limit")
    suspend fun recent(limit: Int = 200): List<MessageEntity>
}

@Dao
interface NotificationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<NotificationEntity>)

    @Query("SELECT * FROM notifications ORDER BY createdAt DESC LIMIT :limit")
    suspend fun recent(limit: Int = 100): List<NotificationEntity>
}

@Dao
interface CompanyDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<CompanyEntity>)
}

@Dao
interface DriverDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<DriverEntity>)

    @Query("SELECT * FROM drivers ORDER BY updatedAt DESC")
    suspend fun getAll(): List<DriverEntity>
}

@Dao
interface ProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: ProfileEntity)

    @Query("SELECT * FROM profile WHERE userKey = :key LIMIT 1")
    suspend fun get(key: String = "me"): ProfileEntity?
}

@Dao
interface SettingDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(setting: SettingEntity)

    @Query("SELECT * FROM settings WHERE `key` = :key LIMIT 1")
    suspend fun get(key: String): SettingEntity?
}

@Dao
interface SavedPlaceDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<SavedPlaceEntity>)

    @Query("SELECT * FROM saved_places ORDER BY updatedAt DESC LIMIT :limit")
    suspend fun recent(limit: Int = 50): List<SavedPlaceEntity>
}

@Dao
interface GpsDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(position: GpsPositionEntity)

    @Query("SELECT * FROM gps_positions WHERE synced = 0 ORDER BY recordedAt ASC LIMIT :limit")
    suspend fun pending(limit: Int = 200): List<GpsPositionEntity>

    @Query("UPDATE gps_positions SET synced = 1 WHERE clientId IN (:ids)")
    suspend fun markSynced(ids: List<String>)

    @Query("DELETE FROM gps_positions WHERE synced = 1 AND recordedAt < :before")
    suspend fun purgeSyncedBefore(before: Long)
}

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: OutboxEntity)

    @Query("SELECT * FROM outbox WHERE status IN ('pending','failed') ORDER BY createdAt ASC LIMIT :limit")
    suspend fun pending(limit: Int = 50): List<OutboxEntity>

    @Query("UPDATE outbox SET status = :status, attempts = :attempts, lastError = :error, updatedAt = :updatedAt WHERE clientId = :id")
    suspend fun updateStatus(id: String, status: String, attempts: Int, error: String, updatedAt: Long)

    @Query("SELECT COUNT(*) FROM outbox WHERE status IN ('pending','failed')")
    suspend fun pendingCount(): Int

    @Query("DELETE FROM outbox WHERE status = 'done' AND updatedAt < :before")
    suspend fun purgeDoneBefore(before: Long)

    @Query("DELETE FROM outbox")
    suspend fun deleteAll()
}

@Dao
interface CacheManifestDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<CacheManifestEntity>)

    @Query("SELECT * FROM cache_manifest")
    suspend fun getAll(): List<CacheManifestEntity>

    @Query("SELECT * FROM cache_manifest WHERE path = :path LIMIT 1")
    suspend fun get(path: String): CacheManifestEntity?
}
