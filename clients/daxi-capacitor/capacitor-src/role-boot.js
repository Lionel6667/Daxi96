(function (global) {
  'use strict';

  function onReady(fn) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function reinitDriver() {
    var page = String(global._daxiShellPage || '');
    if (page !== 'driver') return;
    try {
      if (typeof global.populateSidebar === 'function') global.populateSidebar();
      if (typeof global._initDriverWS === 'function') global._initDriverWS();
      if (typeof global.prefetchDriverOrders === 'function') global.prefetchDriverOrders();
      var key =
        (global.DJANGO_SESSION && global.DJANGO_SESSION.google_maps_key) ||
        global.GOOGLE_MAPS_API_KEY ||
        '';
      if (key && typeof global._loadGoogleMaps === 'function' && typeof global._initDriverMap === 'function') {
        global._loadGoogleMaps(function () {
          if (global.google && global.google.maps && typeof global._initDriverMap === 'function') {
            global._initDriverMap();
          }
        });
      }
    } catch (e) {}
  }

  function reinitEnterprise() {
    var page = String(global._daxiShellPage || '');
    if (page !== 'enterprise_dashboard') return;
    try {
      if (typeof global.loadDashboardData === 'function') global.loadDashboardData();
      if (typeof global.loadOrders === 'function') global.loadOrders('active');
      if (typeof global.loadEntPlans === 'function') global.loadEntPlans();
    } catch (e) {}
  }

  function onShellReady() {
    reinitDriver();
    reinitEnterprise();
  }

  global.addEventListener('daxi:shell-context-ready', onShellReady);
  onReady(onShellReady);
})(typeof window !== 'undefined' ? window : this);
