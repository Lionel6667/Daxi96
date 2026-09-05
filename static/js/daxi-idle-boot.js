(function (global) {
  'use strict';

  var IDLE_SCRIPTS = [
    'daxi-app-api.js',
    'daxi-realtime.js',
    'daxi-notif-policy.js',
    'daxi-notifications.js',
    'daxi-realtime-sync.js',
    'daxi-routes.js',
    'daxi-deeplink-router.js',
    'daxi-places-catalog.js',
    'daxi-maplibre.js',
    'daxi-map-snap.js',
    'daxi-order-card-map.js',
    'daxi-client-gps-core.js',
    'daxi-gps-trace.js',
    'gps-precision-engine.js'
  ];

  var started = false;

  function loadOne(file) {
    return new Promise(function (resolve) {
      var v = global._DAXI_ASSET_V || '20260905a';
      var s = document.createElement('script');
      s.src = '/static/js/' + file + '?v=' + v;
      s.defer = true;
      s.onload = s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (started) return;
    started = true;
    IDLE_SCRIPTS.reduce(function (chain, file) {
      return chain.then(function () { return loadOne(file); });
    }, Promise.resolve());
  }

  function schedule() {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(boot, { timeout: 6500 });
    } else {
      setTimeout(boot, 4000);
    }
  }

  if (document.readyState === 'complete') schedule();
  else global.addEventListener('load', schedule, { once: true });
})(typeof window !== 'undefined' ? window : this);
