
(function (global) {
  'use strict';

  const MAPS = {};
  const OBSERVERS = new WeakMap();
  const REFRESH_TIMERS = {};
  const SCHEDULED = {};
  const ROUTE_CACHE = {};
  const MAP_ID = 'c4948b020bfc08331f1cb94e';
  const PREFETCH_HOST_ID = 'daxi-map-prefetch-host';
  let mapsLibPromise = null;
  let directionsService = null;

  function orderIdFromEl(el) {
    return (el.id || '').replace('daximap-', '');
  }

  function mapsApiReady() {
    return !!(global.google && global.google.maps && global.google.maps.Map);
  }

  function ensureMapsLib() {
    if (mapsApiReady()) return Promise.resolve();
    if (mapsLibPromise) return mapsLibPromise;
    mapsLibPromise = new Promise(function (resolve) {
      var tries = 0;
      (function poll() {
        tries += 1;
        if (mapsApiReady()) {
          resolve();
          return;
        }
        if (tries > 250) {
          resolve();
          return;
        }
        setTimeout(poll, 120);
      })();
    });
    return mapsLibPromise;
  }

  function whenMapsReady(fn) {
    ensureMapsLib().then(fn);
  }

  function mapHasRenderedTiles(map, el) {
    if (global._daxiMapHasRenderedTiles) {
      return global._daxiMapHasRenderedTiles(map || el);
    }
    var div = null;
    try {
      div = map && map.getDiv ? map.getDiv() : el;
    } catch (e) { return false; }
    if (!div || !div.isConnected) return false;
    if ((div.offsetWidth || 0) < 20 || (div.offsetHeight || 0) < 20) return false;
    var gm = div.querySelector('.gm-style');
    if (!gm) return false;
    var imgs = gm.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].src && imgs[i].offsetWidth > 0) return true;
    }
    var canvas = gm.querySelector('canvas');
    return !!(canvas && canvas.width > 8 && canvas.height > 8);
  }

  function revealCardMap(el, map, oid, skelFailsafe) {
    if (!el || !map) return;
    if (!mapHasRenderedTiles(map, el)) {
      setTimeout(function () { revealCardMap(el, map, oid, skelFailsafe); }, 180);
      return;
    }
    clearTimeout(skelFailsafe);
    try { global.google.maps.event.trigger(map, 'resize'); } catch (e) {}
    var rec = MAPS[el.id];
    if (rec && rec.lastPoints) fitMap(map, rec.lastPoints);
    el.dataset.daxiCardMapReady = '1';
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    hideSkeleton(oid, 'ok');
  }

  function hideSkeleton(orderId, message) {
    var skel = document.getElementById('daximap-skel-' + orderId);
    if (!skel) return;
    if (message && message !== 'ok') {
      if (message === 'Chargement carte…' || message === 'Carte indisponible') {
        if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.applyCardSkeleton) {
          DaxiMapPlaceholder.applyCardSkeleton(skel);
        }
        if (message === 'Carte indisponible' && window.DaxiMapPlaceholder && DaxiMapPlaceholder.showOfflineModal) {
          var wrap = skel.closest('.daximap-wrap');
          if (wrap) {
            DaxiMapPlaceholder.showOfflineModal(wrap, {
              onRetry: function () { refreshElement(document.getElementById('daximap-' + orderId), true); }
            });
          }
        }
        return;
      }
      skel.innerHTML = '<span style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.04em;padding:0 12px;text-align:center;">' + message + '</span>';
      skel.style.display = 'flex';
      skel.style.opacity = '1';
      skel.style.pointerEvents = 'auto';
      return;
    }
    skel.style.pointerEvents = 'none';
    skel.style.opacity = '0';
    setTimeout(function () { skel.style.display = 'none'; }, 400);
  }

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

  function readTheme() {
    if (global.DaxiMapTheme) return global.DaxiMapTheme.readTheme();
    return document.documentElement.getAttribute('data-theme') || 'dark';
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
    if (Math.abs(a) < 1e-4 && Math.abs(b) < 1e-4) return null;
    return { lat: a, lng: b };
  }

  function isValidGpsPoint(pt) {
    if (!pt) return false;
    return normalizeCoordPos(pt.lat, pt.lng) != null;
  }

  function distMeters(a, b) {
    if (!a || !b) return Infinity;
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180;
    var la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function closestOnSegment(p, a, b) {
    var ax = a.lng;
    var ay = a.lat;
    var bx = b.lng;
    var by = b.lat;
    var px = p.lng;
    var py = p.lat;
    var abx = bx - ax;
    var aby = by - ay;
    var apx = px - ax;
    var apy = py - ay;
    var ab2 = abx * abx + aby * aby;
    var t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return { lat: ay + aby * t, lng: ax + abx * t };
  }

  function snapToPath(lat, lng, path, maxSnapM) {
    if (global.DaxiMapSnap && typeof global.DaxiMapSnap.snapToPath === 'function') {
      var r = global.DaxiMapSnap.snapToPath(lat, lng, path, maxSnapM);
      return { lat: r.lat, lng: r.lng };
    }
    if (!path || path.length < 2 || lat == null || lng == null) return { lat: lat, lng: lng };
    maxSnapM = maxSnapM == null ? 200 : maxSnapM;
    var p = { lat: +lat, lng: +lng };
    var best = p;
    var bestDist = Infinity;
    for (var i = 0; i < path.length - 1; i++) {
      var c = closestOnSegment(p, path[i], path[i + 1]);
      var d = distMeters(p, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (bestDist > maxSnapM) return p;
    return best;
  }

  if (!global.DaxiMapSnap) {
    global.DaxiMapSnap = {
      snapToPath: snapToPath,
      distMeters: distMeters,
    };
  }

  function coordsFromEl(el) {
    const pickupExplicit = normalizeCoordPos(parseCoord(el.dataset.pickupLat), parseCoord(el.dataset.pickupLng));
    const meeting = normalizeCoordPos(parseCoord(el.dataset.meetingLat), parseCoord(el.dataset.meetingLng));
    const rdv = normalizeCoordPos(parseCoord(el.dataset.rdvLat), parseCoord(el.dataset.rdvLng));
    const clientGps = normalizeCoordPos(parseCoord(el.dataset.clientGpsLat), parseCoord(el.dataset.clientGpsLng));
    const dest = normalizeCoordPos(parseCoord(el.dataset.destLat), parseCoord(el.dataset.destLng));
    const driver = normalizeCoordPos(parseCoord(el.dataset.driverLat), parseCoord(el.dataset.driverLng));
    const departDisplay = pickupExplicit || meeting || rdv || clientGps;
    let planStops = [];
    try {
      if (el.dataset.planStops) planStops = JSON.parse(el.dataset.planStops) || [];
    } catch (e) { planStops = []; }
    planStops = planStops.map(function (s) {
      if (!s) return s;
      var p = normalizeCoordPos(parseCoord(s.lat), parseCoord(s.lng));
      return p ? { label: s.label, lat: p.lat, lng: p.lng } : null;
    }).filter(Boolean);
    return {
      pickup: pickupExplicit,
      pickupDisplay: departDisplay,
      dest: dest,
      driver: driver,
      status: el.dataset.orderStatus || '',
      planStops: planStops,
      orderId: (el.id || '').replace('daximap-', ''),
      mapScope: el.dataset.mapScope || 'card',
    };
  }

  function routeColorsForScope(scope) {
    return { main: '#fbbf24', fallback: '#f59e0b', weight: scope === 'enterprise' ? 5 : 4, opacity: scope === 'enterprise' ? 0.92 : 0.85 };
  }

  function cfgKey(cfg) {
    function p(pt) {
      if (!pt) return '';
      return (+pt.lat).toFixed(5) + ',' + (+pt.lng).toFixed(5);
    }
    return [
      p(cfg.pickup), p(cfg.dest), p(cfg.driver), cfg.status || '',
      (cfg.planStops || []).map(function (s) { return p(s); }).join('|'),
    ].join(';');
  }

  function isInOpenDrawer(el) {
    var drawer = el && el.closest ? el.closest('#orders-drawer') : null;
    return !!(drawer && drawer.classList.contains('open'));
  }

  function isInDriverOrdersList(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('#orders-list') || el.closest('#sb-orders'));
  }

  function isInSheetOrderSlot(el) {
    return !!(el && el.closest && el.closest('#daxi-sheet-order-slot'));
  }

  function ensurePrefetchHost() {
    var host = document.getElementById(PREFETCH_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = PREFETCH_HOST_ID;
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:360px;overflow:hidden;visibility:hidden;pointer-events:none;z-index:-1;';
      document.body.appendChild(host);
    }
    return host;
  }

  function isInPrefetchHost(el) {
    return !!(el && el.closest && el.closest('#' + PREFETCH_HOST_ID));
  }

  function shouldEagerInit(el) {
    return isVisible(el) || isInOpenDrawer(el) || isInClientOrdersList(el) ||
      isInDriverOrdersList(el) || isInSheetOrderSlot(el) || isInPrefetchHost(el);
  }

  function isInClientOrdersList(el) {
    return !!(el && el.closest && el.closest('#client-orders-htmx'));
  }

  function isClientOrdersPageOpen() {
    var overlay = document.getElementById('daxiPageOverlay');
    return !!(overlay && overlay.classList.contains('show'));
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (isInPrefetchHost(el)) return true;
    if (isInOpenDrawer(el)) return true;
    if (isInDriverOrdersList(el)) return true;
    if (isInSheetOrderSlot(el)) return true;
    if (isInClientOrdersList(el)) {
      var rect0 = el.getBoundingClientRect();
      if (rect0.width < 20) return false;
      var vh = global.innerHeight || 800;
      return rect0.bottom > -60 && rect0.top < vh + 60;
    }
    const panel = el.closest('.adm-order-details-panel, .drv-oc-details');
    if (panel) {
      if (panel.hidden) return false;
      if (panel.classList.contains('adm-order-details-panel') && !panel.classList.contains('is-open')) return false;
      if (panel.style.display === 'none') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 20 && rect.height >= 20;
  }

  function getDirections() {
    if (!global.google || !global.google.maps || !global.google.maps.DirectionsService) return null;
    if (!directionsService) {
      directionsService = new global.google.maps.DirectionsService();
    }
    return directionsService;
  }

  function routeCacheKey(origin, dest, waypoints) {
    return [origin, dest].concat(waypoints || []).map(function (p) {
      if (!p) return '';
      return (+p.lat).toFixed(4) + ',' + (+p.lng).toFixed(4);
    }).join('|');
  }

  function fetchDrivingRoute(origin, dest, waypoints) {
    if (!isValidGpsPoint(origin) || !isValidGpsPoint(dest)) return Promise.resolve(null);
    const wps = (waypoints || []).filter(isValidGpsPoint);
    const key = routeCacheKey(origin, dest, wps);
    if (ROUTE_CACHE[key]) return Promise.resolve(ROUTE_CACHE[key]);

    if (global.DaxiRoutes && typeof global.DaxiRoutes.computeRoute === 'function') {
      return global.DaxiRoutes.computeRoute(origin, dest, wps).then(function (route) {
        if (!route || !route.path || route.path.length < 2) return null;
        const path = route.path.map(function (pt) {
          return { lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat, lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng };
        });
        ROUTE_CACHE[key] = path;
        return path;
      });
    }

    const svc = getDirections();
    if (!svc) return Promise.resolve(null);

    const req = {
      origin: origin,
      destination: dest,
      travelMode: global.google.maps.TravelMode.DRIVING,
      region: 'ht',
      optimizeWaypoints: false,
    };
    if (wps.length) {
      req.waypoints = wps.map(function (w) {
        return { location: w, stopover: true };
      });
    }

    return new Promise(function (resolve) {
      try {
        svc.route(req, function (result, status) {
          if (status !== 'OK' || !result || !result.routes || !result.routes[0]) {
            resolve(null);
            return;
          }
          const path = [];
          result.routes[0].legs.forEach(function (leg) {
            (leg.steps || []).forEach(function (step) {
              (step.path || []).forEach(function (pt) {
                path.push({ lat: pt.lat(), lng: pt.lng() });
              });
            });
          });
          if (path.length >= 2) ROUTE_CACHE[key] = path;
          resolve(path.length >= 2 ? path : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function drawRouteLine(store, map, key, origin, dest, waypoints, fallback, color, weight, opacity, onPath) {
    if (fallback && fallback.length >= 2) {
      addLine(store, map, key, fallback, color || '#94a3b8', weight || 3, 0.35, true);
    }
    try {
      fetchDrivingRoute(origin, dest, waypoints).then(function (path) {
        if (!path || path.length < 2) return;
        if (store.polylines[key]) store.polylines[key].setMap(null);
        addLine(store, map, key, path, color || '#94a3b8', weight || 4, opacity != null ? opacity : 0.7, false);
        store.routePaths = store.routePaths || {};
        store.routePaths[key] = path;
        if (typeof onPath === 'function') onPath(path);
      }).catch(function () {});
    } catch (e) {}
  }

  function applyThemeToRecord(rec, theme) {
    if (!rec || !rec.map) return false;
    theme = theme || readTheme();
    if (rec.theme === theme) return true;
    var ok = false;
    if (global.DaxiMapTheme && global.DaxiMapTheme.applyMapTheme) {
      ok = global.DaxiMapTheme.applyMapTheme(rec.map, theme);
    } else {
      try {
        rec.map.setOptions({
          colorScheme: global.DaxiMapTheme ? global.DaxiMapTheme.mapColorScheme(theme) : (theme === 'light' ? 'LIGHT' : 'DARK'),
          backgroundColor: global.DaxiMapTheme ? global.DaxiMapTheme.mapBgColor(theme) : (theme === 'light' ? '#F0F4F9' : '#070b14')
        });
        ok = true;
      } catch (e) {
        ok = false;
      }
    }
    if (ok) rec.theme = theme;
    if (ok && rec.map && global.google && global.google.maps && global.google.maps.event) {
      try { global.google.maps.event.trigger(rec.map, 'resize'); } catch (e) {}
    }
    return ok;
  }

  function syncAllThemes(theme) {
    theme = theme || readTheme();
    Object.keys(MAPS).forEach(function (key) {
      applyThemeToRecord(MAPS[key], theme);
    });
    if (global.DaxiMapPlaceholder && global.DaxiMapPlaceholder.applyCardSkeleton) {
      document.querySelectorAll('.daxi-map-ph-skel').forEach(function (el) {
        global.DaxiMapPlaceholder.applyCardSkeleton(el, theme);
      });
    }
  }

  function mapOptions(center, theme) {
    theme = theme || readTheme();
    var opts = {
      center: center || { lat: 19.759, lng: -72.198 },
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      mapId: MAP_ID,
      backgroundColor: global.DaxiMapTheme ? global.DaxiMapTheme.mapBgColor(theme) : (theme === 'light' ? '#F0F4F9' : '#070b14'),
    };
    if (global.DaxiMapTheme && global.DaxiMapTheme.mapColorScheme) {
      opts.colorScheme = global.DaxiMapTheme.mapColorScheme(theme);
    } else if (global.google && global.google.maps && global.google.maps.ColorScheme) {
      opts.colorScheme = theme === 'light' ? global.google.maps.ColorScheme.LIGHT : global.google.maps.ColorScheme.DARK;
    }
    return opts;
  }

  function pinIcon(color, scale) {
    const icon = {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: scale || 1.35,
      anchor: new global.google.maps.Point(12, 22),
    };
    if (global.google && global.google.maps && global.google.maps.Point) {
      icon.labelOrigin = new global.google.maps.Point(12, 9);
    }
    return icon;
  }

  function driverIcon(status) {
    const color = STATUS_COLOR[status] || '#f59e0b';
    if (global.DaxiMapMarkers && global.DaxiMapMarkers.driverGoogleIcon) {
      return global.DaxiMapMarkers.driverGoogleIcon({ color: color, size: 32 });
    }
    return pinIcon(color, 1.1);
  }

  function fitMap(map, points) {
    if (!map || !points || !points.length) return;
    var pad = { top: 48, right: 44, bottom: 56, left: 44 };
    if (points.length === 1) {
      map.setCenter(points[0]);
      var z = map.getZoom();
      if (!z || z > 14) map.setZoom(13);
      return;
    }
    const bounds = new global.google.maps.LatLngBounds();
    points.forEach(function (p) { bounds.extend(p); });
    map.fitBounds(bounds, pad);
  }

  function clearStore(store) {
    Object.values(store.markers || {}).forEach(function (m) { m.setMap(null); });
    Object.values(store.polylines || {}).forEach(function (p) { p.setMap(null); });
    store.markers = {};
    store.polylines = {};
  }

  function addMarker(store, map, key, pos, icon, title, zIndex, label) {
    if (!pos) return;
    const opts = { map: map, position: pos, icon: icon, title: title || '', zIndex: zIndex || 100 };
    if (label) opts.label = { text: label, color: '#fff', fontSize: '11px', fontWeight: '700' };
    store.markers[key] = new global.google.maps.Marker(opts);
  }

  function addLine(store, map, key, path, color, weight, opacity, dashed) {
    if (!path || path.length < 2) return;
    const opts = {
      map: map,
      path: path,
      strokeColor: color || '#94a3b8',
      strokeOpacity: opacity != null ? opacity : 0.75,
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

  function destroyMapRecord(el) {
    if (!el) return;
    const rec = MAPS[el.id];
    if (rec && rec.map) {
      try { global.google.maps.event.clearInstanceListeners(rec.map); } catch (e) {}
    }
    delete MAPS[el.id];
    delete el.dataset.mapReady;
    delete el.dataset.daxiCardMapReady;
    delete el.dataset.daxiDriverObs;
  }

  function isMapAttachedToEl(rec, el) {
    if (!rec || !rec.map || !el) return false;
    try {
      var div = rec.map.getDiv();
      return !!(div && div === el && div.isConnected);
    } catch (e) {
      return false;
    }
  }

  function destroyOrder(orderId) {
    if (orderId == null || orderId === '') return;
    var el = document.getElementById('daximap-' + orderId);
    if (el) destroyMapRecord(el);
    delete MAPS['daximap-' + orderId];
    var skel = document.getElementById('daximap-skel-' + orderId);
    if (skel) {
      skel.style.display = 'none';
      skel.style.opacity = '0';
    }
  }

  function destroyInRoot(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-daximap="1"]').forEach(function (el) {
      destroyMapRecord(el);
    });
  }

  function drawMap(el, cfg, force) {
    const key = el.id;
    const signature = cfgKey(cfg);
    const theme = readTheme();
    const oid = cfg.orderId || orderIdFromEl(el);

    if (!force && el.dataset.mapReady === '1' && MAPS[key] && MAPS[key].cfgKey === signature && MAPS[key].theme === theme && MAPS[key].map && isMapAttachedToEl(MAPS[key], el)) {
      global.google.maps.event.trigger(MAPS[key].map, 'resize');
      if (MAPS[key].lastPoints) fitMap(MAPS[key].map, MAPS[key].lastPoints);
      el.style.opacity = '1';
      hideSkeleton(oid, 'ok');
      return;
    }

    let rec = MAPS[key];
    if (rec && !isMapAttachedToEl(rec, el)) {
      destroyMapRecord(el);
      rec = null;
    }
    if (rec && rec.theme !== theme && !applyThemeToRecord(rec, theme)) {
      destroyMapRecord(el);
      el.innerHTML = '';
      rec = null;
    }

    const isNewMap = !rec || !rec.map;
    if (!isNewMap) {
      el.dataset.mapReady = '1';
    } else {
      el.dataset.mapReady = '1';
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.6s ease';
    }

    var skelFailsafe = setTimeout(function () {
      var rec2 = MAPS[key];
      if (rec2 && rec2.map) revealCardMap(el, rec2.map, oid, skelFailsafe);
    }, 12000);

    const center = cfg.pickupDisplay || cfg.pickup || cfg.dest || { lat: 19.759, lng: -72.198 };
    var map;
    if (!rec || !rec.map) {
      el.innerHTML = '';
      var mapOpts = mapOptions(center, theme);
      try {
        map = new global.google.maps.Map(el, mapOpts);
      } catch (mapErr) {
        console.warn('[DaxiOrderCardMap] mapId fallback', mapErr);
        delete mapOpts.mapId;
        mapOpts.mapTypeId = global.google.maps.MapTypeId ? global.google.maps.MapTypeId.ROADMAP : 'roadmap';
        map = new global.google.maps.Map(el, mapOpts);
      }
      rec = { map: map, store: { markers: {}, polylines: {} }, theme: theme, cfgKey: signature };
      MAPS[key] = rec;
    } else {
      map = rec.map;
      try { global.google.maps.event.trigger(map, 'resize'); } catch (e) {}
      rec.cfgKey = signature;
    }

    const store = rec.store;
    clearStore(store);

    const st = cfg.status;
    const points = [];
    function extend(p) { if (p) points.push(p); }

    if (cfg.pickup) {
      addMarker(store, map, 'pickup', cfg.pickup, pinIcon('#22c55e', 1.35), 'Départ (RDV)', 400, 'A');
      extend(cfg.pickup);
    } else if (cfg.pickupDisplay) {
      addMarker(store, map, 'pickup-hint', cfg.pickupDisplay, pinIcon('#64748b', 0.95), 'Départ (à confirmer)', 380, '?');
      extend(cfg.pickupDisplay);
    } else if (cfg._pendingCoords) {
      addMarker(store, map, 'pickup-hint', { lat: center.lat + 0.008, lng: center.lng - 0.012 }, pinIcon('#64748b', 0.9), 'Départ à placer', 380);
    }
    if (cfg.dest) {
      addMarker(store, map, 'dest', cfg.dest, pinIcon('#ef4444', 1.35), 'Arrivée', 390, 'B');
      extend(cfg.dest);
    }
    if (cfg.driver) {
      var driverPos = cfg.driver;
      if (st === 'arrived' && cfg.pickup) {
        driverPos = { lat: cfg.pickup.lat, lng: cfg.pickup.lng };
        cfg.driver = driverPos;
      }
      addMarker(store, map, 'driver', driverPos, driverIcon(cfg.status), 'Chauffeur', 420);
      extend(driverPos);
    }

    function snapDriverToPath(path) {
      if (!isValidGpsPoint(cfg.driver) || !path || path.length < 2) return;
      var snapped = snapToPath(cfg.driver.lat, cfg.driver.lng, path, 60);
      var mk = store.markers.driver;
      if (mk && mk.setPosition) mk.setPosition(snapped);
      cfg.driver = snapped;
    }

    const planWp = (cfg.planStops || []).filter(isValidGpsPoint);

    planWp.forEach(function (s, i) {
      addMarker(store, map, 'stop-' + i, s, pinIcon('#a855f7', 1.1), 'Étape ' + (i + 1), 385 + i, String(i + 1));
      extend(s);
    });

    rec.lastPoints = points.slice();

    const routePath = [];
    if (cfg.pickup) routePath.push(cfg.pickup);
    planWp.forEach(function (s) { routePath.push(s); });
    if (cfg.dest) routePath.push(cfg.dest);

    if (isValidGpsPoint(cfg.pickup) && isValidGpsPoint(cfg.dest)) {
      var routeStyle = routeColorsForScope(cfg.mapScope);
      drawRouteLine(store, map, 'route', cfg.pickup, cfg.dest, planWp.length ? planWp : null, routePath, routeStyle.main, routeStyle.weight, routeStyle.opacity);
    } else if (routePath.length >= 2) {
      var fbStyle = routeColorsForScope(cfg.mapScope);
      addLine(store, map, 'route', routePath, fbStyle.fallback, fbStyle.weight - 1, fbStyle.opacity * 0.55, true);
    }

    if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.pickup) && st === 'on_way') {
      drawRouteLine(store, map, 'leg', cfg.driver, cfg.pickup, [], [cfg.driver, cfg.pickup], '#3b82f6', 5, 0.85, snapDriverToPath);
    } else if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.dest) && st === 'in_progress') {
      drawRouteLine(store, map, 'leg', cfg.driver, cfg.dest, [], [cfg.driver, cfg.dest], '#f59e0b', 5, 0.85, snapDriverToPath);
    } else if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.pickup) && st === 'arrived' && isValidGpsPoint(cfg.dest)) {
      drawRouteLine(store, map, 'leg', cfg.pickup, cfg.dest, planWp.length ? planWp : null, routePath, '#34d399', 5, 0.85);
    } else if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.pickup) && st === 'driver_assigned') {
      drawRouteLine(store, map, 'leg', cfg.driver, cfg.pickup, [], [cfg.driver, cfg.pickup], '#a855f7', 4, 0.55, snapDriverToPath);
    }

    function finishLayout() {
      if (!MAPS[key] || MAPS[key].map !== map) return;
      try { global.google.maps.event.trigger(map, 'resize'); } catch (e) {}
      if (points.length) fitMap(map, points);
      else {
        map.setCenter(center);
        map.setZoom(12);
      }
      revealCardMap(el, map, oid, skelFailsafe);
      setTimeout(function () {
        if (!MAPS[key] || MAPS[key].map !== map) return;
        try { global.google.maps.event.trigger(map, 'resize'); } catch (e2) {}
        if (rec.lastPoints) fitMap(map, rec.lastPoints);
      }, isNewMap ? 350 : 80);
    }

    try {
      global.google.maps.event.addListenerOnce(map, 'tilesloaded', finishLayout);
      global.google.maps.event.addListenerOnce(map, 'idle', finishLayout);
    } catch (e) {}
    if (isNewMap) {
      setTimeout(finishLayout, 400);
    } else {
      finishLayout();
    }
  }

  function updateDriverOnMap(el) {
    if (!el) return;
    var rec = MAPS[el.id];
    if (!rec || !rec.map) return;
    var cfg = coordsFromEl(el);
    var store = rec.store;
    if (!isValidGpsPoint(cfg.driver)) {
      if (store.markers.driver) {
        store.markers.driver.setMap(null);
        delete store.markers.driver;
      }
      return;
    }
    var driverPos = cfg.driver;
    if (cfg.status === 'arrived' && cfg.pickup) {
      driverPos = { lat: cfg.pickup.lat, lng: cfg.pickup.lng };
    }
    var mk = store.markers.driver;
    if (!mk) {
      addMarker(store, rec.map, 'driver', driverPos, driverIcon(cfg.status), 'Chauffeur', 420);
      mk = store.markers.driver;
    } else if (mk.setPosition) {
      mk.setPosition(driverPos);
    }
    if (mk && mk.setIcon) mk.setIcon(driverIcon(cfg.status));
    var legKey = 'leg';
    if (store.polylines[legKey]) store.polylines[legKey].setMap(null);
    delete store.polylines[legKey];
    var st = cfg.status;
    if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.pickup) && st === 'on_way') {
      drawRouteLine(store, rec.map, legKey, cfg.driver, cfg.pickup, [], [cfg.driver, cfg.pickup], '#3b82f6', 5, 0.85, function (path) {
        var snapped = snapToPath(cfg.driver.lat, cfg.driver.lng, path, 60);
        if (store.markers.driver && store.markers.driver.setPosition) {
          store.markers.driver.setPosition(snapped);
        }
      });
    } else if (isValidGpsPoint(cfg.driver) && isValidGpsPoint(cfg.dest) && st === 'in_progress') {
      drawRouteLine(store, rec.map, legKey, cfg.driver, cfg.dest, [], [cfg.driver, cfg.dest], '#f59e0b', 5, 0.85, function (path) {
        var snapped = snapToPath(cfg.driver.lat, cfg.driver.lng, path, 60);
        if (store.markers.driver && store.markers.driver.setPosition) {
          store.markers.driver.setPosition(snapped);
        }
      });
    }
    if (rec.lastPoints) {
      try { global.google.maps.event.trigger(rec.map, 'resize'); } catch (e) {}
    }
  }

  function observeDriverAttrs(el) {
    if (!global.MutationObserver || el.dataset.daxiDriverObs) return;
    el.dataset.daxiDriverObs = '1';
    var timer = null;
    var mo = new global.MutationObserver(function (muts) {
      var hit = false;
      muts.forEach(function (m) {
        if (m.type === 'attributes' && (
          m.attributeName === 'data-driver-lat' ||
          m.attributeName === 'data-driver-lng' ||
          m.attributeName === 'data-order-status'
        )) hit = true;
      });
      if (!hit) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var attr = muts[0] && muts[0].attributeName;
        var driverOnly = attr === 'data-driver-lat' || attr === 'data-driver-lng';
        if (driverOnly && MAPS[el.id] && MAPS[el.id].map) {
          updateDriverOnMap(el);
          return;
        }
        refreshElement(el, false);
      }, 120);
    });
    mo.observe(el, { attributes: true, attributeFilter: ['data-driver-lat', 'data-driver-lng', 'data-order-status'] });
  }

  function refreshElement(el, force) {
    if (!el) return Promise.resolve(null);
    if (!isVisible(el) && !force && !isInOpenDrawer(el) && !isInClientOrdersList(el) &&
        !isInDriverOrdersList(el) && !isInPrefetchHost(el)) {
      return Promise.resolve(null);
    }
    if (isInClientOrdersList(el) && !force && !isClientOrdersPageOpen() && !isInPrefetchHost(el)) {
      var waitOid = orderIdFromEl(el);
      hideSkeleton(waitOid, 'Chargement carte…');
      el.style.opacity = '1';
      if (!el.dataset.daxiOrdersPageWait) {
        el.dataset.daxiOrdersPageWait = '1';
        document.addEventListener('daxi:orders-page-open', function () {
          delete el.dataset.daxiOrdersPageWait;
          refreshElement(el, true);
        }, { once: true });
      }
      return Promise.resolve(null);
    }
    delete el.dataset.daxiOrdersPageWait;
    observeDriverAttrs(el);
    return ensureMapsLib().then(function () {
      var oid = orderIdFromEl(el);
      if (!mapsApiReady()) {
        hideSkeleton(oid, 'Chargement carte…');
        el.style.opacity = '1';
        if (!el.dataset.daxiGmapsWait) {
          el.dataset.daxiGmapsWait = '1';
          var gmapsPolls = 0;
          (function pollGmapsReady() {
            gmapsPolls += 1;
            if (!el.isConnected) {
              delete el.dataset.daxiGmapsWait;
              return;
            }
            if (mapsApiReady()) {
              delete el.dataset.daxiGmapsWait;
              refreshElement(el, true);
              return;
            }
            if (gmapsPolls > 120) {
              delete el.dataset.daxiGmapsWait;
              hideSkeleton(oid, 'Carte indisponible');
              return;
            }
            setTimeout(pollGmapsReady, 150);
          })();
          document.addEventListener('daxi-gmaps-ready', function () {
            if (!el.dataset.daxiGmapsWait) return;
            delete el.dataset.daxiGmapsWait;
            refreshElement(el, true);
          }, { once: true });
        }
        return null;
      }
      delete el.dataset.daxiGmapsWait;
      const cfg = coordsFromEl(el);
      oid = cfg.orderId || oid;
      const pendingCoords = !cfg.pickup && !cfg.dest;
      if (pendingCoords) {
        cfg._pendingCoords = true;
      }
      observeResize(el);
      try {
        drawMap(el, cfg, !!force);
        return MAPS[el.id] ? MAPS[el.id].map : null;
      } catch (err) {
        console.warn('[DaxiOrderCardMap]', err);
        hideSkeleton(oid, 'Carte indisponible');
        delete el.dataset.mapReady;
        return null;
      }
    });
  }

  function refreshAllInRoot(root, force) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-daximap="1"]').forEach(function (el) {
      if (force) {
        delete el.dataset.mapReady;
        delete el.dataset.daxiCardMapReady;
        delete el.dataset.ioBound;
        delete el.dataset.daxiOrdersPageWait;
        el.style.opacity = '1';
      }
      refreshElement(el, !!force);
    });
    observeClientOrderMaps(scope);
  }

  function prefetchFromHtml(html, orderId) {
    if (!html || orderId == null || orderId === '') return;
    if (html.indexOf('data-daximap="1"') < 0) return;
    var host = ensurePrefetchHost();
    var oid = String(orderId);
    if (host.querySelector('[data-daxi-prefetch-order="' + oid + '"]')) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('data-daxi-prefetch-order', oid);
    wrap.innerHTML = html;
    host.appendChild(wrap);
    refreshAllInRoot(wrap, true);
  }

  function prefetchInRoot(root) {
    refreshAllInRoot(root, true);
  }

  function init(root) {
    whenMapsReady(function () {
      const scope = root && root.querySelectorAll ? root : document;
      if (global.DaxiMapPlaceholder) {
        scope.querySelectorAll('.daxi-map-ph-skel').forEach(function (el) {
          DaxiMapPlaceholder.applyCardSkeleton(el);
        });
      }
      scope.querySelectorAll('[data-daximap="1"]').forEach(function (el) {
        if (shouldEagerInit(el)) refreshElement(el, isInPrefetchHost(el) || isInSheetOrderSlot(el));
      });
      observeClientOrderMaps(scope);
      var prefetchHost = document.getElementById(PREFETCH_HOST_ID);
      if (prefetchHost && (!root || root === document || prefetchHost.contains(root) || root.contains(prefetchHost))) {
        refreshAllInRoot(prefetchHost, false);
      }
    });
  }

  function observeClientOrderMaps(root) {
    if (!global.IntersectionObserver) return;
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('#client-orders-htmx [data-daximap="1"]:not([data-io-bound])').forEach(function (el) {
      el.dataset.ioBound = '1';
      var io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          refreshElement(el, false);
          io.unobserve(el);
        });
      }, { rootMargin: '100px', threshold: 0.05 });
      io.observe(el);
    });
  }

  function observeResize(el) {
    if (!global.ResizeObserver || OBSERVERS.has(el)) return;
    const wrap = el.closest('.daximap-wrap') || el;
    let timer = null;
    const ro = new global.ResizeObserver(function () {
      if (!isVisible(el)) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        const rec = MAPS[el.id];
        if (!rec || !rec.map) return;
        global.google.maps.event.trigger(rec.map, 'resize');
        if (rec.lastPoints) fitMap(rec.map, rec.lastPoints);
      }, 280);
    });
    ro.observe(wrap);
    OBSERVERS.set(el, ro);
  }

  function refresh(orderId) {
    const el = document.getElementById('daximap-' + orderId);
    return refreshElement(el, false);
  }

  function scheduleRefresh(orderId) {
    var el = document.getElementById('daximap-' + orderId);
    if (!el) return;
    if (MAPS[el.id] && MAPS[el.id].map) {
      updateDriverOnMap(el);
      var key = orderId + ':resize';
      clearTimeout(SCHEDULED[key]);
      SCHEDULED[key] = setTimeout(function () {
        var rec = MAPS[el.id];
        if (!rec || !rec.map) return;
        try { global.google.maps.event.trigger(rec.map, 'resize'); } catch (e) {}
        if (rec.lastPoints) fitMap(rec.map, rec.lastPoints);
      }, 420);
      return;
    }
    refreshElement(el, false);
    var key = orderId + ':resize';
    clearTimeout(SCHEDULED[key]);
    SCHEDULED[key] = setTimeout(function () {
      var rec = MAPS[el.id];
      if (!rec || !rec.map) return;
      try { global.google.maps.event.trigger(rec.map, 'resize'); } catch (e) {}
      if (rec.lastPoints) fitMap(rec.map, rec.lastPoints);
    }, 420);
  }

  function resizeVisible(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-daximap="1"]').forEach(function (el) {
      if (!isVisible(el) && !isInOpenDrawer(el) && !isInClientOrdersList(el) &&
          !isInDriverOrdersList(el) && !isInPrefetchHost(el)) return;
      const rec = MAPS[el.id];
      if (!rec || !rec.map) {
        refreshElement(el, false);
        return;
      }
      try { global.google.maps.event.trigger(rec.map, 'resize'); } catch (e) {}
      if (rec.lastPoints) fitMap(rec.map, rec.lastPoints);
    });
  }

  function destroyAll() {
    Object.keys(MAPS).forEach(function (key) {
      var el = document.getElementById(key);
      if (el) destroyMapRecord(el);
      else delete MAPS[key];
    });
    Object.keys(SCHEDULED).forEach(function (key) { clearTimeout(SCHEDULED[key]); delete SCHEDULED[key]; });
  }

  document.addEventListener('daxi-theme-change', function (e) {
    var theme = (e && e.detail && e.detail.theme) || readTheme();
    syncAllThemes(theme);
    setTimeout(function () { resizeVisible(); }, 60);
  });

  document.addEventListener('htmx:afterSettle', function (evt) {
    const root = evt.detail && evt.detail.target ? evt.detail.target : null;
    clearTimeout(REFRESH_TIMERS.htmx);
    REFRESH_TIMERS.htmx = setTimeout(function () {
      if (root && root.id === 'client-orders-htmx') {
        refreshAllInRoot(root, true);
      } else {
        init(root);
      }
    }, 180);
  });

  document.addEventListener('DOMContentLoaded', function () {
    init();
    if (global.DaxiMapPlaceholder) {
      document.querySelectorAll('.daxi-map-ph-skel').forEach(function (el) {
        DaxiMapPlaceholder.applyCardSkeleton(el);
      });
    }
  });

  document.addEventListener('daxi-gmaps-ready', function () {
    mapsLibPromise = null;
    setTimeout(function () {
      init(document.getElementById('orders-list'));
      init(document.getElementById('sb-orders'));
    }, 200);
  });

  document.addEventListener('daxi-drawer-open', function () {
    setTimeout(function () {
      init(document.getElementById('orders-list'));
      init(document.getElementById('sb-orders'));
    }, 80);
    setTimeout(function () {
      init(document.getElementById('orders-list'));
      init(document.getElementById('sb-orders'));
      resizeVisible(document.getElementById('orders-list'));
      resizeVisible(document.getElementById('sb-orders'));
    }, 650);
  });

  global.addEventListener('resize', function () {
    clearTimeout(REFRESH_TIMERS.win);
    REFRESH_TIMERS.win = setTimeout(function () {
      Object.keys(MAPS).forEach(function (key) {
        const rec = MAPS[key];
        if (rec && rec.map) {
          global.google.maps.event.trigger(rec.map, 'resize');
          if (rec.lastPoints) fitMap(rec.map, rec.lastPoints);
        }
      });
    }, 200);
  });

  global.DaxiOrderCardMap = {
    init: init,
    refresh: refresh,
    refreshAllInRoot: refreshAllInRoot,
    prefetchFromHtml: prefetchFromHtml,
    prefetchInRoot: prefetchInRoot,
    scheduleRefresh: scheduleRefresh,
    resizeVisible: resizeVisible,
    syncAllThemes: syncAllThemes,
    destroyAll: destroyAll,
    destroyOrder: destroyOrder,
    destroyInRoot: destroyInRoot,
  };

  global.initDaxiOrderCardMaps = init;
})(typeof window !== 'undefined' ? window : this);