package com.daxipro.daxi.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.daxipro.daxi.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * État réseau global : lien réseau, Internet, backend DAXI.
 * ONLINE = backend joignable ; OFFLINE = pas de réseau ; RECONNECTING = réseau mais backend pas encore OK.
 */
class NetworkManager(context: Context) {

    enum class State {
        ONLINE,
        OFFLINE,
        RECONNECTING,
    }

    data class Snapshot(
        val state: State,
        val hasNetwork: Boolean,
        val hasInternet: Boolean,
        val backendReachable: Boolean,
    )

    private val appContext = context.applicationContext
    private val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val probeClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val _snapshot = MutableStateFlow(readSnapshot())
    val snapshot: StateFlow<Snapshot> = _snapshot

    val isOnline: Boolean get() = _snapshot.value.state == State.ONLINE

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = scheduleProbe()
        override fun onLost(network: Network) = scheduleProbe()
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = scheduleProbe()
    }

    fun start() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)
        scheduleProbe()
    }

    fun stop() {
        try {
            cm.unregisterNetworkCallback(callback)
        } catch (_: Exception) {
        }
    }

    fun refresh() {
        scheduleProbe()
    }

    private fun scheduleProbe() {
        scope.launch {
            val snap = readSnapshot(probeBackend = hasInternetCapability())
            _snapshot.value = snap
        }
    }

    private fun hasInternetCapability(): Boolean {
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun readSnapshot(probeBackend: Boolean = hasInternetCapability()): Snapshot {
        val hasNetwork = cm.activeNetwork != null
        val hasInternet = hasInternetCapability()
        val backend = if (probeBackend && hasInternet) probeBackendReachable() else false
        val state = when {
            !hasNetwork || !hasInternet -> State.OFFLINE
            backend -> State.ONLINE
            else -> State.RECONNECTING
        }
        return Snapshot(state, hasNetwork, hasInternet, backend)
    }

    private fun probeBackendReachable(): Boolean {
        val root = BuildConfig.DAXI_BASE_URL.trimEnd('/')
        val url = "$root/api/mobile/bootstrap/?probe=1"
        return try {
            val builder = Request.Builder().url(url).get()
            if (root.contains("ngrok")) {
                builder.header("ngrok-skip-browser-warning", "true")
            }
            probeClient.newCall(builder.build()).execute().use { resp ->
                resp.isSuccessful || resp.code in 400..499
            }
        } catch (_: Exception) {
            false
        }
    }
}
