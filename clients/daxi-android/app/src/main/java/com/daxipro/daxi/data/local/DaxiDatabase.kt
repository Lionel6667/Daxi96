package com.daxipro.daxi.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.daxipro.daxi.data.local.dao.CacheManifestDao
import com.daxipro.daxi.data.local.dao.CompanyDao
import com.daxipro.daxi.data.local.dao.DriverDao
import com.daxipro.daxi.data.local.dao.GpsDao
import com.daxipro.daxi.data.local.dao.MessageDao
import com.daxipro.daxi.data.local.dao.NotificationDao
import com.daxipro.daxi.data.local.dao.OrderDao
import com.daxipro.daxi.data.local.dao.OutboxDao
import com.daxipro.daxi.data.local.dao.ProfileDao
import com.daxipro.daxi.data.local.dao.SavedPlaceDao
import com.daxipro.daxi.data.local.dao.SettingDao
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

@Database(
    entities = [
        OrderEntity::class,
        MessageEntity::class,
        NotificationEntity::class,
        CompanyEntity::class,
        DriverEntity::class,
        ProfileEntity::class,
        SettingEntity::class,
        SavedPlaceEntity::class,
        GpsPositionEntity::class,
        OutboxEntity::class,
        CacheManifestEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class DaxiDatabase : RoomDatabase() {
    abstract fun orderDao(): OrderDao
    abstract fun messageDao(): MessageDao
    abstract fun notificationDao(): NotificationDao
    abstract fun companyDao(): CompanyDao
    abstract fun driverDao(): DriverDao
    abstract fun profileDao(): ProfileDao
    abstract fun settingDao(): SettingDao
    abstract fun savedPlaceDao(): SavedPlaceDao
    abstract fun gpsDao(): GpsDao
    abstract fun outboxDao(): OutboxDao
    abstract fun cacheManifestDao(): CacheManifestDao

    companion object {
        @Volatile
        private var instance: DaxiDatabase? = null

        fun get(context: Context): DaxiDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    DaxiDatabase::class.java,
                    "daxi_room.db",
                ).fallbackToDestructiveMigration().build().also { instance = it }
            }
        }
    }
}
