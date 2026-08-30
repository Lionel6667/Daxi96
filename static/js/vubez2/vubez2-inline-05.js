(function(){
  window._daxiLoaderDismissed = false;
  window._daxiLoaderStartedAt = Date.now();
  window._DAXI_LOADER_MIN_MS = 700;
  window._daxiBootState = window._daxiBootState || {};
  if (window._daxiBootState.mapReady == null) window._daxiBootState.mapReady = false;
  if (window._daxiBootState.routesReady == null) window._daxiBootState.routesReady = true;
  if (window._daxiBootState.ordersReady == null) window._daxiBootState.ordersReady = false;
  if (typeof window._daxiResetMapReadyFlags === 'function') window._daxiResetMapReadyFlags(false, false);
  window._daxiMapDismissTimer = null;
  if (typeof _daxiBootLoadOrders === 'function') _daxiBootLoadOrders();
  if (!window._daxiDismissInitialLoader) {
    window._daxiDismissInitialLoader = function() {
      if (window._daxiIntroPlaying) {
        window._daxiLoaderDismissQueued = true;
        if (typeof window._daxiBootMark === 'function') window._daxiBootMark('loader-dismiss-deferred');
        if (!window._daxiLoaderFlushBound) {
          window._daxiLoaderFlushBound = true;
          var flush = function() {
            if (window._daxiLoaderDismissQueued && window._daxiDismissInitialLoader) {
              window._daxiLoaderDismissQueued = false;
              window._daxiDismissInitialLoader();
            }
          };
          window.addEventListener('daxi:intro-complete', flush, { once: true });
          document.addEventListener('daxi:intro-complete', flush, { once: true });
        }
        return;
      }
      if (window._daxiLoaderDismissed) return;
      window._daxiLoaderDismissed = true;
      if (typeof window._daxiBootMark === 'function') window._daxiBootMark('loader-dismiss');
      document.documentElement.classList.remove('daxi-booting');
      var loader = document.getElementById('initialLoader');
      if (loader) {
        loader.classList.add('is-dismissed');
        loader.style.pointerEvents = 'none';
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        setTimeout(function(){ loader.style.display = 'none'; }, 550);
      }
    };
    if (window._daxiIntroPromise) {
      window._daxiIntroPromise.then(function () {
        if (window._daxiBootVisualQueued && typeof window._daxiFinishClientBootVisual === 'function') {
          window._daxiBootVisualQueued = false;
          window._daxiFinishClientBootVisual();
        }
        
        
        var boot = window._daxiBootState || {};
        var ready = !!(window._clientBgMap || boot.mapReady || window._daxiOfflineMapMode || window._daxiExternalMapsBlocked);
        if (ready) {
          if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
          return;
        }
        setTimeout(function () {
          if (!window._daxiLoaderDismissed && window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
        }, 1200);
      });
    }
  }
  window._daxiFinishClientBootVisual = function() {
    if (window._daxiIntroPlaying) {
      window._daxiBootVisualQueued = true;
      if (!window._daxiBootVisualIntroBound) {
        window._daxiBootVisualIntroBound = true;
        var resumeVisual = function() {
          if (window._daxiBootVisualQueued && typeof window._daxiFinishClientBootVisual === 'function') {
            window._daxiBootVisualQueued = false;
            window._daxiFinishClientBootVisual();
          }
        };
        window.addEventListener('daxi:intro-complete', resumeVisual, { once: true });
        document.addEventListener('daxi:intro-complete', resumeVisual, { once: true });
      }
      return;
    }
    var stage = document.getElementById('daxi-map-stage');
    var revealed = stage && stage.classList.contains('is-live');
    if (window._daxiBootVisualDone && revealed) return;
    var boot = window._daxiBootState || {};
    var mapUsable = !!(window._clientBgMap && window.google && google.maps);
    var shellReady = !!(boot.mapReady || window._daxiOfflineMapMode || window._daxiExternalMapsBlocked || window._clientBgMap);
    if (!shellReady && !mapUsable) return;
    if (window._daxiOfflineMapMode || window._daxiExternalMapsBlocked || (boot.mapReady && !mapUsable)) {
      var nativeApp = !!(window._daxiCapacitorApp || (window._daxiIsNativeApp && window._daxiIsNativeApp()));
      if (nativeApp && !window._daxiGoogleMapHasBeenShown && !mapUsable) {
        _daxiScheduleMapRevealCheck();
        return;
      }
      if (!window._daxiLoaderDismissed && window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
      _daxiScheduleMapRevealCheck();
      return;
    }
    if (!mapUsable && !shellReady) return;
    var elapsed = Date.now() - (window._daxiLoaderStartedAt || 0);
    var wait = Math.max(0, (window._DAXI_LOADER_MIN_MS || 1400) - elapsed);
    setTimeout(function() {
      var stageNow = document.getElementById('daxi-map-stage');
      var liveNow = stageNow && stageNow.classList.contains('is-live');
      if (window._daxiBootVisualDone && liveNow) return;
      window._daxiBootVisualDone = true;
      if (!window._daxiLoaderDismissed && window._daxiDismissInitialLoader) {
        window._daxiDismissInitialLoader();
      }
      setTimeout(function() {
        _daxiScheduleMapRevealCheck();
        var isNative = window._daxiIsNativeApp && window._daxiIsNativeApp();
        if (isNative && window.DaxiAndroid && DaxiAndroid.notifyMapReady && _daxiIsGoogleMapVisuallyReady()) {
          DaxiAndroid.notifyMapReady();
        }
      }, 420);
    }, wait);
  };
  if (!window._daxiTryDismissInitialLoader) {
    window._daxiTryDismissInitialLoader = function() {
      if (typeof window._daxiFinishClientBootVisual === 'function') {
        window._daxiFinishClientBootVisual();
      }
    };
  }
  window._daxiOnNativeAppRevealed = function() {
    if (window._daxiIntroPlaying) {
      if (!window._daxiNativeRevealQueued) {
        window._daxiNativeRevealQueued = true;
        var resumeReveal = function() {
          window._daxiNativeRevealQueued = false;
          if (window._daxiOnNativeAppRevealed) window._daxiOnNativeAppRevealed();
        };
        window.addEventListener('daxi:intro-complete', resumeReveal, { once: true });
        document.addEventListener('daxi:intro-complete', resumeReveal, { once: true });
      }
      return;
    }
    if (window._daxiNativeAppRevealed) return;
    window._daxiNativeAppRevealed = true;
    if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
    if (typeof _daxiEnsureGoogleMapSized === 'function') _daxiEnsureGoogleMapSized('native-ready');
    if (typeof _daxiMaybeAskLocation === 'function') _daxiMaybeAskLocation();
    if (typeof window._daxiLoadGoogleMaps === 'function' && !window._clientBgMap) {
      window._daxiLoadGoogleMaps();
    }
  };
  window._daxiOnNativeLocationGranted = function(lat, lng, acc) {
    if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
    if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
    if (typeof _markGeoGranted === 'function') _markGeoGranted();
    window._daxiPendingNativeGpsBoot = false;
    _daxiGpsFinalized = false;
    _daxiGpsLocked = false;
    _clientGpsBootStarted = false;
    if (lat != null && lng != null && typeof _placeClientPickupOnMap === 'function') {
        _placeClientPickupOnMap(+lat, +lng, {
            acc: acc != null ? +acc : 250,
            forcePan: true,
            source: 'native_grant',
            allowStale: true
        });
    }
    if (typeof _bootClientGps === 'function') _bootClientGps();
  };
  window._daxiOnNativeGpsFix = function(p) {
    if (!p || p.lat == null || p.lng == null) return;
    var firstFix = !window._clientGpsPannedOnce;
    if (typeof _placeClientPickupOnMap === 'function') {
        _placeClientPickupOnMap(+p.lat, +p.lng, {
            acc: p.accuracy != null ? +p.accuracy : 250,
            source: 'native_watch',
            allowStale: true,
            forcePan: firstFix || !!window._daxiForceGpsPanOnce
        });
    }
    if ((firstFix || window._daxiCommanderGpsFocusPending) && typeof _daxiFocusMapOnReadyGps === 'function') {
        _daxiFocusMapOnReadyGps('native-gps');
    }
  };
  window._daxiOnNativeLocationDenied = function() {
    window._daxiPendingNativeGpsBoot = false;
    var enableBtn = document.getElementById('locEnableBtn');
    if (enableBtn) {
      enableBtn.disabled = false;
      var span = enableBtn.querySelector('span');
      if (span && span.dataset.origLabel) span.textContent = span.dataset.origLabel;
    }
    if (window._daxiNativePermissionHost) return;
  };
  window._daxiOnNativeLocationManual = function() {
    if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
    if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
    var destinationSwitch = document.getElementById('destinationSwitch');
    var destinationField = document.getElementById('destinationField');
    if (destinationSwitch) destinationSwitch.checked = true;
    if (destinationField) destinationField.classList.remove('hidden');
  };
  window._daxiOnNativeLocationSkipped = function() {
    if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
    if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
  };
  setTimeout(function() {
    if (!window._daxiLoaderDismissed && window._daxiDismissInitialLoader) {
      window._daxiDismissInitialLoader();
    }
  }, 10000);

  document.addEventListener('DOMContentLoaded', function() {
    if (!window.DaxiAndroid && typeof _resolveGeoPermission === 'function') {
      _resolveGeoPermission(function(state) {
        
        if (state === 'granted' && typeof _bootClientGps === 'function') {
          if (typeof _daxiGrantGpsUserConsent === 'function') _daxiGrantGpsUserConsent();
          if (window.DaxiWebGps) {
            DaxiWebGps.startSession('CLIENT', { exploitableM: DAXI_GPS_FALLBACK_M, targetAccuracy: DAXI_GPS_TARGET_M, timeoutMs: 15000 });
          }
          _bootClientGps();
        }
      });
    }
  });

  function _daxiMapsApiKey() {
    return (window.DJANGO_CONFIG && window.DJANGO_CONFIG.googleMapsApiKey)
      || window.GOOGLE_MAPS_API_KEY
      || (window.DJANGO_SESSION && window.DJANGO_SESSION.google_maps_key)
      || '';
  }
  function _daxiIsWebBrowserMaps() {
    return !(window._daxiIsNativeApp && window._daxiIsNativeApp());
  }
  function _daxiPrepareMapContainerForGoogle() {
    var el = document.getElementById('daxi-main-map');
    if (!el) return null;
    var overlay = document.getElementById('daxi-map-blocked-overlay');
    if (overlay) overlay.remove();
    if (el.querySelector('[data-daxi-map-blocked-message]') || (!el.querySelector('.gm-style') && el._mapInit && !window._clientBgMap)) {
      el.innerHTML = '';
      el._mapInit = false;
    }
    return el;
  }
  function _daxiIsMapDisplayed() {
    if (typeof _daxiIsGoogleMapVisuallyReady === 'function' && _daxiIsGoogleMapVisuallyReady()) return true;
    var stage = document.getElementById('daxi-map-stage');
    return !!(window._clientBgMap && stage && stage.classList.contains('is-live'));
  }
  function _daxiStopMapsRetryLoop() {
    if (window._daxiMapsRetryTimer) {
      clearInterval(window._daxiMapsRetryTimer);
      window._daxiMapsRetryTimer = null;
    }
  }
  function _daxiClearFailedGmapsScript() {
    if (window.google && window.google.maps) return;
    document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').forEach(function(node) {
      try { node.remove(); } catch (e) {}
    });
    window._daxiMapsLoading = false;
  }
  function _daxiEnsureMainMapLoadRetry(reason) {
    if (reason === 'theme-change') {
      var pendingTheme = window._daxiPendingMapTheme || document.documentElement.getAttribute('data-theme') || 'dark';
      _daxiApplyMapContainerTheme(pendingTheme);
      if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.applyTheme) {
        DaxiMapPlaceholder.applyTheme('daxi-map-stage', pendingTheme);
      }
      if (window._clientBgMap && typeof _daxiApplyClientBgMapTheme === 'function') {
        _daxiApplyClientBgMapTheme(pendingTheme);
      }
      if (!window._clientBgMap && !window._daxiMapsLoading && !window.googleMapsLoaded && typeof window._daxiLoadGoogleMaps === 'function') {
        window._daxiLoadGoogleMaps();
      }
      return;
    }
    if (_daxiIsMapDisplayed()) return;
    if (_daxiCompleteMapsLoadIfReady()) {
      if (window._daxiPendingMapTheme && window._clientBgMap && typeof _daxiApplyClientBgMapTheme === 'function') {
        _daxiApplyClientBgMapTheme(window._daxiPendingMapTheme);
      }
      return;
    }
    if (window.google && window.google.maps && typeof google.maps.Map === 'function') {
      _daxiPrepareMapContainerForGoogle();
      if (typeof initPlacesAutocomplete === 'function') initPlacesAutocomplete();
      else if (typeof _initPlacesAutocompleteAsync === 'function') {
        _initPlacesAutocompleteAsync().catch(function(err) {
          console.error('[Daxi Maps] Places init failed:', err);
        });
      }
      _daxiScheduleMapRevealCheck();
      return;
    }
    console.warn('[DAXI] Carte non affichée (' + (reason || 'retry') + ') — nouvelle tentative…');
    clearTimeout(window._daxiMapsLoadTimeoutId);
    _daxiClearFailedGmapsScript();
    window.googleMapsLoaded = false;
    _daxiStartMapsRetryLoop();
    _daxiRetryMapsConnection();
  }
  window._daxiEnsureMainMapLoadRetry = _daxiEnsureMainMapLoadRetry;
  function _daxiRetryMapsConnection() {
    if (_daxiIsMapDisplayed()) {
      _daxiStopMapsRetryLoop();
      return;
    }
    if (window._daxiMapsLoading && !window.googleMapsLoaded) return;
    if (_daxiCompleteMapsLoadIfReady()) {
      _daxiStopMapsRetryLoop();
      return;
    }
    if (window.google && window.google.maps && typeof google.maps.Map === 'function') {
      _daxiPrepareMapContainerForGoogle();
      if (!window._clientBgMap) {
        if (typeof initPlacesAutocomplete === 'function') initPlacesAutocomplete();
        else if (typeof _initPlacesAutocompleteAsync === 'function') {
          _initPlacesAutocompleteAsync().catch(function(err) {
            console.error('[Daxi Maps] Places init failed:', err);
          });
        }
      }
      _daxiScheduleMapRevealCheck();
      return;
    }
    console.warn('[DAXI] Nouvelle tentative Google Maps…');
    clearTimeout(window._daxiMapsLoadTimeoutId);
    _daxiClearFailedGmapsScript();
    window.googleMapsLoaded = false;
    window._clientBgMap = null;
    _daxiClearMainMapPair();
    window._daxiMapTilesReadySignaled = false;
    window._daxiMapVisualReady = false;
    window._daxiMapPlaceholderHidden = false;
    var el = document.getElementById('daxi-main-map');
    if (el) {
      el._mapInit = false;
      if (!el.querySelector('.gm-style')) el.innerHTML = '';
    }
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.resetLive) {
      DaxiMapPlaceholder.resetLive('daxi-map-stage');
    }
    if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
  }
  function _daxiStartMapsRetryLoop() {
    if (window._daxiMapsRetryTimer) return;
    window._daxiMapsRetryTimer = setInterval(_daxiRetryMapsConnection, 5000);
  }
  function _daxiRestartMapLoadWatchdog() {
    if (!window.DaxiMapPlaceholder || !DaxiMapPlaceholder.startWatchdog) return;
    DaxiMapPlaceholder.startWatchdog('daxi-map-stage', {
      ms: 10000,
      isReady: function() {
        return _daxiIsGoogleMapVisuallyReady();
      },
      onRetry: _daxiRetryMainMapLoad
    });
  }
  function _daxiRetryMainMapLoad() {
    if (window._daxiGoogleMapHasBeenShown) {
      if (typeof _daxiEnsureGoogleMapSized === 'function') _daxiEnsureGoogleMapSized('retry-skipped');
      return;
    }
    if (typeof window._daxiRecoverLiveGoogleMap === 'function') {
      window._daxiRecoverLiveGoogleMap('retry-main-map');
      _daxiRestartMapLoadWatchdog();
      return;
    }
    window._daxiMapsLoading = false;
    window.googleMapsLoaded = false;
    window._clientBgMap = null;
    _daxiClearMainMapPair();
    window._daxiMapTilesReadySignaled = false;
    window._daxiBootVisualDone = false;
    window._daxiMapPlaceholderHidden = false;
    window._daxiMapVisualReady = false;
    var el = document.getElementById('daxi-main-map');
    if (el) el._mapInit = false;
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.resetLive && !window._daxiGoogleMapHasBeenShown) DaxiMapPlaceholder.resetLive('daxi-map-stage');
    try { sessionStorage.removeItem('daxi_maps_probe_failed'); } catch (e) {}
    window._daxiMapsFailCount = 0;
    if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
    _daxiRestartMapLoadWatchdog();
  }
  window._daxiRetryMainMapLoad = _daxiRetryMainMapLoad;
  function _daxiShowWebMapsBlocked(reason) {
    var stage = document.getElementById('daxi-map-stage');
    var el = _daxiPrepareMapContainerForGoogle() || document.getElementById('daxi-main-map');
    if (!el && !stage) return;
    window._daxiOfflineMapMode = false;
    window._clientBgMap = null;
    _daxiClearMainMapPair();
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.mapReady = true;
    window._daxiBootState.routesReady = true;
    if (window.DaxiNetworkBanner && DaxiNetworkBanner.isOffline && DaxiNetworkBanner.isOffline()) {
      DaxiNetworkBanner.scheduleShowIfStillOffline();
    } else if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.showOfflineModal) {
      DaxiMapPlaceholder.showOfflineModal(stage || el.parentElement || el, {
        onRetry: _daxiRetryMainMapLoad
      });
    }
    if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
    else if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
  }
  function _daxiCompleteMapsLoadIfReady() {
    if (!(window.google && window.google.maps && typeof google.maps.Map === 'function')) return false;
    clearTimeout(window._daxiMapsLoadTimeoutId);
    window.googleMapsLoaded = true;
    window._daxiMapsLoading = false;
    window._daxiMapsFailCount = 0;
    _daxiStopMapsRetryLoop();
    try { sessionStorage.removeItem('daxi_maps_probe_failed'); sessionStorage.setItem('daxi_maps_ok', '1'); } catch (e) {}
    var blocked = document.getElementById('daxi-map-blocked-overlay');
    if (blocked) blocked.remove();
    var bgPresent = document.getElementById('daxi-main-map');
    if (bgPresent && !window._clientBgMap) bgPresent._mapInit = false;
    if (typeof initPlacesAutocomplete === 'function') {
      initPlacesAutocomplete();
    } else if (typeof _initPlacesAutocompleteAsync === 'function') {
      _initPlacesAutocompleteAsync().catch(function(err) {
        console.error('[Daxi Maps] Places init failed:', err);
      });
    }
    if (window._daxiPendingMapTheme && window._clientBgMap && typeof _daxiApplyClientBgMapTheme === 'function') {
      _daxiApplyClientBgMapTheme(window._daxiPendingMapTheme);
    }
    _daxiRestartMapLoadWatchdog();
    return true;
  }
  function _daxiClassifyGoogleMapsFailure(reason) {
    var domErr = '';
    try {
      var node = document.querySelector('.gm-err-message, .gm-err-title');
      if (node && node.textContent) domErr = String(node.textContent).replace(/\s+/g, ' ').trim();
    } catch (e) {}
    var map = {
      auth: 'cle refusee / restriction / billing / API non activee',
      missing_key: 'cle absente',
      network: 'erreur reseau',
      timeout: 'timeout chargement',
      import: 'Maps JavaScript API indisponible (importLibrary)',
      quota: 'quota'
    };
    return { code: reason || 'unknown', detail: map[reason] || reason || 'unknown', googleMessage: domErr };
  }
  function _daxiReportGoogleMapsFailure(reason) {
    var info = _daxiClassifyGoogleMapsFailure(reason);
    if (typeof window._daxiMapDevLog === 'function') {
      window._daxiMapDevLog('Google Maps load failed', { code: info.code, detail: info.detail, googleMessage: info.googleMessage || undefined, origin: location.origin });
    } else {
      console.warn('[DAXI MAP] Google Maps load failed', info.code, info.detail);
    }
    window._daxiLastGoogleMapsError = info;
    return info;
  }
  function _daxiHandleMapsFailure(reason) {
    if (_daxiCompleteMapsLoadIfReady()) return;
    window._daxiMapsLoading = false;
    _daxiReportGoogleMapsFailure(reason);
    var preferGoogle = window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps();
    if (preferGoogle) {
      _daxiClearFailedGmapsScript();
      _daxiStartMapsRetryLoop();
      return;
    }
    console.warn('[DAXI] Google Maps indisponible (' + (reason || 'unknown') + ') —', location.hostname);
    if (reason === 'auth' || reason === 'missing_key') {
      _daxiStopMapsRetryLoop();
      if (_daxiIsWebBrowserMaps()) {
        try { sessionStorage.setItem('daxi_maps_probe_failed', '1'); } catch (e) {}
        _daxiShowWebMapsBlocked(reason);
      } else {
        try { sessionStorage.setItem('daxi_maps_probe_failed', '1'); } catch (e) {}
        window._daxiExternalMapsBlocked = true;
        if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
          DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
        }
        if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap();
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
        else if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
      }
      return;
    }
    if (_daxiIsWebBrowserMaps()) {
      _daxiClearFailedGmapsScript();
      _daxiStartMapsRetryLoop();
      _daxiRetryMapsConnection();
      return;
    }
    try { sessionStorage.setItem('daxi_maps_probe_failed', '1'); } catch (e) {}
    window._daxiExternalMapsBlocked = true;
    if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
      DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
    }
    if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap();
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.mapReady = true;
    if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
    else if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
  }
  function _daxiShouldUseOfflineMap() {
    if (location.protocol === 'file:') return !navigator.onLine;
    if (window._daxiCapacitorApp || window._daxiHybridShell || (window._daxiIsNativeApp && window._daxiIsNativeApp())) {
      return false;
    }
    return false;
  }
  function _daxiArmMapsLoadTimeout() {
    clearTimeout(window._daxiMapsLoadTimeoutId);
    var host = location.hostname || '';
    var isNative = window._daxiIsNativeApp && window._daxiIsNativeApp();
    var timeoutMs = (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps())
      ? 20000
      : (isNative ? 8000 : ((/\.ngrok/i.test(host) || host === 'localhost' || host === '127.0.0.1') ? 45000 : 20000));
    window._daxiMapsLoadTimeoutId = setTimeout(function() {
      if (window.googleMapsLoaded) {
        if (window._clientBgMap && typeof window._daxiPlaceholderHide === 'function') {
          window._daxiPlaceholderHide('timeout-force');
        }
        return;
      }
      if (_daxiCompleteMapsLoadIfReady()) return;
      if (window._daxiMapsLoading) _daxiHandleMapsFailure('timeout');
    }, timeoutMs);
  }
  function _daxiShowNativeMap(map) {
    if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) return;
    window._daxiMapLibreReady = true;
    if (map) window._daxiMapLibreBg = map;
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.mapReady = true;
    if (typeof window._daxiForceHideMapPlaceholder === 'function') window._daxiForceHideMapPlaceholder();
    else if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap(true);
    if (map && map.resize) setTimeout(function() { try { map.resize(); } catch (e) {} }, 80);
    if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
  }
  function _daxiLoadGoogleMaps() {
    if (!(window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) && (window._daxiCapacitorApp || window._DAXI_USE_MAPLIBRE)) {
      window._DAXI_USE_MAPLIBRE = true;
      var capEl = document.getElementById('daxi-main-map');
      if (capEl && window.DaxiMapProvider && !window._daxiMapLibreBg) {
        window.DaxiMapProvider.initMapLibreBackground(capEl).then(function(map) {
          if (!map) throw new Error('maplibre');
          _daxiShowNativeMap(map);
        }).catch(function() {
          if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
            DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
          }
          _daxiShowNativeMap(null);
        });
      } else if (window._daxiMapLibreBg) {
        _daxiShowNativeMap(window._daxiMapLibreBg);
      } else {
        _daxiShowNativeMap(null);
      }
      return;
    }
    window.DAXI_USE_GOOGLE_MAPS = true;
    window.DAXI_USE_MAPLIBRE = false;
    window._DAXI_USE_MAPLIBRE = false;
    if (typeof _daxiSetMapPhase === 'function') _daxiSetMapPhase('MAP_LOADING');
    if (typeof _daxiPlaceholderShow === 'function' && !window._daxiPlaceholderInitialLogged) {
      window._daxiPlaceholderInitialLogged = true;
      _daxiPlaceholderShow('initial');
    }
    if (typeof window._daxiMapDevLog === 'function') window._daxiMapDevLog('Starting Google Maps');
    if (window.googleMapsLoaded && window._clientBgMap) return;
    if (window.googleMapsLoaded && !window._clientBgMap) {
      if (typeof _daxiMapWarn === 'function') _daxiMapWarn('loadGoogleMaps-stale-flag-reset');
      window.googleMapsLoaded = false;
    }
    if (typeof _daxiMapLog === 'function') _daxiMapLog('loadGoogleMaps-start', { online: navigator.onLine });
    if (_daxiShouldUseOfflineMap()) {
      if (window.DaxiOffline && DaxiOffline.initSimpleMap) DaxiOffline.initSimpleMap('daxi-main-map');
      window._daxiBootState = window._daxiBootState || {};
      window._daxiBootState.mapReady = true;
      if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
      return;
    }
    var key = _daxiMapsApiKey();
    if (!key) {
      if (window.DAXI_DEBUG) {  }
      if (window._daxiIsNativeApp && window._daxiIsNativeApp()) {
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
          DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
        }
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
      }
      if (!window._daxiMapsKeyWaitBound) {
        window._daxiMapsKeyWaitBound = true;
        document.addEventListener('daxi:bootstrap-ready', function() {
          if (!window.googleMapsLoaded && typeof window._daxiLoadGoogleMaps === 'function') {
            window._daxiLoadGoogleMaps();
          }
        });
        setTimeout(function() {
          if (!window.googleMapsLoaded && !_daxiMapsApiKey() && _daxiIsWebBrowserMaps()) {
            _daxiShowWebMapsBlocked('missing_key');
          }
        }, 5000);
      }
      return;
    }
    _daxiPrepareMapContainerForGoogle();
    if (_daxiCompleteMapsLoadIfReady()) return;
    var existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existingScript) {
      if (window.google && window.google.maps) {
        if (typeof google.maps.Map === 'function') {
          if (_daxiCompleteMapsLoadIfReady()) return;
        } else if (typeof google.maps.importLibrary === 'function') {
          if (!window._daxiMapsLoading) {
            window._daxiMapsLoading = true;
            _daxiArmMapsLoadTimeout();
          }
          google.maps.importLibrary('maps').then(function() {
            _daxiCompleteMapsLoadIfReady();
          }).catch(function() {
            _daxiHandleMapsFailure('import');
          });
          return;
        }
      }
      if (!window._daxiMapsLoading) {
        window._daxiMapsLoading = true;
        _daxiArmMapsLoadTimeout();
      }
      return;
    }
    if (window._daxiMapsLoading) return;
    window._daxiMapsLoading = true;
    var _mapsFailed = false;
    window.gm_authFailure = function() {
      if (_mapsFailed) return;
      _mapsFailed = true;
      clearTimeout(window._daxiMapsLoadTimeoutId);
      setTimeout(function() { _daxiHandleMapsFailure('auth'); }, 400);
    };
    var s = document.createElement('script');
    s.referrerPolicy = 'origin';
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&loading=async&callback=initPlacesAutocomplete';
    s.async = true;
    s.onerror = function() {
      clearTimeout(window._daxiMapsLoadTimeoutId);
      try { s.remove(); } catch (e) {}
      window._daxiMapsLoading = false;
      window._daxiMapsFailCount = (window._daxiMapsFailCount || 0) + 1;
      if (window._daxiMapsFailCount < 6) {
        setTimeout(function() {
          if (window.googleMapsLoaded || window._clientBgMap) return;
          if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
        }, 1200);
        return;
      }
      if (_mapsFailed) return;
      _mapsFailed = true;
      _daxiHandleMapsFailure('network');
    };
    _daxiArmMapsLoadTimeout();
    if (!window._daxiGmapsCallbackWrapped) {
      window._daxiGmapsCallbackWrapped = true;
      var _origCallback = window.initPlacesAutocomplete;
      window.initPlacesAutocomplete = function() {
        var self = this;
        var args = arguments;
        clearTimeout(window._daxiMapsLoadTimeoutId);
        _daxiStopMapsRetryLoop();
        try { sessionStorage.removeItem('daxi_maps_probe_failed'); } catch (e) {}
        window._daxiMapsFailCount = 0;
        var blocked = document.getElementById('daxi-map-blocked-overlay');
        if (blocked) blocked.remove();
        var bgEl = document.getElementById('daxi-main-map');
        if (bgEl) bgEl._mapInit = false;
        window._daxiMapsLoading = false;
        var finish = function() {
          window.googleMapsLoaded = true;
          if (typeof window._daxiMapDevLog === 'function') {
            window._daxiMapDevLog('Google Maps script loaded');
            if (window.google && window.google.maps) window._daxiMapDevLog('google.maps available');
          }
          try { sessionStorage.removeItem('daxi_maps_probe_failed'); sessionStorage.setItem('daxi_maps_ok', '1'); } catch (e) {}
          if (typeof _daxiMapLog === 'function') _daxiMapLog('loadGoogleMaps-callback');
          setTimeout(function() {
            if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.init === 'function') {
              DaxiOrderCardMap.init();
            } else if (typeof initDaxiMaps3D === 'function') {
              initDaxiMaps3D();
            }
            if (typeof _daxiScanLiveTracking === 'function') _daxiScanLiveTracking();
            if (typeof _daxiNotifyGoogleMapsReady === 'function') _daxiNotifyGoogleMapsReady();
          }, 120);
          if (typeof _origCallback === 'function') return _origCallback.apply(self, args);
        };
        if (window.google && window.google.maps && typeof google.maps.importLibrary === 'function' && typeof google.maps.Map !== 'function') {
          Promise.all([
            google.maps.importLibrary('maps'),
            google.maps.importLibrary('geometry'),
            google.maps.importLibrary('places'),
            google.maps.importLibrary('marker')
          ]).then(function() { finish(); }).catch(function() { finish(); });
          return;
        }
        return finish();
      };
    }
    document.head.appendChild(s);
    _daxiRestartMapLoadWatchdog();
  }
    window._daxiLoadGoogleMaps = _daxiLoadGoogleMaps;
    window._daxiStartMapsRetryLoop = _daxiStartMapsRetryLoop;
    window._daxiStopMapsRetryLoop = _daxiStopMapsRetryLoop;
  document.addEventListener('daxi:bootstrap-ready', function() {
    if (window._daxiGoogleMapHasBeenShown || (window._clientBgMap && window.google && window.google.maps)) {
      return;
    }
    if (!_daxiShouldUseOfflineMap() && typeof _daxiLoadGoogleMaps === 'function') {
      window._daxiOfflineMapMode = false;
      _daxiLoadGoogleMaps();
    }
  });
  if (_daxiShouldUseOfflineMap()) {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.DaxiOffline && DaxiOffline.initSimpleMap) DaxiOffline.initSimpleMap('daxi-main-map');
      if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
    });
  } else if (_daxiMapsApiKey()) {
    _daxiLoadGoogleMaps();
    _daxiRestartMapLoadWatchdog();
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      _daxiLoadGoogleMaps();
      _daxiRestartMapLoadWatchdog();
    });
  }
  document.addEventListener('DOMContentLoaded', function() {
    if (window.DaxiMapPlaceholder) {
      DaxiMapPlaceholder.applyTheme('daxi-map-stage');
      DaxiMapPlaceholder.bindThemeSync('daxi-map-stage');
    }
  });
})();
