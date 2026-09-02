(function (global) {
  'use strict';

  var started = false;
  var v = function () { return global._DAXI_ASSET_V || '20260902m'; };

  var INTERACTION_SCRIPTS = [
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

  function loadOne(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src + (src.indexOf('?') >= 0 ? '' : '?v=' + v());
      s.defer = true;
      s.onload = s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (started) return;
    started = true;
    INTERACTION_SCRIPTS.reduce(function (chain, src) {
      return chain.then(function () { return loadOne(src); });
    }, Promise.resolve());
  }

  function arm() {
    var once = { once: true, passive: true, capture: true };
    document.addEventListener('pointerdown', boot, once);
    document.addEventListener('keydown', boot, once);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
})(typeof window !== 'undefined' ? window : this);
