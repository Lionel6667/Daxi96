(function (global) {
  'use strict';

  var started = false;
  var v = function () { return global._DAXI_ASSET_V || '20260902o'; };

  var DEFERRED_CSS = [
    'assets/css/vubez2-core.css?v=' + (global._DAXI_ASSET_V || '20260902o'),
    'assets/css/vubez2-body.css?v=20260902b',
    'assets/css/remixicon-vubez2.css?v=' + (global._DAXI_ASSET_V || '20260902o'),
    'assets/css/aos.css',
    '/static/css/daxi-suggestions-theme.css?v=20260760',
    '/static/css/daxi-theme-subpages.css?v=20260823c',
    '/static/css/daxi-assist-ai.css?v=20260814f',
    '/static/css/daxi-map-theme.css?v=20260731',
    '/static/css/daxi-order-cards.css?v=20260762',
    '/static/css/daxi-checkout-cards.css?v=20260831g',
    '/static/css/daxi-chat.css?v=20260760',
    '/static/css/daxi-network-banner.css?v=20260828d',
    '/static/css/daxi-theme-contrast.css?v=20260828e',
    '/static/css/daxi-lieux.css?v=20260827a'
  ];

  var INTERACTION_SCRIPTS = [
    'assets/js/htmx.min.js',
    '/static/js/daxi-action-buttons.js?v=20260820a',
    '/static/js/daxi-modal.js?v=20260820d',
    '/static/js/daxi-app-api.js',
    '/static/js/daxi-realtime.js',
    '/static/js/daxi-notif-policy.js',
    '/static/js/daxi-notifications.js',
    '/static/js/daxi-realtime-sync.js',
    '/static/js/daxi-routes.js',
    '/static/js/daxi-deeplink-router.js',
    '/static/js/daxi-places-catalog.js',
    '/static/js/daxi-maplibre.js',
    '/static/js/daxi-map-snap.js',
    '/static/js/daxi-order-card-map.js',
    '/static/js/daxi-client-gps-core.js',
    '/static/js/daxi-gps-trace.js',
    '/static/js/gps-precision-engine.js',
    '/static/js/daxi-map-markers.js',
    '/static/js/daxi-map-theme.js',
    '/static/js/daxi-main-map-dual.js',
    '/static/js/daxi-network-banner.js',
    '/static/js/daxi-map-provider.js',
    '/static/js/daxi-phone.js',
    '/static/js/daxi-session-store.js',
    '/static/js/daxi-network-state.js',
    '/static/js/daxi-htmx-csrf.js',
    '/static/js/daxi-shell-role.js',
    '/static/js/daxi-offline.js',
    '/static/js/daxi-countdown.js',
    '/static/js/daxi-auto-i18n.js',
    '/static/js/daxi-push-register.js',
    '/assets/js/aos.js',
    '/static/js/daxi-client-map-ui.js'
  ];

  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'all';
    document.head.appendChild(link);
  }

  function loadOne(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src + (src.indexOf('?') >= 0 ? '' : '?v=' + v());
      if (src.indexOf('htmx') >= 0) {
        s.onerror = function () {
          s.onerror = null;
          s.src = 'https://unpkg.com/htmx.org@2.0.2/dist/htmx.min.js';
          s.onload = function () { resolve(); };
        };
      }
      s.defer = true;
      s.onload = s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function hydrateLazyBgs() {
    document.querySelectorAll('[data-bg]').forEach(function (el) {
      var url = el.getAttribute('data-bg');
      if (url) {
        el.style.backgroundImage = 'url("' + url + '")';
        el.removeAttribute('data-bg');
      }
    });
  }

  function shouldArm(e) {
    if (!e || !e.target || !e.target.closest) return false;
    return !!e.target.closest(
      '#mainTabBar, #orderTaxiBtn, #daxiMenuFab, #daxiMapTapZone, ' +
      '.daxi-map-placeholder, #myPositionBtn, #daxi-map-placeholder-img, ' +
      '.sidebar-menu-item, .tab-bar-btn[data-tab], #destinationAddress, ' +
      '#destinationAddressArrival, .app-sheet'
    );
  }

  function boot() {
    if (started) return;
    started = true;
    DEFERRED_CSS.forEach(loadCss);
    hydrateLazyBgs();
    INTERACTION_SCRIPTS.reduce(function (chain, src) {
      return chain.then(function () { return loadOne(src); });
    }, Promise.resolve());
  }

  function arm() {
    var once = { once: true, passive: true, capture: true };
    document.addEventListener('pointerdown', function (e) {
      if (shouldArm(e)) boot();
    }, once);
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.tab-bar-btn[data-tab], .sidebar-menu-item, #orderTaxiBtn');
      if (btn) boot();
    }, true);
    document.addEventListener('focusin', function (e) {
      var id = e.target && e.target.id;
      if (id === 'destinationAddress' || id === 'destinationAddressArrival') boot();
    }, { once: true, capture: true });
    // Safety net for real users who stare at the map without tapping.
    setTimeout(boot, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }

  global._daxiBootDeferredAssets = boot;
})(typeof window !== 'undefined' ? window : this);
