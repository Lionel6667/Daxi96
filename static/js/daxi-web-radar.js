
(function (global) {
  'use strict';

  function isNative() {
    try {
      var ua = navigator.userAgent || '';
      if (/DaxiAndroid\//i.test(ua)) return true;
      if (global.DaxiAndroid || global._daxiCapacitorApp) return true;
      if (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()) {
        return true;
      }
      if (document.documentElement && document.documentElement.classList.contains('daxi-native-shell')) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function hasOwnBoot() {
    return !!(document.getElementById('initialLoader') || document.getElementById('splash'));
  }

  function isAppSurface() {
    var p = (location.pathname || '').toLowerCase();
    return (
      p === '/' ||
      p.indexOf('/driver') === 0 ||
      p.indexOf('/chauffeur') === 0 ||
      p.indexOf('/entreprise') === 0 ||
      p.indexOf('/admin') === 0 ||
      p.indexOf('/compte') === 0
    );
  }

  function mount() {
    if (isNative() || !isAppSurface() || hasOwnBoot() || document.getElementById('daxi-web-radar')) return;
    var el = document.createElement('div');
    el.id = 'daxi-web-radar';
    el.className = 'daxi-web-radar';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="daxi-gps-boot__stage">' +
      '<span class="daxi-gps-boot__ring"></span>' +
      '<span class="daxi-gps-boot__ring r2"></span>' +
      '<span class="daxi-gps-boot__ring r3"></span>' +
      '<span class="daxi-gps-boot__dot"></span>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
    var gone = false;
    var dismiss = function () {
      if (gone) return;
      gone = true;
      el.classList.add('is-dismissed');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 500);
    };
    if (document.readyState === 'complete') {
      setTimeout(dismiss, 900);
    } else {
      global.addEventListener('load', function () {
        setTimeout(dismiss, 700);
      });
    }
    setTimeout(dismiss, 2400);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})(typeof window !== 'undefined' ? window : this);
