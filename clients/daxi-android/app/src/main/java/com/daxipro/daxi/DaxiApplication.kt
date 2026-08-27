package com.daxipro.daxi

import android.app.Application
import com.daxipro.daxi.notifications.NotificationHelper
import com.daxipro.daxi.sync.SyncScheduler

class DaxiApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        DaxiAppServices.init(this)
        NotificationHelper.createChannels(this)
        SyncScheduler.schedule(this)
    }
}
