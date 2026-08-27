package com.daxipro.daxi.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.daxipro.daxi.MainActivity
import com.daxipro.daxi.R

object NotificationHelper {

    const val CHANNEL_ORDERS = "daxi_orders"
    const val CHANNEL_SOS = "daxi_sos"
    const val CHANNEL_GENERAL = "daxi_general"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ORDERS,
                "Courses Daxi",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Mises à jour de vos commandes" }
        )
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_SOS,
                "Alertes SOS Daxi",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgences SOS — vibration et son"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_GENERAL,
                "Daxi",
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
    }

    fun show(context: Context, title: String, body: String, channel: String = CHANNEL_GENERAL, urgent: Boolean = false) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(if (urgent) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
        if (urgent) {
            builder.setVibrate(longArrayOf(0, 400, 200, 400, 200, 600))
            builder.setCategory(NotificationCompat.CATEGORY_ALARM)
        }
        NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), builder.build())
    }
}
