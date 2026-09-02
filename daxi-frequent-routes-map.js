
(function (global) {
    'use strict';

    var ROUTE_COLORS = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    var _lines = [];
    var _glows = [];
    var _markers = [];
    var _activeIdx = -1;
    var _hud = null;
    var _routeDrawToken = 0;
    var _preloaded = false;
    var _trackBound = false;
    var _scrollRaf = null;
    var _scrollSnapTimer = null;
    var _ignoreScrollSelect = false;
    var _routePathApiCache = {};
    var _fetchingRouteKey = null;

    function _routes() { return global.DAXI_FREQUENT_ROUTES || []; }

    function _routeSlug(route) {
        if (global._daxiRouteSlug) return global._daxiRouteSlug(route);
        return String((route && route.from) || '') + '-' + String((route && route.to) || '');
    }

    function _syncRouteUrl(idx) {
        if (global._daxiRouteFromNav && global._daxiRouteFromNav()) return;
        var route = _routes()[idx];
        if (!route || typeof global.daxiSetRoute !== 'function') return;
        global.daxiSetRoute('itineraires', _routeSlug(route));
    }

    function _applyPendingRouteSlug() {
        var slug = global._daxiPendingRouteSlug;
        if (!slug) return;
        global._daxiPendingRouteSlug = null;
        var idx = global._daxiRouteIndexFromSlug ? global._daxiRouteIndexFromSlug(slug) : -1;
        if (idx < 0) {
            _routes().some(function(route, i) {
                if (_routeSlug(route) === slug) { idx = i; return true; }
                return false;
            });
        }
        if (idx >= 0) selectRoute(idx);
    }

    function selectRouteBySlug(slug) {
        var idx = global._daxiRouteIndexFromSlug ? global._daxiRouteIndexFromSlug(slug) : -1;
        if (idx < 0) {
            _routes().some(function(route, i) {
                if (_routeSlug(route) === slug) { idx = i; return true; }
                return false;
            });
        }
        if (idx >= 0) selectRoute(idx);
        return idx;
    }

    function _tabBarH() {
        return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height'), 10) || 60;
    }

    function _cityImages(name, idx, slot) {
        if (global.DAXI_PICK_CITY_IMAGES) {
            return global.DAXI_PICK_CITY_IMAGES(name, idx || 0, slot || 'from');
        }
        if (name === 'Cap-Haïtien' && global.DAXI_CAP_HAITIEN_IMAGES && global.DAXI_CAP_HAITIEN_IMAGES.length) {
            var all = global.DAXI_CAP_HAITIEN_IMAGES;
            var base = ((idx || 0) * 2) + (slot === 'to' ? 1 : 0);
            return [all[base % all.length], all[(base + 1) % all.length]];
        }
        var m = global.DAXI_CITY_IMAGES || {};
        return (m[name] || []).slice(0, 2);
    }

    function _cityImgUrl(name, idx) {
        var imgs = _cityImages(name, idx);
        return imgs.length ? imgs[0].url : '';
    }

    function _cityCoord(name, fallback) {
        if (name === 'Folibètè') name = 'Fòlibète';
        var table = global.DAXI_CITY_COORDS || {};
        var c = table[name];
        if (c && c.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
        if (fallback && fallback.lat != null) return { lat: fallback.lat, lng: fallback.lng };
        return null;
    }

    function _openCityLightbox(url, alt, cityName) {
        var lb = document.getElementById('daxiCityLightbox');
        var img = document.getElementById('daxiCityLightboxImg');
        var cap = document.getElementById('daxiCityLightboxCaption');
        if (!lb || !img || !url) return;
        img.src = url;
        img.alt = alt || cityName || '';
        if (cap) cap.textContent = cityName || alt || '';
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function _closeCityLightbox() {
        var lb = document.getElementById('daxiCityLightbox');
        if (!lb) return;
        lb.classList.remove('open');
        document.body.style.overflow = '';
    }
    global._daxiOpenCityLightbox = _openCityLightbox;
    global._daxiCloseCityLightbox = _closeCityLightbox;

    function _pathToLatLngs(path) {
        return (path || []).map(function (p) { return { lat: p[0], lng: p[1] }; });
    }

    function _parseKm(dist) {
        if (!dist) return null;
        var m = String(dist).match(/([\d.]+)/);
        return m ? parseFloat(m[1]) : null;
    }

    function _estPriceUsd(km) {
        if (!km) return null;
        return (km * 0.35).toFixed(2);
    }

    function preloadImages(allRoutes) {
        var urls = {};
        var list = allRoutes ? _routes() : _routes().slice(0, 2);
        list.forEach(function (r, idx) {
            var a = _cityImgUrl(r.from, idx);
            var b = _cityImgUrl(r.to, idx + 1);
            if (a) urls[a] = 1;
            if (b) urls[b] = 1;
        });
        Object.keys(urls).forEach(function (url) {
            var im = new Image();
            im.decoding = 'async';
            im.src = url;
        });
        if (!allRoutes) _preloaded = true;
    }

    var _warmedUp = false;
    var _warmingPromise = null;

    function _setRoutesHudLoading(on) {
        _ensureHud();
        var el = document.getElementById('daxi-routes-boot');
        if (!el) {
            el = document.createElement('div');
            el.id = 'daxi-routes-boot';
            el.className = 'daxi-routes-boot';
            el.innerHTML = '<div class="daxi-routes-boot__ring" aria-hidden="true"></div><span>Chargement des itinéraires…</span>';
            _hud.appendChild(el);
        }
        el.style.display = on ? 'flex' : 'none';
        if (_hud) _hud.style.pointerEvents = on ? 'auto' : '';
    }

    function warmup(opts) {
        opts = opts || {};
        if (_warmedUp) return Promise.resolve();
        if (_warmingPromise) return _warmingPromise;

        _warmingPromise = new Promise(function (resolve) {
            var finished = false;
            function finish() {
                if (finished) return;
                finished = true;
                _warmedUp = true;
                _warmingPromise = null;
                resolve();
            }

            _ensureHud();
            if (_hud) _hud.style.display = 'none';

            var routes = _routes();
            if (!routes.length) {
                finish();
                return;
            }

            var track = document.getElementById('daxi-routes-track');
            if (!track || !track.children.length) _renderTrack();
            preloadImages(true);

            var pending = 0;
            routes.forEach(function (route) {
                var cacheKey = _routeKey(route);
                if (_routePathApiCache[cacheKey] && _routePathApiCache[cacheKey].length > 1) return;
                var fromPos = _cityCoord(route.from);
                var toPos = _cityCoord(route.to);
                if (!fromPos || !toPos) return;
                if (!isFinite(fromPos.lat) || !isFinite(fromPos.lng) || !isFinite(toPos.lat) || !isFinite(toPos.lng)) return;
                if (!global._daxiMapTilesReadySignaled) return;
                pending++;
                _fetchRoutesMapPath(fromPos, toPos)
                    .then(function (path) {
                        if (path && path.length > 1) _routePathApiCache[cacheKey] = path;
                    })
                    .catch(function () {})
                    .finally(function () {
                        pending--;
                        if (pending <= 0) finish();
                    });
            });

            if (pending === 0) finish();
            setTimeout(finish, opts.timeoutMs || 15000);
        });

        return _warmingPromise;
    }

    function _bootWarmupPoll() {
        if (_warmedUp || _warmingPromise) return;
        if (global._daxiOfflineMapMode || global._daxiExternalMapsBlocked) return;
        if (!global._clientBgMap || !global.google) return;
        if (!global._daxiMapTilesReadySignaled) return;
        if (window._daxiRoutesWarmupStarted) return;
        window._daxiRoutesWarmupStarted = true;

        var lbl = document.getElementById('daxiMapLoaderLabel');
        if (lbl && !window._daxiLoaderDismissed) {
            lbl.removeAttribute('data-translate');
            lbl.textContent = 'Préparation des itinéraires…';
        }

        warmup({ timeoutMs: 15000 }).then(function () {
            window._daxiBootState = window._daxiBootState || {};
            window._daxiBootState.routesReady = true;
            if (typeof global._daxiTryDismissInitialLoader === 'function') {
                global._daxiTryDismissInitialLoader();
            }
        });
    }

    function _routeKey(route) {
        return route.from + '|' + route.to;
    }

    function _previewPathFor(route) {
        if (route.realPath && route.realPath.length > 1) return _pathToLatLngs(route.realPath);
        var fromPos = _cityCoord(route.from);
        var toPos = _cityCoord(route.to);
        if (!fromPos || !toPos) return null;
        return [{ lat: fromPos.lat, lng: fromPos.lng }, { lat: toPos.lat, lng: toPos.lng }];
    }

    function _finalizeRoutePath(fromPos, toPos, path) {
        if (!path || path.length < 2) return path;
        path = path.slice();
        path[0] = { lat: fromPos.lat, lng: fromPos.lng };
        path[path.length - 1] = { lat: toPos.lat, lng: toPos.lng };
        return path;
    }

    function _fetchOsrmPath(fromPos, toPos) {
        var url = 'https://router.project-osrm.org/route/v1/driving/' +
            fromPos.lng + ',' + fromPos.lat + ';' + toPos.lng + ',' + toPos.lat +
            '?overview=full&geometries=geojson';
        return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
            if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) return null;
            var geom = data.routes[0].geometry;
            if (!geom || !geom.coordinates || geom.coordinates.length < 2) return null;
            return geom.coordinates.map(function (pt) { return { lat: pt[1], lng: pt[0] }; });
        }).catch(function () { return null; });
    }

    function _fetchRoutesMapPath(fromPos, toPos) {
        var chain = Promise.resolve(null);
        if (typeof global._fetchRoute === 'function') {
            chain = global._fetchRoute(fromPos.lng, fromPos.lat, toPos.lng, toPos.lat, null, 0).then(function (res) {
                return (res && res.path && res.path.length > 1) ? res.path : null;
            }).catch(function () { return null; });
        }
        return chain.then(function (path) {
            if (path && path.length > 1) return path;
            return _fetchOsrmPath(fromPos, toPos);
        }).then(function (path) {
            path = _finalizeRoutePath(fromPos, toPos, path);
            return (path && path.length > 1) ? path : null;
        });
    }

    function _ensureHud() {
        if (_hud) return _hud;
        _hud = document.createElement('div');
        _hud.id = 'daxi-routes-map-hud';
        _hud.innerHTML =
            '<div class="daxi-routes-hud-top">' +
            '<div class="daxi-routes-hud-title">Itinéraires fréquents</div>' +
            '<button type="button" id="daxi-routes-close" class="daxi-routes-hud-btn" aria-label="Fermer"><i class="ri-close-line"></i></button>' +
            '</div>' +
            '<div class="daxi-routes-h-strip">' +
            '<div id="daxi-routes-track" class="daxi-routes-track"></div>' +
            '</div>';
        document.body.appendChild(_hud);
        document.getElementById('daxi-routes-close').onclick = exit;
        return _hud;
    }

    function _applyTrackPadding() {
        var track = document.getElementById('daxi-routes-track');
        if (!track) return;
        var card = track.querySelector('.daxi-routes-card');
        if (!card) return;
        var pad = Math.max(0, (track.clientWidth - card.offsetWidth) / 2);
        track.style.paddingLeft = pad + 'px';
        track.style.paddingRight = pad + 'px';
    }

    function _centerScrollIdx() {
        var track = document.getElementById('daxi-routes-track');
        if (!track) return -1;
        var cards = track.querySelectorAll('.daxi-routes-card');
        if (!cards.length) return -1;
        var center = track.scrollLeft + track.clientWidth / 2;
        var best = 0;
        var bestDist = Infinity;
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var cardCenter = card.offsetLeft + card.offsetWidth / 2;
            var dist = Math.abs(center - cardCenter);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    function _scrollCardToCenter(idx, behavior) {
        var track = document.getElementById('daxi-routes-track');
        var card = track && track.querySelector('[data-route-idx="' + idx + '"]');
        if (!track || !card) return;
        var left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        _ignoreScrollSelect = true;
        track.scrollTo({ left: Math.max(0, left), behavior: behavior || 'smooth' });
        setTimeout(function () { _ignoreScrollSelect = false; }, behavior === 'auto' ? 0 : 420);
    }

    function _updateActiveCardClass(idx) {
        var track = document.getElementById('daxi-routes-track');
        if (!track) return;
        track.querySelectorAll('.daxi-routes-card').forEach(function (card) {
            var i = parseInt(card.dataset.routeIdx, 10);
            card.classList.toggle('daxi-routes-card--active', i === idx);
        });
    }

    function _onTrackScroll() {
        if (_ignoreScrollSelect) return;
        if (_scrollRaf) cancelAnimationFrame(_scrollRaf);
        _scrollRaf = requestAnimationFrame(function () {
            var idx = _centerScrollIdx();
            if (idx >= 0 && idx !== _activeIdx) _activateRoute(idx, false);
        });
        if (_scrollSnapTimer) clearTimeout(_scrollSnapTimer);
        _scrollSnapTimer = setTimeout(function () {
            var idx = _centerScrollIdx();
            if (idx >= 0 && idx !== _activeIdx) _activateRoute(idx, false);
        }, 120);
    }

    function _bindTrackEvents() {
        if (_trackBound) return;
        var track = document.getElementById('daxi-routes-track');
        if (!track) return;
        _trackBound = true;
        track.addEventListener('scroll', _onTrackScroll, { passive: true });
        global.addEventListener('resize', function () {
            if (!_hud || _hud.style.display === 'none') return;
            _applyTrackPadding();
            if (_activeIdx >= 0) _scrollCardToCenter(_activeIdx, 'auto');
        });
    }

    function _cityMarkerEl(name, imgUrl, color) {
        var w = document.createElement('div');
        w.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;line-height:1;';
        if (imgUrl) {
            var img = document.createElement('img');
            img.src = imgUrl;
            img.alt = name;
            img.style.cssText = 'width:44px;height:44px;border-radius:10px;object-fit:cover;border:2px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.45);margin-bottom:4px;display:block;';
            w.appendChild(img);
        } else {
            var dot = document.createElement('div');
            dot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid #fff;margin-bottom:4px;';
            w.appendChild(dot);
        }
        var lbl = document.createElement('div');
        lbl.textContent = name;
        lbl.style.cssText = 'padding:2px 7px;border-radius:8px;background:rgba(8,14,35,.92);color:#f8fafc;font-size:9px;font-weight:700;white-space:nowrap;';
        w.appendChild(lbl);
        w.addEventListener('click', function (e) {
            e.stopPropagation();
            if (imgUrl && global._daxiOpenCityLightbox) {
                global._daxiOpenCityLightbox(imgUrl, name, name);
            }
        });
        return w;
    }

    function _placeCityMarker(map, AME, pos, name, imgUrl, color) {
        if (!pos || !map) return;
        var content = _cityMarkerEl(name, imgUrl, color);
        if (AME) {
            _markers.push(new AME({
                map: map,
                position: pos,
                content: content,
                zIndex: 900,
                title: name
            }));
            return;
        }
        _markers.push(new google.maps.Marker({
            map: map,
            position: pos,
            zIndex: 900,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 0,
                anchor: new google.maps.Point(0, 0)
            },
            label: {
                text: name,
                color: '#f8fafc',
                fontSize: '9px',
                fontWeight: '700'
            }
        }));
    }

    function _clearMap() {
        _routeDrawToken++;
        _lines.forEach(function (l) { if (l) l.setMap(null); });
        _glows.forEach(function (g) { if (g) g.setMap(null); });
        _markers.forEach(function (m) {
            if (m.map != null) m.map = null;
            else if (m.setMap) m.setMap(null);
        });
        _lines = [];
        _glows = [];
        _markers = [];
    }

    function _drawPathOnMap(path, idx, map, route, AME, styleOpts) {
        if (!path || path.length < 2) return;
        styleOpts = styleOpts || {};
        var token = _routeDrawToken;
        var color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
        var lineOpacity = styleOpts.lineOpacity != null ? styleOpts.lineOpacity : 0.95;
        var glowOpacity = styleOpts.glowOpacity != null ? styleOpts.glowOpacity : 0.2;

        var glow = new google.maps.Polyline({
            path: path, map: map, strokeColor: color, strokeOpacity: glowOpacity, strokeWeight: 14, zIndex: 400, geodesic: false
        });
        var line = new google.maps.Polyline({
            path: path, map: map, strokeColor: color, strokeOpacity: lineOpacity, strokeWeight: 5, zIndex: 401, geodesic: false
        });
        _glows.push(glow);
        _lines.push(line);

        if (route) {
            var fromImg = _cityImgUrl(route.from, idx);
            var toImg = _cityImgUrl(route.to, idx + 1);
            var fromPos = _cityCoord(route.from);
            var toPos = _cityCoord(route.to);
            if (fromPos) _placeCityMarker(map, AME, fromPos, route.from, fromImg, color);
            if (toPos) _placeCityMarker(map, AME, toPos, route.to, toImg, color);
        }

        if (token !== _routeDrawToken) {
            glow.setMap(null);
            line.setMap(null);
        }
    }

    function _fitPathBounds(path) {
        if (!path || !path.length || !global._clientBgMap) return;
        var b = new google.maps.LatLngBounds();
        path.forEach(function (p) { b.extend(p); });
        var bottom = _tabBarH() + 168;
        global._clientBgMap.fitBounds(b, { top: 56, right: 36, bottom: bottom, left: 36 });
        if (global._clientBgMap.getTilt() > 10) global._clientBgMap.setTilt(0);
    }

    function _drawRoute(route, idx, map, AME) {
        var fromPos = _cityCoord(route.from);
        var toPos = _cityCoord(route.to);
        if (!fromPos || !toPos) return;

        var cacheKey = _routeKey(route);
        if (_routePathApiCache[cacheKey] && _routePathApiCache[cacheKey].length > 1) {
            _drawPathOnMap(_routePathApiCache[cacheKey], idx, map, route, AME);
            _fitPathBounds(_routePathApiCache[cacheKey]);
            return;
        }

        if (_fetchingRouteKey === cacheKey) return;
        _fetchingRouteKey = cacheKey;

        var preview = _previewPathFor(route);
        if (preview && preview.length > 1) {
            _drawPathOnMap(preview, idx, map, route, AME, { lineOpacity: 0.35, glowOpacity: 0.08 });
        }

        _fetchRoutesMapPath(fromPos, toPos).then(function (path) {
            _fetchingRouteKey = null;
            if (_activeIdx !== idx) return;
            if (path && path.length > 1) {
                _routePathApiCache[cacheKey] = path;
                _clearMap();
                _drawPathOnMap(path, idx, map, route, AME);
                _fitPathBounds(path);
            }
        }).catch(function () {
            _fetchingRouteKey = null;
        });
    }

    function _prefetchAllRoutes() {
        _routes().forEach(function (route) {
            var cacheKey = _routeKey(route);
            if (_routePathApiCache[cacheKey]) return;
            var fromPos = _cityCoord(route.from);
            var toPos = _cityCoord(route.to);
            if (!fromPos || !toPos) return;
            _fetchRoutesMapPath(fromPos, toPos).then(function (path) {
                if (path && path.length > 1) _routePathApiCache[cacheKey] = path;
            }).catch(function () {});
        });
    }

    function _cardImagesHtml(route, idx) {
        var fromImgs = _cityImages(route.from, idx, 'from');
        var toImgs = _cityImages(route.to, idx, 'to');
        var items = [];
        fromImgs.forEach(function (img) {
            if (img && img.url) items.push({ img: img, city: route.from });
        });
        toImgs.forEach(function (img) {
            if (img && img.url) items.push({ img: img, city: route.to });
        });
        if (!items.length) return '';
        var html = '<div class="daxi-routes-card-imgs">';
        items.forEach(function (p) {
            html += '<img src="' + p.img.url + '" alt="' + (p.img.alt || p.city) + '" loading="eager" decoding="async" fetchpriority="high" data-lightbox="1" data-city="' + p.city + '">';
        });
        html += '</div>';
        return html;
    }

    function _renderTrack() {
        var track = document.getElementById('daxi-routes-track');
        if (!track) return;
        track.innerHTML = '';
        _routes().forEach(function (route, idx) {
            var km = _parseKm(route.distance);
            var price = route.priceUsd != null ? route.priceUsd : _estPriceUsd(km);
            var priceLabel = route.priceUsd != null ? ('$' + route.priceUsd) : (price ? ('~$' + price) : '');
            var color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            var card = document.createElement('div');
            card.className = 'daxi-routes-card' + (idx === _activeIdx ? ' daxi-routes-card--active' : '');
            card.dataset.routeIdx = String(idx);
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.innerHTML =
                _cardImagesHtml(route, idx) +
                '<div class="daxi-routes-card-route" style="color:' + color + ';">' + route.from + ' → ' + route.to + '</div>' +
                '<div class="daxi-routes-card-meta">' + (route.distance || '—') + ' · ' + (route.duration || '—') +
                (priceLabel ? ' · ' + priceLabel : '') + '</div>' +
                '<div class="daxi-routes-card-hint">Double-tap pour réserver</div>';
            card.addEventListener('click', function () { selectRoute(idx); });
            card.addEventListener('dblclick', function () {
                if (idx === _activeIdx) bookRoute(idx);
            });
            track.appendChild(card);
        });

        track.querySelectorAll('[data-lightbox="1"]').forEach(function (img) {
            img.addEventListener('click', function (e) {
                e.stopPropagation();
                _openCityLightbox(img.src, img.alt, img.getAttribute('data-city') || img.alt);
            });
        });
        _applyTrackPadding();
        _bindTrackEvents();
    }

    function _activateRoute(idx, scrollToCenter) {
        _activeIdx = idx;
        var route = _routes()[idx];
        if (!route || !global._clientBgMap) return;

        global._daxiSuppressGpsPan = true;
        _updateActiveCardClass(idx);
        _clearMap();
        _drawRoute(route, idx, global._clientBgMap, global._daxiAdvancedMarkerElement);

        if (scrollToCenter) _scrollCardToCenter(idx, 'smooth');
        _syncRouteUrl(idx);
    }

    function selectRoute(idx) {
        _activateRoute(idx, true);
        setTimeout(function () { _scrollCardToCenter(idx, 'smooth'); }, 50);
    }

    function bookRoute(idx) {
        selectRoute(idx);
        var route = _routes()[idx];
        if (!route || !route.realPath || route.realPath.length < 2) return;
        var fromCoord = _cityCoord(route.from, { lat: route.realPath[0][0], lng: route.realPath[0][1] });
        var toCoord = _cityCoord(route.to, {
            lat: route.realPath[route.realPath.length - 1][0],
            lng: route.realPath[route.realPath.length - 1][1]
        });
        var s = fromCoord ? [fromCoord.lat, fromCoord.lng] : route.realPath[0];
        var e = toCoord ? [toCoord.lat, toCoord.lng] : route.realPath[route.realPath.length - 1];
        var pickupIn = document.getElementById('destinationAddress');
        var destIn = document.getElementById('destinationAddressArrival');
        var ph = document.getElementById('pickupHidden');
        var dh = document.getElementById('destinationHidden');
        if (pickupIn) {
            pickupIn.value = route.from;
            pickupIn.dataset.placeSelected = '1';
            pickupIn.dataset.daxiUncovered = '';
            pickupIn.dataset.daxiGpsUncovered = '';
            if (typeof global._clearUncoveredBlock === 'function') global._clearUncoveredBlock(pickupIn);
        }
        if (destIn) {
            destIn.value = route.to;
            destIn.dataset.placeSelected = '1';
            destIn.dataset.daxiUncovered = '';
            if (typeof global._clearUncoveredBlock === 'function') global._clearUncoveredBlock(destIn);
        }
        if (ph) ph.value = route.from;
        if (dh) dh.value = route.to;
        var plat = document.getElementById('pickupLatHidden');
        var plng = document.getElementById('pickupLngHidden');
        var dlat = document.getElementById('destLatHidden');
        var dlng = document.getElementById('destLngHidden');
        if (plat) plat.value = s[0];
        if (plng) plng.value = s[1];
        if (dlat) dlat.value = e[0];
        if (dlng) dlng.value = e[1];
        global._daxiPickupFromGps = false;
        if (typeof _setMainMapBookingPoint === 'function') {
            _setMainMapBookingPoint('pickup', s[0], s[1], 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress', { silent: true });
            _setMainMapBookingPoint('dest', e[0], e[1], 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: true });
        }
        if (typeof global._triggerDestRoutePreview === 'function') global._triggerDestRoutePreview();
        else if (typeof global._updateBookingRoute === 'function') global._updateBookingRoute();
        exit();
        if (typeof tabGoBook === 'function') tabGoBook();
        if (typeof _daxiSetSheetMode === 'function') _daxiSetSheetMode('form');
    }

    function _isMapExperienceOffline() {
        if (global._daxiForceOfflineUiPreview) return true;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        if (global.DaxiOffline && global.DaxiOffline.isReadOnly && global.DaxiOffline.isReadOnly()) return true;
        return false;
    }

    function enter() {
        if (!_routes().length) return;

        if (_isMapExperienceOffline()) {
            if (typeof global._daxiOpenRoutesFallback === 'function') {
                global._daxiOpenRoutesFallback();
            } else if (typeof global.openDaxiPage === 'function') {
                global.openDaxiPage('frequentRoutesSection', 'Itinéraires fréquents');
            }
            return;
        }
        if (!global._clientBgMap || !global.google) {
            setTimeout(enter, 200);
            return;
        }

        if (global.DaxiExplorerMap && typeof global.DaxiExplorerMap.exit === 'function') {
            try { global.DaxiExplorerMap.exit(); } catch (e) {}
        }

        function _showRoutes() {
            _ensureHud();
            _hud.style.display = 'block';
            _setRoutesHudLoading(false);
            document.body.classList.add('daxi-routes-mode');
            global._daxiSuppressGpsPan = true;
            global._daxiMapUserInteracting = false;
            _clearMap();
            _activeIdx = -1;
            var track = document.getElementById('daxi-routes-track');
            if (!track || !track.children.length) _renderTrack();
            _activateRoute(0, true);
            preloadImages(true);
            setTimeout(function () {
                if (typeof _syncMapFloatControls === 'function') _syncMapFloatControls();
                _applyTrackPadding();
                if (global._daxiPendingRouteSlug) {
                    _applyPendingRouteSlug();
                } else {
                    _scrollCardToCenter(0, 'auto');
                }
            }, 80);
        }

        if (!_warmedUp) {
            _ensureHud();
            _hud.style.display = 'block';
            document.body.classList.add('daxi-routes-mode');
            _setRoutesHudLoading(true);
            warmup({ timeoutMs: 20000 }).then(_showRoutes);
            return;
        }

        _showRoutes();
    }

    function exit() {
        if (_hud) _hud.style.display = 'none';
        _setRoutesHudLoading(false);
        document.body.classList.remove('daxi-routes-mode');
        global._daxiSuppressGpsPan = false;
        _clearMap();
        _activeIdx = -1;
        _fetchingRouteKey = null;
        if (typeof _syncMapFloatControls === 'function') _syncMapFloatControls();
    }


    function refreshOnMap() {
        if (!document.body.classList.contains('daxi-routes-mode')) return false;
        if (!global._clientBgMap || _activeIdx < 0) return false;
        var route = _routes()[_activeIdx];
        if (!route) return false;
        var idx = _activeIdx;
        _clearMap();
        _drawRoute(route, idx, global._clientBgMap, global._daxiAdvancedMarkerElement);
        return true;
    }

    global.DaxiRoutesMap = {
        enter: enter,
        exit: exit,
        selectRoute: selectRoute,
        selectRouteBySlug: selectRouteBySlug,
        bookRoute: bookRoute,
        preloadImages: preloadImages,
        warmup: warmup,
        refreshOnMap: refreshOnMap,
        isWarm: function () { return _warmedUp; }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('daxi-theme-change', function () {
            setTimeout(function () { refreshOnMap(); }, 60);
        });
        var _bootPoll = setInterval(function () {
            _bootWarmupPoll();
            if (_warmedUp) clearInterval(_bootPoll);
        }, 400);
        document.addEventListener('DOMContentLoaded', _bootWarmupPoll);
    }
})(typeof window !== 'undefined' ? window : this);
