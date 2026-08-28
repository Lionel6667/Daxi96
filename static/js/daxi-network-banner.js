
(function (global) {
  'use strict';

    var SHOW_DELAY_MS = 400;
  var _showTimer = null;
  var _visible = false;
  var _bound = false;

  function readTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function isOffline() {
    if (typeof global._daxiNativeOnline === 'boolean') return !global._daxiNativeOnline;
    if (location.protocol === 'file:') return !global.navigator.onLine;
    return !global.navigator.onLine;
  }

  function clearShowTimer() {
    if (_showTimer) {
      clearTimeout(_showTimer);
      _showTimer = null;
    }
  }

  function hideMapOfflineSheets() {
    if (!global.DaxiMapPlaceholder || !global.DaxiMapPlaceholder.hideOfflineModal) return;
    global.DaxiMapPlaceholder.hideOfflineModal('daxi-map-stage');
    var drv = document.getElementById('drv-map-stage');
    if (drv) global.DaxiMapPlaceholder.hideOfflineModal(drv);
  }

  function applyTheme(el) {
    if (!el) return;
    var theme = readTheme();
    el.classList.toggle('is-light', theme === 'light');
    el.classList.toggle('is-dark', theme !== 'light');
  }

  function ensureBanner() {
    var el = document.getElementById('daxi-network-banner');
    if (el) {
      applyTheme(el);
      return el;
    }
    el = document.createElement('div');
    el.id = 'daxi-network-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = ''
      + '<div class="daxi-network-banner__card">'
      + '<div class="daxi-network-banner__icon" aria-hidden="true"><i class="ri-wifi-off-line"></i></div>'
      + '<div class="daxi-network-banner__copy">'
      + '<span class="daxi-network-banner__title">Hors ligne</span>'
      + '<span class="daxi-network-banner__sub">Connexion indisponible</span>'
      + '</div>'
      + '<button type="button" class="daxi-network-banner__retry" aria-label="Réessayer">'
      + '<i class="ri-refresh-line" aria-hidden="true"></i>'
      + '</button>'
      + '</div>';
    applyTheme(el);
    var retry = el.querySelector('.daxi-network-banner__retry');
    if (retry) {
      retry.addEventListener('click', function () {
        hide();
        if (typeof global._daxiRetryMainMapLoad === 'function') {
          global._daxiRetryMainMapLoad();
        } else if (global.DaxiOffline && global.DaxiOffline.onNetworkReady) {
          global.DaxiOffline.onNetworkReady();
        } else if (typeof global._daxiLoadGoogleMaps === 'function') {
          global._daxiLoadGoogleMaps();
        }
        scheduleShowIfStillOffline();
      });
    }
    document.body.appendChild(el);
    return el;
  }

  function show() {
    if (!isOffline()) {
      hide();
      return;
    }
    if (_visible) return;
    _visible = true;
    var el = ensureBanner();
    applyTheme(el);
    hideMapOfflineSheets();
    global.requestAnimationFrame(function () {
      el.classList.add('is-visible');
    });
  }

  function hide() {
    clearShowTimer();
    _visible = false;
    var el = document.getElementById('daxi-network-banner');
    if (!el) return;
    el.classList.remove('is-visible');
    global.setTimeout(function () {
      var node = document.getElementById('daxi-network-banner');
      if (node && !node.classList.contains('is-visible')) node.remove();
    }, 380);
    hideMapOfflineSheets();
  }

  function scheduleShowIfStillOffline() {
    clearShowTimer();
    if (!isOffline()) {
      hide();
      return;
    }
    _showTimer = global.setTimeout(function () {
      _showTimer = null;
      if (isOffline()) show();
      else hide();
    }, SHOW_DELAY_MS);
  }

  function onOnline() {
    hide();
  }

  function onOffline() {
    scheduleShowIfStillOffline();
  }

  function refresh() {
    if (isOffline()) scheduleShowIfStillOffline();
    else hide();
  }

  function bind() {
    if (_bound) return;
    _bound = true;
    global.addEventListener('online', onOnline);
    global.addEventListener('offline', onOffline);
    document.addEventListener('daxi-theme-change', function () {
      applyTheme(document.getElementById('daxi-network-banner'));
    });
    if (isOffline()) scheduleShowIfStillOffline();
    else hide();
  }

  function boot() {
    bind();
  }

  global.DaxiNetworkBanner = {
    SHOW_DELAY_MS: SHOW_DELAY_MS,
    isOffline: isOffline,
    show: show,
    hide: hide,
    refresh: refresh,
    scheduleShowIfStillOffline: scheduleShowIfStillOffline
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);