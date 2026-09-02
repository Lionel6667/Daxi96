(function (global) {
  'use strict';

  var loaded = false;
  var loading = null;
  var v = function () { return global._DAXI_ASSET_V || '20260902t'; };

  var CHUNKS = [
    '/static/js/vubez2/vubez2-inline-04.js',
    '/static/js/vubez2/vubez2-inline-06.js',
    '/static/js/vubez2/vubez2-inline-07.js'
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + '?v=' + v();
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('chunk failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = CHUNKS.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      loaded = true;
      try {
        global.dispatchEvent(new Event('daxi:vubez2-ready'));
      } catch (e) {}
      if (typeof global._daxiLazyLoadPlaces === 'function') {
        global._daxiLazyLoadPlaces();
      }
    }).catch(function () {
      loading = null;
    });
    return loading;
  }

  global._daxiEnsureVubez2Chunks = ensure;

  function stub(name) {
    var impl = function () {
      var args = arguments;
      var self = this;
      return ensure().then(function () {
        var fn = global[name];
        if (fn && fn !== impl && typeof fn === 'function') {
          return fn.apply(self, args);
        }
      });
    };
    impl._daxiStub = true;
    global[name] = impl;
  }

  [
    'tabGoBook', 'tabGoOrders', 'tabGoTarif', 'tabGoAccount',
    'openPlanModal', 'closePlanModal', 'toggleAssistanceFab',
    'handleTouristAttractions', 'initPlacesAutocomplete'
  ].forEach(stub);

  function arm() {
    var once = { once: true, passive: true, capture: true };
    document.addEventListener('pointerdown', function () { ensure(); }, once);
    document.addEventListener('keydown', function () { ensure(); }, once);
    document.addEventListener('focusin', function (e) {
      var id = e.target && e.target.id;
      if (id === 'destinationAddress' || id === 'destinationAddressArrival') ensure();
    }, { once: true, capture: true });
    // Auto-load soon so map/booking work without requiring a lucky tap first.
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(function () { ensure(); }, { timeout: 1200 });
    } else {
      setTimeout(function () { ensure(); }, 700);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
})(typeof window !== 'undefined' ? window : this);
