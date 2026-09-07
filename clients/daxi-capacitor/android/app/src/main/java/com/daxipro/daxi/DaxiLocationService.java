package com.daxipro.daxi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service so driver GPS survives onPause / screen-off.
 * The fused request itself stays in DaxiGpsEngine; this only holds the
 * OS location privilege while the chauffeur is on duty.
 */
public class DaxiLocationService extends Service {
    static final String ACTION_START = "com.daxipro.daxi.action.START_LOCATION";
    static final String ACTION_STOP = "com.daxipro.daxi.action.STOP_LOCATION";
    static final String CHANNEL_ID = "daxi_gps_min";
    static final int NOTIF_ID = 7101;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        ensureChannel();
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            this,
            0,
            launch,
            Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT
        );
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(tap)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setOnlyAlertOnce(true)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, notification);
        }
        Log.i(DaxiGpsEngine.TAG, "foreground service started");
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) {
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        try {
            nm.deleteNotificationChannel("daxi_gps");
        } catch (Exception ignored) {}
        if (nm.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.daxi_gps_channel),
            NotificationManager.IMPORTANCE_MIN
        );
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableLights(false);
        channel.enableVibration(false);
        nm.createNotificationChannel(channel);
    }
}
