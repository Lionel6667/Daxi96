package com.daxipro.daxi;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Looper;
import android.util.Log;
import androidx.core.location.LocationManagerCompat;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.Granularity;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Fused Location request tuned for a navigation app, not a weather widget.
 *
 * Stock @capacitor/geolocation hardcodes interval=10s, minUpdate=5s and maps
 * JS `timeout` onto setMaxUpdateDelayMillis (30s batching). Samsung then
 * refuses to open a GNSS session ("long engine interval").
 */
final class DaxiGpsEngine {
    static final String TAG = "DAXI_GPS";
    static final long INTERVAL_MS = 1000L;
    static final long MIN_INTERVAL_MS = 500L;
    static final long MAX_DELAY_MS = 0L;

    interface FixListener {
        void onFix(Location location);
        void onError(String message);
    }

    private final Context context;
    private FusedLocationProviderClient fusedClient;
    private LocationCallback callback;
    private FixListener listener;

    DaxiGpsEngine(Context context) {
        this.context = context.getApplicationContext();
    }

    boolean isPlayServicesAvailable() {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
            == ConnectionResult.SUCCESS;
    }

    boolean isLocationServicesEnabled() {
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        return lm != null && LocationManagerCompat.isLocationEnabled(lm);
    }

    LocationRequest buildRequest() {
        return new LocationRequest.Builder(INTERVAL_MS)
            .setMinUpdateIntervalMillis(MIN_INTERVAL_MS)
            .setMaxUpdateDelayMillis(MAX_DELAY_MS)
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(true)
            .build();
    }

    @SuppressWarnings("MissingPermission")
    void start(FixListener listener) {
        stop();
        this.listener = listener;
        if (!isPlayServicesAvailable()) {
            if (listener != null) listener.onError("Google Play Services not available");
            return;
        }
        if (!isLocationServicesEnabled()) {
            if (listener != null) listener.onError("location disabled");
            return;
        }
        fusedClient = LocationServices.getFusedLocationProviderClient(context);
        LocationRequest request = buildRequest();
        Log.i(
            TAG,
            "request interval=" + INTERVAL_MS
                + " minInterval=" + MIN_INTERVAL_MS
                + " maxDelay=" + MAX_DELAY_MS
                + " waitAccurate=true priority=HIGH_ACCURACY granularity=FINE"
        );
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) {
                    return;
                }
                // Deliver every fix in the batch, not only getLastLocation().
                for (Location location : locationResult.getLocations()) {
                    if (location == null) {
                        continue;
                    }
                    FixListener current = DaxiGpsEngine.this.listener;
                    if (current != null) {
                        current.onFix(location);
                    }
                }
            }
        };
        fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper());
    }

    void stop() {
        if (fusedClient != null && callback != null) {
            fusedClient.removeLocationUpdates(callback);
        }
        callback = null;
        listener = null;
        fusedClient = null;
    }

    boolean isRunning() {
        return callback != null;
    }
}
