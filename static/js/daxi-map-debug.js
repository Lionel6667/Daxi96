
(function (global) {
  'use strict';

  var ENABLED = false;

  function log(tag, detail) {
    if (!ENABLED) return;
    if (detail !== undefined) {
      console.log('[DaxiMap][' + tag + ']', detail);
    } else {
      console.log('[DaxiMap][' + tag + ']');
    }
  }

  function warn(tag, detail) {
    if (!ENABLED) return;
    console.warn('[DaxiMap][' + tag + ']', detail !== undefined ? detail : '');
  }

  global._daxiMapLog = log;
  global._daxiMapWarn = warn;
  global.DaxiMapDebug = { log: log, warn: warn, enabled: ENABLED };
})(typeof window !== 'undefined' ? window : this);