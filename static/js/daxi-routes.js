
(function (global) {
  'use strict';

  function latLngObj(pt) {
    if (!pt) return null;
    var lat = typeof pt.lat === 'function' ? pt.lat() : (pt.lat != null ? pt.lat : pt.latitude);
    var lng = typeof pt.lng === 'function' ? pt.lng() : (pt.lng != null ? pt.lng : pt.longitude);
    if (Array.isArray(pt) && pt.length >= 2) {
      lat = pt[0];
      lng = pt[1];
    }
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  function routesApiLatLng(pt) {
    var o = latLngObj(pt);
    if (!o) return null;
    return { latitude: o.lat, longitude: o.lng };
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
      var poly = route.polyline || route.polylineDetails ||
        (route.routes && route.routes[0] && (route.routes[0].polyline || route.routes[0].polylineDetails));
      var encoded = poly && (poly.encodedPolyline || poly);
      if (encoded && global.google && google.maps && google.maps.geometry && google.maps.geometry.encoding) {
        return google.maps.geometry.encoding.decodePath(encoded);
      }
    } catch (e2) {}
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

  function directionsFallback(origin, destination, waypoints) {
    return new Promise(function (resolve) {
      if (!global.google || !google.maps || !google.maps.DirectionsService) {
        resolve(null);
        return;
      }
      var svc = global._daxiDirectionsService || new google.maps.DirectionsService();
      global._daxiDirectionsService = svc;
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
      svc.route(req, function (result, status) {
        if (status !== 'OK' || !result || !result.routes[0]) {
          resolve(null);
          return;
        }
        var path = decodePath(result.routes[0]);
        var m = metricsFromRoute(result.routes[0]);
        resolve({ path: path, distanceText: m.distanceText, durationText: m.durationText });
      });
    });
  }

  async function computeRoute(origin, destination, waypoints) {
    var o = latLngObj(origin);
    var d = latLngObj(destination);
    if (!o || !d) return null;
    var oApi = routesApiLatLng(o);
    var dApi = routesApiLatLng(d);
    if (!oApi || !dApi) return null;

    try {
      if (global.google && google.maps && google.maps.importLibrary) {
        var routesLib = await google.maps.importLibrary('routes');
        var Route = routesLib.Route;
        if (Route && typeof Route.computeRoutes === 'function') {
          var intermediates = (waypoints || []).map(function (w) {
            var p = routesApiLatLng(w);
            return p ? { location: { latLng: p } } : null;
          }).filter(Boolean);

          var response = await Route.computeRoutes({
            origin: { location: { latLng: oApi } },
            destination: { location: { latLng: dApi } },
            intermediates: intermediates,
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
            computeAlternativeRoutes: false,
          });

          var routes = response && (response.routes || response);
          var route = Array.isArray(routes) ? routes[0] : routes;
          if (route) {
            var path = decodePath(route);
            if (!path.length && route.polylineDetails) {
              var enc = route.polylineDetails.encodedPolyline;
              if (enc && google.maps.geometry && google.maps.geometry.encoding) {
                path = google.maps.geometry.encoding.decodePath(enc);
              }
            }
            var m = metricsFromRoute(route);
            if (path.length >= 2) {
              return { path: path, distanceText: m.distanceText, durationText: m.durationText };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[DaxiRoutes] computeRoutes failed, fallback', e);
    }
    return directionsFallback(o, d, waypoints);
  }

  global.DaxiRoutes = {
    computeRoute: computeRoute,
    latLngObj: latLngObj,
  };
})(window);