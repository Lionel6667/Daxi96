
(function (global) {
  'use strict';

  const ENT_MAPS = {};
  let mapsReady = null;

  const LIVE = {
    map: null,
    pollTimer: null,
    lastData: null,
    focusOrderId: null,
    focusDriverId: null,
    returnSection: null,
    returnLabel: null,
    pendingFocusDriverId: null,
    pendingShowAllDrivers: false,
    markers: {},
    polylines: {},
    info: null,
    expanded: false,
    viewportLocked: false,
    initialFitDone: false,
    active: false,
  };

  const TRACK_MAPS = {};
  const ROUTE_CACHE = {};
  let directionsService = null;

  const STATUS_COLOR = {
    pending: '#f59e0b',
    price_proposed: '#3b82f6',
    price_confirmed: '#8b5cf6',
    driver_assigned: '#a855f7',
    on_way: '#3b82f6',
    arrived: '#14b8a6',
    in_progress: '#f59e0b',
    cancelled: '#ef4444',
    completed: '#22c55e',
  };

  const LIVE_STATUSES = ['price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return'];
  const COORD_EPS = 0.00035;

  function readTheme() {
    if (global.DaxiMapTheme) return global.DaxiMapTheme.readTheme();
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function mapOptions(center, zoom) {
    const theme = readTheme();
    const opts = {
      center: center || { lat: 19.759, lng: -72.198 },
      zoom: zoom != null ? zoom : 11,
      mapId: 'c4948b020bfc08331f1cb94e',
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      backgroundColor: global.DaxiMapTheme ? global.DaxiMapTheme.mapBgColor(theme) : (theme === 'light' ? '#F0F4F9' : '#070b14'),
    };
    if (global.google && global.google.maps && global.google.maps.ColorScheme) {
      opts.colorScheme = global.DaxiMapTheme
        ? global.DaxiMapTheme.mapColorScheme(theme)
        : (theme === 'light' ? global.google.maps.ColorScheme.LIGHT : global.google.maps.ColorScheme.DARK);
    }
    if (global.google && global.google.maps && global.google.maps.RenderingType) {
      opts.renderingType = global.google.maps.RenderingType.VECTOR;
    }
    return opts;
  }

  function ensureMapsReady() {
    if (!global.google || !global.google.maps) {
      return Promise.reject(new Error('Google Maps not loaded'));
    }
    if (!mapsReady) {
      mapsReady = global.google.maps.importLibrary('maps').catch(function (e) {
        mapsReady = null;
        throw e;
      });
    }
    return mapsReady;
  }

  function parseCoord(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function normalizeCoordPos(lat, lng) {
    if (lat == null || lng == null) return null;
    let a = +lat;
    let b = +lng;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    if (Math.abs(a) > 35 && Math.abs(b) <= 35) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    return { lat: a, lng: b };
  }

  function pos(lat, lng) {
    return normalizeCoordPos(lat, lng);
  }

  function coordsNear(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.lat - b.lat) < COORD_EPS && Math.abs(a.lng - b.lng) < COORD_EPS;
  }

  function circleIcon(color, scale, label) {
    const icon = {
      path: global.google.maps.SymbolPath.CIRCLE,
      scale: scale || 9,
      fillColor: color,
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    };
    if (label) icon.labelOrigin = new global.google.maps.Point(0, 0);
    return icon;
  }

  function driverMarkerIcon(color) {
    if (global.DaxiMapMarkers && global.DaxiMapMarkers.driverGoogleIcon) {
      return global.DaxiMapMarkers.driverGoogleIcon({ color: color || '#f59e0b', size: 32 });
    }
    return circleIcon(color || '#f59e0b', 9);
  }

  function getDirectionsService() {
    if (!directionsService && global.google && global.google.maps) {
      directionsService = new global.google.maps.DirectionsService();
    }
    return directionsService;
  }

  function routeCacheKey(origin, dest, waypoints) {
    var parts = [origin, dest].concat(waypoints || []).map(function (p) {
      if (!p) return '';
      return (+p.lat).toFixed(4) + ',' + (+p.lng).toFixed(4);
    });
    return parts.join('|');
  }

  function isValidGpsPoint(pt) {
    if (!pt || pt.lat == null || pt.lng == null) return false;
    var lat = +pt.lat;
    var lng = +pt.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    if (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4) return false;
    return true;
  }

  function fetchDrivingRoute(origin, dest, waypoints, options) {
    options = options || {};
    if (!isValidGpsPoint(origin) || !isValidGpsPoint(dest)) return Promise.resolve(null);
    var wps = (waypoints || []).filter(isValidGpsPoint);
    var key = routeCacheKey(origin, dest, wps);
    if (!options.skipCache && ROUTE_CACHE[key]) return Promise.resolve(ROUTE_CACHE[key]);

    if (global.DaxiRoutes && typeof global.DaxiRoutes.computeRoute === 'function') {
      return global.DaxiRoutes.computeRoute(origin, dest, wps).then(function (route) {
        if (!route || !route.path || route.path.length < 2) return null;
        var path = route.path.map(function (pt) {
          return { lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat, lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng };
        });
        if (!options.skipCache) ROUTE_CACHE[key] = path;
        return path;
      });
    }

    return Promise.resolve(null);
  }

  function pinIcon(color, scale) {
    const icon = {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: scale || 1.1,
      anchor: new global.google.maps.Point(12, 22),
    };
    if (global.google && global.google.maps && global.google.maps.Point) {
      icon.labelOrigin = new global.google.maps.Point(12, 9);
    }
    return icon;
  }

  function cardMapPinScale() {
    return 1.4;
  }

  function syncOrderMapLegend(orderId, cfg) {
    const legend = document.getElementById('map-legend-' + orderId);
    if (!legend) return;
    legend.querySelectorAll('[data-leg]').forEach(function (el) {
      const key = el.getAttribute('data-leg');
      let visible = false;
      if (key === 'pickup') visible = !!cfg.pickup;
      else if (key === 'dest') visible = !!cfg.dest;
      else if (key === 'driver') visible = !!cfg.driver;
      el.classList.toggle('is-visible', visible);
      el.classList.toggle('is-missing', !visible);
    });
  }

  function fitMapToPoints(map, points, padding) {
    if (!map || !points || !points.length) return;
    const pad = padding || { top: 56, right: 56, bottom: 56, left: 56 };
    if (points.length === 1) {
      map.setCenter(points[0]);
      const z = map.getZoom();
      if (!z || z > 15) map.setZoom(14);
      return;
    }
    const bounds = new global.google.maps.LatLngBounds();
    points.forEach(function (p) { bounds.extend(p); });
    map.fitBounds(bounds, pad);
    global.google.maps.event.addListenerOnce(map, 'idle', function () {
      if (map.getZoom() > 15) map.setZoom(15);
    });
  }

  function liveOrdersOnly(orders) {
    var now = Date.now();
    var horizon = now + 60 * 60 * 1000;
    return (orders || []).filter(function (o) {
      if (LIVE_STATUSES.indexOf(o.status) < 0) return false;
      if (o.is_later) {
        if (!o.scheduled_at) return false;
        var sched = new Date(o.scheduled_at).getTime();
        if (!Number.isFinite(sched) || sched > horizon) return false;
      }
      return true;
    });
  }

  function liveMapRenderOptions(extra) {
    extra = extra || {};
    var opts = {};
    if (LIVE.focusDriverId) opts.focusDriverId = LIVE.focusDriverId;
    if (extra.forceFit) opts.forceFit = true;
    return opts;
  }

  function syncLiveMapToolbar() {
    var toolbar = document.getElementById('live-map-toolbar');
    var btn = document.getElementById('live-map-back-btn');
    if (!toolbar) return;
    if (LIVE.returnSection) {
      toolbar.hidden = false;
      if (btn) {
        var label = LIVE.returnLabel || 'Retour';
        btn.innerHTML = '<i class="ri-arrow-left-line"></i> ' + escHtml(label);
      }
    } else {
      toolbar.hidden = true;
    }
  }

  function adminLiveMapGoBack() {
    var section = LIVE.returnSection || 'dashboard';
    LIVE.focusDriverId = null;
    LIVE.focusOrderId = null;
    LIVE.pendingFocusDriverId = null;
    LIVE.pendingShowAllDrivers = false;
    LIVE.returnSection = null;
    LIVE.returnLabel = null;
    syncLiveMapToolbar();
    if (typeof global.showAdminSection === 'function') {
      global.showAdminSection(section);
    }
  }

  function orderPositions(o) {
    const pLat = o.meeting_lat != null ? o.meeting_lat : o.pickup_lat;
    const pLng = o.meeting_lng != null ? o.meeting_lng : o.pickup_lng;
    const pickup = pos(pLat, pLng);
    const dest = pos(o.destination_lat, o.destination_lng);
    const driver = (o.driver && o.driver.lat != null && o.driver.lng != null)
      ? pos(o.driver.lat, o.driver.lng) : null;
    let client = null;
    if (o.show_client && o.client_lat != null && o.client_lng != null) {
      client = pos(o.client_lat, o.client_lng);
    }
    if (client && pickup && coordsNear(client, pickup)) {
      client = null;
    }
    const primary = driver || pickup;
    return { pickup: pickup, dest: dest, driver: driver, client: client, primary: primary };
  }

  function trackingPositionsFromDataset(el) {
    const meeting = pos(parseCoord(el.dataset.meetingLat), parseCoord(el.dataset.meetingLng));
    const pickupRaw = pos(parseCoord(el.dataset.pickupLat), parseCoord(el.dataset.pickupLng));
    const pickup = meeting || pickupRaw;
    const dest = pos(parseCoord(el.dataset.destLat), parseCoord(el.dataset.destLng));
    const driver = pos(parseCoord(el.dataset.driverLat), parseCoord(el.dataset.driverLng));
    let client = pos(parseCoord(el.dataset.clientLat), parseCoord(el.dataset.clientLng));
    if (client && pickup && coordsNear(client, pickup)) client = null;
    return {
      pickup: pickup,
      dest: dest,
      driver: driver,
      client: client,
      status: el.dataset.orderStatus || '',
      planStops: [],
    };
  }

  const CARD_MAP_OBSERVERS = new WeakMap();

  function isOrderMapVisible(el) {
    if (!el || !el.isConnected) return false;
    const panel = el.closest('.adm-order-details-panel');
    if (panel && (panel.hidden || !panel.classList.contains('is-open'))) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 48 && rect.height >= 48;
  }

  function buildOrderMapCfg(el) {
    if (!el) return null;
    const cfg = trackingPositionsFromDataset(el);
    if (!cfg.pickup) {
      cfg.pickup = pos(parseCoord(el.dataset.lat), parseCoord(el.dataset.lng));
    }
    cfg.orderId = (el.id || '').replace('map-order-', '');
    cfg.isCardMap = el.dataset.cardMap === 'true';
    cfg.fit = true;
    return cfg;
  }

  function observeCardMapResize(el) {
    if (!global.ResizeObserver || CARD_MAP_OBSERVERS.has(el)) return;
    const wrap = el.closest('.adm-order-map-wrap') || el;
    const ro = new global.ResizeObserver(function () {
      if (!isOrderMapVisible(el)) return;
      const rec = TRACK_MAPS[el.id];
      if (!rec || !rec.map) return;
      const cfg = buildOrderMapCfg(el);
      if (!cfg || (!cfg.pickup && !cfg.dest)) return;
      global.google.maps.event.trigger(rec.map, 'resize');
      drawOrderTrackingOnMap(rec.map, rec.store, cfg);
    });
    ro.observe(wrap);
    CARD_MAP_OBSERVERS.set(el, ro);
  }

  function scheduleCardMapRefit(el) {
    const mapKey = el.id;
    [0, 120, 320].forEach(function (delay) {
      setTimeout(function () {
        if (!isOrderMapVisible(el)) return;
        const rec = TRACK_MAPS[mapKey];
        if (!rec || !rec.map) return;
        const cfg = buildOrderMapCfg(el);
        if (!cfg || (!cfg.pickup && !cfg.dest)) return;
        global.google.maps.event.trigger(rec.map, 'resize');
        drawOrderTrackingOnMap(rec.map, rec.store, cfg);
      }, delay);
    });
  }

  function initOrRefreshOrderMapElement(el) {
    const cfg = buildOrderMapCfg(el);
    if (!cfg || (!cfg.pickup && !cfg.dest)) return Promise.resolve(null);
    if (cfg.isCardMap) observeCardMapResize(el);
    return renderOrderTrackingMap(el, cfg).then(function (map) {
      el.dataset.mapInit = '1';
      if (cfg.isCardMap && map) scheduleCardMapRefit(el);
      return map;
    }).catch(function (e) {
      delete el.dataset.mapInit;
      console.warn('order map:', e);
      el.innerHTML = '<p style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;">Carte indisponible</p>';
      return null;
    });
  }

  function refreshOrderMap(orderId) {
    const el = document.getElementById('map-order-' + orderId);
    if (!el || !isOrderMapVisible(el)) return Promise.resolve(null);
    return initOrRefreshOrderMapElement(el);
  }

  function scheduleOrderMapRefresh(orderId) {
    [50, 180, 400].forEach(function (ms) {
      setTimeout(function () { refreshOrderMap(orderId); }, ms);
    });
  }

  
  function syncEntLocFields(entId) {
    const rec = ENT_MAPS[entId];
    if (!rec || !rec.map) return;
    const c = rec.map.getCenter();
    if (!c) return;
    const lat = c.lat();
    const lng = c.lng();
    const latEl = document.getElementById('adm-ent-lat-' + entId);
    const lngEl = document.getElementById('adm-ent-lng-' + entId);
    const coordEl = document.getElementById('adm-ent-coords-' + entId);
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    if (coordEl) coordEl.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  function destroyEntMap(entId) {
    if (ENT_MAPS[entId]) {
      ENT_MAPS[entId].map = null;
      delete ENT_MAPS[entId];
    }
    const el = document.getElementById('adm-ent-loc-map-' + entId);
    if (el) {
      el.innerHTML = '';
      delete el.dataset.mapInit;
    }
  }

  function initEntMapBlock(block) {
    const entId = block.dataset.entId;
    const mapEl = document.getElementById('adm-ent-loc-map-' + entId);
    if (!mapEl || mapEl.dataset.mapInit) return;

    const lat = parseFloat(block.dataset.lat) || 19.7607;
    const lng = parseFloat(block.dataset.lng) || -72.2039;
    const center = { lat: lat, lng: lng };

    mapEl.dataset.mapInit = '1';
    const map = new global.google.maps.Map(mapEl, mapOptions(center, 16));
    ENT_MAPS[entId] = { map: map, block: block };

    map.addListener('idle', function () { syncEntLocFields(entId); });
    global.google.maps.event.addListenerOnce(map, 'idle', function () { syncEntLocFields(entId); });
  }

  function initEntLocationMaps() {
    return ensureMapsReady().then(function () {
      document.querySelectorAll('.adm-ent-loc-block').forEach(initEntMapBlock);
    }).catch(function (e) { console.warn('admin ent maps:', e); });
  }

  function destroyLiveMapInstance() {
    if (LIVE.pollTimer) {
      clearInterval(LIVE.pollTimer);
      LIVE.pollTimer = null;
    }
    LIVE.map = null;
    LIVE._viewportBound = false;
    LIVE._mapTheme = null;
    clearLiveLayers();
    const container = document.getElementById('admin-live-map');
    if (container) container.innerHTML = '';
  }

  function destroyOrderTrackingMaps() {
    Object.keys(TRACK_MAPS).forEach(function (key) { delete TRACK_MAPS[key]; });
    document.querySelectorAll('[id^="map-order-"][data-map-init]').forEach(function (el) {
      delete el.dataset.mapInit;
      el.innerHTML = '';
    });
    document.querySelectorAll('[id^="sos-map-"][data-map-init]').forEach(function (el) {
      delete el.dataset.mapInit;
      el.innerHTML = '';
    });
  }

  function reinitOrderMapsForTheme() {
    destroyOrderTrackingMaps();
    initAdminOrderMaps();
  }

  function reinitEntMapsForTheme() {
    const ids = Object.keys(ENT_MAPS);
    ids.forEach(destroyEntMap);
    initEntLocationMaps();
  }

  
  function clearMapLayers(store) {
    Object.values(store.markers || {}).forEach(function (m) { m.setMap(null); });
    Object.values(store.polylines || {}).forEach(function (p) { p.setMap(null); });
    store.markers = {};
    store.polylines = {};
    if (store.info) { store.info.close(); store.info = null; }
  }

  function addMapMarker(store, map, key, position, icon, title, zIndex, onClick, label) {
    if (!position || position.lat == null || position.lng == null) return null;
    const opts = {
      map: map,
      position: position,
      icon: icon,
      title: title || '',
      zIndex: zIndex || 100,
    };
    if (label) {
      opts.label = { text: label, color: '#ffffff', fontSize: '11px', fontWeight: '700' };
    }
    const m = new global.google.maps.Marker(opts);
    if (onClick) m.addListener('click', onClick);
    store.markers[key] = m;
    return m;
  }

  function addMapLine(store, map, key, path, color, weight, opacity, dashed) {
    if (!path || path.length < 2) return;
    const opts = {
      map: map,
      path: path,
      strokeColor: color || '#3b82f6',
      strokeOpacity: opacity != null ? opacity : 0.85,
      strokeWeight: weight || 4,
      zIndex: 50,
    };
    if (dashed) {
      opts.icons = [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
        offset: '0',
        repeat: '14px',
      }];
    }
    store.polylines[key] = new global.google.maps.Polyline(opts);
  }

  function drawOrderTrackingOnMap(map, store, cfg) {
    clearMapLayers(store);
    const pickup = cfg.pickup;
    const dest = cfg.dest;
    const driver = cfg.driver;
    const client = cfg.client;
    const status = cfg.status || '';
    const color = STATUS_COLOR[status] || '#3b82f6';
    const id = cfg.orderId || 'x';
    const isCard = !!cfg.isCardMap;
    const pinScale = isCard ? cardMapPinScale() : 1.15;
    const points = [];

    function extend(p) {
      if (p) points.push(p);
    }

    if (pickup) {
      addMapMarker(store, map, 'pickup-' + id, pickup, pinIcon('#22c55e', pinScale), 'Départ', 400, null, 'A');
      extend(pickup);
    }
    if (dest) {
      addMapMarker(store, map, 'dest-' + id, dest, pinIcon('#ef4444', pinScale), 'Arrivée', 390, null, 'B');
      extend(dest);
    }
    if (driver) {
      var driverIcon = driverMarkerIcon(color);
      var driverKey = 'driver-' + id;
      if (cfg.driverMeta && global.DaxiMapMarkers) {
        if (cfg.driverMeta.photo_url && global.DaxiMapMarkers.loadDriverAvatarIcon) {
          addMapMarker(store, map, driverKey, driver, driverIcon, 'Chauffeur', 420);
          global.DaxiMapMarkers.loadDriverAvatarIcon({
            photoUrl: cfg.driverMeta.photo_url,
            initials: (cfg.driverMeta.name || '?').charAt(0),
            color: color,
            size: cfg.driverMeta.size || 28,
          }, function (icon) {
            if (icon && store.markers[driverKey]) store.markers[driverKey].setIcon(icon);
          });
        } else if (global.DaxiMapMarkers.driverAvatarGoogleIcon) {
          driverIcon = global.DaxiMapMarkers.driverAvatarGoogleIcon({
            photoUrl: cfg.driverMeta.photo_url,
            initials: (cfg.driverMeta.name || '?').charAt(0),
            color: color,
            size: cfg.driverMeta.size || 28,
          });
          addMapMarker(store, map, driverKey, driver, driverIcon, 'Chauffeur', 420);
        } else {
          addMapMarker(store, map, driverKey, driver, driverIcon, 'Chauffeur', 420);
        }
      } else {
        addMapMarker(store, map, driverKey, driver, driverIcon, 'Chauffeur', 420);
      }
      extend(driver);
    }
    if (client && !isCard) {
      addMapMarker(store, map, 'client-' + id, client, circleIcon('#06b6d4', 9), 'Client (GPS)', 410);
      extend(client);
    }

    const planStops = cfg.planStops || [];
    planStops.forEach(function (s, i) {
      if (!s || s.lat == null || s.lng == null) return;
      const stopPos = { lat: +s.lat, lng: +s.lng };
      addMapMarker(store, map, 'stop-' + id + '-' + i, stopPos, circleIcon('#a855f7', 8), s.label || ('Étape ' + (i + 1)), 385 + i, null, String(i + 1));
      extend(stopPos);
    });

    const routePath = [];
    if (pickup) routePath.push(pickup);
    planStops.forEach(function (s) {
      if (s && s.lat != null && s.lng != null) routePath.push({ lat: +s.lat, lng: +s.lng });
    });
    if (dest) routePath.push(dest);

    store._routeGen = (store._routeGen || 0) + 1;
    drawRoutedLines(map, store, {
      orderId: id,
      pickup: pickup,
      dest: dest,
      driver: driver,
      status: status,
      planStops: planStops,
      fallbackPath: routePath,
    }, store._routeGen);

    if (cfg.fit !== false && points.length) {
      const pad = isCard
        ? { top: 44, right: 44, bottom: 64, left: 44 }
        : { top: 56, right: 56, bottom: 56, left: 56 };
      fitMapToPoints(map, points, pad);
    }
    if (isCard && id) syncOrderMapLegend(id, { pickup: pickup, dest: dest, driver: driver });
    return points;
  }

  function drawRoutedLines(map, store, cfg, gen) {
    const id = cfg.orderId || 'x';
    const pickup = cfg.pickup;
    const dest = cfg.dest;
    const driver = cfg.driver;
    const status = cfg.status || '';
    const planStops = cfg.planStops || [];
    const fallback = cfg.fallbackPath || [];

    function isStale() {
      return store._routeGen !== gen;
    }

    function drawLeg(key, path, color, weight, opacity, dashed) {
      if (isStale() || !path || path.length < 2) return;
      addMapLine(store, map, key, path, color, weight, opacity, dashed);
    }

    function drawStraightLeg(key, from, to, color, weight, opacity, dashed) {
      if (!from || !to) return;
      drawLeg(key, [from, to], color, weight, opacity, dashed);
    }

    const planWp = planStops
      .filter(function (s) { return s && s.lat != null && s.lng != null; })
      .map(function (s) { return { lat: +s.lat, lng: +s.lng }; });

    const mainPromise = (pickup && dest)
      ? fetchDrivingRoute(pickup, dest, planWp)
      : Promise.resolve(null);

    mainPromise.then(function (path) {
      if (isStale()) return;
      drawLeg('route-' + id, path || (fallback.length >= 2 ? fallback : null), '#fbbf24', 4, 0.85, false);

      let legPromise = Promise.resolve(null);
      if (status === 'on_way' && driver && pickup) {
        legPromise = fetchDrivingRoute(driver, pickup, []);
      } else if (status === 'in_progress' && driver && dest) {
        legPromise = fetchDrivingRoute(driver, dest, []);
      } else if (status === 'arrived' && pickup && dest) {
        legPromise = fetchDrivingRoute(pickup, dest, planWp);
      }
      return legPromise;
    }).then(function (legPath) {
      if (isStale()) return;
      if (status === 'on_way' && driver && pickup) {
        drawLeg('leg-' + id, legPath, '#3b82f6', 5, 0.9, false);
        if (!legPath) drawStraightLeg('leg-' + id, driver, pickup, '#3b82f6', 5, 0.9, false);
      } else if (status === 'in_progress' && driver && dest) {
        drawLeg('leg-' + id, legPath, '#f59e0b', 5, 0.9, false);
        if (!legPath) drawStraightLeg('leg-' + id, driver, dest, '#f59e0b', 5, 0.9, false);
      } else if (status === 'arrived' && pickup && dest) {
        drawLeg('leg-' + id, legPath, '#14b8a6', 4, 0.65, false);
        if (!legPath) drawStraightLeg('leg-' + id, pickup, dest, '#14b8a6', 4, 0.65, true);
      }
    }).catch(function (e) {
      console.warn('admin route:', e);
      if (isStale()) return;
      if (fallback.length >= 2) drawLeg('route-' + id, fallback, '#f59e0b', 4, 0.7, true);
    });
  }

  function renderOrderTrackingMap(containerEl, cfg) {
    if (!containerEl) return Promise.resolve(null);
    const mapKey = containerEl.id || ('track-' + (cfg.orderId || Date.now()));
    const currentTheme = readTheme();
    return ensureMapsReady().then(function () {
      let rec = TRACK_MAPS[mapKey];
      if (rec && rec.theme && rec.theme !== currentTheme) {
        delete TRACK_MAPS[mapKey];
        containerEl.innerHTML = '';
        rec = null;
      }
      if (!rec) {
        containerEl.innerHTML = '';
        const map = new global.google.maps.Map(containerEl, mapOptions(null, 13));
        rec = { map: map, store: { markers: {}, polylines: {} }, theme: currentTheme };
        TRACK_MAPS[mapKey] = rec;
        if (cfg.isCardMap) {
          global.google.maps.event.addListenerOnce(map, 'idle', function () {
            global.google.maps.event.trigger(map, 'resize');
            drawOrderTrackingOnMap(map, rec.store, cfg);
          });
        }
      } else {
        global.google.maps.event.trigger(rec.map, 'resize');
      }
      drawOrderTrackingOnMap(rec.map, rec.store, cfg);
      return rec.map;
    });
  }

  
  function clearLiveLayers() {
    clearMapLayers({ markers: LIVE.markers, polylines: LIVE.polylines, info: LIVE.info });
    LIVE.markers = {};
    LIVE.polylines = {};
    LIVE.info = null;
  }

  function bindLiveMapViewportLock() {
    if (!LIVE.map || LIVE._viewportBound) return;
    LIVE._viewportBound = true;
    LIVE.map.addListener('dragstart', function () { LIVE.viewportLocked = true; });
    LIVE.map.addListener('zoom_changed', function () {
      if (!LIVE._programmaticMove) LIVE.viewportLocked = true;
    });
  }

  function drawFocusedOrder(o, extend) {
    const pos = orderPositions(o);
    const drv = o.driver;
    const cfg = {
      orderId: o.id,
      pickup: pos.pickup,
      dest: pos.dest,
      driver: pos.driver,
      client: pos.client,
      status: o.status,
      planStops: o.plan_stops || [],
      fit: false,
      isCardMap: false,
      driverMeta: drv ? {
        photo_url: drv.photo_url,
        name: drv.name,
        size: 28,
      } : null,
    };
    const store = { markers: LIVE.markers, polylines: LIVE.polylines, info: LIVE.info };
    drawOrderTrackingOnMap(LIVE.map, store, cfg);
    LIVE.markers = store.markers;
    LIVE.polylines = store.polylines;
    [pos.pickup, pos.dest, pos.driver, pos.client].forEach(extend);
    (o.plan_stops || []).forEach(function (s) {
      if (s && s.lat != null && s.lng != null) extend({ lat: +s.lat, lng: +s.lng });
    });
  }

  function updateMarkerPosition(key, position, icon, title, zIndex, onClick, label) {
    const existing = LIVE.markers[key];
    if (!position) {
      if (existing) { existing.setMap(null); delete LIVE.markers[key]; }
      return;
    }
    if (existing) {
      existing.setPosition(position);
      return;
    }
    addMapMarker(
      { markers: LIVE.markers }, LIVE.map, key, position, icon, title, zIndex, onClick, label,
    );
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function driverMapColor(d) {
    if (!d.is_online) return '#94a3b8';
    if (d.availability === 'busy' || d.on_trip) return '#f97316';
    return '#22c55e';
  }

  function renderLiveDrivers(drivers, options) {
    options = options || {};
    const seen = {};
    (drivers || []).forEach(function (d) {
      if (d.lat == null || d.lng == null) return;
      const fpos = normalizeCoordPos(d.lat, d.lng);
      if (!fpos) return;
      const key = 'driver-' + d.id;
      seen[key] = true;
      const color = driverMapColor(d);
      const icon = driverMarkerIcon(color);
      const title = (d.name || 'Chauffeur') + ' — ' + (d.status_label || d.status || '');
      const zIndex = options.focusDriverId === d.id ? 500 : (250 + d.id);
      updateMarkerPosition(
        key, fpos, icon, title, zIndex,
        function () { showDriverMapTooltip(d); },
      );
      if (d.photo_url && global.DaxiMapMarkers && global.DaxiMapMarkers.loadDriverAvatarIcon) {
        global.DaxiMapMarkers.loadDriverAvatarIcon({
          photoUrl: d.photo_url,
          initials: (d.name || '?').charAt(0),
          color: color,
          size: options.focusDriverId === d.id ? 40 : 36,
        }, function (loadedIcon) {
          if (loadedIcon && LIVE.markers[key]) LIVE.markers[key].setIcon(loadedIcon);
        });
      }
    });
    Object.keys(LIVE.markers).forEach(function (key) {
      if (key.indexOf('driver-') === 0 && !seen[key]) {
        LIVE.markers[key].setMap(null);
        delete LIVE.markers[key];
      }
    });
  }

  function updateLiveMapFooter(data) {
    const chipsEl = document.getElementById('live-map-order-chips');
    const statusEl = document.getElementById('live-map-status');
    if (!chipsEl) return;
    syncLiveMapToolbar();
    const driverOnly = !!LIVE.focusDriverId;
    const orders = liveOrdersOnly(data.orders || []);
    if (driverOnly) {
      chipsEl.innerHTML = '';
      chipsEl.style.display = 'none';
    } else {
      chipsEl.style.display = '';
      if (!orders.length) {
        chipsEl.innerHTML = '<span class="live-map-status" style="text-align:left;margin:0">Aucune course affichée — les courses « prix confirmé » et en cours apparaissent ici.</span>';
      } else {
        chipsEl.innerHTML = orders.map(function (o) {
          const route = String(o.pickup || o.destination || '').slice(0, 32);
          const suffix = route.length > 32 ? '…' : '';
          const color = STATUS_COLOR[o.status] || '#3b82f6';
          return '<button type="button" class="live-map-chip" onclick="focusLiveMapOrder(' + o.id + ')">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
            '<span>#' + o.id + ' ' + escHtml(route) + suffix + '</span></button>';
        }).join('');
      }
    }
    const drivers = data.drivers || [];
    const withPos = drivers.filter(function (d) { return d.lat != null && d.lng != null; });
    const online = withPos.filter(function (d) { return d.is_online; }).length;
    if (statusEl) {
      let line = withPos.length + ' chauffeur(s) sur la carte · ' + online + ' en ligne · ' + orders.length + ' course(s)';
      if (data.updated_at) {
        try {
          line += ' · Maj ' + new Date(data.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {  }
      }
      statusEl.textContent = line;
    }
  }

  function applyLiveMapPendingActions(data) {
    if (LIVE.pendingFocusDriverId) {
      focusLiveMapDriver(LIVE.pendingFocusDriverId);
      LIVE.pendingFocusDriverId = null;
      return;
    }
    if (LIVE.pendingShowAllDrivers) {
      LIVE.pendingShowAllDrivers = false;
      const pts = (data.drivers || []).map(function (d) {
        return d.lat != null && d.lng != null ? normalizeCoordPos(d.lat, d.lng) : null;
      }).filter(Boolean);
      if (pts.length && LIVE.map) {
        LIVE._programmaticMove = true;
        fitMapToPoints(LIVE.map, pts, { top: 80, right: 56, bottom: 120, left: 56 });
        global.google.maps.event.addListenerOnce(LIVE.map, 'idle', function () { LIVE._programmaticMove = false; });
        LIVE.initialFitDone = true;
      }
    }
  }

  function showDriverMapTooltip(d) {
    if (!LIVE.map || !global.google || !global.google.maps) return;
    if (!LIVE.info) LIVE.info = new global.google.maps.InfoWindow({ className: 'daxi-live-map-info' });
    if (LIVE._driverTipTimer) clearTimeout(LIVE._driverTipTimer);
    var theme = readTheme();
    var status = d.status_label || d.status_duration_label || d.status || '';
    var orderLine = '';
    if (d.active_order) {
      orderLine = '<br><span style="font-size:12px;color:' + (theme === 'light' ? '#475569' : '#94a3b8') + ';">Course #' + d.active_order.id + ' — ' +
        escHtml(d.active_order.status_display || d.active_order.status) + '</span>';
    }
    var bg = theme === 'light' ? '#ffffff' : '#1e293b';
    var titleColor = theme === 'light' ? '#0f172a' : '#f8fafc';
    var subColor = theme === 'light' ? '#475569' : '#94a3b8';
    var border = theme === 'light' ? '#e2e8f0' : '#334155';
    LIVE.info.setContent(
      '<div class="daxi-live-map-info__box" style="background:' + bg + ';color:' + titleColor + ';padding:10px 12px;border-radius:10px;border:1px solid ' + border + ';min-width:150px;font-family:system-ui,-apple-system,sans-serif;line-height:1.45;">' +
      '<strong style="font-size:14px;color:' + titleColor + ';">' + escHtml(d.name || 'Chauffeur') + '</strong><br>' +
      '<span style="color:' + subColor + ';font-size:12px;">' + escHtml(status) + '</span>' +
      orderLine + '</div>'
    );
    LIVE.info.setPosition({ lat: +d.lat, lng: +d.lng });
    LIVE.info.open(LIVE.map);
    LIVE._driverTipTimer = setTimeout(function () { LIVE.info.close(); }, 5000);
  }

  function renderLiveMap(data, options) {
    if (!LIVE.map || !LIVE.active) return;
    options = options || {};
    LIVE.lastData = data;

    const orders = liveOrdersOnly(data.orders);
    const focusDriverId = options.focusDriverId || LIVE.focusDriverId;
    const shouldRefit = options.forceFit || (!LIVE.viewportLocked && !LIVE.initialFitDone);
    const driverOnly = !!focusDriverId;

    if (LIVE.focusOrderId && !driverOnly) {
      clearLiveLayers();
      const bounds = new global.google.maps.LatLngBounds();
      let hasBounds = false;
      function extend(pos) {
        if (!pos) return;
        bounds.extend(pos);
        hasBounds = true;
      }
      orders.forEach(function (o) {
        if (o.id !== LIVE.focusOrderId) return;
        drawFocusedOrder(o, extend);
      });
      if (!orders.find(function (x) { return x.id === LIVE.focusOrderId; })) {
        LIVE.focusOrderId = null;
      }
      if (shouldRefit && hasBounds) {
        LIVE._programmaticMove = true;
        fitMapToPoints(LIVE.map, boundsToPoints(bounds), { top: 80, right: 56, bottom: 120, left: 56 });
        global.google.maps.event.addListenerOnce(LIVE.map, 'idle', function () { LIVE._programmaticMove = false; });
        LIVE.initialFitDone = true;
      }
      updateLiveMapFooter(data);
      return;
    }

    const seen = {};
    if (!driverOnly) {
    orders.forEach(function (o) {
      const pos = orderPositions(o);
      const color = STATUS_COLOR[o.status] || '#3b82f6';
      const pinPos = pos.pickup || pos.dest;
      if (!pinPos) return;
      seen['order-' + o.id] = true;
      updateMarkerPosition(
        'order-' + o.id, pinPos, circleIcon(color, 9), 'Course #' + o.id, 300 + o.id,
        function () { focusLiveMapOrder(o.id); }, String(o.id),
      );
    });

    Object.keys(LIVE.markers).forEach(function (key) {
      if (key.indexOf('order-') === 0 && !seen[key]) {
        LIVE.markers[key].setMap(null);
        delete LIVE.markers[key];
      }
    });
    } else {
      Object.keys(LIVE.markers).forEach(function (key) {
        if (key.indexOf('order-') === 0) {
          LIVE.markers[key].setMap(null);
          delete LIVE.markers[key];
        }
      });
    }

    Object.keys(LIVE.polylines).forEach(function (key) {
      LIVE.polylines[key].setMap(null);
      delete LIVE.polylines[key];
    });

    renderLiveDrivers(data.drivers || [], { focusDriverId: focusDriverId });

    if (focusDriverId) {
      var fd = (data.drivers || []).find(function (x) { return x.id === focusDriverId; });
      if (fd && fd.lat != null && fd.lng != null) {
        var fpos = normalizeCoordPos(fd.lat, fd.lng);
        if (fpos) {
          LIVE._programmaticMove = true;
          LIVE.map.setCenter(fpos);
          LIVE.map.setZoom(15);
          global.google.maps.event.addListenerOnce(LIVE.map, 'idle', function () { LIVE._programmaticMove = false; });
          showDriverMapTooltip(fd);
        }
      }
    }

    updateLiveMapFooter(data);

    if (shouldRefit && !driverOnly) {
      const pts = orders.map(function (o) {
        var p = orderPositions(o);
        return p.pickup || p.dest || p.driver;
      }).filter(Boolean);
      (data.drivers || []).forEach(function (d) {
        if (d.lat != null && d.lng != null) {
          const dp = normalizeCoordPos(d.lat, d.lng);
          if (dp) pts.push(dp);
        }
      });
      if (pts.length) {
        LIVE._programmaticMove = true;
        fitMapToPoints(LIVE.map, pts, { top: 80, right: 48, bottom: 120, left: 48 });
        global.google.maps.event.addListenerOnce(LIVE.map, 'idle', function () { LIVE._programmaticMove = false; });
        LIVE.initialFitDone = true;
      }
    }
  }

  function boundsToPoints(bounds) {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    return [
      { lat: ne.lat(), lng: ne.lng() },
      { lat: sw.lat(), lng: sw.lng() },
    ];
  }

  function focusLiveMapDriver(driverId) {
    LIVE.focusOrderId = null;
    if (!driverId) {
      LIVE.focusDriverId = null;
      syncLiveMapToolbar();
      return;
    }
    LIVE.focusDriverId = driverId;
    if (LIVE.lastData) {
      renderLiveMap(LIVE.lastData, { forceFit: false, focusDriverId: driverId });
    } else {
      LIVE.pendingFocusDriverId = driverId;
    }
    syncLiveMapToolbar();
  }

  function focusLiveMapOrder(orderId) {
    if (!orderId) return;
    if (LIVE.focusOrderId === orderId) return;
    LIVE.focusDriverId = null;
    LIVE.focusOrderId = orderId;
    if (LIVE.lastData) {
      renderLiveMap(LIVE.lastData, { forceFit: true });
    }
  }

  global.focusLiveMapDriver = focusLiveMapDriver;
  global.focusLiveMapOrder = focusLiveMapOrder;
  global.LIVE = LIVE;

  function refreshAdminLiveMap() {
    if (!LIVE.active) return Promise.resolve();
    const fetchFn = global.adminFetch || global.fetch;
    return fetchFn('/api/admin-panel/live-map/').then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      renderLiveMap(data, liveMapRenderOptions());
      applyLiveMapPendingActions(data);
    }).catch(function (e) {
      console.error('live-map:', e);
    });
  }

  function createLiveMap() {
    const container = document.getElementById('admin-live-map');
    const wrap = document.getElementById('admin-live-map-wrap');
    if (!container) return;
    if (wrap) wrap.classList.remove('live-map-paused');
    LIVE.map = new global.google.maps.Map(container, mapOptions({ lat: 19.759, lng: -72.198 }, 11));
    LIVE._mapTheme = readTheme();
    bindLiveMapViewportLock();
    LIVE.map.addListener('click', function () {
      if (LIVE.focusOrderId) {
        LIVE.focusOrderId = null;
        if (LIVE.lastData) renderLiveMap(LIVE.lastData, { forceFit: false });
      }
    });
    global.google.maps.event.addListenerOnce(LIVE.map, 'idle', function () {
      global.google.maps.event.trigger(LIVE.map, 'resize');
    });
  }

  function pauseAdminLiveMap() {
    LIVE.active = false;
    if (LIVE.pollTimer) {
      clearInterval(LIVE.pollTimer);
      LIVE.pollTimer = null;
    }
    const wrap = document.getElementById('admin-live-map-wrap');
    if (wrap) wrap.classList.add('live-map-paused');
    const section = document.getElementById('admin-section-live-map');
    if (section) section.classList.add('live-map-paused');
  }

  function initAdminLiveMap() {
    LIVE.active = true;
    const wrap = document.getElementById('admin-live-map-wrap');
    const section = document.getElementById('admin-section-live-map');
    if (wrap) wrap.classList.remove('live-map-paused');
    if (section) section.classList.remove('live-map-paused');
    if (typeof global.syncAdminHeaderHeight === 'function') global.syncAdminHeaderHeight();

    return ensureMapsReady().then(function () {
      const currentTheme = readTheme();
      const themeChanged = LIVE.map && LIVE._mapTheme && LIVE._mapTheme !== currentTheme;
      if (themeChanged) {
        destroyLiveMapInstance();
      }
      if (!LIVE.map) {
        LIVE.initialFitDone = false;
        LIVE.viewportLocked = false;
        createLiveMap();
      } else {
        global.google.maps.event.trigger(LIVE.map, 'resize');
      }
      return refreshAdminLiveMap();
    }).then(function () {
      if (LIVE.pollTimer) clearInterval(LIVE.pollTimer);
      LIVE.pollTimer = setInterval(refreshAdminLiveMap, 12000);
      [50, 200, 500].forEach(function (ms) {
        setTimeout(resizeLiveMap, ms);
      });
    }).catch(function (e) { console.error('initAdminLiveMap:', e); });
  }

  function resizeLiveMap() {
    if (LIVE.map && LIVE.active) {
      global.google.maps.event.trigger(LIVE.map, 'resize');
      if (LIVE.lastData) renderLiveMap(LIVE.lastData, liveMapRenderOptions());
    }
  }

  function toggleLiveMapExpand() {
    resizeLiveMap();
  }

  function reinitLiveMapForTheme() {
    const wrap = document.getElementById('admin-live-map-wrap');
    if (!wrap || !global.DaxiMapTheme) return;
    const theme = readTheme();
    const rebuild = function (done) {
      const focus = LIVE.focusOrderId;
      const focusDriver = LIVE.focusDriverId;
      const data = LIVE.lastData;
      const locked = LIVE.viewportLocked;
      const fitted = LIVE.initialFitDone;
      destroyLiveMapInstance();
      if (LIVE.active) {
        createLiveMap();
        LIVE.focusOrderId = focus;
        LIVE.focusDriverId = focusDriver;
        LIVE.viewportLocked = locked;
        LIVE.initialFitDone = fitted;
        if (data) renderLiveMap(data, liveMapRenderOptions());
        if (!LIVE.pollTimer) LIVE.pollTimer = setInterval(refreshAdminLiveMap, 12000);
      }
      if (typeof done === 'function') done();
    };
    if (LIVE.active && LIVE.map) {
      global.DaxiMapTheme.crossfade(wrap, theme, rebuild);
    } else {
      rebuild();
    }
  }

  function syncAdminMapsTheme() {
    reinitEntMapsForTheme();
    reinitOrderMapsForTheme();
    reinitLiveMapForTheme();
  }

  function initAdminOrderMaps() {
    if (global.DaxiOrderCardMap && typeof global.DaxiOrderCardMap.init === 'function') {
      global.DaxiOrderCardMap.init();
    } else if (global.google && global.google.maps) {
      document.querySelectorAll('[id^="map-order-"][data-lat][data-lng]').forEach(function (el) {
        if (!isOrderMapVisible(el)) return;
        initOrRefreshOrderMapElement(el);
      });
    }
    document.querySelectorAll('[data-daximap="1"]').forEach(function (el) {
      delete el.dataset.mapReady;
      delete el.dataset.daxiCardMapReady;
      delete el.dataset.daxiDriverObs;
    });
    if (global.DaxiOrderCoordsMap && typeof global.DaxiOrderCoordsMap.initAll === 'function') {
      global.DaxiOrderCoordsMap.initAll();
    }
  }

  function initSosOrderMap(orderId) {
    const el = document.getElementById('sos-map-' + orderId);
    if (!el) return;
    const cfg = trackingPositionsFromDataset(el);
    cfg.orderId = orderId;
    cfg.fit = true;
    renderOrderTrackingMap(el, cfg).catch(function (e) {
      console.warn('SOS map:', e);
      el.innerHTML = '<p style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Carte indisponible (Google Maps)</p>';
    });
  }

  document.addEventListener('daxi-theme-change', function () {
    syncAdminMapsTheme();
  });

  global.addEventListener('resize', function () {
    if (typeof global.syncAdminHeaderHeight === 'function') global.syncAdminHeaderHeight();
    if (LIVE.active && LIVE.map) resizeLiveMap();
  });

  function daxiMapRecenter(orderId) {
    if (global.DaxiOrderCardMap && global.DaxiOrderCardMap.refresh) {
      global.DaxiOrderCardMap.refresh(orderId);
    }
  }

  function daxiMapResizeWrap(wrap) {
    if (!wrap) return;
    setTimeout(function () {
      if (global.DaxiOrderCardMap && global.DaxiOrderCardMap.resizeVisible) {
        global.DaxiOrderCardMap.resizeVisible(wrap);
      }
    }, 60);
    setTimeout(function () {
      if (global.DaxiOrderCardMap && global.DaxiOrderCardMap.resizeVisible) {
        global.DaxiOrderCardMap.resizeVisible(wrap);
      }
    }, 280);
  }

  function daxiMapOpenOnMainMap(orderId) {
    var wrap = document.getElementById('daximap-wrap-' + orderId);
    if (!wrap) return;
    wrap.classList.add('daximap-wrap--fullscreen');
    document.body.classList.add('daxi-map-fs-active');
    var fsBtn = document.getElementById('daximap-fs-' + orderId);
    var reduceBtn = document.getElementById('daximap-reduce-' + orderId);
    if (fsBtn) fsBtn.style.display = 'none';
    if (reduceBtn) reduceBtn.style.display = 'flex';
    daxiMapResizeWrap(wrap);
  }

  function daxiMapExitFs(orderId) {
    var wrap = document.getElementById('daximap-wrap-' + orderId);
    if (!wrap) return;
    wrap.classList.remove('daximap-wrap--fullscreen');
    if (!document.querySelector('.daximap-wrap--fullscreen')) {
      document.body.classList.remove('daxi-map-fs-active');
    }
    var fsBtn = document.getElementById('daximap-fs-' + orderId);
    var reduceBtn = document.getElementById('daximap-reduce-' + orderId);
    if (fsBtn) fsBtn.style.display = 'flex';
    if (reduceBtn) reduceBtn.style.display = 'none';
    daxiMapResizeWrap(wrap);
  }

  global.daxiMapRecenter = daxiMapRecenter;
  global.daxiMapOpenOnMainMap = daxiMapOpenOnMainMap;
  global.daxiMapExitFs = daxiMapExitFs;
  global.adminLiveMapGoBack = adminLiveMapGoBack;

  global.AdminMaps = {
    initEntLocationMaps: initEntLocationMaps,
    initLiveMap: initAdminLiveMap,
    pauseLiveMap: pauseAdminLiveMap,
    refreshLiveMap: refreshAdminLiveMap,
    focusLiveMapOrder: focusLiveMapOrder,
    toggleLiveMapExpand: toggleLiveMapExpand,
    resizeLiveMap: resizeLiveMap,
    renderOrderTrackingMap: renderOrderTrackingMap,
    refreshOrderMap: refreshOrderMap,
    scheduleOrderMapRefresh: scheduleOrderMapRefresh,
    initSosOrderMap: initSosOrderMap,
    ensureReady: ensureMapsReady,
    syncTheme: syncAdminMapsTheme,
  };

  global.initAdminOrderMaps = initAdminOrderMaps;
  global.initAllMapDivs = initAdminOrderMaps;
  global.refreshAdminLiveMap = refreshAdminLiveMap;
  global.initAdminLiveMap = initAdminLiveMap;
  global.pauseAdminLiveMap = pauseAdminLiveMap;
  global.initSosOrderMap = initSosOrderMap;
  global.toggleLiveMapExpand = toggleLiveMapExpand;
  global.syncAdminHeaderHeight = function () {
    const header = document.querySelector('#admin-main > main > header');
    if (header) {
      document.documentElement.style.setProperty('--admin-header-h', header.offsetHeight + 'px');
    }
  };
})(typeof window !== 'undefined' ? window : this);