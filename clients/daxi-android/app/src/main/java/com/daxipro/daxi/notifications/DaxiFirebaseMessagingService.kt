package com.daxipro.daxi.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.daxipro.daxi.notifications.NotificationHelper.show

class DaxiFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val event = message.data["event"] ?: ""
        val isSos = event == "sos_alert"
        val title = message.notification?.title ?: message.data["title"] ?: if (isSos) "🆘 SOS URGENCE" else "Daxi"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        if (body.isNotBlank() || isSos) {
            val channel = if (isSos) NotificationHelper.CHANNEL_SOS else NotificationHelper.CHANNEL_ORDERS
            show(this, title, body.ifBlank { "Alerte SOS — intervention immédiate" }, channel, urgent = isSos)
        }
    }

    override fun onNewToken(token: String) {
        getSharedPreferences("daxi_prefs", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .apply()
    }
}
