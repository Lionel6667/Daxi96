
(function (global) {
  'use strict';

  var GRID = 3;
  var CACHE_TTL_MS = 45 * 60 * 1000;
  var MIN_NETWORK_GAP_MS = 2500;
  var MAX_NETWORK_PER_MIN = 20;
  var SESSION_CAP = 300;
  var OFFROUTE_M = 150;

  var cache = Object.create(null);
  var inflight = Object.create(null);
  var networkTimes = [];
  var lastNetworkAt = 0;
  var sessionNetwork = 0;
  var directionsService = null;

  function latLngObj(pt) {
    if (!pt) return null;
    var lat = typeof pt.lat === 'function' ? pt.lat() : (pt.lat != null ? pt.lat : pt.latitude);
    var lng = typeof pt.lng === 'function' ? pt.lng() : (pt.lng != null ? pt.lng : pt.longitude);
    if (Array.isArray(pt) && pt.length >= 2) {
      lat = pt[0];
      lng = pt[1];
      if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
        var swap = lat;
        lat = lng;
        lng = swap;
      }
    }
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4) return null;
    return { lat: lat, lng: lng };
  }

  function gridPt(pt) {
    var o = latLngObj(pt);
    if (!o) return '';
    return o.lat.toFixed(GRID) + ',' + o.lng.toFixed(GRID);
  }

  function cacheKey(origin, destination, waypoints) {
    var parts = [gridPt(origin), gridPt(destination)];
    (waypoints || []).forEach(function (w) { parts.push(gridPt(w)); });
    return parts.join('|');
  }

  function pruneNetworkTimes(now) {
    var cut = now - 60000;
    while (networkTimes.length && networkTimes[0] < cut) networkTimes.shift();
  }

  function canNetwork(now) {
    if (sessionNetwork >= SESSION_CAP) return false;
    if (now - lastNetworkAt < MIN_NETWORK_GAP_MS) return false;
    pruneNetworkTimes(now);
    return networkTimes.length < MAX_NETWORK_PER_MIN;
  }

  function markNetwork(now) {
    lastNetworkAt = now;
    sessionNetwork += 1;
    networkTimes.push(now);
  }

  function cacheGet(key, now) {
    var hit = cache[key];
    if (!hit || !hit.route) return null;
    if (now - hit.at > CACHE_TTL_MS) return null;
    return hit.route;
  }

  function cachePut(key, route, now) {
    if (!route) return;
    cache[key] = { route: route, at: now };
  }

  function nearestCached(origin, destination, now) {
    var o = latLngObj(origin);
    var d = latLngObj(destination);
    if (!o || !d) return null;
    var best = null;
    var bestScore = Infinity;
    Object.keys(cache).forEach(function (key) {
      var hit = cache[key];
      if (!hit || !hit.route || now - hit.at > CACHE_TTL_MS) return;
      var parts = key.split('|');
      if (parts.length < 2) return;
      var a = parts[0].split(',');
      var b = parts[1].split(',');
      var olat = parseFloat(a[0]);
      var olng = parseFloat(a[1]);
      var dlat = parseFloat(b[0]);
      var dlng = parseFloat(b[1]);
      if (!isFinite(olat) || !isFinite(dlat)) return;
      var score = Math.abs(olat - o.lat) + Math.abs(olng - o.lng) + Math.abs(dlat - d.lat) + Math.abs(dlng - d.lng);
      if (score < bestScore) {
        bestScore = score;
        best = hit.route;
      }
    });
    if (best && bestScore < 0.02) return best;
    return null;
  }

  function decodePath(route) {
    var path = [];
    try {
      var legs = (route.legs || route.routes && route.routes[0] && route.routes[0].legs) || [];
      legs.forEach(function (leg) {
        (leg.steps || []).forEach(function (step) {
          (step.path || []).forEach(function (pt) { path.push(pt); });
        });
      });
    } catch (e) {}
    if (path.length) return path;

    try {
      var overview = route.overview_path || (route.routes && route.routes[0] && route.routes[0].overview_path);
      if (overview && overview.length) return overview;
    } catch (e2) {}

    try {
      var poly = route.polyline || route.polylineDetails ||
        (route.routes && route.routes[0] && (route.routes[0].polyline || route.routes[0].polylineDetails));
      var encoded = poly && (poly.encodedPolyline || poly);
      if (encoded && global.google && google.maps && google.maps.geometry && google.maps.geometry.encoding) {
        return google.maps.geometry.encoding.decodePath(encoded);
      }
    } catch (e3) {}
    return path;
  }

  function metricsFromRoute(route) {
    var totalM = 0;
    var totalS = 0;
    var legs = route.legs || (route.routes && route.routes[0] && route.routes[0].legs) || [];
    legs.forEach(function (leg) {
      if (leg.distance && leg.distance.value != null) totalM += leg.distance.value;
      else if (leg.distanceMeters != null) totalM += leg.distanceMeters;
      if (leg.duration && leg.duration.value != null) totalS += leg.duration.value;
      else if (leg.durationMillis != null) totalS += Math.round(leg.durationMillis / 1000);
      else if (leg.staticDuration) totalS += parseInt(leg.staticDuration, 10) || 0;
    });
    if (!totalM && route.distanceMeters != null) totalM = route.distanceMeters;
    if (!totalS && route.durationMillis != null) totalS = Math.round(route.durationMillis / 1000);
    var km = (totalM / 1000).toFixed(1);
    var durMin = Math.max(1, Math.round(totalS / 60));
    var durText = durMin >= 60
      ? Math.floor(durMin / 60) + ' h ' + (durMin % 60) + ' min'
      : durMin + ' min';
    return { distanceText: km + ' km', durationText: durText };
  }

  function normalizeResult(rawRoute) {
    if (!rawRoute) return null;
    var path = decodePath(rawRoute);
    if (path.length < 2 && rawRoute.path && rawRoute.path.length >= 2) path = rawRoute.path;
    if (path.length < 2) return null;
    var m = metricsFromRoute(rawRoute);
    return { path: path, distanceText: m.distanceText, durationText: m.durationText };
  }

  function getDirectionsService() {
    if (!global.google || !google.maps || !google.maps.DirectionsService) return null;
    if (!directionsService) {
      directionsService = global._daxiDirectionsService || new google.maps.DirectionsService();
      global._daxiDirectionsService = directionsService;
    }
    return directionsService;
  }

  function directionsNetwork(origin, destination, waypoints) {
    return new Promise(function (resolve) {
      var svc = getDirectionsService();
      if (!svc) {
        resolve(null);
        return;
      }
      var req = {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      };
      if (waypoints && waypoints.length) {
        req.waypoints = waypoints.map(function (w) {
          var p = latLngObj(w);
          return { location: p, stopover: true };
        });
      }
      try {
        svc.route(req, function (result, status) {
          if (status !== 'OK' || !result || !result.routes || !result.routes[0]) {
            resolve(null);
            return;
          }
          resolve(normalizeResult(result.routes[0]));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function computeRoute(origin, destination, waypoints) {
    var o = latLngObj(origin);
    var d = latLngObj(destination);
    if (!o || !d) return Promise.resolve(null);
    var wps = (waypoints || []).map(latLngObj).filter(Boolean);
    var key = cacheKey(o, d, wps);
    if (!key || key.indexOf('||') === 0) return Promise.resolve(null);
    var now = Date.now();

    var cached = cacheGet(key, now);
    if (cached) return Promise.resolve(cached);
    if (inflight[key]) return inflight[key];

    if (!canNetwork(now)) {
      return Promise.resolve(nearestCached(o, d, now));
    }

    markNetwork(now);
    var pending = directionsNetwork(o, d, wps).then(function (route) {
      delete inflight[key];
      if (route) cachePut(key, route, Date.now());
      return route;
    }, function () {
      delete inflight[key];
      return null;
    });
    inflight[key] = pending;
    return pending;
  }

  function distToPathM(lat, lng, path) {
    if (global.DaxiMapSnap && typeof global.DaxiMapSnap.snapToPath === 'function') {
      var r = global.DaxiMapSnap.snapToPath(lat, lng, path, 100000);
      return r && isFinite(r.dist) ? r.dist : Infinity;
    }
    if (!path || path.length < 2 || !isFinite(lat) || !isFinite(lng)) return Infinity;
    var best = Infinity;
    var p = { lat: +lat, lng: +lng };
    for (var i = 0; i < path.length - 1; i++) {
      var a = latLngObj(path[i]);
      var b = latLngObj(path[i + 1]);
      if (!a || !b) continue;
      var abx = b.lng - a.lng;
      var aby = b.lat - a.lat;
      var apx = p.lng - a.lng;
      var apy = p.lat - a.lat;
      var ab2 = abx * abx + aby * aby;
      var t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      var clat = a.lat + aby * t;
      var clng = a.lng + abx * t;
      var dLat = (clat - p.lat) * 111320;
      var dLng = (clng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180);
      var dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < best) best = dist;
    }
    return best;
  }

  function shouldRefreshPath(lat, lng, path, minIntervalMs, lastAt) {
    if (!path || path.length < 2) return !lastAt || (Date.now() - lastAt > 8000);
    if (lastAt && Date.now() - lastAt < (minIntervalMs || 45000)) return false;
    return distToPathM(lat, lng, path) >= OFFROUTE_M;
  }

  global.DaxiRoutes = {
    computeRoute: computeRoute,
    latLngObj: latLngObj,
    distToPathM: distToPathM,
    shouldRefreshPath: shouldRefreshPath,
    OFFROUTE_M: OFFROUTE_M,
  };
})(window);
