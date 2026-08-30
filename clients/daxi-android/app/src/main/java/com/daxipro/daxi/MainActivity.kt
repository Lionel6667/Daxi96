package com.daxipro.daxi

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.TextView
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.messaging.FirebaseMessaging
import com.daxipro.daxi.bridge.DaxiJsBridge
import com.daxipro.daxi.databinding.ActivityMainBinding
import com.daxipro.daxi.location.LocationHelper
import com.daxipro.daxi.network.LiveRequestInterceptor
import com.daxipro.daxi.network.MapTileInterceptor
import com.daxipro.daxi.network.NetworkManager
import com.daxipro.daxi.network.NgrokRequestInterceptor
import com.daxipro.daxi.offline.OfflineWebCache
import com.daxipro.daxi.DaxiAppServices
import com.daxipro.daxi.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var networkManager: NetworkManager
    private lateinit var locationHelper: LocationHelper
    private lateinit var webCache: OfflineWebCache
    private var offlineBootstrapJson: String? = null
    private var loadingLiveSite = false
    private var splashHidden = false
    private var pageLoadAt = 0L
    private var contentStarted = false
    private var nativeLocationPromptShown = false
    private var nativeNotifPromptScheduled = false
    private var nativeNotifPromptShown = false
    private var splashHiddenAt = 0L

    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: android.webkit.GeolocationPermissions.Callback? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val locOk = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoCallback?.invoke(pendingGeoOrigin, locOk, false)
        pendingGeoCallback = null
        pendingGeoOrigin = null
        if (locOk) {
            locationHelper.startContinuousUpdates()
            prefetchLocation()
            notifyJsLocationGranted()
        } else {
            notifyJsLocationDenied()
        }
        onNativeLocationFlowFinished()
    }

    private val notificationOnlyLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        getSharedPreferences("daxi_prefs", MODE_PRIVATE).edit()
            .putBoolean("notif_perm_asked", true).apply()
        if (granted) {
            registerFcmToken()
            notifyJsNotificationPermission(true)
        } else {
            notifyJsNotificationPermission(false)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        DaxiAppServices.init(this)
        webCache = OfflineWebCache(this)
        networkManager = NetworkManager(this)
        locationHelper = LocationHelper(this)
        if (hasLocationPermission() && locationHelper.isLocationEnabled()) {
            locationHelper.startContinuousUpdates()
        }
        offlineBootstrapJson = webCache.bundledBootstrapJson()

        setupWebView()
        binding.btnRetry.setOnClickListener {
            loadingLiveSite = false
            splashHidden = false
            contentStarted = false
            startAppContent()
        }
        observeNetwork()
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    webCache.ensureBundledShellCopied()
                    webCache.ensureBundledWebCacheCopied()
                    DaxiAppServices.offlineMapManager.ensureBundledMapCopied()
                    DaxiAppServices.offlineMapManager.ensureStartedBlocking()
                    offlineBootstrapJson = DaxiAppServices.bootstrapRepository.readBootstrapJson()
                        ?: webCache.bundledBootstrapJson()
                }
            } catch (_: Exception) {
                offlineBootstrapJson = webCache.bundledBootstrapJson()
            }
            refreshJsBridge()
            networkManager.start()
            startAppContent()
            prefetchOfflineData()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) binding.webView.goBack()
                else finish()
            }
        })
    }

    private fun setupWebView() {
        val webView = binding.webView
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setGeolocationEnabled(true)
            allowFileAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            userAgentString = userAgentString + " DaxiAndroid/" + BuildConfig.VERSION_NAME
        }
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        refreshJsBridge()

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: android.webkit.GeolocationPermissions.Callback?
            ) {
                if (hasLocationPermission()) {
                    callback?.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    callback?.invoke(origin, false, false)
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                pageLoadAt = System.currentTimeMillis()
                Log.i(MAP_TAG, "[MAP] Shell Loaded")
                binding.webView.visibility = View.VISIBLE
                injectNativeBridge()
                injectLiveBaseUrl()
                patchNgrokAndNativeFetch()
                syncGuestIdFromJs()
                disableWebPullToRefresh()
                binding.root.postDelayed({
                    if (!splashHidden) hideSplash()
                }, 320)
                if (hasLocationPermission()) {
                    locationHelper.startContinuousUpdates()
                    prefetchLocation()
                } else {
                    dismissWebLoader()
                }
                binding.root.postDelayed({ pollUiReadyAndHideSplash() }, 400)
                scheduleSplashFallback(15_000)
                if (loadingLiveSite && networkManager.isOnline) {
                    webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: android.webkit.WebResourceResponse?,
            ) {
                if (request?.isForMainFrame != true) return
                if (loadingLiveSite && (errorResponse?.statusCode ?: 0) >= 400) {
                    loadingLiveSite = false
                    loadOfflineShell()
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame != true) return
                if (loadingLiveSite) {
                    loadingLiveSite = false
                    loadOfflineShell()
                } else {
                    showOfflineOverlay(false)
                }
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest
            ): android.webkit.WebResourceResponse? {
                webCache.interceptCacheFirst(request)?.let { return it }
                interceptOfflineTile(request)?.let { return it }
                if (networkManager.isOnline) {
                    MapTileInterceptor.intercept(request)?.let { return it }
                }
                LiveRequestInterceptor.intercept(request, BuildConfig.DAXI_BASE_URL)?.let { return it }
                if (networkManager.isOnline) {
                    NgrokRequestInterceptor.intercept(request)?.let { return it }
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false


                if (url.startsWith("file://")) return false
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    if (request.isForMainFrame) return true
                    return isInternalDaxiUrl(url)
                }
                return false
            }
        }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermissionFromJs() {
        runOnUiThread {
            if (hasLocationPermission()) {
                locationHelper.startContinuousUpdates()
                prefetchLocation()
                notifyJsLocationGranted()
                onNativeLocationFlowFinished()
                return@runOnUiThread
            }
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    private fun notifyJsLocationGranted() {
        val loc = locationHelper.resolveForBridge()
        val js = if (loc != null) {
            "(function(){if(window._daxiOnNativeLocationGranted)window._daxiOnNativeLocationGranted(${loc.latitude},${loc.longitude},${loc.accuracy});})();"
        } else {
            "(function(){if(window._daxiOnNativeLocationGranted)window._daxiOnNativeLocationGranted();})();"
        }
        binding.webView.post {
            binding.webView.evaluateJavascript(js, null)
        }
    }

    private fun notifyJsLocationDenied() {
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){if(window._daxiOnNativeLocationDenied)window._daxiOnNativeLocationDenied();})();",
                null,
            )
        }
    }

    private fun onMapReadyFromJs() {
        pollUiReadyAndHideSplash()
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){if(window._daxiOnNativeAppRevealed)window._daxiOnNativeAppRevealed();})();",
                null,
            )
        }
    }

    private fun refreshJsBridge() {
        binding.webView.removeJavascriptInterface("DaxiAndroid")
        binding.webView.addJavascriptInterface(
            DaxiJsBridge(
                this,
                locationHelper,
                networkManager,
                offlineBootstrapJson,
                { requestNotificationPermissionOnly() },
                { prefetchOfflineData() },
                { prefetchLocation() },
                { requestLocationPermissionFromJs() },
                { runOnUiThread { onMapReadyFromJs() } },
                { js -> binding.webView.post { binding.webView.evaluateJavascript(js, null) } },
            ),
            "DaxiAndroid"
        )
    }

    private fun isInternalDaxiUrl(url: String): Boolean {
        return url.startsWith(BuildConfig.DAXI_BASE_URL) ||
            url.startsWith("file://") ||
            url.contains("daxipro.com") ||
            url.contains("julmin") ||
            url.contains("daxi") ||
            url.contains("ngrok-free.dev") ||
            url.contains("ngrok-free.app") ||
            url.contains("ngrok.io")
    }

    private fun disableWebPullToRefresh() {
        binding.webView.evaluateJavascript(
            """
            (function(){
              document.documentElement.style.overscrollBehavior = 'none';
              document.body.style.overscrollBehavior = 'none';
              document.body.style.overflow = document.body.style.overflow || 'hidden';
            })();
            """.trimIndent(),
            null
        )
    }

    private fun observeNetwork() {
        lifecycleScope.launch {
            networkManager.snapshot.collectLatest { snap ->
                binding.offlineBanner.isVisible = false
                if (snap.state == NetworkManager.State.ONLINE) {
                    showOfflineOverlay(false)
                    prefetchOfflineData()
                    SyncScheduler.runNow(this@MainActivity)
                }
                injectNetworkStateToJs(snap)
            }
        }
    }

    private fun injectNetworkStateToJs(snap: NetworkManager.Snapshot) {
        val state = snap.state.name
        val online = snap.state == NetworkManager.State.ONLINE
        binding.webView.evaluateJavascript(
            """
            (function(){
              var payload={state:'$state',hasNetwork:${snap.hasNetwork},hasInternet:${snap.hasInternet},backendReachable:${snap.backendReachable}};
              window._daxiNativeOnline=${if (online) "true" else "false"};
              if(window._daxiApplyNativeNetworkState) window._daxiApplyNativeNetworkState(payload);
              else if(!${if (online) "true" else "false"} && window.DaxiOffline && DaxiOffline.applyCachedUi){
                DaxiOffline.applyCachedUi('active');
              }
            })();
            """.trimIndent(),
            null
        )
    }

    private fun showOfflineOverlay(show: Boolean) {
        binding.offlineOverlay.isVisible = false
    }

    private fun scheduleSplashFallback(delayMs: Long) {
        if (splashHidden) return
        binding.root.removeCallbacks(splashFallbackRunnable)
        binding.root.postDelayed(splashFallbackRunnable, delayMs)
    }

    private val splashFallbackRunnable = Runnable {
        if (!splashHidden) hideSplash()
    }

    private fun pollUiReadyAndHideSplash() {
        if (splashHidden) return
        binding.webView.evaluateJavascript(
            """
            (function(){
              var mapOk = window._daxiMapVisualReady === true;
              var sheet = document.getElementById('appSheet');
              var sheetOk = sheet && sheet.offsetHeight > 40;
              var booking = document.getElementById('bookingSection');
              var bookOk = booking && booking.offsetHeight > 40;
              return (mapOk && sheetOk && bookOk) ? '1' : '0';
            })();
            """.trimIndent(),
        ) { value ->
            if (splashHidden) return@evaluateJavascript
            if (value == "\"1\"") {
                val elapsed = System.currentTimeMillis() - pageLoadAt
                val minSplash = 3_200L
                val wait = (minSplash - elapsed).coerceAtLeast(0)
                binding.root.postDelayed({ hideSplash() }, wait)
            } else {
                binding.root.postDelayed({ pollUiReadyAndHideSplash() }, 250)
            }
        }
    }

    private fun scheduleSplashReveal(delayMs: Long) {
        scheduleSplashFallback(delayMs)
    }

    private fun hideSplash() {
        if (splashHidden) return
        splashHidden = true
        splashHiddenAt = System.currentTimeMillis()
        Log.i(MAP_TAG, "[MAP] Splash Hidden")
        binding.splashOverlay.animate().alpha(0f).setDuration(280).withEndAction {
            binding.splashOverlay.isVisible = false
            startNativePermissionFlow()
        }
    }

    private fun dismissWebLoader() {
        binding.webView.evaluateJavascript(
            """
            (function(){
              if(typeof _daxiDismissInitialLoader==='function') _daxiDismissInitialLoader();
              if(typeof _hideLocationSharePrompt==='function') _hideLocationSharePrompt();
            })();
            """.trimIndent(),
            null,
        )
    }

    private fun startNativePermissionFlow() {
        dismissWebLoader()
        if (nativeLocationPromptShown) {
            scheduleNativeNotificationPrompt()
            return
        }
        nativeLocationPromptShown = true
        if (hasLocationPermission()) {
            locationHelper.startContinuousUpdates()
            prefetchLocation()
            notifyJsLocationGranted()
            onNativeLocationFlowFinished()
            return
        }
        showNativeLocationPrompt()
    }

    private fun showNativeLocationPrompt() {
        runOnUiThread {
            showDaxiPermissionDialog(
                title = getString(R.string.perm_location_title),
                message = getString(R.string.perm_location_message),
                primaryLabel = getString(R.string.perm_location_enable),
                onPrimary = { requestLocationPermissionFromJs() },
                secondaryLabel = getString(R.string.perm_location_manual),
                onSecondary = {
                    notifyJsLocationManual()
                    onNativeLocationFlowFinished()
                },
                tertiaryLabel = getString(R.string.perm_location_later),
                onTertiary = {
                    notifyJsLocationSkipped()
                    onNativeLocationFlowFinished()
                },
                cancellable = false,
            )
        }
    }

    private fun onNativeLocationFlowFinished() {
        scheduleNativeNotificationPrompt()
    }

    private fun scheduleNativeNotificationPrompt() {
        if (nativeNotifPromptScheduled) return
        nativeNotifPromptScheduled = true
        val elapsed = System.currentTimeMillis() - splashHiddenAt
        val delay = (30_000L - elapsed).coerceAtLeast(2_000L)
        binding.root.removeCallbacks(nativeNotifPromptRunnable)
        binding.root.postDelayed(nativeNotifPromptRunnable, delay)
    }

    private val nativeNotifPromptRunnable = Runnable {
        maybeShowNativeNotificationPrompt()
    }

    private fun maybeShowNativeNotificationPrompt() {
        if (nativeNotifPromptShown) return
        val prefs = getSharedPreferences("daxi_prefs", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            registerFcmToken()
            if (!prefs.getBoolean("notification_notice_shown", false)) {
                prefs.edit().putBoolean("notification_notice_shown", true).apply()
                notifyJsNotificationPermission(true)
            }
            return
        }
        if (Build.VERSION.SDK_INT < 33) {
            registerFcmToken()
            if (!prefs.getBoolean("notification_notice_shown", false)) {
                prefs.edit().putBoolean("notification_notice_shown", true).apply()
                notifyJsNotificationPermission(true)
            }
            return
        }
        nativeNotifPromptShown = true
        runOnUiThread {
            showDaxiPermissionDialog(
                title = getString(R.string.perm_notif_title),
                message = getString(R.string.perm_notif_message),
                primaryLabel = getString(R.string.perm_notif_enable),
                onPrimary = { requestNotificationPermissionOnly() },
                secondaryLabel = getString(R.string.perm_notif_decline),
                onSecondary = { notifyJsNotificationPermission(false) },
                cancellable = true,
            )
        }
    }

    private fun showDaxiPermissionDialog(
        title: String,
        message: String,
        primaryLabel: String,
        onPrimary: () -> Unit,
        secondaryLabel: String? = null,
        onSecondary: (() -> Unit)? = null,
        tertiaryLabel: String? = null,
        onTertiary: (() -> Unit)? = null,
        cancellable: Boolean = false,
    ) {
        val content = layoutInflater.inflate(R.layout.dialog_daxi_permission, null)
        content.findViewById<TextView>(R.id.dialogTitle).text = title
        content.findViewById<TextView>(R.id.dialogMessage).text = message
        val primaryBtn = content.findViewById<MaterialButton>(R.id.dialogPrimaryBtn)
        val secondaryBtn = content.findViewById<MaterialButton>(R.id.dialogSecondaryBtn)
        val tertiaryBtn = content.findViewById<MaterialButton>(R.id.dialogTertiaryBtn)
        primaryBtn.text = primaryLabel
        val dialog = MaterialAlertDialogBuilder(this, R.style.Theme_Daxi_Dialog)
            .setView(content)
            .setCancelable(cancellable)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        primaryBtn.setOnClickListener {
            dialog.dismiss()
            onPrimary()
        }
        if (!secondaryLabel.isNullOrBlank() && onSecondary != null) {
            secondaryBtn.visibility = View.VISIBLE
            secondaryBtn.text = secondaryLabel
            secondaryBtn.setOnClickListener {
                dialog.dismiss()
                onSecondary()
            }
        }
        if (!tertiaryLabel.isNullOrBlank() && onTertiary != null) {
            tertiaryBtn.visibility = View.VISIBLE
            tertiaryBtn.text = tertiaryLabel
            tertiaryBtn.setOnClickListener {
                dialog.dismiss()
                onTertiary()
            }
        }
        dialog.show()
    }

    private fun notifyJsLocationManual() {
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){if(window._daxiOnNativeLocationManual)window._daxiOnNativeLocationManual();})();",
                null,
            )
        }
    }

    private fun notifyJsLocationSkipped() {
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){if(window._daxiOnNativeLocationSkipped)window._daxiOnNativeLocationSkipped();})();",
                null,
            )
        }
    }

    private fun requestNotificationPermissionOnly() {
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33) {
                val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    registerFcmToken()
                    notifyJsNotificationPermission(true)
                } else {
                    val canShowRationale = ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.POST_NOTIFICATIONS)
                    if (canShowRationale) {
                        notificationOnlyLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {


                        val wasEverAsked = getSharedPreferences("daxi_prefs", MODE_PRIVATE)
                            .getBoolean("notif_perm_asked", false)
                        if (!wasEverAsked) {
                            notificationOnlyLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {

                            showDaxiPermissionDialog(
                                title = getString(R.string.perm_notif_title),
                                message = getString(R.string.perm_notif_settings_message),
                                primaryLabel = getString(R.string.perm_notif_settings_open),
                                onPrimary = {
                                    val intent = android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                        data = android.net.Uri.fromParts("package", packageName, null)
                                    }
                                    startActivity(intent)
                                },
                                secondaryLabel = getString(R.string.perm_notif_decline),
                                onSecondary = { notifyJsNotificationPermission(false) },
                                cancellable = true,
                            )
                        }
                    }
                }
            } else {
                registerFcmToken()
                notifyJsNotificationPermission(true)
            }
        }
    }

    private fun notifyJsNotificationPermission(granted: Boolean) {
        val fn = if (granted) "_daxiOnNativeNotifPermissionGranted" else "_daxiOnNativeNotifPermissionDenied"
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){if(window.$fn)window.$fn();})();",
                null,
            )
        }
    }

    private fun interceptOfflineTile(request: WebResourceRequest): android.webkit.WebResourceResponse? {
        if (request.method != "GET") return null
        val path = request.url.encodedPath ?: return null
        if (!path.contains("/tiles/")) return null
        val host = request.url.host.orEmpty()
        if (host.isNotEmpty() && host != "127.0.0.1" && host != "localhost") return null
        DaxiAppServices.offlineMapManager.ensureStartedBlocking()
        val parsed = DaxiAppServices.offlineMapManager.parseTilePath(path) ?: return null
        val bytes = DaxiAppServices.offlineMapManager.getTileBytes(parsed.first, parsed.second, parsed.third)
            ?: return null
        Log.d(MAP_TAG, "[MAP] Tile ${parsed.first}/${parsed.second}/${parsed.third} loaded")
        return android.webkit.WebResourceResponse(
            "image/png",
            null,
            java.io.ByteArrayInputStream(bytes),
        )
    }

    private fun prefetchLocation() {
        lifecycleScope.launch { locationHelper.refreshHighAccuracy() }
    }

    private var prefetchRunning = false

    private fun pushBootstrapToJs() {
        refreshJsBridge()
        binding.webView.evaluateJavascript(
            """
            (function(){
              try {
                var d=JSON.parse(DaxiAndroid.getOfflineBootstrap()||'{}');
                if(d&&d.ok){
                  window._daxiOfflineData=d;
                  if(window.DaxiOffline){
                    if(DaxiOffline.applyBootstrap) DaxiOffline.applyBootstrap(d);
                    if(DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi('active');
                    if(DaxiOffline.ensureOfflineMap) DaxiOffline.ensureOfflineMap();
                  }
                }
              } catch(e){}
            })();
            """.trimIndent(),
            null,
        )
    }

    private fun syncGuestIdFromJs() {
        binding.webView.evaluateJavascript(
            """
            (function(){
              var gid = localStorage.getItem('daxi_guest_id') || window._daxiGuestId || '';
              if(gid && window.DaxiAndroid && DaxiAndroid.saveGuestId) DaxiAndroid.saveGuestId(gid);
              return gid;
            })();
            """.trimIndent(),
        ) { _ -> }
    }

    private suspend fun readGuestIdFromPrefs(): String? {
        return getSharedPreferences("daxi_prefs", MODE_PRIVATE).getString("guest_id", null)
    }

    private fun prefetchOfflineData() {
        if (prefetchRunning) return
        prefetchRunning = true
        lifecycleScope.launch {
            try {
                offlineBootstrapJson = withContext(Dispatchers.IO) {
                    DaxiAppServices.bootstrapRepository.readBootstrapJson()
                        ?: webCache.bundledBootstrapJson()
                }
                pushBootstrapToJs()

                withContext(Dispatchers.IO) {
                    DaxiAppServices.offlineMapManager.ensureBundledMapCopied()
                    DaxiAppServices.offlineMapManager.ensureStartedBlocking()
                }
                pushBootstrapToJs()

                if (networkManager.isOnline) {
                    syncGuestIdFromJs()
                    val guestId = readGuestIdFromPrefs()
                    val bootstrapOk = withContext(Dispatchers.IO) {
                        DaxiAppServices.syncEngine.syncBootstrapOnly(guestId)
                    }
                    if (bootstrapOk) {
                        offlineBootstrapJson = withContext(Dispatchers.IO) {
                            DaxiAppServices.bootstrapRepository.readBootstrapJson()
                                ?: webCache.bundledBootstrapJson()
                        }
                        pushBootstrapToJs()
                    }
                    launch(Dispatchers.IO) {
                        DaxiAppServices.syncEngine.runHeavySync()
                    }
                }
            } finally {
                prefetchRunning = false
            }
        }
    }

    private fun registerFcmToken() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            getSharedPreferences("daxi_prefs", MODE_PRIVATE)
                .edit()
                .putString("fcm_token", token)
                .apply()
        }
    }


    private fun startAppContent() {
        if (contentStarted && binding.webView.url?.startsWith("file://") == true) return
        contentStarted = true
        splashHidden = false
        binding.splashOverlay.alpha = 1f
        binding.splashOverlay.isVisible = true

        offlineBootstrapJson = DaxiAppServices.bootstrapRepository.readBootstrapJson()
            ?: webCache.bundledBootstrapJson()
        refreshJsBridge()
        injectNetworkStateToJs(networkManager.snapshot.value)
        loadOfflineShell()
    }

    private fun loadOfflineShell() {
        loadingLiveSite = false
        binding.splashStatus.setText(R.string.splash_loading)
        binding.webView.loadUrl(webCache.bestOfflineUrl())
    }
    private fun injectLiveBaseUrl() {
        val base = BuildConfig.DAXI_BASE_URL.replace("'", "\\'")
        val online = networkManager.isOnline
        val state = networkManager.snapshot.value.state.name
        val onlineJs = if (online) "true" else "false"
        binding.webView.evaluateJavascript(
            """
            (function(){
              window._daxiLiveBaseUrl='$base';
              window._daxiNativeOnline=$onlineJs;
              window._daxiHybridShell=true;
              if(window._daxiApplyNativeNetworkState){
                window._daxiApplyNativeNetworkState({state:'$state',hasNetwork:true,hasInternet:$onlineJs,backendReachable:$onlineJs});
              }
              var hybridFile = window._daxiHybridShell && location.protocol === 'file:';
              if($onlineJs && hybridFile){
                window._daxiExternalMapsBlocked=true;
                if(window.DaxiOffline&&DaxiOffline.initSimpleMap) DaxiOffline.initSimpleMap('daxi-main-map',{force:true});
              } else if($onlineJs){
                window._daxiExternalMapsBlocked=false;
                if(typeof window._daxiLoadGoogleMaps==='function') window._daxiLoadGoogleMaps();
                else if(window.DaxiOffline&&DaxiOffline.initSimpleMap) DaxiOffline.initSimpleMap('daxi-main-map',{force:true});
              } else {
                window._daxiExternalMapsBlocked=true;
                if(window.DaxiOffline&&DaxiOffline.initSimpleMap) DaxiOffline.initSimpleMap('daxi-main-map',{force:true});
              }
              if(window.DaxiOffline){
                if(window.DaxiOffline.load) DaxiOffline.load();
                if($onlineJs){
                  if(DaxiOffline.onNetworkReady) DaxiOffline.onNetworkReady();
                } else {
                  if(DaxiOffline.ensureOfflineMap) DaxiOffline.ensureOfflineMap();
                  if(DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi('active');
                }
              }
            })();
            """.trimIndent(),
            null
        )
    }

    private fun patchNgrokAndNativeFetch() {
        binding.webView.evaluateJavascript(
            """
            (function(){
              if(window.__daxiFetchPatched) return;
              window.__daxiFetchPatched = true;
              window._daxiNetLog = function(stage, detail) {
                try {
                  var d = detail || {};
                  var elapsed = d._t0 ? (' +' + (Date.now() - d._t0) + 'ms') : '';
                  console.log('[DAXI_NET] [' + stage + ']' + elapsed, d.method || '', d.url || d.path || '', d.status != null ? ('status=' + d.status) : '', d.error || '');
                } catch(e) {}
              };
              function liveBase(){
                var b = (window._daxiLiveBaseUrl || '').replace(/\/$/,'');
                if(!b && window.DaxiAndroid && DaxiAndroid.getLiveBaseUrl){
                  try { b = String(DaxiAndroid.getLiveBaseUrl() || '').replace(/\/$/,''); } catch(e){}
                }
                return b;
              }
              function absUrl(u){
                if(!u) return u;
                var s = String(u);
                if(s.indexOf('http://')===0 || s.indexOf('https://')===0) return s;
                var live = liveBase();
                if(live && s.charAt(0)==='/') return live + s;
                return s;
              }
              function needsNativeProxy(url, method){
                var m = (method || 'GET').toUpperCase();
                if(m === 'GET' || m === 'HEAD') return false;
                var s = String(url || '');
                var live = liveBase();
                if(s.indexOf('/htmx/') >= 0 || s.indexOf('/api/') >= 0) return true;
                if(live && s.indexOf(live) === 0 && (s.indexOf('/htmx/') >= 0 || s.indexOf('/api/') >= 0)) return true;
                return false;
              }
              window._daxiProxyHttpCbs = window._daxiProxyHttpCbs || {};
              window._daxiOnProxyHttpResult = function(id, status, bodyB64, contentType){
                var cb = window._daxiProxyHttpCbs[id];
                delete window._daxiProxyHttpCbs[id];
                if(!cb) return;
                var text = '';
                try { text = atob(bodyB64 || ''); } catch(e) { text = ''; }
                cb(status|0, text, contentType || 'text/plain');
              };
              function nativeProxy(method, url, body, contentType){
                return new Promise(function(resolve, reject){
                  if(!window.DaxiAndroid || !DaxiAndroid.proxyHttpAsync){
                    reject(new Error('no_native_proxy'));
                    return;
                  }
                  var id = 'p' + Date.now() + '_' + Math.floor(Math.random()*1e6);
                  var t0 = Date.now();
                  window._daxiProxyHttpCbs[id] = function(status, text, ct){
                    window._daxiNetLog('JS_PROXY_RECEIVED', { method: method, url: url, status: status, _t0: t0 });
                    resolve({ status: status, text: text, contentType: ct });
                  };
                  window._daxiNetLog('JS_PROXY_START', { method: method, url: url, _t0: t0 });
                  try {
                    DaxiAndroid.proxyHttpAsync(method, url, body == null ? null : String(body), contentType || '', id);
                  } catch(e) {
                    delete window._daxiProxyHttpCbs[id];
                    reject(e);
                  }
                  setTimeout(function(){
                    if(window._daxiProxyHttpCbs[id]){
                      delete window._daxiProxyHttpCbs[id];
                      reject(new Error('proxy_timeout'));
                    }
                  }, 35000);
                });
              }
              var origFetch = window.fetch;
              if(origFetch){
                window.fetch = function(input, init){
                  init = init || {};
                  var url = typeof input === 'string' ? absUrl(input) : (input && input.url ? absUrl(input.url) : '');
                  var method = (init.method || 'GET').toUpperCase();
                  var t0 = Date.now();
                  if(needsNativeProxy(url, method) && window.DaxiAndroid && DaxiAndroid.proxyHttpAsync){
                    var body = init.body;
                    if(body && typeof body !== 'string'){
                      try { body = String(body); } catch(e) { body = ''; }
                    }
                    var ct = '';
                    try {
                      var h0 = new Headers(init.headers || {});
                      ct = h0.get('Content-Type') || '';
                    } catch(e2) {}
                    return nativeProxy(method, url, body || '', ct || 'application/x-www-form-urlencoded;charset=UTF-8')
                      .then(function(r){
                        return new Response(r.text || '', {
                          status: r.status || 502,
                          statusText: r.status ? 'OK' : 'Bad Gateway',
                          headers: { 'Content-Type': r.contentType || 'text/html' }
                        });
                      });
                  }
                  window._daxiNetLog('JS_REQUEST_START', { method: method, url: url, _t0: t0 });
                  if(typeof input === 'string') input = url;
                  else if(input && input.url) input = new Request(url, input);
                  var h = new Headers(init.headers || {});
                  h.set('ngrok-skip-browser-warning','true');
                  h.set('X-Daxi-Hybrid','1');
                  init.headers = h;
                  init.credentials = init.credentials || 'include';
                  return origFetch(input, init).then(function(res){
                    window._daxiNetLog('JS_RESPONSE_RECEIVED', { method: method, url: url, status: res.status, _t0: t0 });
                    return res;
                  }).catch(function(err){
                    window._daxiNetLog('JS_REQUEST_FAILED', { method: method, url: url, error: String(err), _t0: t0 });
                    throw err;
                  });
                };
              }
              var XO = XMLHttpRequest.prototype.open;
              var XS = XMLHttpRequest.prototype.send;
              var XH = XMLHttpRequest.prototype.setRequestHeader;
              XMLHttpRequest.prototype.open = function(method, url){
                this._daxiMethod = (method || 'GET').toUpperCase();
                this._daxiUrl = absUrl(url);
                this._daxiT0 = Date.now();
                this._daxiHeaders = {};
                this._daxiProxy = needsNativeProxy(this._daxiUrl, this._daxiMethod);
                if(this._daxiProxy){
                  try {
                    Object.defineProperty(this, 'readyState', { configurable: true, get: function(){ return this._daxiReady || 1; } });
                  } catch(e) {}
                  this._daxiReady = 1;
                  return;
                }
                var r = XO.call(this, method, this._daxiUrl);
                try { this.setRequestHeader('ngrok-skip-browser-warning','true'); } catch(e){}
                try { this.setRequestHeader('X-Daxi-Hybrid','1'); } catch(e){}
                return r;
              };
              XMLHttpRequest.prototype.setRequestHeader = function(k, v){
                this._daxiHeaders = this._daxiHeaders || {};
                this._daxiHeaders[k] = v;
                if(this._daxiProxy) return;
                return XH.call(this, k, v);
              };
              XMLHttpRequest.prototype.send = function(body){
                var self = this;
                if(self._daxiProxy){
                  var ct = (self._daxiHeaders && (self._daxiHeaders['Content-Type'] || self._daxiHeaders['content-type'])) || 'application/x-www-form-urlencoded;charset=UTF-8';
                  var payload = body == null ? '' : String(body);
                  nativeProxy(self._daxiMethod, self._daxiUrl, payload, ct).then(function(r){
                    try {
                      Object.defineProperty(self, 'status', { configurable: true, get: function(){ return r.status || 0; } });
                      Object.defineProperty(self, 'readyState', { configurable: true, get: function(){ return 4; } });
                      Object.defineProperty(self, 'responseText', { configurable: true, get: function(){ return r.text || ''; } });
                      Object.defineProperty(self, 'response', { configurable: true, get: function(){ return r.text || ''; } });
                      Object.defineProperty(self, 'responseURL', { configurable: true, get: function(){ return self._daxiUrl; } });
                      self.getAllResponseHeaders = function(){ return 'content-type: ' + (r.contentType || 'text/html'); };
                      self.getResponseHeader = function(name){
                        if(String(name||'').toLowerCase() === 'content-type') return r.contentType || 'text/html';
                        return null;
                      };
                      if(self.onreadystatechange) self.onreadystatechange();
                      if(self.onload) self.onload();
                      self.dispatchEvent(new Event('load'));
                      self.dispatchEvent(new Event('loadend'));
                    } catch(e) {
                      if(self.onerror) self.onerror(e);
                      self.dispatchEvent(new Event('error'));
                      self.dispatchEvent(new Event('loadend'));
                    }
                  }).catch(function(err){
                    window._daxiNetLog('JS_PROXY_FAILED', { method: self._daxiMethod, url: self._daxiUrl, error: String(err) });
                    if(self.onerror) self.onerror(err);
                    try { self.dispatchEvent(new Event('error')); self.dispatchEvent(new Event('loadend')); } catch(e2){}
                  });
                  return;
                }
                var t0 = self._daxiT0 || Date.now();
                window._daxiNetLog('JS_REQUEST_START', { method: self._daxiMethod, url: self._daxiUrl, _t0: t0 });
                if(!self._daxiNetHooked){
                  self._daxiNetHooked = true;
                  self.addEventListener('loadend', function(){
                    window._daxiNetLog('JS_RESPONSE_RECEIVED', { method: self._daxiMethod, url: self._daxiUrl, status: self.status, _t0: t0 });
                  });
                  self.addEventListener('error', function(){
                    window._daxiNetLog('JS_REQUEST_FAILED', { method: self._daxiMethod, url: self._daxiUrl, error: 'xhr_error', _t0: t0 });
                  });
                  self.addEventListener('timeout', function(){
                    window._daxiNetLog('JS_REQUEST_FAILED', { method: self._daxiMethod, url: self._daxiUrl, error: 'xhr_timeout', _t0: t0 });
                  });
                }
                try { this.setRequestHeader('ngrok-skip-browser-warning','true'); } catch(e){}
                try { this.setRequestHeader('X-Daxi-Hybrid','1'); } catch(e){}
                return XS.call(this, body);
              };
              document.body.addEventListener('htmx:configRequest', function(evt){
                if(!evt.detail) return;
                var live = liveBase();
                if(!live) return;
                var p = evt.detail.path || (evt.detail.pathInfo && evt.detail.pathInfo.requestPath);
                if(p && String(p).charAt(0)==='/') evt.detail.path = absUrl(p);
                evt.detail.headers = evt.detail.headers || {};
                evt.detail.headers['ngrok-skip-browser-warning'] = 'true';
                evt.detail.headers['X-Daxi-Hybrid'] = '1';
              }, true);
            })();
            """.trimIndent(),
            null
        )
    }

    private fun injectNativeBridge() {
        binding.webView.evaluateJavascript(
            """
            (function(){
              if(window.__daxiNativeInjected) return;
              window.__daxiNativeInjected = true;
              window._daxiNativePermissionHost = true;
              document.documentElement.classList.add('daxi-native-android', 'daxi-native-shell');
              window._daxiHybridShell = true;
              window._daxiUseNativeGps = true;
              if(window.DaxiAndroid && DaxiAndroid.getFcmToken){
                var token = DaxiAndroid.getFcmToken();
                var gid = localStorage.getItem('daxi_guest_id') || '';
                if(token){
                  fetch('/api/notifications/register-device/', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'include',
                    body: JSON.stringify({token: token, guest_id: gid, platform: 'android'})
                  }).catch(function(){});
                }
              }
              if(window.DaxiMapPlaceholder){
                if(DaxiMapPlaceholder.applyPlaceholderDom) DaxiMapPlaceholder.applyPlaceholderDom();
                else if(DaxiMapPlaceholder.applyTheme) DaxiMapPlaceholder.applyTheme('daxi-map-stage');
              }
              if(window._daxiEnsurePushRegistration) window._daxiEnsurePushRegistration();
              if(window.DaxiGuestId && DaxiGuestId.ensure){
                DaxiGuestId.ensure().then(function(gid){
                  if(gid && window._daxiBootPreloadClientOrders) window._daxiBootPreloadClientOrders();
                });
              } else if(window._daxiBootPreloadClientOrders){
                window._daxiBootPreloadClientOrders();
              }
            })();
            """.trimIndent(),
            null
        )
    }

    companion object {
        private const val MAP_TAG = "DaxiMap"
    }

    override fun onDestroy() {
        locationHelper.stopContinuousUpdates()
        networkManager.stop()
        super.onDestroy()
    }
}
