
(function (global) {
  'use strict';

  var MAIN_TILT = 52;
  var CAP_HAITIEN = { lat: 19.7558, lng: -72.2018 };
  var DEFAULT_ZOOM = 14;
  var MAP_ID = 'c4948b020bfc08331f1cb94e';

  function layerClass(isActive) {
    return 'daxi-main-map-theme-layer' + (isActive ? ' is-main-map-active' : ' is-main-map-hidden');
  }

  function captureView(map) {
    if (!map || !map.getCenter) return null;
    try {
      var c = map.getCenter();
      if (!c) return null;
      return {
        center: { lat: c.lat(), lng: c.lng() },
        zoom: map.getZoom(),
        tilt: map.getTilt ? map.getTilt() : 0,
        heading: map.getHeading ? map.getHeading() : 0
      };
    } catch (e) {
      return null;
    }
  }

  function applyView(map, view) {
    if (!map || !view) return;
    try {
      if (view.center && map.setCenter) map.setCenter(view.center);
      if (view.zoom != null && map.setZoom) map.setZoom(view.zoom);
      if (view.tilt != null && map.setTilt) map.setTilt(view.tilt);
      if (view.heading != null && map.setHeading) map.setHeading(view.heading);
    } catch (e) {}
  }

  function buildMapOptions(theme, restore, paddingFn) {
    theme = theme === 'light' ? 'light' : 'dark';
    var pad = typeof paddingFn === 'function' ? paddingFn(20) : 20;
    var opts = {
      mapId: MAP_ID,
      center: (restore && restore.center) ? restore.center : CAP_HAITIEN,
      zoom: (restore && restore.zoom != null) ? restore.zoom : DEFAULT_ZOOM,
      tilt: (restore && restore.tilt != null) ? restore.tilt : MAIN_TILT,
      heading: (restore && restore.heading != null) ? restore.heading : 0,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      draggable: true,
      zoomControl: false,
      scrollwheel: true,
      disableDoubleClickZoom: false,
      clickableIcons: false,
      headingInteractionEnabled: false,
      tiltInteractionEnabled: false,
      backgroundColor: global.DaxiMapTheme ? global.DaxiMapTheme.mapBgColor(theme) : (theme === 'light' ? '#F0F4F9' : '#070b14'),
      padding: pad
    };
    if (global.DaxiMapTheme && global.DaxiMapTheme.mapColorScheme) {
      opts.colorScheme = global.DaxiMapTheme.mapColorScheme(theme);
    } else if (global.google && global.google.maps && global.google.maps.ColorScheme) {
      opts.colorScheme = theme === 'light' ? global.google.maps.ColorScheme.LIGHT : global.google.maps.ColorScheme.DARK;
    }
    return opts;
  }

  function getMapForTheme(pair, theme) {
    return theme === 'light' ? pair.light : pair.dark;
  }

  function getElForTheme(pair, theme) {
    return theme === 'light' ? pair.lightEl : pair.darkEl;
  }

  function syncInactiveFromActive(pair) {
    if (!pair || pair._syncing) return;
    var active = getMapForTheme(pair, pair.activeTheme);
    var inactiveTheme = pair.activeTheme === 'light' ? 'dark' : 'light';
    var inactive = getMapForTheme(pair, inactiveTheme);
    if (!active || !inactive) return;
    pair._syncing = true;
    applyView(inactive, captureView(active));
    pair._syncing = false;
  }

  function wireMapSync(pair, map) {
    if (!pair || !map || map._daxiDualSyncBound) return;
    map._daxiDualSyncBound = true;
    function onViewChange() {
      if (pair._syncing) return;
      syncInactiveFromActive(pair);
    }
    ['dragend', 'zoom_changed', 'tilt_changed', 'heading_changed'].forEach(function (ev) {
      try { global.google.maps.event.addListener(map, ev, onViewChange); } catch (e) {}
    });
  }

  function ensureThemeMap(pair, theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    if (getMapForTheme(pair, theme)) return getMapForTheme(pair, theme);

    var active = getMapForTheme(pair, pair.activeTheme);
    var view = captureView(active) || {
      center: CAP_HAITIEN,
      zoom: DEFAULT_ZOOM,
      tilt: MAIN_TILT,
      heading: 0
    };
    var el = getElForTheme(pair, theme);
    var map = new global.google.maps.Map(el, buildMapOptions(theme, view, pair._paddingFn));
    applyView(map, view);
    if (theme === 'light') pair.light = map;
    else pair.dark = map;
    wireMapSync(pair, map);
    try {
      global.dispatchEvent(new CustomEvent('daxi-main-map-layer-ready', { detail: { map: map, theme: theme } }));
    } catch (e) {}
    return map;
  }

  function preloadSibling(pair) {
    if (!pair || pair._siblingPreloadStarted) return;
    pair._siblingPreloadStarted = true;
    var other = pair.activeTheme === 'light' ? 'dark' : 'light';
    if (getMapForTheme(pair, other)) {
      pair._siblingReady = true;
      return;
    }
    var active = getMapForTheme(pair, pair.activeTheme);
    if (!active || !global.google || !global.google.maps) return;

    function buildSibling() {
      if (getMapForTheme(pair, other)) {
        pair._siblingReady = true;
        return;
      }
      try {
        ensureThemeMap(pair, other);
        pair._siblingReady = true;
      } catch (e) {
        pair._siblingPreloadStarted = false;
      }
    }

    if (global.google.maps.event) {
      global.google.maps.event.addListenerOnce(active, 'idle', buildSibling);
    } else {
      buildSibling();
    }
  }

  function setActiveTheme(pair, theme, opts) {
    opts = opts || {};
    if (!pair) return null;
    theme = theme === 'light' ? 'light' : 'dark';
    if (pair.activeTheme === theme && !opts.force) {
      return getMapForTheme(pair, theme);
    }
    ensureThemeMap(pair, theme);
    syncInactiveFromActive(pair);
    var showLight = theme === 'light';
    pair.darkEl.className = layerClass(!showLight);
    pair.lightEl.className = layerClass(showLight);
    pair.activeTheme = theme;
    var active = getMapForTheme(pair, theme);
    global._clientBgMap = active;
    global._daxiClientMapTheme = theme;
    if (active && global.google && global.google.maps && global.google.maps.event) {
      try { global.google.maps.event.trigger(active, 'resize'); } catch (e) {}
    }
    return active;
  }

  function create(hostEl, opts) {
    opts = opts || {};
    if (!hostEl || !global.google || !global.google.maps) return null;

    var startTheme = opts.theme || global.document.documentElement.getAttribute('data-theme') || 'dark';
    startTheme = startTheme === 'light' ? 'light' : 'dark';
    hostEl.innerHTML = '';

    var darkEl = document.createElement('div');
    darkEl.id = 'daxi-main-map-dark';
    darkEl.setAttribute('data-map-theme-layer', 'dark');

    var lightEl = document.createElement('div');
    lightEl.id = 'daxi-main-map-light';
    lightEl.setAttribute('data-map-theme-layer', 'light');

    hostEl.appendChild(darkEl);
    hostEl.appendChild(lightEl);

    var restore = opts.restore || null;
    var paddingFn = opts.paddingFn;
    var defaultView = {
      center: (restore && restore.center) ? restore.center : (opts.center || CAP_HAITIEN),
      zoom: (restore && restore.zoom != null) ? restore.zoom : (opts.zoom != null ? opts.zoom : DEFAULT_ZOOM),
      tilt: (restore && restore.tilt != null) ? restore.tilt : (opts.tilt != null ? opts.tilt : MAIN_TILT),
      heading: (restore && restore.heading != null) ? restore.heading : 0
    };

    var pair = {
      dark: null,
      light: null,
      darkEl: darkEl,
      lightEl: lightEl,
      hostEl: hostEl,
      activeTheme: startTheme,
      _paddingFn: paddingFn,
      _syncing: false,
      _siblingPreloadStarted: true,
      _siblingReady: true
    };

    try {
      pair.dark = new global.google.maps.Map(darkEl, buildMapOptions('dark', defaultView, paddingFn));
      pair.light = new global.google.maps.Map(lightEl, buildMapOptions('light', defaultView, paddingFn));
      applyView(pair.dark, defaultView);
      applyView(pair.light, defaultView);
    } catch (e) {
      return null;
    }

    wireMapSync(pair, pair.dark);
    wireMapSync(pair, pair.light);

    darkEl.className = layerClass(startTheme !== 'light');
    lightEl.className = layerClass(startTheme === 'light');

    var activeMap = startTheme === 'light' ? pair.light : pair.dark;
    global._daxiMainMapPair = pair;
    global._clientBgMap = activeMap;
    global._daxiClientMapTheme = startTheme;
    try {
      global.dispatchEvent(new CustomEvent('daxi-main-map-layer-ready', { detail: { map: activeMap, theme: startTheme } }));
    } catch (e2) {}
    return pair;
  }

  function applyTheme(theme) {
    var pair = global._daxiMainMapPair;
    if (!pair) return false;
    setActiveTheme(pair, theme);
    return true;
  }

  function getActiveMap() {
    var pair = global._daxiMainMapPair;
    if (!pair) return global._clientBgMap || null;
    return getMapForTheme(pair, pair.activeTheme);
  }

  function forEachMap(fn) {
    var pair = global._daxiMainMapPair;
    if (pair) {
      if (pair.dark) fn(pair.dark);
      if (pair.light) fn(pair.light);
      return;
    }
    if (global._clientBgMap) fn(global._clientBgMap);
  }

  function focusCapHaitien(opts) {
    opts = opts || {};
    var view = {
      center: CAP_HAITIEN,
      zoom: opts.zoom != null ? opts.zoom : DEFAULT_ZOOM,
      tilt: opts.tilt != null ? opts.tilt : MAIN_TILT,
      heading: 0
    };
    forEachMap(function (m) { applyView(m, view); });
    var active = getActiveMap();
    if (active && global.google && global.google.maps && global.google.maps.event) {
      try { global.google.maps.event.trigger(active, 'resize'); } catch (e) {}
    }
  }

  function fitBounds(bounds, padding) {
    if (!bounds) return;
    forEachMap(function (m) {
      try {
        m.fitBounds(bounds, padding);
        if (m.setTilt) m.setTilt(MAIN_TILT);
        if (m.setHeading) m.setHeading(0);
      } catch (e) {}
    });
  }

  function toggleTilt() {
    var active = getActiveMap();
    if (!active || !active.getTilt) return MAIN_TILT;
    var cur = active.getTilt() || 0;
    var next = cur > 4 ? 0 : MAIN_TILT;
    forEachMap(function (m) {
      try { if (m.setTilt) m.setTilt(next); } catch (e) {}
    });
    return next;
  }

  function destroy() {
    global._daxiMainMapPair = null;
  }

  global.DaxiMainMapDual = {
    CAP_HAITIEN: CAP_HAITIEN,
    MAIN_TILT: MAIN_TILT,
    DEFAULT_ZOOM: DEFAULT_ZOOM,
    create: create,
    applyTheme: applyTheme,
    setActiveTheme: setActiveTheme,
    syncInactiveFromActive: syncInactiveFromActive,
    getActiveMap: getActiveMap,
    forEachMap: forEachMap,
    focusCapHaitien: focusCapHaitien,
    fitBounds: fitBounds,
    toggleTilt: toggleTilt,
    captureView: captureView,
    applyView: applyView,
    destroy: destroy
  };
})(typeof window !== 'undefined' ? window : this);