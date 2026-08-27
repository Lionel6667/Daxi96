package com.daxipro.daxi

import android.content.Context
import com.daxipro.daxi.data.repository.BootstrapRepository
import com.daxipro.daxi.data.repository.OutboxRepository
import com.daxipro.daxi.gps.GpsQueueManager
import com.daxipro.daxi.maps.OfflineMapManager
import com.daxipro.daxi.network.AppApi
import com.daxipro.daxi.network.DaxiApiClient
import com.daxipro.daxi.offline.OfflineWebCache
import com.daxipro.daxi.sync.SyncEngine

object DaxiAppServices {
    @Volatile
    private var initialized = false

    lateinit var api: DaxiApiClient
        private set
    lateinit var appApi: AppApi
        private set
    lateinit var bootstrapRepository: BootstrapRepository
        private set
    lateinit var outboxRepository: OutboxRepository
        private set
    lateinit var gpsQueue: GpsQueueManager
        private set
    lateinit var offlineMapManager: OfflineMapManager
        private set
    lateinit var webCache: OfflineWebCache
        private set
    lateinit var syncEngine: SyncEngine
        private set

    fun init(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (initialized) return
            val app = context.applicationContext
            api = DaxiApiClient(app)
            appApi = AppApi(api)
            bootstrapRepository = BootstrapRepository(app, api)
            outboxRepository = OutboxRepository(app)
            gpsQueue = GpsQueueManager(app, api)
            offlineMapManager = OfflineMapManager(app, api)
            webCache = OfflineWebCache(app)
            syncEngine = SyncEngine(app)
            initialized = true
        }
    }
}
