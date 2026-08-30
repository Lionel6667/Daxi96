
(function (global) {
    'use strict';

    var TRAVEL_MS = 5500;
    var ZOOM_OUT_MS = 1500;
    var ZOOM_IN_MS = 1800;
    var EXPLORER_PITCH = 62;
    var EXPLORER_ZOOM = 17.4;
    var EXPLORER_ZOOM_CRUISE = 11.8;

    var _markers = [];
    var _lines = [];
    var _glows = [];
    var _hud = null;
    var _detailEl = null;
    var _activeIdx = 0;
    var _traveling = false;
    var _travelRaf = null;
    var _navMarker = null;
    var _navMarkerEl = null;
    var _travelLine = null;
    var _travelGlow = null;
    var _prefetchTimer = null;
    var _routeCache = {};
    var _routeFetchChain = Promise.resolve();
    var _pathToken = 0;
    var _imagesPreloaded = false;
    var _imageCache = {};
    var _foreignSnap = null;
    var _lightboxEl = null;
    var _enterAttempts = 0;
    var _placesResolved = false;
    var _geoCache = {};
    var _resolveChain = Promise.resolve();

    var NAV = {
        lookAheadIdx: 3
    };

    function _places() { return global.DAXI_HAITI_PLACES || []; }

    function _tabBarH() {
        return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height'), 10) || 60;
    }

    function _map() { return global._clientBgMap; }
    function _ame() { return global._daxiAdvancedMarkerElement; }

    function _mapSupports3D() {
        if (global._daxiMapSupports3D === false) return false;
        var map = _map();
        try {
            if (map && map.getRenderingType && map.getRenderingType() === 'RASTER') return false;
        } catch (e) {}
        return true;
    }

    function _moveCameraSafe(opts) {
        var map = _map();
        if (!map || !opts) return Promise.resolve();
        var cam = Object.assign({}, opts);
        if (!_mapSupports3D()) {
            delete cam.tilt;
            delete cam.heading;
        }
        return new Promise(function (resolve) {
            var done = false;
            function finish() {
                if (done) return;
                done = true;
                resolve();
            }
            try {
                var p = map.moveCamera(cam);
                if (p && typeof p.then === 'function') {
                    p.then(finish).catch(function () {
                        try {
                            map.moveCamera({ center: cam.center, zoom: cam.zoom != null ? cam.zoom : map.getZoom() });
                        } catch (e2) {}
                        finish();
                    });
                    return;
                }
            } catch (e) {
                try {
                    map.moveCamera({ center: cam.center, zoom: cam.zoom != null ? cam.zoom : map.getZoom() });
                } catch (e2) {}
            }
            setTimeout(finish, Math.round(ZOOM_IN_MS * 0.65));
        });
    }

    function _setMapView(lat, lng, heading, zoom) {
        var map = _map();
        if (!map) return;
        try {
            map.setCenter({ lat: lat, lng: lng });
            if (zoom != null) map.setZoom(zoom);
            if (_mapSupports3D()) {
                map.setTilt(EXPLORER_PITCH);
                if (heading != null && isFinite(heading)) map.setHeading(heading);
            }
        } catch (e) {}
    }

    function _sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function _latLngObj(ll) {
        if (!ll) return null;
        if (typeof ll.lat === 'function') return { lat: ll.lat(), lng: ll.lng() };
        return { lat: ll.lat, lng: ll.lng };
    }

    function _readCamera() {
        var map = _map();
        if (!map) return null;
        var c = map.getCenter();
        if (!c) return null;
        return {
            center: _latLngObj(c),
            zoom: map.getZoom() || 10,
            tilt: (_mapSupports3D() && map.getTilt) ? (map.getTilt() || 0) : 0,
            heading: (_mapSupports3D() && map.getHeading) ? (map.getHeading() || 0) : 0
        };
    }

    function _boundsFromIndices(indices, extraPath) {
        var list = _places();
        var b = new google.maps.LatLngBounds();
        indices.forEach(function (i) {
            var p = list[i];
            if (p) b.extend({ lat: p.lat, lng: p.lng });
        });
        if (extraPath && extraPath.length) {
            extraPath.forEach(function (pt) { b.extend(pt); });
        }
        return b;
    }

    function _latRad(lat) {
        var s = Math.sin(lat * Math.PI / 180);
        return Math.log((1 + s) / (1 - s)) / 2;
    }

    function _lerpHeading(a, b, t) {
        var diff = ((b - a + 540) % 360) - 180;
        return a + diff * t;
    }

    function _computeFitCamera(indices, extraPath, travelMode) {
        var map = _map();
        var b = _boundsFromIndices(indices, extraPath);
        if (!map || b.isEmpty()) return _readCamera();

        var padding = travelMode ? _travelBoundsPadding() : _boundsPadding();
        var div = map.getDiv();
        var w = Math.max(120, (div.offsetWidth || 360) - padding.left - padding.right);
        var h = Math.max(120, (div.offsetHeight || 640) - padding.top - padding.bottom);

        var ne = b.getNorthEast();
        var sw = b.getSouthWest();
        var center = {
            lat: (ne.lat() + sw.lat()) / 2,
            lng: (ne.lng() + sw.lng()) / 2
        };

        var latFraction = Math.abs(_latRad(ne.lat()) - _latRad(sw.lat())) / Math.PI;
        if (latFraction < 0.00001) latFraction = 0.00001;
        var lngDiff = ne.lng() - sw.lng();
        if (lngDiff < 0) lngDiff += 360;
        var lngFraction = lngDiff / 360;
        if (lngFraction < 0.00001) lngFraction = 0.00001;

        var zoomLat = Math.log(h / 256 / latFraction) / Math.LN2;
        var zoomLng = Math.log(w / 256 / lngFraction) / Math.LN2;
        var zoom = Math.min(zoomLat, zoomLng, 18);
        if (!isFinite(zoom) || zoom < 1) zoom = 10;
        zoom = Math.max(5, Math.min(18, zoom));

        return { center: center, zoom: zoom, tilt: 0, heading: 0 };
    }

    function _animateCameraLerp(fromCam, toCam, durationMs) {
        var map = _map();
        if (!map || !fromCam || !toCam) return Promise.resolve();
        return new Promise(function (resolve) {
            var start = performance.now();
            function frame(now) {
                var t = Math.min(1, (now - start) / durationMs);
                var e = _easeInOut(t);
                var cam = {
                    center: {
                        lat: fromCam.center.lat + (toCam.center.lat - fromCam.center.lat) * e,
                        lng: fromCam.center.lng + (toCam.center.lng - fromCam.center.lng) * e
                    },
                    zoom: fromCam.zoom + (toCam.zoom - fromCam.zoom) * e,
                    tilt: (fromCam.tilt || 0) + ((toCam.tilt || 0) - (fromCam.tilt || 0)) * e,
                    heading: _lerpHeading(fromCam.heading || 0, toCam.heading || 0, e)
                };
                if (!_mapSupports3D()) {
                    delete cam.tilt;
                    delete cam.heading;
                }
                try { map.moveCamera(cam); } catch (err) {}
                if (t < 1) requestAnimationFrame(frame);
                else resolve();
            }
            requestAnimationFrame(frame);
        });
    }

    function _animateFitBounds(indices, extraPath, travelMode) {
        var fromCam = _readCamera();
        var target = _computeFitCamera(indices, extraPath, travelMode);
        if (!target || !fromCam) return _moveCameraSafe(target);
        return _animateCameraLerp(fromCam, target, ZOOM_OUT_MS);
    }

    function _cinematicOrbit(center, fromHeading, toHeading, durationMs) {
        var map = _map();
        if (!map || !_mapSupports3D()) return Promise.resolve();
        return new Promise(function (resolve) {
            var start = performance.now();
            function frame(now) {
                var t = Math.min(1, (now - start) / durationMs);
                var e = _easeInOut(t);
                var h = fromHeading + (toHeading - fromHeading) * e;
                try {
                    map.moveCamera({
                        center: center,
                        zoom: EXPLORER_ZOOM,
                        tilt: EXPLORER_PITCH,
                        heading: h
                    });
                } catch (err) {}
                if (t < 1) requestAnimationFrame(frame);
                else resolve();
            }
            requestAnimationFrame(frame);
        });
    }

    function _ensureMarkerLib() {
        var AME = _ame();
        if (AME) return Promise.resolve(AME);
        if (!global.google || !google.maps || typeof google.maps.importLibrary !== 'function') {
            return Promise.resolve(null);
        }
        return google.maps.importLibrary('marker').then(function (lib) {
            global._daxiAdvancedMarkerElement = lib.AdvancedMarkerElement;
            return lib.AdvancedMarkerElement;
        }).catch(function () { return null; });
    }

    function _hideForeignMarkers() {
        if (_foreignSnap) return;
        _foreignSnap = { booking: [], planStops: [], clientLoc: null };
        if (global._bookingMarkers) {
            ['pickup', 'dest'].forEach(function (k) {
                var m = global._bookingMarkers[k];
                if (!m) return;
                var onMap = m.map != null || (m.getMap && m.getMap());
                _foreignSnap.booking.push({ marker: m, wasOn: !!onMap });
                if (m.map != null) m.map = null;
                else if (m.setMap) m.setMap(null);
            });
        }
        (global._planStopMarkers || []).forEach(function (m) {
            if (!m) return;
            var onMap = m.map != null || (m.getMap && m.getMap());
            _foreignSnap.planStops.push({ marker: m, wasOn: !!onMap });
            if (m.map != null) m.map = null;
            else if (m.setMap) m.setMap(null);
        });
        var cl = global._clientLocationMarker;
        if (cl) {
            var clOn = cl.map != null || (cl.getMap && cl.getMap());
            _foreignSnap.clientLoc = { marker: cl, wasOn: !!clOn };
            if (cl.map != null) cl.map = null;
            else if (cl.setMap) cl.setMap(null);
        }
    }

    function _restoreForeignMarkers() {
        if (!_foreignSnap) return;
        var snap = _foreignSnap;
        _foreignSnap = null;
        var map = _map();
        if (!map) return;
        snap.booking.forEach(function (item) {
            if (!item.wasOn || !item.marker) return;
            if (item.marker.map != null) item.marker.map = map;
            else if (item.marker.setMap) item.marker.setMap(map);
        });
        snap.planStops.forEach(function (item) {
            if (!item.wasOn || !item.marker) return;
            if (item.marker.map != null) item.marker.map = map;
            else if (item.marker.setMap) item.marker.setMap(map);
        });
        if (snap.clientLoc && snap.clientLoc.wasOn && snap.clientLoc.marker) {
            var cl = snap.clientLoc.marker;
            if (cl.map != null) cl.map = map;
            else if (cl.setMap) cl.setMap(map);
        }
    }

    function _preloadImage(url) {
        if (!url) return Promise.resolve('');
        var cached = _imageCache[url];
        if (cached && cached.loaded) return Promise.resolve(url);
        if (cached && cached.promise) return cached.promise;
        var entry = { loaded: false, promise: null };
        entry.promise = new Promise(function (resolve) {
            var im = new Image();
            im.decoding = 'async';
            im.onload = function () { entry.loaded = true; resolve(url); };
            im.onerror = function () { entry.loaded = true; resolve(url); };
            im.src = url;
        });
        _imageCache[url] = entry;
        return entry.promise;
    }

    function _ensureLightbox() {
        if (_lightboxEl) return _lightboxEl;
        _lightboxEl = document.createElement('div');
        _lightboxEl.id = 'daxi-explorer-lightbox';
        _lightboxEl.className = 'daxi-explorer-lightbox';
        _lightboxEl.innerHTML =
            '<button type="button" class="daxi-explorer-lightbox-close" aria-label="Fermer"><i class="ri-close-line"></i></button>' +
            '<img class="daxi-explorer-lightbox-img" alt="">';
        _lightboxEl.addEventListener('click', _closeLightbox);
        _lightboxEl.querySelector('.daxi-explorer-lightbox-close').addEventListener('click', function (e) {
            e.stopPropagation();
            _closeLightbox();
        });
        document.body.appendChild(_lightboxEl);
        return _lightboxEl;
    }

    function _openPhotoLightbox(url, alt) {
        if (!url) return;
        var lb = _ensureLightbox();
        var img = lb.querySelector('.daxi-explorer-lightbox-img');
        img.alt = alt || '';
        img.classList.add('daxi-explorer-lightbox-img--loading');
        _preloadImage(url).then(function (readyUrl) {
            img.src = readyUrl;
            img.classList.remove('daxi-explorer-lightbox-img--loading');
        });
        lb.classList.add('open');
        document.body.classList.add('daxi-explorer-lightbox-open');
    }

    function _closeLightbox() {
        if (_lightboxEl) _lightboxEl.classList.remove('open');
        document.body.classList.remove('daxi-explorer-lightbox-open');
    }

    function _resolveAllPlaces() {
        if (_placesResolved) return Promise.resolve();
        _placesResolved = true;
        return Promise.resolve();
    }

    function _boundsPadding() {
        return { top: 72, right: 44, bottom: _tabBarH() + 200, left: 44 };
    }

    function _travelBoundsPadding() {
        return { top: 88, right: 52, bottom: 110, left: 52 };
    }

    function _fitBoundsIndices(indices, extraPath, travelMode) {
        var map = _map();
        var list = _places();
        if (!map || !list.length || !indices.length) return;
        var b = new google.maps.LatLngBounds();
        indices.forEach(function (i) {
            var p = list[i];
            if (p) b.extend({ lat: p.lat, lng: p.lng });
        });
        if (extraPath && extraPath.length) {
            extraPath.forEach(function (pt) { b.extend(pt); });
        }
        try {
            map.fitBounds(b, travelMode ? _travelBoundsPadding() : _boundsPadding());
            if (_mapSupports3D()) {
                map.setTilt(0);
                map.setHeading(0);
            }
        } catch (e) {}
    }

    function _fitAllPlaces() {
        var list = _places();
        var idx = [];
        for (var i = 0; i < list.length; i++) idx.push(i);
        _fitBoundsIndices(idx);
    }

    function _fetchGoogleDirectionsPath(from, to) {
        return new Promise(function (resolve) {
            if (!global.google || !google.maps || !google.maps.DirectionsService) {
                resolve(null);
                return;
            }
            if (!global._daxiExplorerDirectionsService) {
                global._daxiExplorerDirectionsService = new google.maps.DirectionsService();
            }
            global._daxiExplorerDirectionsService.route({
                origin: { lat: from.lat, lng: from.lng },
                destination: { lat: to.lat, lng: to.lng },
                travelMode: google.maps.TravelMode.DRIVING
            }, function (result, status) {
                if (status !== 'OK' || !result || !result.routes || !result.routes[0]) {
                    resolve(null);
                    return;
                }
                var path = [];
                result.routes[0].legs.forEach(function (leg) {
                    leg.steps.forEach(function (step) {
                        step.path.forEach(function (pt) {
                            path.push({ lat: pt.lat(), lng: pt.lng() });
                        });
                    });
                });
                resolve(path.length > 1 ? path : null);
            });
        });
    }

    function _getRoutePath(fromIdx, toIdx) {
        var list = _places();
        var routes = global.DAXI_HAITI_ROUTES || [];
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return [];
        var leg = null;
        if (toIdx === fromIdx + 1) leg = routes[fromIdx];
        else if (toIdx === fromIdx - 1) {
            leg = routes[toIdx] ? routes[toIdx].slice().reverse() : null;
        }
        if (!leg || leg.length < 2) {
            return _densifyPath(_straightPath(list[fromIdx], list[toIdx], 56), 30);
        }
        var pts = leg.map(function (p) { return { lat: p[0], lng: p[1] }; });
        pts[0] = { lat: list[fromIdx].lat, lng: list[fromIdx].lng };
        pts[pts.length - 1] = { lat: list[toIdx].lat, lng: list[toIdx].lng };
        return _densifyPath(pts, 30);
    }

    function _ll(p) { return { lat: p.lat, lng: p.lng }; }

    function _lerp(a, b, t) { return a + (b - a) * t; }

    function _haversineM(a, b) {
        var R = 6371000;
        var dLat = (b.lat - a.lat) * Math.PI / 180;
        var dLng = (b.lng - a.lng) * Math.PI / 180;
        var lat1 = a.lat * Math.PI / 180;
        var lat2 = b.lat * Math.PI / 180;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function _segDist(a, b) {
        if (global.google && google.maps && google.maps.geometry && google.maps.geometry.spherical) {
            return google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(a.lat, a.lng),
                new google.maps.LatLng(b.lat, b.lng)
            );
        }
        return _haversineM(a, b);
    }


    function _pathKey(a, b) {
        return a.lat + ',' + a.lng + '|' + b.lat + ',' + b.lng;
    }

    function _normPath(path) {
        if (!path || !path.length) return [];
        return path.map(function (pt) {
            if (typeof pt.lat === 'function') return { lat: pt.lat(), lng: pt.lng() };
            if (Array.isArray(pt)) return { lat: pt[0], lng: pt[1] };
            return { lat: pt.lat, lng: pt.lng };
        });
    }

    function _pathLength(path) {
        if (!path || path.length < 2) return 0;
        var total = 0;
        for (var i = 0; i < path.length - 1; i++) {
            total += _segDist(path[i], path[i + 1]);
        }
        return total;
    }

    function _densifyPath(path, maxSegM) {
        maxSegM = maxSegM || 22;
        if (!path || path.length < 2) return path || [];
        var out = [path[0]];
        for (var i = 0; i < path.length - 1; i++) {
            var a = path[i];
            var b = path[i + 1];
            var dist = _segDist(a, b);
            var steps = Math.max(1, Math.ceil(dist / maxSegM));
            for (var s = 1; s <= steps; s++) {
                var f = s / steps;
                out.push({
                    lat: _lerp(a.lat, b.lat, f),
                    lng: _lerp(a.lng, b.lng, f)
                });
            }
        }
        return out;
    }

    function _buildPathSampler(path) {
        path = _normPath(path);
        if (!path.length) return { path: [], cum: [0], total: 0 };
        var cum = [0];
        for (var i = 1; i < path.length; i++) {
            cum[i] = cum[i - 1] + _segDist(path[i - 1], path[i]);
        }
        return { path: path, cum: cum, total: cum[cum.length - 1] || 0 };
    }

    function _sampleSampler(sampler, t) {
        var path = sampler.path;
        if (!path.length) return null;
        if (path.length === 1) return { lat: path[0].lat, lng: path[0].lng };
        var target = sampler.total * Math.max(0, Math.min(1, t));
        if (target <= 0) return { lat: path[0].lat, lng: path[0].lng };
        var lo = 0;
        for (var i = 1; i < path.length; i++) {
            if (sampler.cum[i] >= target) { lo = i - 1; break; }
            lo = i - 1;
        }
        var hi = Math.min(lo + 1, path.length - 1);
        var segLen = sampler.cum[hi] - sampler.cum[lo];
        var f = segLen > 0 ? (target - sampler.cum[lo]) / segLen : 0;
        var a = path[lo];
        var b = path[hi];
        return { lat: _lerp(a.lat, b.lat, f), lng: _lerp(a.lng, b.lng, f) };
    }

    function _bearingOnSampler(sampler, t) {
        var path = sampler.path;
        if (path.length < 2 || typeof global._calcBearing !== 'function') return 0;
        var idx = Math.min(path.length - 2, Math.max(0, Math.round(t * (path.length - 1))));
        var a = path[idx];
        var b = path[idx + 1];
        return global._calcBearing([a.lng, a.lat], [b.lng, b.lat]);
    }

    function _arrowScreenRotation(bearing) {
        var map = _map();
        var mapH = 0;
        try {
            if (map && typeof map.getHeading === 'function') mapH = map.getHeading() || 0;
        } catch (e) {}
        return bearing - mapH;
    }

    function _updateNavArrowRotation(bearing) {
        if (!_navMarkerEl) return;
        var arrow = _navMarkerEl.querySelector('.daxi-explorer-nav-arrow');
        if (arrow) arrow.style.transform = 'rotate(' + _arrowScreenRotation(bearing) + 'deg)';
    }

    function _prepareAnimPath(path, maxPts) {
        maxPts = maxPts || 140;
        var sampler = _buildPathSampler(path);
        if (sampler.path.length <= maxPts) return sampler;
        var trimmed = [];
        for (var i = 0; i < maxPts; i++) {
            var pt = _sampleSampler(sampler, i / (maxPts - 1));
            if (pt) trimmed.push(pt);
        }
        return _buildPathSampler(trimmed);
    }

    function _samplePath(path, t) {
        var pt = _sampleSampler(_buildPathSampler(path), t);
        return pt ? [pt.lng, pt.lat] : null;
    }

    function _bearingOnPath(path, t) {
        return _bearingOnSampler(_buildPathSampler(path), t);
    }

    function _straightPath(from, to, steps) {
        steps = steps || 64;
        var out = [];
        for (var i = 0; i <= steps; i++) {
            var f = i / steps;
            out.push({ lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f });
        }
        return out;
    }

    function _coordsToPath(coords) {
        if (!coords || !coords.length) return [];
        return coords.map(function (pt) {
            if (Array.isArray(pt)) return { lat: pt[0], lng: pt[1] };
            if (typeof pt.lat === 'function') return { lat: pt.lat(), lng: pt.lng() };
            return { lat: pt.lat, lng: pt.lng };
        });
    }

    function _fetchOsrmDirect(from, to) {
        var url = 'https://router.project-osrm.org/route/v1/driving/' +
            from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
            '?overview=full&geometries=geojson';
        return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
            if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) return null;
            var geom = data.routes[0].geometry;
            if (!geom || !geom.coordinates || geom.coordinates.length < 2) return null;
            return geom.coordinates.map(function (pt) { return { lat: pt[1], lng: pt[0] }; });
        }).catch(function () { return null; });
    }

    function _fetchSmartPath(from, to) {
        if (typeof global._fetchSmartRoute === 'function') {
            return global._fetchSmartRoute(from.lat, from.lng, to.lat, to.lng).then(function (res) {
                if (res && res.path && res.path.length > 1) return _coordsToPath(res.path);
                return null;
            }).catch(function () { return null; });
        }
        return _fetchOsrmDirect(from, to);
    }

    function _finalizePath(from, to, path) {
        var straight = _densifyPath(_straightPath(from, to, 96), 14);
        if (!path || path.length < 2) path = straight;
        path = _densifyPath(_normPath(path), 32);
        if (path.length > 1) {
            path[0] = { lat: from.lat, lng: from.lng };
            path[path.length - 1] = { lat: to.lat, lng: to.lng };
        }
        return path;
    }

    function _fetchPath(from, to) {
        var key = _pathKey(from, to);
        if (_routeCache[key]) return Promise.resolve(_routeCache[key]);

        var run = function () {
            return _fetchGoogleDirectionsPath(from, to).then(function (path) {
                if (!path || path.length < 2) {
                    return _fetchSmartPath(from, to).then(function (alt) {
                        return alt && alt.length > 1 ? alt : null;
                    });
                }
                return path;
            }).then(function (path) {
                path = _finalizePath(from, to, path);
                _routeCache[key] = path;
                return path;
            });
        };

        var queued = _routeFetchChain.then(run, run);
        _routeFetchChain = queued.catch(function () {});
        return queued;
    }

    function _travelDurationMs(path) {
        var dist = _pathLength(path);
        if (dist <= 0) return TRAVEL_MS;
        return Math.min(11000, Math.max(6200, Math.round(dist / 14)));
    }

    function _suppressForeignMapLayers() {
        if (window._bookingRouteGlow) window._bookingRouteGlow.setMap(null);
        if (window._bookingRouteLine) window._bookingRouteLine.setMap(null);
        if (global.DaxiRoutesMap && typeof global.DaxiRoutesMap.exit === 'function') {
            try { global.DaxiRoutesMap.exit(); } catch (e) {}
        }
    }

    function _restoreForeignMapLayers() {
        var map = _map();
        if (!map) return;
        if (window._bookingRouteGlow && window._bookingRouteGlow.getPath && window._bookingRouteGlow.getPath().length) {
            window._bookingRouteGlow.setMap(map);
        }
        if (window._bookingRouteLine && window._bookingRouteLine.getPath && window._bookingRouteLine.getPath().length) {
            window._bookingRouteLine.setMap(map);
        }
    }

    function _setGoogleMapLabelsHidden(hidden) {
        var map = _map();
        if (!map) return;
        try {
            map.setOptions({ clickableIcons: false });
        } catch (e) {}
    }

    function _prefetchImages(priorityIdx) {
        var list = _places();
        if (!list.length) return Promise.resolve();
        var jobs = [];
        if (priorityIdx != null && list[priorityIdx]) {
            jobs.push(_preloadImage(list[priorityIdx].image));
            jobs.push(_preloadImage(list[priorityIdx].detailImage));
        }
        list.forEach(function (p, i) {
            if (i === priorityIdx) return;
            jobs.push(_preloadImage(p.image));
            jobs.push(_preloadImage(p.detailImage));
        });
        _imagesPreloaded = true;
        return Promise.all(jobs);
    }

    function _prefetchAdjacent(idx) {
        if (_traveling) return;
        if (_prefetchTimer) clearTimeout(_prefetchTimer);
        _prefetchTimer = setTimeout(function () {
            if (_traveling) return;
            var list = _places();
            if (!list.length) return;
            var cur = list[idx];
            if (!cur) return;
            if (idx + 1 < list.length) _fetchPath(cur, list[idx + 1]);
            if (idx - 1 >= 0) _fetchPath(cur, list[idx - 1]);
        }, 1200);
    }

    function _invalidateTravel() {
        _pathToken++;
        if (_travelRaf) {
            cancelAnimationFrame(_travelRaf);
            _travelRaf = null;
        }
    }

    function _clearMapOverlays() {
        _lines.forEach(function (l) { if (l && l.setMap) l.setMap(null); });
        _glows.forEach(function (g) { if (g && g.setMap) g.setMap(null); });
        _markers.forEach(function (m) {
            if (m && m.map != null) m.map = null;
            else if (m && m.setMap) m.setMap(null);
        });
        _lines = [];
        _glows = [];
        _markers = [];
        _travelLine = null;
        _travelGlow = null;
        if (_navMarker) {
            if (_navMarker.map != null) _navMarker.map = null;
            else if (_navMarker.setMap) _navMarker.setMap(null);
            _navMarker = null;
            _navMarkerEl = null;
        }
    }

    function _placeMarkerContent(place, idx, isActive) {
        var anchor = document.createElement('div');
        anchor.className = 'daxi-explorer-pin-anchor';

        var stack = document.createElement('div');
        stack.className = 'daxi-explorer-pin-stack daxi-explorer-pin' +
            (isActive ? ' daxi-explorer-pin--active' : ' daxi-explorer-pin--idle');
        stack.style.cssText = 'pointer-events:auto;cursor:pointer;line-height:1;';

        var photoWrap = document.createElement('div');
        photoWrap.className = 'daxi-explorer-pin-photo-wrap';
        var img = document.createElement('img');
        img.alt = place.name;
        img.className = 'daxi-explorer-pin-photo daxi-explorer-pin-photo--loading';
        img.decoding = 'async';
        if (idx === 0) img.setAttribute('fetchpriority', 'high');
        var photoUrl = place.image;
        _preloadImage(photoUrl).then(function (url) {
            img.src = url;
            img.classList.remove('daxi-explorer-pin-photo--loading');
        });
        img.addEventListener('click', function (e) {
            e.stopPropagation();
            _openPhotoLightbox(place.detailImage || place.image, place.name);
        });
        photoWrap.appendChild(img);
        stack.appendChild(photoWrap);

        var shadow = document.createElement('div');
        shadow.className = 'daxi-explorer-pin-shadow';
        stack.appendChild(shadow);

        var lbl = document.createElement('div');
        lbl.className = 'daxi-explorer-pin-label';
        lbl.textContent = place.shortName || place.name;
        lbl.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!_traveling && idx !== _activeIdx && Math.abs(idx - _activeIdx) === 1) {
                travelToIndex(idx);
            }
        });
        stack.appendChild(lbl);

        anchor.appendChild(stack);
        return anchor;
    }

    function _drawMarkersForIndices(indices, highlightIdx) {
        var map = _map();
        var AME = _ame();
        if (!map || !AME || !indices || !indices.length) return;
        indices.forEach(function (idx) {
            var place = _places()[idx];
            if (!place) return;
            var isActive = idx === highlightIdx;
            var content = _placeMarkerContent(place, idx, isActive);
            _markers.push(new AME({
                map: map,
                position: _ll(place),
                content: content,
                zIndex: isActive ? 1400 : 1000 + idx,
                gmpClickable: true
            }));
        });
    }

    function _drawAllMarkers() {
        var map = _map();
        var AME = _ame();
        if (!map || !AME) return;
        _places().forEach(function (place, idx) {
            var isActive = idx === _activeIdx;
            var content = _placeMarkerContent(place, idx, isActive);
            var pos = _ll(place);
            _markers.push(new AME({
                map: map,
                position: pos,
                content: content,
                zIndex: isActive ? 1400 : 1000 + idx,
                gmpClickable: true
            }));
        });
    }

    function _initTravelLines(color) {
        var map = _map();
        if (!map) return;
        if (_travelGlow) { _travelGlow.setMap(null); _travelGlow = null; }
        if (_travelLine) { _travelLine.setMap(null); _travelLine = null; }
        _travelGlow = new google.maps.Polyline({
            path: [], map: map, strokeColor: color || '#f59e0b',
            strokeOpacity: 0.22, strokeWeight: 16, zIndex: 502, geodesic: false
        });
        _travelLine = new google.maps.Polyline({
            path: [], map: map, strokeColor: color || '#f59e0b',
            strokeOpacity: 0.92, strokeWeight: 4, zIndex: 503, geodesic: false
        });
        _glows.push(_travelGlow);
        _lines.push(_travelLine);
    }

    function _updateTravelLines(pathSlice) {
        if (_travelGlow) _travelGlow.setPath(pathSlice);
        if (_travelLine) _travelLine.setPath(pathSlice);
    }

    function _drawRouteLine(path, color) {
        var map = _map();
        if (!map || !path || path.length < 2) return;
        _glows.push(new google.maps.Polyline({
            path: path, map: map, strokeColor: color || '#f59e0b',
            strokeOpacity: 0.28, strokeWeight: 18, zIndex: 500, geodesic: false
        }));
        _lines.push(new google.maps.Polyline({
            path: path, map: map, strokeColor: color || '#f59e0b',
            strokeOpacity: 0.95, strokeWeight: 5, zIndex: 501, geodesic: false
        }));
    }

    function _navArrowEl() {
        var el = document.createElement('div');
        el.className = 'daxi-explorer-nav-marker';
        el.innerHTML = '<div class="daxi-explorer-nav-arrow"><i class="ri-arrow-up-s-fill"></i></div>';
        return el;
    }

    function _ensureNavMarker() {
        var map = _map();
        var AME = _ame();
        if (!map || _navMarker) return;
        _navMarkerEl = _navArrowEl();
        if (AME) {
            _navMarker = new AME({
                map: map,
                position: _ll(_places()[_activeIdx]),
                content: _navMarkerEl,
                zIndex: 2000
            });
        }
    }

    function _setTravelUi(on, label) {
        var bar = document.getElementById('daxi-explorer-travel');
        var prog = document.getElementById('daxi-explorer-travel-prog');
        var lbl = document.getElementById('daxi-explorer-travel-lbl');
        var prev = document.getElementById('daxi-explorer-prev');
        var next = document.getElementById('daxi-explorer-next');
        var placeBar = document.getElementById('daxi-explorer-place-bar');
        if (bar) bar.style.display = on ? 'flex' : 'none';
        if (lbl && label) lbl.textContent = label;
        if (prog && !on) prog.style.width = '0%';
        if (on) {
            if (prev) prev.disabled = true;
            if (next) next.disabled = true;
            document.querySelectorAll('.daxi-explorer-detail-book').forEach(function(btn) {
                btn.style.display = 'none';
            });
            if (_detailEl && _detailEl.classList.contains('open')) {
                _closeDetail();
            }
        } else {
            document.querySelectorAll('.daxi-explorer-detail-book').forEach(function(btn) {
                btn.style.display = '';
            });
            _updatePlaceBar();
        }
        if (placeBar) placeBar.style.opacity = on ? '0.35' : '1';
        if (placeBar) placeBar.style.pointerEvents = on ? 'none' : 'auto';
        document.body.classList.toggle('daxi-explorer-traveling', !!on);
        if (typeof global._daxiUpdateExpandFab === 'function') global._daxiUpdateExpandFab();
    }

    function _updateProgress(pct) {
        var prog = document.getElementById('daxi-explorer-travel-prog');
        if (prog) prog.style.width = Math.round(pct * 100) + '%';
    }

    function _updatePlaceBar() {
        var nameEl = document.getElementById('daxi-explorer-active-name');
        var moreBtn = document.getElementById('daxi-explorer-active-more');
        var place = _places()[_activeIdx];
        if (!place) return;
        if (nameEl) nameEl.textContent = place.name;
        if (moreBtn) {
            moreBtn.onclick = function () { _openDetail(_activeIdx); };
        }
        var prev = document.getElementById('daxi-explorer-prev');
        var next = document.getElementById('daxi-explorer-next');
        if (prev) prev.disabled = _activeIdx <= 0 || _traveling;
        if (next) next.disabled = _activeIdx >= _places().length - 1 || _traveling;
    }

    function _focusPlace(idx, animated) {
        var place = _places()[idx];
        if (!place) return Promise.resolve();
        var cam = { center: _ll(place), zoom: EXPLORER_ZOOM };
        if (_mapSupports3D()) {
            cam.tilt = EXPLORER_PITCH;
            cam.heading = animated ? 24 : 24;
        }
        return _moveCameraSafe(cam);
    }

    function _openDetail(idx) {
        var place = _places()[idx];
        if (!place || !_detailEl) return;
        var highlightsHtml = '';
        if (place.highlights && place.highlights.length) {
            highlightsHtml = '<h4>À découvrir</h4><ul class="daxi-explorer-detail-list">';
            place.highlights.forEach(function (h) {
                highlightsHtml += '<li>' + h + '</li>';
            });
            highlightsHtml += '</ul>';
        }
        var tipHtml = place.visitTip
            ? '<h4>Bon à savoir</h4><p class="daxi-explorer-detail-tip">' + place.visitTip + '</p>'
            : '';
        _detailEl.innerHTML =
            '<div class="daxi-explorer-detail-panel" onclick="event.stopPropagation()">' +
            '<button type="button" class="daxi-explorer-detail-close" id="daxi-explorer-detail-close"><i class="ri-close-line"></i></button>' +
            '<div class="daxi-explorer-detail-img" id="daxi-explorer-detail-hero" style="background-image:url(\'' + (place.detailImage || place.image) + '\')" role="button" tabindex="0" aria-label="Agrandir la photo"></div>' +
            '<div class="daxi-explorer-detail-scroll">' +
            '<h3>' + place.name + '</h3>' +
            highlightsHtml +
            '<h4>Description</h4><p>' + place.description + '</p>' +
            '<h4>Histoire</h4><p>' + place.history + '</p>' +
            tipHtml +
            '</div>' +
            '<button type="button" class="daxi-explorer-detail-book" data-place-name="' + place.name.replace(/"/g, '') + '">Commander un taxi</button>' +
            '</div>';
        _detailEl.classList.add('open');
        document.body.classList.add('daxi-explorer-detail-open');
        document.getElementById('daxi-explorer-detail-close').onclick = _closeDetail;
        var hero = document.getElementById('daxi-explorer-detail-hero');
        if (hero) {
            hero.onclick = function (e) {
                e.stopPropagation();
                _openPhotoLightbox(place.detailImage || place.image, place.name);
            };
        }
        var bookBtn = _detailEl.querySelector('.daxi-explorer-detail-book');
        if (bookBtn) {
            bookBtn.onclick = function () {
                _closeDetail();
                exit();
                if (typeof global.closeDaxiPage === 'function') global.closeDaxiPage();
                if (typeof global.tabGoBook === 'function') global.tabGoBook();
                var destIn = document.getElementById('destinationAddressArrival');
                var dh = document.getElementById('destinationHidden');
                var dlat = document.getElementById('destLatHidden');
                var dlng = document.getElementById('destLngHidden');
                if (destIn) { destIn.value = place.name; destIn.dataset.placeSelected = '1'; }
                if (dh) dh.value = place.name;
                if (dlat) dlat.value = place.lat;
                if (dlng) dlng.value = place.lng;
                if (typeof global._setMainMapBookingPoint === 'function') {
                    global._setMainMapBookingPoint('dest', place.lat, place.lng, 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: true });
                }
                if (typeof global._daxiSetSheetMode === 'function') global._daxiSetSheetMode('form');
            };
        }
    }

    function _closeDetail() {
        if (_detailEl) _detailEl.classList.remove('open');
        document.body.classList.remove('daxi-explorer-detail-open');
    }

    function _ensureHud() {
        if (_hud) return _hud;
        _hud = document.createElement('div');
        _hud.id = 'daxi-explorer-hud';
        _hud.innerHTML =
            '<div class="daxi-explorer-hud-top">' +
            '<button type="button" id="daxi-explorer-close" class="daxi-explorer-hud-close" aria-label="Fermer"><i class="ri-arrow-left-line"></i></button>' +
            '<span class="daxi-explorer-hud-title" data-translate="discover_haiti">Découvrez Haïti</span>' +
            '<span style="width:36px;"></span>' +
            '</div>' +
            '<div class="daxi-explorer-travel" id="daxi-explorer-travel" style="display:none;">' +
            '<div class="daxi-explorer-travel-track"><div class="daxi-explorer-travel-prog" id="daxi-explorer-travel-prog"></div></div>' +
            '<span id="daxi-explorer-travel-lbl">Voyage en cours…</span>' +
            '</div>' +
            '<div class="daxi-explorer-nav-row">' +
            '<button type="button" id="daxi-explorer-prev" class="daxi-explorer-nav-btn"><i class="ri-arrow-left-s-line"></i> Précédent</button>' +
            '<button type="button" id="daxi-explorer-next" class="daxi-explorer-nav-btn">Suivant <i class="ri-arrow-right-s-line"></i></button>' +
            '</div>' +
            '<div class="daxi-explorer-place-bar" id="daxi-explorer-place-bar">' +
            '<div id="daxi-explorer-active-name" class="daxi-explorer-active-name">—</div>' +
            '<button type="button" id="daxi-explorer-active-more" class="daxi-explorer-active-more">En savoir plus</button>' +
            '</div>';
        document.body.appendChild(_hud);

        _detailEl = document.createElement('div');
        _detailEl.id = 'daxi-explorer-detail';
        _detailEl.className = 'daxi-explorer-detail';
        _detailEl.onclick = _closeDetail;
        document.body.appendChild(_detailEl);

        document.getElementById('daxi-explorer-prev').onclick = function () { goRelative(-1); };
        document.getElementById('daxi-explorer-next').onclick = function () { goRelative(1); };
        document.getElementById('daxi-explorer-prev').disabled = true;
        document.getElementById('daxi-explorer-close').onclick = function () {
            exit();
            if (typeof global.tabGoBook === 'function') global.tabGoBook();
        };
        return _hud;
    }

    function _activatePlace(idx, skipFocus) {
        _activeIdx = idx;
        _clearMapOverlays();
        _drawAllMarkers();
        _updatePlaceBar();
        if (!skipFocus && !_traveling) _focusPlace(idx, true);
    }

    function travelToIndex(targetIdx) {
        var list = _places();
        if (_traveling || targetIdx < 0 || targetIdx >= list.length || targetIdx === _activeIdx) return;
        if (Math.abs(targetIdx - _activeIdx) !== 1) return;

        var from = list[_activeIdx];
        var to = list[targetIdx];

        _traveling = true;
        document.body.classList.add('daxi-explorer-traveling');
        global._daxiSuppressGpsPan = true;
        _closeDetail();
        _setTravelUi(true, 'Calcul itinéraire…');

        _fetchPath(from, to).then(function (path) {
            if (!_traveling) return;
            if (!path || path.length < 2) {
                _traveling = false;
                _setTravelUi(false);
                return;
            }
            _setTravelUi(true, 'Préparation du voyage…');
            _runTravelAnimation(path, from, to, targetIdx);
        }).catch(function () {
            _traveling = false;
            _setTravelUi(false);
        });
    }

    function _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function _runTravelAnimation(path, from, to, targetIdx) {
        var map = _map();
        if (!map || !path || path.length < 2) {
            _traveling = false;
            _setTravelUi(false);
            _activatePlace(targetIdx);
            return;
        }

        _invalidateTravel();
        var token = _pathToken;
        var fromIdx = _activeIdx;
        var sampler = _prepareAnimPath(path, 100);
        var animPath = sampler.path;

        _clearMapOverlays();
        _drawMarkersForIndices([fromIdx, targetIdx], fromIdx);
        _initTravelLines(to.color || '#f59e0b');
        _ensureNavMarker();

        _setTravelUi(true, 'Vue d\'ensemble…');
        _animateFitBounds([fromIdx, targetIdx], animPath, true).then(function () {
            if (token !== _pathToken || !_traveling) return;
            _setTravelUi(true, 'Vers ' + (to.shortName || to.name) + '…');
            return _sleep(350);
        }).then(function () {
            if (token !== _pathToken || !_traveling) return;
            _startCruisePhase(sampler, animPath, to, targetIdx, token);
        });
    }

    function _startCruisePhase(sampler, animPath, to, targetIdx, token) {
        var travelMs = _travelDurationMs(animPath);
        var start = performance.now();
        var lastHeading = _bearingOnSampler(sampler, 0);
        var pathIdx = 0;
        var map = _map();

        if (map && _mapSupports3D()) {
            map.setTilt(0);
            map.setHeading(0);
        }
        _updateTravelLines([animPath[0]]);
        if (_navMarker) {
            if (_navMarker.position) _navMarker.position = animPath[0];
            _updateNavArrowRotation(lastHeading);
        }

        function frame(now) {
            if (token !== _pathToken || !_traveling) return;

            var rawT = Math.min(1, (now - start) / travelMs);
            var t = _easeInOut(rawT);
            _updateProgress(rawT);

            var pt = _sampleSampler(sampler, t);
            if (!pt) {
                if (rawT < 1) _travelRaf = requestAnimationFrame(frame);
                else _finishArrival(targetIdx, to, lastHeading, token);
                return;
            }

            lastHeading = _bearingOnSampler(sampler, t);

            if (_navMarker) {
                if (_navMarker.position) _navMarker.position = pt;
                else if (_navMarker.setPosition) _navMarker.setPosition(pt);
                _updateNavArrowRotation(lastHeading);
            }

            pathIdx = Math.max(pathIdx, Math.round(t * (animPath.length - 1)));
            _updateTravelLines(animPath.slice(0, pathIdx + 1));

            try {
                map.setCenter(pt);
            } catch (e) {}

            if (rawT < 1) {
                _travelRaf = requestAnimationFrame(frame);
            } else {
                _finishArrival(targetIdx, to, lastHeading, token);
            }
        }

        _travelRaf = requestAnimationFrame(frame);
    }

    function _finishArrival(targetIdx, to, heading, token) {
        if (token !== _pathToken) return;
        if (_navMarker) {
            if (_navMarker.map != null) _navMarker.map = null;
            _navMarker = null;
            _navMarkerEl = null;
        }

        _setTravelUi(true, 'Arrivée…');
        var fromCam = _readCamera();
        var arriveCam = {
            center: _ll(to),
            zoom: EXPLORER_ZOOM,
            tilt: EXPLORER_PITCH,
            heading: 26
        };

        if (!fromCam) fromCam = { center: _ll(to), zoom: EXPLORER_ZOOM_CRUISE, tilt: 0, heading: 0 };

        _animateCameraLerp(fromCam, arriveCam, ZOOM_IN_MS).then(function () {
            if (token !== _pathToken) return;
            return _cinematicOrbit(_ll(to), 26, 94, 2400);
        }).then(function () {
            if (token !== _pathToken) return;
            _traveling = false;
            _setTravelUi(false);
            _activeIdx = targetIdx;
            _clearMapOverlays();
            _drawAllMarkers();
            _updatePlaceBar();
            _prefetchAdjacent(targetIdx);
            var bar = document.getElementById('daxi-explorer-place-bar');
            if (bar) {
                bar.classList.add('daxi-explorer-place-bar--pulse');
                setTimeout(function () { bar.classList.remove('daxi-explorer-place-bar--pulse'); }, 900);
            }
        });
    }

    function goRelative(delta) {
        var list = _places();
        if (!list.length || _traveling) return;
        var next = _activeIdx + delta;
        if (next < 0 || next >= list.length) return;
        document.body.classList.add('daxi-explorer-traveling');
        if (typeof global._daxiUpdateExpandFab === 'function') global._daxiUpdateExpandFab();
        travelToIndex(next);
    }

    function enter() {
        if (!_places().length) return;

        var offline = (typeof navigator !== 'undefined' && navigator.onLine === false) ||
            (global.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) ||
            !!global._daxiOfflineMapMode || !!global._daxiExternalMapsBlocked;
        if (offline) {
            if (typeof global._daxiShowMapNeedOnline === 'function') {
                global._daxiShowMapNeedOnline('explorer');
            } else {
                alert('Connexion internet requise pour Découvrir Haïti (carte interactive).');
            }
            var onBack = function () {
                window.removeEventListener('online', onBack);
                if (global.DaxiNetworkState && DaxiNetworkState.isOnline && !DaxiNetworkState.isOnline()) return;
                enter();
            };
            window.addEventListener('online', onBack);
            return;
        }

        var mapsReady = typeof global._daxiIsGoogleMapsReady === 'function' && global._daxiIsGoogleMapsReady();

        if (!mapsReady || !_map()) {
            _enterAttempts++;
            if (_enterAttempts > 80) {
                if (typeof global._daxiShowMapNeedOnline === 'function') {
                    global._daxiShowMapNeedOnline('explorer');
                } else {
                    console.warn('[DaxiExplorer] Carte indisponible — réessayez dans un instant.');
                }
                _enterAttempts = 0;
                return;
            }
            if (typeof global._daxiLoadGoogleMaps === 'function') {
                global._daxiLoadGoogleMaps();
            }
            if (!mapsReady && global.google && global.google.maps &&
                typeof global.google.maps.importLibrary === 'function' &&
                typeof global._daxiEnsureGoogleMapsReady === 'function') {
                global._daxiEnsureGoogleMapsReady().then(function (ready) {
                    if (ready && typeof global._initClientBgMap === 'function' && !global._clientBgMap) {
                        global._initClientBgMap();
                    }
                    setTimeout(enter, 50);
                }).catch(function () {
                    setTimeout(enter, 250);
                });
                return;
            }
            if (mapsReady && typeof global._initClientBgMap === 'function' && !global._clientBgMap) {
                global._initClientBgMap();
            }
            setTimeout(enter, 250);
            return;
        }

        _enterAttempts = 0;
        window._daxiPendingExplorer = false;
        if (typeof global.closeDaxiPage === 'function') global.closeDaxiPage();
        _ensureHud();
        _hud.style.display = 'block';
        document.body.classList.add('daxi-explorer-mode');
        var overlay = document.getElementById('daxiPageOverlay');
        if (overlay) overlay.classList.remove('show', 'slide-in');
        global._daxiSuppressGpsPan = true;
        global._daxiMapUserInteracting = false;
        _activeIdx = 0;
        _traveling = false;
        _suppressForeignMapLayers();
        _hideForeignMarkers();
        _setGoogleMapLabelsHidden(true);
        _updatePlaceBar();

        var lbl = document.getElementById('daxi-explorer-travel-lbl');
        if (lbl) lbl.textContent = 'Chargement…';

        _resolveAllPlaces().then(function () {
            return _prefetchImages(0);
        }).then(function () {
            return _ensureMarkerLib();
        }).then(function () {
            _activatePlace(0, true);
            var allIdx = [];
            for (var i = 0; i < _places().length; i++) allIdx.push(i);
            return _animateFitBounds(allIdx);
        }).then(function () {
            return _focusPlace(0, true);
        }).then(function () {
            return _cinematicOrbit(_ll(_places()[0]), 24, 58, 1800);
        }).then(function () {
            _prefetchAdjacent(0);
            if (typeof global._syncMapFloatControls === 'function') global._syncMapFloatControls();
            if (typeof global.applyDaxiTranslations === 'function') global.applyDaxiTranslations();
        });
    }

    function exit() {
        _invalidateTravel();
        _traveling = false;
        if (_hud) _hud.style.display = 'none';
        _closeDetail();
        _closeLightbox();
        document.body.classList.remove('daxi-explorer-mode');
        document.body.classList.remove('daxi-explorer-traveling');
        document.body.classList.remove('daxi-explorer-detail-open');
        document.body.classList.remove('daxi-explorer-lightbox-open');
        if (typeof global._daxiUpdateExpandFab === 'function') global._daxiUpdateExpandFab();
        global._daxiSuppressGpsPan = false;
        _setGoogleMapLabelsHidden(false);
        _restoreForeignMapLayers();
        _restoreForeignMarkers();
        if (_prefetchTimer) { clearTimeout(_prefetchTimer); _prefetchTimer = null; }
        _clearMapOverlays();
        var map = _map();
        if (map && typeof map.getCenter === 'function' && typeof map.getZoom === 'function') {
            _moveCameraSafe({ center: map.getCenter(), zoom: map.getZoom(), tilt: 0, heading: 0 });
        }
        _enterAttempts = 0;
        if (typeof global._syncMapFloatControls === 'function') global._syncMapFloatControls();
    }

    global.DaxiExplorerMap = {
        enter: enter,
        exit: exit,
        travelToIndex: travelToIndex,
        goNext: function () { goRelative(1); },
        goPrev: function () { goRelative(-1); },
        preload: function () { return _prefetchImages(0); }
    };
})(typeof window !== 'undefined' ? window : this);
