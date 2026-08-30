package com.daxipro.daxi.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicReference

data class NativeLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val altitude: Double,
    val speed: Float,
    val bearing: Float,
    val time: Long,
    val isBootstrap: Boolean = false,
) {
    fun isPrecise(): Boolean = accuracy <= LocationHelper.PRECISE_MAX_ACCURACY_M
}


class LocationHelper(private val context: Context) {

    companion object {
        private const val TAG = "DaxiLocation"


        const val PRECISE_MAX_ACCURACY_M = 500f


        const val REJECT_ACCURACY_M = 5000f


        const val GOOD_ACCURACY_M = 120f

        private const val BEST_STALE_MS = 8_000L
        private const val BOOTSTRAP_STALE_MS = 45_000L
        private const val UPDATE_INTERVAL_MS = 1000L
    }

    private val fused = LocationServices.getFusedLocationProviderClient(context)
    private val bestFix = AtomicReference<NativeLocation?>(null)
    private val bootstrapFix = AtomicReference<NativeLocation?>(null)
    private var updatesStarted = false

    private val locationRequest = LocationRequest.Builder(
        Priority.PRIORITY_HIGH_ACCURACY,
        UPDATE_INTERVAL_MS,
    ).apply {
        setMinUpdateIntervalMillis(500L)
        setMaxUpdateDelayMillis(2000L)
        setWaitForAccurateLocation(true)
        setMinUpdateDistanceMeters(0f)
    }.build()

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach { absorbLocation(it, fromBootstrap = false) }
            result.lastLocation?.let { absorbLocation(it, fromBootstrap = false) }
        }
    }

    fun isLocationEnabled(): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            lm.isLocationEnabled
        } else {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    @SuppressLint("MissingPermission")
    fun startContinuousUpdates() {
        if (!isLocationEnabled()) {
            Log.w(TAG, "Device location disabled")
            return
        }
        fetchLastLocationBootstrap()
        if (updatesStarted) return
        updatesStarted = true
        Log.i(TAG, "requestLocationUpdates PRIORITY_HIGH_ACCURACY")
        fused.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper(),
        )
    }

    fun stopContinuousUpdates() {
        if (!updatesStarted) return
        updatesStarted = false
        fused.removeLocationUpdates(locationCallback)
        Log.i(TAG, "Stopped fused location updates")
    }

    @SuppressLint("MissingPermission")
    suspend fun refreshHighAccuracy(timeoutMs: Long = 12_000L): NativeLocation? {
        if (!isLocationEnabled()) return resolveForBridge()
        startContinuousUpdates()
        val deadline = System.currentTimeMillis() + timeoutMs
        var lastSeen: NativeLocation? = resolveForBridge()
        while (System.currentTimeMillis() < deadline) {
            lastSeen = resolveForBridge() ?: lastSeen
            val best = bestFix.get()
            if (best != null && best.isPrecise() && best.accuracy <= GOOD_ACCURACY_M) {
                return best
            }
            if (best != null && best.isPrecise()) {
                val elapsed = timeoutMs - (deadline - System.currentTimeMillis())
                if (elapsed >= 4_000L) return best
            }
            delay(250L)
        }
        return lastSeen ?: resolveForBridge()
    }

    @SuppressLint("MissingPermission")
    fun requestFreshFix() {
        if (!isLocationEnabled()) return
        fetchLastLocationBootstrap()
        startContinuousUpdates()
    }

    fun getBestLocation(): NativeLocation? {
        val resolved = resolveForBridge()
        val now = System.currentTimeMillis()
        val ageMs = resolved?.let { now - it.time } ?: Long.MAX_VALUE
        val acc = resolved?.accuracy ?: Float.MAX_VALUE
        val needsRefresh = resolved == null ||
            ageMs > BEST_STALE_MS ||
            acc > GOOD_ACCURACY_M ||
            (!resolved.isPrecise() && ageMs > 5_000L)
        if (needsRefresh) requestFreshFix()
        return resolved
    }

    fun getLastKnownHighAccuracy(): NativeLocation? = getBestLocation()

    fun updateCache(loc: Location) {
        absorbLocation(loc, fromBootstrap = false)
    }

    fun resolveForBridge(): NativeLocation? {
        val best = bestFix.get()
        val bootstrap = bootstrapFix.get()
        val now = System.currentTimeMillis()
        if (best != null && now - best.time <= BEST_STALE_MS) return best
        if (bootstrap != null && now - bootstrap.time <= BOOTSTRAP_STALE_MS) return bootstrap
        return best ?: bootstrap
    }

    @SuppressLint("MissingPermission")
    private fun fetchLastLocationBootstrap() {
        fused.lastLocation
            .addOnSuccessListener { loc ->
                if (loc != null) {
                    Log.d(TAG, "getLastLocation bootstrap accuracy=${loc.accuracy}m")
                    absorbLocation(loc, fromBootstrap = true)
                }
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "getLastLocation failed: ${e.message}")
            }
    }

    private fun absorbLocation(loc: Location, fromBootstrap: Boolean) {
        val acc = when {
            loc.accuracy > 0f -> loc.accuracy
            fromBootstrap -> PRECISE_MAX_ACCURACY_M + 50f
            else -> 999f
        }
        if (acc > REJECT_ACCURACY_M) {
            Log.d(TAG, "Ignored fix accuracy=${acc}m (>${REJECT_ACCURACY_M}m)")
            return
        }

        val isImprecise = acc > PRECISE_MAX_ACCURACY_M
        val native = loc.toNative(acc, fromBootstrap && isImprecise)

        if (!isImprecise) {
            mergeBest(native)
            mergeBootstrap(native)
        } else if (fromBootstrap || bootstrapFix.get() == null) {
            mergeBootstrap(native.copy(isBootstrap = true))
        }
    }

    private fun mergeBest(native: NativeLocation) {
        val current = bestFix.get()
        val replace = when {
            current == null -> true
            native.accuracy < current.accuracy - 2f -> true
            System.currentTimeMillis() - current.time > 25_000L -> true
            else -> false
        }
        if (replace) {
            bestFix.set(native.copy(isBootstrap = false))
            Log.d(TAG, "Best fix accuracy=${native.accuracy}m")
        }
    }

    private fun mergeBootstrap(native: NativeLocation) {
        val current = bootstrapFix.get()
        val replace = current == null ||
            native.accuracy < current.accuracy - 5f ||
            System.currentTimeMillis() - current.time > 30_000L
        if (replace) {
            bootstrapFix.set(native.copy(isBootstrap = true))
        }
    }

    private fun Location.toNative(accuracy: Float, bootstrap: Boolean) = NativeLocation(
        latitude = latitude,
        longitude = longitude,
        accuracy = accuracy,
        altitude = if (hasAltitude()) altitude else 0.0,
        speed = if (hasSpeed()) speed else 0f,
        bearing = if (hasBearing()) bearing else 0f,
        time = time,
        isBootstrap = bootstrap,
    )
}
