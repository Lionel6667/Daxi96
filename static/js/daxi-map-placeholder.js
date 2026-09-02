
(function (global) {
  'use strict';

  var URLS = {
    dark: '/assets/images/daxi-map-placeholder-dark.webp',
    light: '/assets/images/daxi-map-placeholder-light.png'
  };


  var WATCHERS = {};
  var REVEAL_WATCHERS = {};

  function readTheme(theme) {
    return theme || document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function imageUrl(theme) {
    theme = readTheme(theme);
    return theme === 'light' ? URLS.light : URLS.dark;
  }

  function applyPlaceholderDom(theme) {
    theme = readTheme(theme);
    var url = imageUrl(theme);
    var ph = document.getElementById('daxi-map-placeholder') || document.querySelector('.daxi-map-placeholder');
    if (!ph) return;
    ph.style.backgroundColor = theme === 'light' ? '#f0f4f9' : '#070b14';
    ph.style.setProperty('--daxi-map-ph-url', 'url("' + url + '")');
    var img = document.getElementById('daxi-map-placeholder-img');
    if (!img) {
      img = document.createElement('img');
      img.id = 'daxi-map-placeholder-img';
      img.alt = '';
      img.decoding = 'async';
      img.setAttribute('aria-hidden', 'true');
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:0;';
      ph.insertBefore(img, ph.firstChild);
    }
    if (img.getAttribute('src') !== url) img.src = url;
  }

  function getStage(stageOrId) {
    if (!stageOrId) return null;
    if (typeof stageOrId === 'string') return document.getElementById(stageOrId);
    return stageOrId;
  }

  function resolveMapDiv(mapOrDiv) {
    if (!mapOrDiv) return null;
    try {
      if (typeof mapOrDiv.getDiv === 'function') return mapOrDiv.getDiv();
    } catch (e) {}
    return mapOrDiv.nodeType === 1 ? mapOrDiv : null;
  }

  function isElementVisible(el, opts) {
    opts = opts || {};
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;
    var st = global.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (!opts.ignoreOpacity && parseFloat(st.opacity) < 0.01) return false;
    return true;
  }

  function mergeMapSignals(local, external) {
    local = local || { idle: false, tiles: false };
    external = external || {};
    return {
      idle: !!(local.idle || external.idle),
      tiles: !!(local.tiles || external.tiles)
    };
  }

  function gmHasPaintedTiles(gm, minW, minH) {
    if (!gm) return false;
    var imgs = gm.querySelectorAll('img');
    var i;
    for (i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.src || img.src.indexOf('data:') === 0) continue;
      if (img.naturalWidth > 32 && img.naturalHeight > 32) return true;
      if (img.complete && img.naturalWidth > 0 && (img.offsetWidth > 0 || img.clientWidth > 0)) return true;
    }
    var canvases = gm.querySelectorAll('canvas');
    for (i = 0; i < canvases.length; i++) {
      var c = canvases[i];
      if (c.width < 16 || c.height < 16) continue;
      var cRect = c.getBoundingClientRect();
      if (cRect.width < 8 && cRect.height < 8 && c.offsetWidth < 8 && c.offsetHeight < 8) continue;
      if (c.width >= minW * 0.35 && c.height >= minH * 0.35) return true;
    }
    return false;
  }

  function gmStyleReady(gm, minH) {
    if (!gm) return false;
    var rect = gm.getBoundingClientRect();
    if (rect.width >= 20 && rect.height >= (minH || 40)) return true;
    if ((gm.offsetWidth || 0) >= 20 && (gm.offsetHeight || 0) >= (minH || 40)) return true;
    return false;
  }

  function mapIsVisuallyReady(mapOrDiv, opts) {
    opts = opts || {};
    if (typeof opts.canReveal === 'function' && !opts.canReveal()) return false;

    var map = null;
    var div = null;
    if (mapOrDiv && typeof mapOrDiv.getDiv === 'function') {
      map = mapOrDiv;
      div = resolveMapDiv(map);
    } else {
      div = resolveMapDiv(mapOrDiv);
    }
    if (!div || !isElementVisible(div, { ignoreOpacity: true })) return false;

    var gm = div.querySelector('.gm-style');
    if (!gm) return false;

    var rect = div.getBoundingClientRect();
    var minW = Math.max(20, rect.width * 0.25);
    var minH = Math.max(20, rect.height * 0.25);
    if (gmHasPaintedTiles(gm, minW, minH)) return true;

    var signals = mergeMapSignals(opts.mapSignals, global._daxiMapReady);
    if (map && signals && signals.idle && gmStyleReady(gm, 32)) return true;
    if (map && signals && signals.idle && signals.tiles && gm) {
      if (gmHasPaintedTiles(gm, 12, 12)) return true;
      if (gmStyleReady(gm, 24)) return true;
      var canvases = gm.querySelectorAll('canvas');
      if (canvases.length > 0) {
        for (var j = 0; j < canvases.length; j++) {
          if (canvases[j].width > 12 && canvases[j].height > 12) return true;
        }
      }
    }

    if (map) {
      try {
        if (map.getZoom && map.getZoom() != null && signals && signals.idle) {
          var bounds = map.getBounds && map.getBounds();
          if (bounds && gm.querySelector('canvas, img')) return true;
        }
      } catch (e) {}
    }

    return false;
  }

  function applyTheme(stageOrId, theme) {
    var stage = getStage(stageOrId);
    if (!stage) return;
    theme = readTheme(theme);
    stage.setAttribute('data-map-theme', theme);
    var ph = stage.querySelector('.daxi-map-placeholder, #daxi-map-placeholder, #drv-map-placeholder');
    if (ph) {
      ph.style.background = theme === 'light' ? '#f0f4f9' : '#070b14';
      ph.style.setProperty('--daxi-map-ph-url', 'url("' + imageUrl(theme) + '")');
    }
    stage.style.setProperty('--daxi-map-ph-url', 'url("' + imageUrl(theme) + '")');
    applyPlaceholderDom(theme);
  }

  function stopLiveRevealWatcher(stageOrId) {
    var stage = getStage(stageOrId);
    var key = stage ? (stage.id || String(stageOrId)) : String(stageOrId);
    var w = REVEAL_WATCHERS[key];
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    if (w.mo) {
      try { w.mo.disconnect(); } catch (e) {}
    }
    if (w.gmapListeners && global.google && global.google.maps && global.google.maps.event) {
      w.gmapListeners.forEach(function (handle) {
        try { global.google.maps.event.removeListener(handle); } catch (e) {}
      });
    }
    if (w.domListeners) {
      w.domListeners.forEach(function (pair) {
        try {
          (pair.target || global).removeEventListener(pair.type, pair.fn);
        } catch (e) {}
      });
    }
    delete REVEAL_WATCHERS[key];
  }

  function startLiveRevealWatcher(stageOrId, opts) {
    opts = opts || {};
    var stage = getStage(stageOrId);
    if (!stage) return;
    var key = stage.id || String(stageOrId);
    if (stage.classList.contains('is-live')) return;
    if (REVEAL_WATCHERS[key] && !opts.force) return;
    stopLiveRevealWatcher(key);

    var state = {
      mapSignals: mergeMapSignals({ idle: false, tiles: false }, global._daxiMapReady),
      bindDone: false
    };

    function getMap() {
      return typeof opts.getMap === 'function' ? opts.getMap() : null;
    }

    function getMapEl() {
      if (typeof opts.getMapEl === 'function') return opts.getMapEl();
      var m = getMap();
      if (m && m.getDiv) {
        try { return m.getDiv(); } catch (e) {}
      }
      return stage.querySelector('#daxi-main-map, #map, [data-daxi-map-host]');
    }

    function triggerResize() {
      var m = getMap();
      if (m && global.google && global.google.maps) {
        try { global.google.maps.event.trigger(m, 'resize'); } catch (e) {}
      }
    }

    function tryReveal() {
      if (stage.classList.contains('is-live')) {
        stopLiveRevealWatcher(key);
        return true;
      }
      if (typeof opts.canReveal === 'function' && !opts.canReveal()) return false;
      triggerResize();
      var m = getMap();
      var el = getMapEl();
      if (!mapIsVisuallyReady(m || el, {
        canReveal: opts.canReveal,
        mapSignals: mergeMapSignals(state.mapSignals, global._daxiMapReady)
      })) {
        return false;
      }
      if (typeof opts.onRevealed === 'function') {
        opts.onRevealed(m);
      } else {
        revealLive(stage);
      }
      stopLiveRevealWatcher(key);
      return true;
    }

    function bindMapListeners(map) {
      if (!map || state.bindDone || !global.google || !global.google.maps) return;
      state.bindDone = true;
      var gmaps = global.google.maps.event;
      var onIdle = function () {
        state.mapSignals.idle = true;
        tryReveal();
      };
      var onTiles = function () {
        state.mapSignals.tiles = true;
        tryReveal();
      };
      var w = REVEAL_WATCHERS[key];
      if (!w) return;
      w.gmapListeners = [
        gmaps.addListener(map, 'idle', onIdle),
        gmaps.addListener(map, 'tilesloaded', onTiles)
      ];
    }

    function ensureMapBound() {
      var w = REVEAL_WATCHERS[key];
      if (!w || state.bindDone) return;
      var m = getMap();
      if (m) bindMapListeners(m);
    }

    function scheduleTick() {
      var w = REVEAL_WATCHERS[key];
      if (!w || stage.classList.contains('is-live')) return;
      w.timer = global.setTimeout(function () {
        ensureMapBound();
        tryReveal();
        scheduleTick();
      }, opts.intervalMs != null ? opts.intervalMs : 250);
    }

    var mapEl = getMapEl();
    var mo = null;
    if (mapEl && global.MutationObserver) {
      mo = new MutationObserver(function () {
        ensureMapBound();
        tryReveal();
      });
      try {
        mo.observe(mapEl, { childList: true, subtree: true, attributes: true });
      } catch (e) {}
    }

    var onResize = function () {
      triggerResize();
      tryReveal();
    };
    var onVisible = function () {
      if (!document.hidden) onResize();
    };

    REVEAL_WATCHERS[key] = {
      timer: null,
      mo: mo,
      gmapListeners: [],
      domListeners: [
        { target: global, type: 'resize', fn: onResize },
        { target: document, type: 'visibilitychange', fn: onVisible },
        { target: global, type: 'pageshow', fn: onResize }
      ]
    };

    REVEAL_WATCHERS[key].domListeners.forEach(function (pair) {
      (pair.target || global).addEventListener(pair.type, pair.fn);
    });

    ensureMapBound();
    triggerResize();
    tryReveal();
    scheduleTick();
  }

  function revealLive(stageOrId) {
    if (global._daxiBlockMapPlaceholderMutations && global._daxiBlockMapPlaceholderMutations()) {
      if (typeof global._daxiTryCommitGoogleMapVisible === 'function') {
        global._daxiTryCommitGoogleMapVisible('revealLive-blocked');
      }
      return;
    }
    if (global._daxiGoogleMapHasBeenShown) return;
    var stage = getStage(stageOrId);
    if (!stage) return;
    stopLiveRevealWatcher(stage.id || stageOrId);
    stage.classList.add('is-live');
    document.documentElement.classList.add('daxi-map-live');
    var ph = stage.querySelector('.daxi-map-placeholder, #daxi-map-placeholder, #drv-map-placeholder');
    if (ph) {
      ph.setAttribute('aria-hidden', 'true');
      ph.style.opacity = '0';
      ph.style.visibility = 'hidden';
      ph.style.pointerEvents = 'none';
      global.setTimeout(function () {
        ph.style.display = 'none';
      }, 600);
    }
    hideOfflineModal(stage);
    stopWatchdog(stage.id || stageOrId);
  }

  function resetLive(stageOrId) {
    if (global._daxiGoogleMapHasBeenShown) return;
    if (global._daxiBlockMapPlaceholderMutations && global._daxiBlockMapPlaceholderMutations()) return;
    var stage = getStage(stageOrId);
    if (!stage) return;
    stopLiveRevealWatcher(stage.id || stageOrId);
    stage.classList.remove('is-live');
    document.documentElement.classList.remove('daxi-map-live');
    var ph = stage.querySelector('.daxi-map-placeholder, #daxi-map-placeholder, #drv-map-placeholder');
    if (ph) {
      ph.setAttribute('aria-hidden', 'false');
      ph.style.removeProperty('display');
      ph.style.removeProperty('opacity');
      ph.style.removeProperty('visibility');
      ph.style.removeProperty('pointer-events');
    }
  }

  function showSwapPlaceholder(stageOrId, theme) {
    if (global._daxiGoogleMapHasBeenShown) {
      applyTheme(stageOrId, theme);
      return;
    }
    if (global._daxiBlockMapPlaceholderMutations && global._daxiBlockMapPlaceholderMutations()) {
      applyTheme(stageOrId, theme);
      return;
    }
    var stage = getStage(stageOrId);
    if (!stage) return;
    applyTheme(stage, theme);
    resetLive(stageOrId);
  }

  function applyCardSkeleton(skelEl, theme) {
    if (!skelEl) return;
    theme = readTheme(theme);
    skelEl.classList.add('daxi-map-ph-skel');
    skelEl.style.backgroundImage = 'url(' + imageUrl(theme) + ')';
    skelEl.style.backgroundSize = 'cover';
    skelEl.style.backgroundPosition = 'center';
    skelEl.innerHTML = '';
  }

  function hideOfflineModal(stageOrHost) {
    var host = getStage(stageOrHost) || stageOrHost;
    if (!host || !host.querySelector) return;
    var sheet = host.querySelector('.daxi-map-offline-sheet');
    if (sheet) sheet.remove();
  }

  function showOfflineModal(stageOrHost, opts) {
    opts = opts || {};
    if (global.DaxiNetworkBanner) {
      if (!global.DaxiNetworkBanner.isOffline()) return;
      global.DaxiNetworkBanner.scheduleShowIfStillOffline();
      return;
    }
    if (global.navigator && global.navigator.onLine && typeof global._daxiNativeOnline !== 'boolean') return;
    if (typeof global._daxiNativeOnline === 'boolean' && global._daxiNativeOnline) return;
    var host = getStage(stageOrHost) || stageOrHost;
    if (!host) return;
    hideOfflineModal(host);
    var theme = readTheme(opts.theme);
    var isLight = theme === 'light';
    var sheet = document.createElement('div');
    sheet.className = 'daxi-map-offline-sheet ' + (isLight ? 'is-light' : 'is-dark');
    sheet.innerHTML = ''
      + '<div class="daxi-map-offline-card" role="dialog" aria-label="Carte hors ligne">'
      + '<div class="daxi-map-offline-icon"><i class="ri-wifi-off-line"></i></div>'
      + '<p class="daxi-map-offline-copy"><span class="daxi-map-offline-title">Hors ligne</span></p>'
      + '<button type="button" class="daxi-map-offline-retry" data-daxi-map-retry aria-label="Réessayer">'
      + '<i class="ri-refresh-line"></i></button>'
      + '</div>';
    host.appendChild(sheet);
    var btn = sheet.querySelector('[data-daxi-map-retry]');
    if (btn) {
      btn.addEventListener('click', function () {
        hideOfflineModal(host);
        if (typeof opts.onRetry === 'function') opts.onRetry();
      });
    }
  }

  function stopWatchdog(key) {
    if (!key) return;
    if (WATCHERS[key]) {
      clearTimeout(WATCHERS[key].timer);
      delete WATCHERS[key];
    }
  }

  function startWatchdog(stageOrId, opts) {
    opts = opts || {};
    var stage = getStage(stageOrId);
    if (!stage) return;
    var key = stage.id || String(stageOrId);
    stopWatchdog(key);
    var ms = opts.ms != null ? opts.ms : 10000;
    WATCHERS[key] = {
      timer: global.setTimeout(function () {
        delete WATCHERS[key];
        if (typeof opts.isReady === 'function' && opts.isReady()) return;
        if (global.DaxiNetworkBanner) {
          if (global.DaxiNetworkBanner.isOffline()) {
            global.DaxiNetworkBanner.scheduleShowIfStillOffline();
          }
          if (typeof opts.onTimeout === 'function') opts.onTimeout();
          return;
        }
        if (global.navigator && global.navigator.onLine) return;
        showOfflineModal(stage, {
          theme: opts.theme,
          onRetry: opts.onRetry
        });
        if (typeof opts.onTimeout === 'function') opts.onTimeout();
      }, ms)
    };
  }

  function bindThemeSync(stageOrId) {
    document.addEventListener('daxi-theme-change', function (evt) {
      applyTheme(stageOrId, evt && evt.detail && evt.detail.theme);
      document.querySelectorAll('.daxi-map-ph-skel').forEach(function (el) {
        applyCardSkeleton(el, evt && evt.detail && evt.detail.theme);
      });
    });
  }

  global._daxiMapHasRenderedTiles = mapIsVisuallyReady;

  global.DaxiMapPlaceholder = {
    URLS: URLS,
    readTheme: readTheme,
    imageUrl: imageUrl,
    applyPlaceholderDom: applyPlaceholderDom,
    applyTheme: applyTheme,
    mapIsVisuallyReady: mapIsVisuallyReady,
    startLiveRevealWatcher: startLiveRevealWatcher,
    stopLiveRevealWatcher: stopLiveRevealWatcher,
    revealLive: revealLive,
    resetLive: resetLive,
    showSwapPlaceholder: showSwapPlaceholder,
    applyCardSkeleton: applyCardSkeleton,
    showOfflineModal: showOfflineModal,
    hideOfflineModal: hideOfflineModal,
    startWatchdog: startWatchdog,
    stopWatchdog: stopWatchdog,
    bindThemeSync: bindThemeSync
  };

  function bootPlaceholders() {
    try {
      applyTheme('daxi-map-stage');
      applyPlaceholderDom();
      bindThemeSync('daxi-map-stage');
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPlaceholders);
  } else {
    bootPlaceholders();
  }
})(typeof window !== 'undefined' ? window : this);