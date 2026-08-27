
(function (global) {
  'use strict';

  var DEG2RAD = Math.PI / 180;
  var EARTH_R = 6371000;
  var DEFAULT_MAX_SNAP_M = 60;

  function toPoint(lat, lng) {
    if (lat == null || lng == null) return null;
    var a = +lat;
    var b = +lng;
    if (!isFinite(a) || !isFinite(b)) return null;
    return { lat: a, lng: b };
  }

  function distMeters(a, b) {
    if (!a || !b) return Infinity;
    var dLat = (b.lat - a.lat) * DEG2RAD;
    var dLng = (b.lng - a.lng) * DEG2RAD;
    var la1 = a.lat * DEG2RAD;
    var la2 = b.lat * DEG2RAD;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
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
    var raw = toPoint(lat, lng);
    if (!raw || !path || path.length < 2) {
      return { lat: lat, lng: lng, dist: Infinity, snapped: false, rawLat: lat, rawLng: lng };
    }
    maxSnapM = maxSnapM == null ? DEFAULT_MAX_SNAP_M : +maxSnapM;
    var best = raw;
    var bestDist = Infinity;
    var bestSeg = -1;
    for (var i = 0; i < path.length - 1; i++) {
      var a = toPoint(path[i].lat, path[i].lng);
      var b = toPoint(path[i + 1].lat, path[i + 1].lng);
      if (!a || !b) continue;
      var c = closestOnSegment(raw, a, b);
      var d = distMeters(raw, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
        bestSeg = i;
      }
    }
    if (bestDist > maxSnapM) {
      return { lat: raw.lat, lng: raw.lng, dist: bestDist, snapped: false, rawLat: raw.lat, rawLng: raw.lng };
    }
    return {
      lat: best.lat,
      lng: best.lng,
      dist: bestDist,
      snapped: true,
      rawLat: raw.lat,
      rawLng: raw.lng,
      segmentIndex: bestSeg,
    };
  }

  function adaptiveMaxSnap(accuracy) {
    var acc = isFinite(accuracy) ? +accuracy : 40;
    return Math.max(25, Math.min(80, acc * 1.35));
  }

  function snapForDisplay(lat, lng, path, accuracy, maxSnapM) {
    var limit = maxSnapM != null ? maxSnapM : adaptiveMaxSnap(accuracy);
    return snapToPath(lat, lng, path, limit);
  }

  function bearingOnPath(lat, lng, path) {
    if (!path || path.length < 2) return null;
    var raw = toPoint(lat, lng);
    if (!raw) return null;
    var snapped = snapToPath(lat, lng, path, 120);
    var idx = snapped.segmentIndex;
    if (idx == null || idx < 0) idx = 0;
    var a = toPoint(path[idx].lat, path[idx].lng);
    var b = toPoint(path[idx + 1].lat, path[idx + 1].lng);
    if (!a || !b) return null;
    var dLng = (b.lng - a.lng) * DEG2RAD;
    var y = Math.sin(dLng) * Math.cos(b.lat * DEG2RAD);
    var x = Math.cos(a.lat * DEG2RAD) * Math.sin(b.lat * DEG2RAD)
      - Math.sin(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function pathFromPolyline(poly) {
    if (!poly) return [];
    if (Array.isArray(poly)) return poly.slice();
    if (poly.getLength) {
      var out = [];
      for (var i = 0; i < poly.getLength(); i++) {
        var pt = poly.getAt(i);
        out.push({ lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat, lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng });
      }
      return out;
    }
    if (poly.length) {
      return poly.map(function (pt) {
        return { lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat, lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng };
      });
    }
    return [];
  }

  function setActiveRoutePath(path) {
    global._daxiActiveRoutePath = path && path.length >= 2 ? path : null;
    if (global.DaxiGpsEngine && typeof global.DaxiGpsEngine.setSnapPath === 'function') {
      global.DaxiGpsEngine.setSnapPath(global._daxiActiveRoutePath);
    }
  }

  global.DaxiMapSnap = {
    distMeters: distMeters,
    closestOnSegment: closestOnSegment,
    snapToPath: snapToPath,
    snapForDisplay: snapForDisplay,
    bearingOnPath: bearingOnPath,
    pathFromPolyline: pathFromPolyline,
    setActiveRoutePath: setActiveRoutePath,
    adaptiveMaxSnap: adaptiveMaxSnap,
    DEFAULT_MAX_SNAP_M: DEFAULT_MAX_SNAP_M,
  };
})(typeof window !== 'undefined' ? window : this);