package com.daxipro.daxi.bridge

import android.content.Context
import android.webkit.JavascriptInterface
import com.daxipro.daxi.BuildConfig
import com.daxipro.daxi.DaxiAppServices
import com.daxipro.daxi.location.LocationHelper
import com.daxipro.daxi.location.NativeLocation
import com.daxipro.daxi.network.DaxiNetLog
import com.daxipro.daxi.network.NetworkManager
import com.daxipro.daxi.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID


class DaxiJsBridge(
    private val context: Context,
    private val locationHelper: LocationHelper,
    private val networkManager: NetworkManager,
    private val offlineJson: String?,
    private val onRequestNotificationPermission: () -> Unit,
    private val onTriggerOfflineSync: () -> Unit,
    private val onRefreshLocation: () -> Unit,
    private val onRequestLocationPermission: () -> Unit,
    private val onNotifyMapReady: () -> Unit,
    private val onEvalJs: ((String) -> Unit)? = null,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        DaxiAppServices.init(context)
    }

    @JavascriptInterface
    fun getCurrentLocation(): String {
        if (!locationHelper.isLocationEnabled()) {
            return JSONObject()
                .put("error", "gps_disabled")
                .put("message", "Activez le GPS dans les paramètres du téléphone")
                .toString()
        }
        if (!hasLocationPermission()) {
            onRequestLocationPermission()
            return JSONObject()
                .put("error", "no_permission")
                .put("message", "Autorisation de localisation requise")
                .toString()
        }

        locationHelper.startContinuousUpdates()
        val cached = locationHelper.resolveForBridge()
        if (cached != null) {
            recordGpsAsync(cached)
            return locationToJson(cached)
        }

        onRefreshLocation()
        return JSONObject()
            .put("error", "no_location")
            .put("message", "Acquisition GPS en cours…")
            .toString()
    }

    private fun recordGpsAsync(loc: NativeLocation) {
        scope.launch {
            DaxiAppServices.gpsQueue.record(
                loc.latitude,
                loc.longitude,
                loc.accuracy,
                loc.speed,
                loc.bearing,
            )
        }
    }

    private fun hasLocationPermission(): Boolean {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_FINE_LOCATION,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
            androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.ACCESS_COARSE_LOCATION,
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun locationToJson(loc: NativeLocation): String {
        return JSONObject()
            .put("lat", loc.latitude)
            .put("lng", loc.longitude)
            .put("accuracy", loc.accuracy.toDouble())
            .put("altitude", loc.altitude)
            .put("speed", loc.speed.toDouble())
            .put("heading", loc.bearing.toDouble())
            .put("time", loc.time)
            .put("precise", loc.isPrecise())
            .put("bootstrap", loc.isBootstrap)
            .put(
                "source",
                if (loc.isBootstrap) "fused_bootstrap" else "fused_live",
            )
            .toString()
    }

    @JavascriptInterface
    fun saveGuestId(guestId: String?) {
        if (guestId.isNullOrBlank()) return
        context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("guest_id", guestId.trim())
            .apply()
    }

    @JavascriptInterface
    fun getGuestId(): String {
        return context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
            .getString("guest_id", "") ?: ""
    }

    @JavascriptInterface
    fun clearAccountData(): String {
        return try {
            context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
                .edit()
                .remove("guest_id")
                .apply()
            scope.launch {
                DaxiAppServices.outboxRepository.clearAll()
            }
            JSONObject().put("ok", true).toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: "clear_failed").toString()
        }
    }

    @JavascriptInterface
    fun refreshLocation() = onRefreshLocation()

    @JavascriptInterface
    fun requestLocationPermission() = onRequestLocationPermission()

    @JavascriptInterface
    fun notifyMapReady() = onNotifyMapReady()

    @JavascriptInterface
    fun isLocationEnabled(): Boolean = locationHelper.isLocationEnabled()

    @JavascriptInterface
    fun isOnline(): Boolean = networkManager.isOnline

    @JavascriptInterface
    fun getNetworkState(): String {
        val snap = networkManager.snapshot.value
        return JSONObject()
            .put("state", snap.state.name)
            .put("hasNetwork", snap.hasNetwork)
            .put("hasInternet", snap.hasInternet)
            .put("backendReachable", snap.backendReachable)
            .toString()
    }

    @JavascriptInterface
    fun refreshNetworkState() {
        networkManager.refresh()
    }

    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun requestNotificationPermission() = onRequestNotificationPermission()

    @JavascriptInterface
    fun getFcmToken(): String {
        return context.getSharedPreferences("daxi_prefs", Context.MODE_PRIVATE)
            .getString("fcm_token", "") ?: ""
    }

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun getLiveBaseUrl(): String = BuildConfig.DAXI_BASE_URL

    @JavascriptInterface
    fun getOfflineBootstrap(): String = offlineJson ?: "{}"

    @JavascriptInterface
    fun triggerOfflineSync() {
        onTriggerOfflineSync()
        SyncScheduler.runNow(context)
    }

    @JavascriptInterface
    fun enqueueOutbox(jsonPayload: String): String {
        return try {
            val input = JSONObject(jsonPayload)
            val actionType = input.optString("type", "htmx_post")
            val endpoint = input.optString("endpoint", input.optString("path", ""))
            val method = input.optString("method", "POST")
            val body = input.optJSONObject("payload")
                ?: input.optJSONObject("body")
                ?: JSONObject()
            if (actionType == "htmx_post" || actionType == "htmx_form") {
                body.put("path", endpoint.ifBlank { body.optString("path") })
            }
            val clientId = input.optString("id", UUID.randomUUID().toString())
            scope.launch {
                DaxiAppServices.outboxRepository.enqueue(
                    actionType = actionType,
                    endpoint = endpoint,
                    method = method,
                    bodyJson = body.toString(),
                    clientId = clientId,
                )
                if (networkManager.isOnline) SyncScheduler.runNow(context)
            }
            JSONObject().put("ok", true).put("id", clientId).toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: "enqueue_failed").toString()
        }
    }

    @JavascriptInterface
    fun getOutboxCount(): Int {
        return try {
            kotlinx.coroutines.runBlocking {
                DaxiAppServices.outboxRepository.pendingCount()
            }
        } catch (_: Exception) {
            0
        }
    }

    @JavascriptInterface
    fun hasOfflineTiles(): Boolean {
        DaxiAppServices.offlineMapManager.ensureStartedBlocking()
        return DaxiAppServices.offlineMapManager.hasOfflineTiles()
    }

    @JavascriptInterface
    fun getOfflineTileUrl(): String {
        DaxiAppServices.offlineMapManager.ensureStartedBlocking()
        return DaxiAppServices.offlineMapManager.tileUrlTemplate()
    }

    @JavascriptInterface
    fun requestDriverAccess(): String {
        return try {
            val resp = DaxiAppServices.api.postJson("/api/mobile/driver-access/", "{}")
            resp?.toString() ?: JSONObject().put("ok", false).put("error", "network").toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: "error").toString()
        }
    }



    @JavascriptInterface
    fun fetchPlaceDetailsAsync(placeId: String, callbackId: String) {
        DaxiNetLog.i("Android", "REQUEST_START fetchPlaceDetailsAsync placeId=$placeId cb=$callbackId")
        if (placeId.isBlank()) {
            deliverPlaceResult(callbackId, JSONObject().put("error", "empty_place_id").toString())
            return
        }
        scope.launch(Dispatchers.IO) {
            val t0 = System.currentTimeMillis()
            val result = try {
                DaxiAppServices.api.getJson(
                    "/api/places/details/?place_id=${java.net.URLEncoder.encode(placeId, "UTF-8")}"
                ) ?: JSONObject().put("error", "no_response").toString()
            } catch (e: Exception) {
                JSONObject().put("error", e.message ?: "fetch_failed").toString()
            }
            DaxiNetLog.i("Android", "RESPONSE_DELIVERED fetchPlaceDetailsAsync cb=$callbackId elapsed=${System.currentTimeMillis() - t0}ms")
            deliverPlaceResult(callbackId, result)
        }
    }

    private fun deliverPlaceResult(callbackId: String, json: String) {
        deliverJsonToJs("_daxiOnPlaceDetailsResult", callbackId, json)
    }

    private fun deliverJsonToJs(jsFn: String, callbackId: String, json: String) {
        val b64 = android.util.Base64.encodeToString(json.toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP)
        val safeId = callbackId.replace("\\", "\\\\").replace("'", "\\'")
        val js = "(function(){if(window.$jsFn){try{window.$jsFn('$safeId',atob('$b64'));}catch(e){}}})();"
        onEvalJs?.invoke(js)
    }


    @JavascriptInterface
    fun fetchPlacePredictionsAsync(query: String, callbackId: String) {
        DaxiNetLog.i("Android", "REQUEST_START fetchPlacePredictionsAsync q=${query.take(40)} cb=$callbackId")
        if (query.isBlank()) {
            deliverJsonToJs("_daxiOnPlacePredictionsResult", callbackId, "[]")
            return
        }
        scope.launch(Dispatchers.IO) {
            val t0 = System.currentTimeMillis()
            val result = try {
                DaxiAppServices.api.getJson(
                    "/api/places/autocomplete/?q=${java.net.URLEncoder.encode(query, "UTF-8")}"
                ) ?: "[]"
            } catch (e: Exception) {
                DaxiNetLog.e("Android", "fetchPlacePredictionsAsync failed: ${e.message}", e)
                "[]"
            }
            DaxiNetLog.i("Android", "RESPONSE_DELIVERED fetchPlacePredictionsAsync cb=$callbackId bytes=${result.length} elapsed=${System.currentTimeMillis() - t0}ms")
            deliverJsonToJs("_daxiOnPlacePredictionsResult", callbackId, result)
        }
    }


    @JavascriptInterface
    fun proxyHttpAsync(
        method: String,
        url: String,
        body: String?,
        contentType: String?,
        requestId: String,
    ) {
        DaxiNetLog.i("Android", "REQUEST_START proxyHttpAsync $method $url id=$requestId")
        scope.launch(Dispatchers.IO) {
            val abs = when {
                url.startsWith("http://") || url.startsWith("https://") -> url
                url.startsWith("/") -> BuildConfig.DAXI_BASE_URL.trimEnd('/') + url
                else -> BuildConfig.DAXI_BASE_URL.trimEnd('/') + "/" + url
            }
            val (status, text, ct) = DaxiAppServices.api.proxyRaw(
                method = method,
                absoluteUrl = abs,
                body = body,
                contentType = contentType,
                extraHeaders = mapOf("X-Daxi-Hybrid" to "1"),
            )
            val b64 = android.util.Base64.encodeToString(
                text.toByteArray(Charsets.UTF_8),
                android.util.Base64.NO_WRAP,
            )
            val safeId = requestId.replace("\\", "\\\\").replace("'", "\\'")
            val safeCt = ct.replace("\\", "\\\\").replace("'", "\\'")
            val js =
                "(function(){if(window._daxiOnProxyHttpResult){try{window._daxiOnProxyHttpResult('$safeId',$status,'$b64','$safeCt');}catch(e){console.error(e);}}})();"
            onEvalJs?.invoke(js)
        }
    }
}
