package com.daxipro.daxi.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.daxipro.daxi.DaxiAppServices

class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            DaxiAppServices.init(applicationContext)
            val result = DaxiAppServices.syncEngine.runFullSync()
            if (result.bootstrapOk || result.outboxSynced > 0 || result.gpsSynced > 0) {
                Result.success()
            } else {
                Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
