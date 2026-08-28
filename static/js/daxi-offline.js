
(function() {
    var DB_NAME = 'daxi_offline_v1';
    var DB_VER = 3;
    var _db = null;
    var _idbDisabled = false;
    var ACTIVE_STATUSES = {
        pending: 1, price_proposed: 1, price_confirmed: 1, driver_assigned: 1,
        on_way: 1, arrived: 1, in_progress: 1
    };

    function disableIdb() {
        _idbDisabled = true;
        try { if (_db) _db.close(); } catch (e) {}
        _db = null;
    }

    function openDb() {
        if (_idbDisabled) return Promise.resolve(null);
        if (_db) return Promise.resolve(_db);
        return new Promise(function(resolve) {
            try {
                var req = indexedDB.open(DB_NAME, DB_VER);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('bootstrap')) db.createObjectStore('bootstrap');
                    if (!db.objectStoreNames.contains('htmx_cache')) db.createObjectStore('htmx_cache');
                    if (db.objectStoreNames.contains('map_tiles')) {
                        db.deleteObjectStore('map_tiles');
                    }
                };
                req.onsuccess = function() { _db = req.result; resolve(_db); };
                req.onerror = function() { disableIdb(); resolve(null); };
                req.onblocked = function() { disableIdb(); resolve(null); };
            } catch (e) {
                disableIdb();
                resolve(null);
            }
        });
    }

    function idbGet(store, key) {
        return openDb().then(function(db) {
            if (!db) return null;
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(store, 'readonly');
                    var req = tx.objectStore(store).get(key);
                    req.onsuccess = function() { resolve(req.result); };
                    req.onerror = function() { resolve(null); };
                } catch (e) {
                    resolve(null);
                }
            });
        }).catch(function() { return null; });
    }

    function idbPut(store, key, value) {
        return openDb().then(function(db) {
            if (!db) return null;
            return new Promise(function(resolve) {
                try {
                    var tx = db.transaction(store, 'readwrite');
                    var os = tx.objectStore(store);
                    if (store === 'bootstrap') {
                        os.put({ data: value, saved_at: Date.now() }, key);
                    } else if (store === 'htmx_cache') {
                        os.put({ html: value, saved_at: Date.now() }, key);
                    } else {
                        os.put(value);
                    }
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { disableIdb(); resolve(); };
                    tx.onabort = function() { disableIdb(); resolve(); };
                } catch (e) {
                    disableIdb();
                    resolve();
                }
            });
        }).catch(function() { return null; });
    }

    function getLiveBaseUrl() {
        if (window.DAXI_API_BASE_URL) return String(window.DAXI_API_BASE_URL).replace(/\/$/, '');
        if (window._daxiLiveBaseUrl) return String(window._daxiLiveBaseUrl).replace(/\/$/, '');
        if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.getLiveBaseUrl) {
            return String(DaxiAndroid.getLiveBaseUrl() || '').replace(/\/$/, '');
        }
        return '';
    }

    function guestQs() {
        if (window.DaxiGuestId && DaxiGuestId.guestQs) return DaxiGuestId.guestQs();
        var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        return gid ? '?guest_id=' + encodeURIComponent(gid) : '';
    }

    function isOffline() {
        if (window.DaxiNetworkState && DaxiNetworkState.isOnline) {
            return !DaxiNetworkState.isOnline();
        }
        if (typeof window._daxiIsNativeOnline === 'function') return !window._daxiIsNativeOnline();
        if (typeof window._daxiNativeOnline === 'boolean') return !window._daxiNativeOnline;
        if (location.protocol === 'file:') return !navigator.onLine;
        return !navigator.onLine;
    }

    function bootstrapUrl() {
        var base = getLiveBaseUrl();
        var path = '/api/mobile/bootstrap/';
        if (window.DaxiGuestId && DaxiGuestId.bootstrapQuery) {
            path += DaxiGuestId.bootstrapQuery();
        } else {
            path += guestQs();
        }
        return base ? (base + path) : path;
    }

    function syncBootstrap() {
        if (isOffline()) return Promise.resolve(window._daxiOfflineData || null);
        return fetch(bootstrapUrl(), {
            credentials: 'include',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.ok) {
                    return idbPut('bootstrap', 'latest', data).then(function() {
                        applyBootstrap(data);
                        return data;
                    });
                }
                return null;
            })
            .catch(function() { return null; });
    }

    function loadBootstrap() {
        return idbGet('bootstrap', 'latest').then(function(row) {
            if (row && row.data) {
                applyBootstrap(row.data);
                return row.data;
            }
            return null;
        });
    }

    function applyBootstrap(data) {
        if (!data || !data.ok) return;
        window._daxiOfflineData = data;
        if (window.DaxiGuestId && DaxiGuestId.reconcileWithBootstrap) {
            DaxiGuestId.reconcileWithBootstrap(data);
        } else if (data.guest_id && !localStorage.getItem('daxi_guest_id')) {
            localStorage.setItem('daxi_guest_id', data.guest_id);
            window._daxiGuestId = data.guest_id;
        }
        if (window.DaxiSessionStore && DaxiSessionStore.saveFromBootstrap) {
            DaxiSessionStore.saveFromBootstrap(data, true);
        } else {
            var u = data.user || {};
            window.DJANGO_SESSION = window.DJANGO_SESSION || {};
            window.DJANGO_SESSION.is_authenticated = !!u.authenticated;
            window.DJANGO_SESSION.user_name = u.name || '';
            window.DJANGO_SESSION.user_email = u.email || '';
            window.DJANGO_SESSION.user_phone = u.phone || '';
            window.DJANGO_SESSION.user_id = u.user_id || '';
            window.DJANGO_SESSION.first_name = (u.name || '').split(' ')[0] || '';
            window.DJANGO_SESSION.google_maps_key = data.google_maps_key || window.DJANGO_SESSION.google_maps_key || '';
        }
        if (data.csrf_token) {
            window.DJANGO_SESSION = window.DJANGO_SESSION || {};
            window.DJANGO_SESSION.csrf_token = data.csrf_token;
        }
        
        var hybridFile = !!(window._daxiHybridShell && location.protocol === 'file:');
        if (data.google_maps_key && !hybridFile) {
            window.GOOGLE_MAPS_API_KEY = data.google_maps_key;
            if (!window.DJANGO_CONFIG) window.DJANGO_CONFIG = {};
            window.DJANGO_CONFIG.googleMapsApiKey = data.google_maps_key;
            if (!isOffline() && !window._daxiExternalMapsBlocked && typeof window._daxiLoadGoogleMaps === 'function') {
                window._daxiOfflineMapMode = false;
                if (!(window._daxiGoogleMapHasBeenShown || window._clientBgMap)) {
                    var bgEl = document.getElementById('daxi-main-map');
                    if (bgEl) { bgEl._mapInit = false; }
                    window._daxiLoadGoogleMaps();
                }
            }
        } else if (data.google_maps_key) {
            window.GOOGLE_MAPS_API_KEY = data.google_maps_key;
            if (!window.DJANGO_CONFIG) window.DJANGO_CONFIG = {};
            window.DJANGO_CONFIG.googleMapsApiKey = data.google_maps_key;
        }

        if (data.drivers && data.drivers.length) {
            window.DJANGO_PRELOAD = window.DJANGO_PRELOAD || {};
            var dmap = {};
            data.drivers.forEach(function(d, i) {
                var photo = d.photoURL || d.photo_url || d.photo || '';
                dmap[d.id || ('d' + i)] = {
                    firstname: d.firstname,
                    lastname: d.lastname,
                    rating: d.rating,
                    photoURL: photo,
                    photo_url: photo,
                    photo: photo,
                    vehicle: d.vehicle,
                    completedTrips: parseInt(d.completed_trips || d.completedTrips || 0, 10) || 0
                };
            });
            window.DJANGO_PRELOAD.drivers = dmap;
            if (typeof renderSidebarTopDrivers === 'function') renderSidebarTopDrivers();
        }

        document.dispatchEvent(new CustomEvent('daxi:bootstrap-ready', { detail: data }));
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function orderCardHtml(o) {
        var status = esc(o.status_display || o.status || '');
        var pickup = esc(o.pickup_display || o.pickup || '—');
        var dest = esc(o.destination_display || o.destination || '—');
        var price = o.total_price != null ? esc(o.total_price) + ' $' : (o.price != null ? esc(o.price) + ' $' : '');
        var driver = esc(o.driver_name || '');
        var when = esc(o.date_display || o.created_display || '');
        return '<div class="daxi-order-card-offline" style="background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.15);border-radius:14px;padding:14px;margin-bottom:10px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            + '<span style="font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase;">#' + esc(o.id) + '</span>'
            + '<span style="font-size:11px;font-weight:700;color:#94a3b8;background:rgba(148,163,184,0.12);padding:3px 8px;border-radius:99px;">' + status + '</span>'
            + '</div>'
            + '<div style="font-size:13px;color:#e2e8f0;margin-bottom:4px;"><i class="ri-map-pin-line" style="color:#22c55e;"></i> ' + pickup + '</div>'
            + '<div style="font-size:13px;color:#e2e8f0;margin-bottom:8px;"><i class="ri-flag-line" style="color:#eab308;"></i> ' + dest + '</div>'
            + (driver ? '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;"><i class="ri-steering-2-line"></i> ' + driver + '</div>' : '')
            + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;">'
            + '<span>' + when + '</span>'
            + (price ? '<span style="color:#f59e0b;font-weight:800;">' + price + '</span>' : '')
            + '</div>'
            + '<div style="margin-top:8px;font-size:10px;color:#64748b;font-style:italic;">Mode hors ligne — consultation seule</div>'
            + '</div>';
    }

    function filterOrders(orders, tab) {
        orders = orders || [];
        if (tab === 'history') {
            return orders.filter(function(o) {
                return o.status === 'completed' || o.status === 'cancelled';
            });
        }
        return orders.filter(function(o) { return !!ACTIVE_STATUSES[o.status]; });
    }

    function renderOfflineOrders(orders, tab) {
        var el = document.getElementById('client-orders-htmx');
        if (!el) return;
        el.style.display = 'block';
        var list = filterOrders(orders, tab || 'active');
        if (!list.length) {
            el.innerHTML = '<div class="daxi-orders-empty" style="padding:24px;text-align:center;color:#94a3b8;">'
                + '<div style="font-size:40px;margin-bottom:8px;">📋</div>'
                + '<p style="font-weight:700;color:#e2e8f0;">' + (tab === 'history' ? 'Aucune course dans l\'historique' : 'Aucune course active') + '</p>'
                + '<p style="font-size:12px;margin-top:6px;">Données en cache — reconnectez-vous pour actualiser</p></div>';
            return;
        }
        el.innerHTML = '<div class="daxi-orders-list">' + list.map(orderCardHtml).join('') + '</div>';
        var badge = document.getElementById('ordersCount');
        var badgeWrap = document.getElementById('ordersCountBadge');
        if (badge) badge.textContent = String(list.length);
        if (badgeWrap && tab !== 'history') badgeWrap.style.display = list.length ? 'inline-flex' : 'none';
    }

    function renderOfflineAccount(data) {
        var el = document.getElementById('account-htmx-slot');
        if (!el) return;
        data = data || window._daxiOfflineData || {};
        var u = data.user || {};
        var stats = data.stats || { total: 0, this_month: 0, pending: 0, completed: 0 };
        if (!u.authenticated) {
            el.innerHTML = '<div class="daxi-acc" id="daxi-account-root">'
                + '<div class="daxi-gate">'
                + '<p class="daxi-gate-kicker">Espace client</p>'
                + '<h3 class="daxi-gate-title">Connectez-vous</h3>'
                + '<p class="daxi-gate-sub">Accédez à vos courses, statistiques et paramètres.</p>'
                + '<div class="daxi-gate-btns">'
                + '<button type="button" class="daxi-gate-in" onclick="if(window.openLoginModal)openLoginModal();">Se connecter</button>'
                + '<button type="button" class="daxi-gate-up" onclick="if(window.openSignupModal)openSignupModal();">Créer un compte</button>'
                + '</div></div></div>';
            return;
        }
        var initials = (u.name || 'U').charAt(0).toUpperCase();
        el.innerHTML = '<div class="daxi-acc">'
            + '<div class="daxi-acc-hero" style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:16px;padding:20px;text-align:center;margin-bottom:12px;">'
            + '<div style="width:72px;height:72px;border-radius:50%;margin:0 auto 10px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#000;">' + esc(initials) + '</div>'
            + '<div style="font-size:17px;font-weight:800;">' + esc(u.name) + '</div>'
            + (u.user_id ? '<div style="font-size:11px;color:#f59e0b;font-weight:700;margin-top:4px;">ID: ' + esc(u.user_id) + '</div>' : '')
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
            + '<div style="background:rgba(8,14,35,0.95);padding:14px;text-align:center;border-radius:12px;"><div style="font-size:22px;font-weight:900;color:#f59e0b;">' + stats.total + '</div><div style="font-size:10px;color:#64748b;">Courses</div></div>'
            + '<div style="background:rgba(8,14,35,0.95);padding:14px;text-align:center;border-radius:12px;"><div style="font-size:22px;font-weight:900;color:#f59e0b;">' + stats.completed + '</div><div style="font-size:10px;color:#64748b;">Terminées</div></div>'
            + '</div>'
            + '<div style="background:rgba(8,14,35,0.85);border-radius:14px;padding:12px;font-size:13px;color:#e2e8f0;">'
            + '<div style="padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.1);"><small style="color:#64748b;display:block;">Email</small>' + esc(u.email || '—') + '</div>'
            + '<div style="padding:8px 0;"><small style="color:#64748b;display:block;">Téléphone</small>' + esc(u.phone || '—') + '</div>'
            + '</div>'
            + '<p style="text-align:center;font-size:11px;color:#64748b;margin-top:12px;">Mode hors ligne — consultation seule</p>'
            + '</div>';
    }

    function renderCachedOrdersIfAny(tab) {
        var data = window._daxiOfflineData;
        if (!data || !data.orders || !data.orders.length) return false;
        renderOfflineOrders(data.orders, tab || 'active');
        return true;
    }

    function renderCachedAccountIfAny() {
        var data = window._daxiOfflineData || { ok: true, user: { authenticated: false } };
        renderOfflineAccount(data);
        return true;
    }

    function applyCachedUi(tab) {
        var data = window._daxiOfflineData;
        if (!data) return;
        var u = data.user || {};
        var pendingSec = document.getElementById('all-pending-requests');
        var htmxOrdersEl = document.getElementById('client-orders-htmx');
        var tabBtns = document.getElementById('orders-tab-btns');
        if (pendingSec) pendingSec.style.display = 'block';
        if (htmxOrdersEl) htmxOrdersEl.style.display = 'block';
        if (tabBtns && (u.authenticated || (data.orders && data.orders.length))) {
            tabBtns.style.display = 'flex';
            tabBtns.style.gap = '6px';
        }
        renderOfflineOrders(data.orders, tab || 'active');
        renderOfflineAccount(data);
        ensureOfflineMap();
    }

    function _hasGoogleMapsKey() {
        return !!(
            (window.DJANGO_CONFIG && window.DJANGO_CONFIG.googleMapsApiKey) ||
            window.GOOGLE_MAPS_API_KEY ||
            (window.DJANGO_SESSION && window.DJANGO_SESSION.google_maps_key)
        );
    }

    function ensureOfflineMap() {
        if (!isOffline() && _hasGoogleMapsKey() && !window._daxiExternalMapsBlocked) {
            if (window.google && google.maps && window._clientBgMap) return;
            if (typeof window._daxiLoadGoogleMaps === 'function') {
                window._daxiLoadGoogleMaps();
            }
            return;
        }
        if (window._daxiOfflineMapMode && window._clientBgMap) return;
        if (window.google && google.maps && window._clientBgMap && !window._daxiExternalMapsBlocked && !window._daxiHybridShell) return;
        initSimpleMap('daxi-main-map', { force: !!(window._daxiHybridShell && isOffline()) });
        if (typeof window._flushClientGpsToMap === 'function') {
            setTimeout(function() { window._flushClientGpsToMap(); }, 300);
        }
    }

    function prefetchHaitiTiles() {
        if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.triggerOfflineSync) {
            DaxiAndroid.triggerOfflineSync();
        }
        return Promise.resolve(0);
    }

    function canQueueOfflineWrites() {
        return typeof DaxiAndroid !== 'undefined' && DaxiAndroid.enqueueOutbox;
    }

    function showPendingOrderToast() {
        var banner = document.getElementById('daxi-pending-order-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'daxi-pending-order-banner';
            banner.style.cssText = 'position:fixed;bottom:88px;left:16px;right:16px;z-index:20040;padding:14px 16px;border-radius:14px;background:rgba(15,23,42,.95);border:1px solid rgba(245,158,11,.35);color:#f8fafc;font-size:13px;font-weight:600;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35)';
            document.body.appendChild(banner);
        }
        banner.textContent = 'Commande en attente de connexion — synchronisation dès que le réseau revient.';
        banner.style.display = 'block';
        setTimeout(function() { banner.style.display = 'none'; }, 8000);
    }

    function stableOutboxId(path, body) {
        try {
            var gid = (window.DaxiGuestId && DaxiGuestId.get) ? DaxiGuestId.get() : '';
            var raw = (path || '') + '|' + gid + '|' + JSON.stringify(body || {});
            var h = 0;
            for (var i = 0; i < raw.length; i++) h = ((h << 5) - h) + raw.charCodeAt(i) | 0;
            return 'obx_' + Math.abs(h).toString(36);
        } catch (e) {
            return 'obx_fallback';
        }
    }

    function enqueueNativeOutbox(type, path, method, payload) {
        if (!canQueueOfflineWrites()) return false;
        try {
            var body = (payload && payload.body) ? payload.body : (payload || {});
            var clientId = stableOutboxId(path, body);
            var res = JSON.parse(DaxiAndroid.enqueueOutbox(JSON.stringify({
                id: clientId,
                type: type || 'htmx_post',
                endpoint: path,
                method: method || 'POST',
                payload: { path: path, body: body }
            })));
            return !!(res && res.ok);
        } catch (e) {
            return false;
        }
    }

    var MAP_TILES_MIN_READY = 4;
    var MAP_TILES_IDEAL_READY = 9;

    function _mapLog(msg) {
        try { console.log('[MAP] ' + msg); } catch (e) {}
    }

    function _resetMapTileState() {
        if (window._daxiGoogleMapHasBeenShown) return;
        if (window._daxiBlockMapPlaceholderMutations && window._daxiBlockMapPlaceholderMutations()) return;
        window._daxiMapTileState = { loaded: 0, failed: 0, total: 25 };
        window._daxiMapVisualReady = false;
        window._daxiMapPlaceholderHidden = false;
        window._daxiGpsReadyLogged = false;
        if (_usesGuardedMapReveal()) {
            try { document.documentElement.classList.remove('daxi-map-live'); } catch (e) {}
        }
    }

    function _latLngToTile(lat, lng, z) {
        var n = Math.pow(2, z);
        var x = Math.floor((lng + 180) / 360 * n);
        var latRad = lat * Math.PI / 180;
        var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x: x, y: y };
    }

    function _latLngToPixel(lat, lng, z) {
        var scale = 256 * Math.pow(2, z);
        var x = (lng + 180) / 360 * scale;
        var sinLat = Math.sin(lat * Math.PI / 180);
        var y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
        return { x: x, y: y };
    }

    function _offlineMapZoom(cfg) {
        var z = (cfg && cfg.default_zoom) ? cfg.default_zoom : 10;
        if (z > 10) z = 10;
        if (z < 8) z = 8;
        return z;
    }

    function _logTileCounters() {
        var st = window._daxiMapTileState || { loaded: 0, failed: 0, total: 25 };
        _mapLog('Tiles Loaded: ' + st.loaded + '/' + st.total);
        if (st.failed > 0) _mapLog('Tiles Failed: ' + st.failed);
    }

    function _applyDaxiMapLiveReveal() {
        if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
            if (typeof window._daxiTryCommitGoogleMapVisible === 'function') {
                window._daxiTryCommitGoogleMapVisible('offline-reveal');
            }
            return;
        }
        if (window.DaxiMapPlaceholder && window.DaxiMapPlaceholder.revealLive) {
            window.DaxiMapPlaceholder.revealLive('daxi-map-stage');
            window._daxiMapPlaceholderHidden = true;
            return;
        }
        if (window._daxiMapPlaceholderHidden) return;
        window._daxiMapPlaceholderHidden = true;
        document.documentElement.classList.add('daxi-map-live');
        var stage = document.getElementById('daxi-map-stage');
        if (stage) stage.classList.add('is-live');
        var ph = document.getElementById('daxi-map-placeholder');
        if (ph) ph.setAttribute('aria-hidden', 'true');
    }

    function _tryRevealMapWhenReady() {
        if (window._daxiMapVisualReady) return;
        var googleReady = !!(
            window.google && window.google.maps && window._clientBgMap && !window._daxiOfflineMapMode &&
            window._daxiMapReady && (window._daxiMapReady.tiles || window._daxiMapReady.idle)
        );
        if (googleReady) {
            window._daxiMapVisualReady = true;
            window._daxiBootState = window._daxiBootState || {};
            window._daxiBootState.mapReady = true;
            _mapLog('Google map ready');
            _applyDaxiMapLiveReveal();
            if (typeof window._daxiPromoteMainMapMarkers === 'function') window._daxiPromoteMainMapMarkers();
            if (typeof window._daxiFlushPendingBookingMarkers === 'function') window._daxiFlushPendingBookingMarkers();
            if (typeof window._daxiSyncBookingMarkersFromForm === 'function') window._daxiSyncBookingMarkersFromForm();
            if (typeof window._daxiTryDismissInitialLoader === 'function') window._daxiTryDismissInitialLoader();
            if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.notifyMapReady) {
                try { DaxiAndroid.notifyMapReady(); } catch (e) {}
            }
            return;
        }
        var st = window._daxiMapTileState || { loaded: 0, failed: 0, total: 25 };
        var fallbackVisible = !!document.getElementById('daxi-fallback-map-layer');
        var tilesReady = st.loaded >= MAP_TILES_MIN_READY;
        if (!fallbackVisible && !tilesReady) return;
        window._daxiMapVisualReady = true;
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        _mapLog('Map Ready');
        _logTileCounters();
        if (st.loaded >= MAP_TILES_IDEAL_READY) {
            _mapLog('Tiles ideal threshold reached (' + MAP_TILES_IDEAL_READY + '/25)');
        }
        _applyDaxiMapLiveReveal();
        if (typeof window._daxiTryDismissInitialLoader === 'function') {
            window._daxiTryDismissInitialLoader();
        }
        if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.notifyMapReady) {
            try { DaxiAndroid.notifyMapReady(); } catch (e) {}
        }
    }

    window._daxiTryRevealMapWhenReady = _tryRevealMapWhenReady;

    function _usesGuardedMapReveal() {
        return !!(window._daxiOfflineMapMode || window._daxiHybridShell || window._daxiExternalMapsBlocked);
    }
    window._daxiUsesGuardedMapReveal = _usesGuardedMapReveal;

    function _onMapTileLoaded(z, x, y) {
        var st = window._daxiMapTileState;
        if (!st) return;
        st.loaded++;
        _mapLog('Tile ' + z + '/' + x + '/' + y + ' loaded');
        _logTileCounters();
        _tryRevealMapWhenReady();
    }

    function _onMapTileFailed(z, x, y) {
        var st = window._daxiMapTileState;
        if (!st) return;
        st.failed++;
        _mapLog('Tile ' + z + '/' + x + '/' + y + ' failed');
        _logTileCounters();
        if (st.failed >= 3) _switchToFallbackMapLayer();
    }

    function _isBlockedOsmTile(img) {
        if (!img || !img.naturalWidth || !img.naturalHeight) return true;
        if (img.naturalWidth < 64 || img.naturalHeight < 64) return true;
        
        try {
            var src = String(img.src || '');
            if (src.indexOf('127.0.0.1') >= 0 || src.indexOf('localhost') >= 0) return false;
            if (src.indexOf('cartocdn.com') >= 0 || src.indexOf('openstreetmap.org') >= 0) return false;
            if (src.indexOf('tile.openstreetmap') >= 0) return false;
        } catch (e0) {}
        try {
            var c = document.createElement('canvas');
            c.width = 32;
            c.height = 32;
            var ctx = c.getContext('2d');
            if (!ctx) return false;
            ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 32, 32);
            var d = ctx.getImageData(0, 0, 32, 32).data;
            var white = 0;
            var total = 32 * 32;
            for (var i = 0; i < d.length; i += 4) {
                if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
            }
            return (white / total) > 0.32;
        } catch (e) {
            return false;
        }
    }

    function _switchToFallbackMapLayer() {
        if (window._daxiMbtilesFallbackActive) return;
        window._daxiMbtilesFallbackActive = true;
        var el = document.getElementById('daxi-main-map');
        if (!el) return;
        var wrap = window._daxiMbtilesWrap;
        if (wrap) wrap.remove();
        window._daxiMbtilesWrap = null;
        window._daxiMbtilesMeta = null;
        
        var online = (typeof window._daxiNativeOnline === 'boolean') ? window._daxiNativeOnline : navigator.onLine;
        if (online && _initOnlineRasterLayer(el, window._daxiOfflineCenter || { lat: 19.7607, lng: -72.2039 }, window._daxiOfflineZoom || 14)) {
            _mapLog('MBTiles invalid — switched to online raster');
            return;
        }
        if (!document.getElementById('daxi-fallback-map-layer')) {
            el.appendChild(_buildFallbackMapLayer());
        }
        var st = window._daxiMapTileState || { loaded: 0, failed: 0, total: 25 };
        st.loaded = MAP_TILES_MIN_READY;
        _mapLog('Invalid MBTiles detected — using fallback layer');
        _tryRevealMapWhenReady();
    }

    
    function _initOnlineRasterLayer(el, center, zoom) {
        if (!el || !center) return false;
        var z = Math.max(10, Math.min(16, zoom || 14));
        var theme = (document.documentElement.getAttribute('data-theme') || 'dark');
        var tpl = theme === 'light'
            ? 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
            : 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
        var wrap = document.createElement('div');
        wrap.id = 'daxi-mbtiles-layer';
        wrap.setAttribute('data-daxi-online-raster', '1');
        wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#070b14;';
        el.appendChild(wrap);
        window._daxiMbtilesWrap = wrap;
        window._daxiMbtilesMeta = { z: z, center: { lat: center.lat, lng: center.lng }, tpl: tpl, online: true };
        window._daxiOfflineZoom = z;
        window._daxiOfflineCenter = { lat: center.lat, lng: center.lng };
        _resetMapTileState();
        var tile = _latLngToTile(center.lat, center.lng, z);
        var total = 0;
        for (var dx = -2; dx <= 2; dx++) {
            for (var dy = -2; dy <= 2; dy++) {
                (function(tx, ty, tileZ) {
                    var img = document.createElement('img');
                    img.alt = '';
                    img.draggable = false;
                    img.setAttribute('data-tile-x', String(tx));
                    img.setAttribute('data-tile-y', String(ty));
                    img.setAttribute('data-tile-z', String(tileZ));
                    img.style.cssText = 'position:absolute;width:256px;height:256px;';
                    img.onload = function() {
                        if (img._daxiCountedLoad) return;
                        img._daxiCountedLoad = true;
                        _onMapTileLoaded(tileZ, tx, ty);
                    };
                    img.onerror = function() {
                        if (!img.dataset.retried) {
                            img.dataset.retried = '1';
                            img.src = 'https://tile.openstreetmap.org/' + tileZ + '/' + tx + '/' + ty + '.png';
                            return;
                        }
                        if (img._daxiCountedFail) return;
                        img._daxiCountedFail = true;
                        img.style.opacity = '0.2';
                        _onMapTileFailed(tileZ, tx, ty);
                    };
                    img.src = tpl.replace('{z}', tileZ).replace('{x}', tx).replace('{y}', ty);
                    wrap.appendChild(img);
                    total++;
                })(tile.x + dx, tile.y + dy, z);
            }
        }
        window._daxiMapTileState = window._daxiMapTileState || { loaded: 0, failed: 0, total: total };
        window._daxiMapTileState.total = total;
        _repositionMbtilesGrid();
        _mapLog('Online raster layer started z=' + z);
        return true;
    }

    function _mapFocusPx(el) {
        var cx = el.clientWidth / 2;
        var cy = el.clientHeight / 2;
        if (typeof window._daxiVisibleMapMidY === 'function') {
            var rect = el.getBoundingClientRect();
            cy = window._daxiVisibleMapMidY() - rect.top;
            cy = Math.max(24, Math.min(el.clientHeight - 24, cy));
        }
        return { x: cx, y: cy };
    }

    function _ensureBookingOverlay(el) {
        if (!el) el = document.getElementById('daxi-main-map');
        if (!el) return null;
        var overlay = document.getElementById('daxi-booking-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'daxi-booking-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9;overflow:hidden;';
            el.appendChild(overlay);
        }
        return overlay;
    }

    function _repositionOfflineBookingDots() {
        var el = document.getElementById('daxi-main-map');
        var center = window._daxiOfflineCenter;
        if (!el || !center) return;
        var overlay = _ensureBookingOverlay(el);
        if (!overlay) return;
        var z = (window._daxiMbtilesMeta && window._daxiMbtilesMeta.z) || window._daxiOfflineZoom || 10;
        var booking = window._daxiOfflineBooking || {};
        ['pickup', 'dest'].forEach(function(type) {
            var pt = booking[type];
            var id = 'daxi-offline-' + type + '-dot';
            var dot = document.getElementById(id);
            if (!pt || pt.lat == null || pt.lng == null) {
                if (dot) dot.remove();
                return;
            }
            if (!dot) {
                dot = document.createElement('div');
                dot.id = id;
                var color = type === 'pickup' ? '#22c55e' : '#eab308';
                dot.style.cssText = 'position:absolute;width:18px;height:18px;border-radius:50%;border:3px solid #fff;transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(0,0,0,.45);background:' + color + ';';
                overlay.appendChild(dot);
            }
            var centerPx = _latLngToPixel(center.lat, center.lng, z);
            var pointPx = _latLngToPixel(pt.lat, pt.lng, z);
            var focus = _mapFocusPx(el);
            dot.style.left = (focus.x + pointPx.x - centerPx.x) + 'px';
            dot.style.top = (focus.y + pointPx.y - centerPx.y) + 'px';
        });
    }

    function _updateOfflineBookingMarker(type, lat, lng) {
        window._daxiOfflineBooking = window._daxiOfflineBooking || {};
        window._daxiOfflineBooking[type === 'pickup' ? 'pickup' : 'dest'] = { lat: lat, lng: lng };
        _repositionOfflineBookingDots();
    }

    function _repositionMbtilesGrid() {
        var wrap = window._daxiMbtilesWrap;
        var meta = window._daxiMbtilesMeta;
        var el = document.getElementById('daxi-main-map');
        if (!wrap || !meta || !el) return;
        var center = window._daxiOfflineCenter || meta.center;
        var z = meta.z;
        var centerPx = _latLngToPixel(center.lat, center.lng, z);
        var focus = _mapFocusPx(el);
        var imgs = wrap.querySelectorAll('img[data-tile-x]');
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            var tx = parseInt(img.getAttribute('data-tile-x'), 10);
            var ty = parseInt(img.getAttribute('data-tile-y'), 10);
            var tilePx = { x: tx * 256, y: ty * 256 };
            img.style.left = (focus.x + tilePx.x - centerPx.x) + 'px';
            img.style.top = (focus.y + tilePx.y - centerPx.y) + 'px';
        }
        _repositionOfflineBookingDots();
    }

    function _initMbtilesLayer(el, center, zoom) {
        if (typeof DaxiAndroid === 'undefined' || !DaxiAndroid.hasOfflineTiles || !DaxiAndroid.hasOfflineTiles()) return false;
        var tpl = DaxiAndroid.getOfflineTileUrl();
        if (!tpl) return false;
        var wrap = document.createElement('div');
        wrap.id = 'daxi-mbtiles-layer';
        wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
        el.appendChild(wrap);
        window._daxiMbtilesWrap = wrap;
        var z = _offlineMapZoom({ default_zoom: zoom });
        window._daxiMbtilesMeta = { z: z, center: { lat: center.lat, lng: center.lng }, tpl: tpl };
        var tile = _latLngToTile(center.lat, center.lng, z);
        for (var dx = -2; dx <= 2; dx++) {
            for (var dy = -2; dy <= 2; dy++) {
                (function(tx, ty, tileZ) {
                    var img = document.createElement('img');
                    img.alt = '';
                    img.draggable = false;
                    img.setAttribute('data-tile-x', String(tx));
                    img.setAttribute('data-tile-y', String(ty));
                    img.setAttribute('data-tile-z', String(tileZ));
                    img.style.cssText = 'position:absolute;width:256px;height:256px;';
                    img.onload = function() {
                        if (img._daxiCountedLoad) return;
                        img._daxiCountedLoad = true;
                        var lz = parseInt(img.getAttribute('data-tile-z'), 10) || tileZ;
                        var lx = parseInt(img.getAttribute('data-tile-x'), 10);
                        var ly = parseInt(img.getAttribute('data-tile-y'), 10);
                        if (_isBlockedOsmTile(img)) {
                            _onMapTileFailed(lz, lx, ly);
                            return;
                        }
                        _onMapTileLoaded(lz, lx, ly);
                    };
                    img.onerror = function() {
                        if (!img.dataset.retried) {
                            img.dataset.retried = '1';
                            var z2 = Math.max(8, tileZ - 1);
                            img.setAttribute('data-tile-z', String(z2));
                            img.src = tpl.replace('{z}', z2).replace('{x}', tx).replace('{y}', ty);
                            return;
                        }
                        if (img._daxiCountedFail) return;
                        img._daxiCountedFail = true;
                        img.style.opacity = '0.15';
                        _onMapTileFailed(tileZ, tx, ty);
                    };
                    img.src = tpl.replace('{z}', tileZ).replace('{x}', tx).replace('{y}', ty);
                    wrap.appendChild(img);
                })(tile.x + dx, tile.y + dy, z);
            }
        }
        _repositionMbtilesGrid();
        return true;
    }

    function _purgeLegacyOsmTiles() {
        return openDb().then(function(db) {
            if (!db.objectStoreNames.contains('map_tiles')) return;
            return new Promise(function(resolve) {
                var tx = db.transaction('map_tiles', 'readwrite');
                tx.objectStore('map_tiles').clear();
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
        }).catch(function() {});
    }

    function _hasNativeOfflineTiles() {
        return typeof DaxiAndroid !== 'undefined' && DaxiAndroid.hasOfflineTiles && DaxiAndroid.hasOfflineTiles();
    }

    function _buildWebMapUnavailableNote() {
        var isHybrid = !!(window._daxiHybridShell || (window._daxiIsNativeApp && window._daxiIsNativeApp()));
        if (isHybrid) return null;
        var host = (window.location && window.location.hostname) || '';
        var ngrok = /\.ngrok/i.test(host);
        var hint = ngrok
            ? 'Ajoutez <strong style="color:#e2e8f0;">https://' + host + '/*</strong> dans Google Cloud Console → Credentials → restrictions HTTP de la clé Maps.'
            : 'Vérifiez la clé Google Maps et les restrictions de domaine pour <strong style="color:#e2e8f0;">' + (host || 'ce site') + '</strong>.';
        var note = document.createElement('div');
        note.id = 'daxi-web-map-unavailable';
        note.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:28px 22px;text-align:center;z-index:12;pointer-events:none;';
        note.innerHTML = '<div style="max-width:340px;">'
            + '<p style="color:#e2e8f0;font-size:15px;font-weight:700;margin:0 0 10px;">Carte indisponible</p>'
            + '<p style="color:#94a3b8;font-size:13px;line-height:1.55;margin:0;">Google Maps n\'est pas accessible ici.<br>' + hint + '</p>'
            + '</div>';
        return note;
    }

    function _buildFallbackMapLayer() {
        var layer = document.createElement('div');
        layer.id = 'daxi-fallback-map-layer';
        layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#070b14;';
        var theme = (document.documentElement.getAttribute('data-theme') || 'dark');
        var imgUrl = (window.DaxiMapPlaceholder && DaxiMapPlaceholder.imageUrl)
            ? DaxiMapPlaceholder.imageUrl(theme)
            : (theme === 'light'
                ? 'assets/images/daxi-map-placeholder-light.png'
                : 'assets/images/daxi-map-placeholder-dark.png');
        
        if (imgUrl.charAt(0) === '/') {
            imgUrl = imgUrl.replace(/^\//, '');
        }
        layer.innerHTML = [
            '<div style="position:absolute;inset:0;background:url(\'' + imgUrl + '\') center / cover no-repeat;"></div>',
            '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,11,20,0.05) 0%,rgba(7,11,20,0.22) 100%);"></div>'
        ].join('');
        return layer;
    }

    function _daxiMapAllowsGpsVisual() {
        var stage = document.getElementById('daxi-map-stage');
        if (!stage || !stage.classList.contains('is-live')) return false;
        if (!window._daxiMapVisualReady && !window._daxiMapPlaceholderHidden) return false;
        if (window._daxiOfflineMapMode) {
            return !!(document.getElementById('daxi-mbtiles-layer'));
        }
        return !!document.querySelector('#daxi-main-map .gm-style');
    }
    window._daxiMapAllowsGpsVisual = _daxiMapAllowsGpsVisual;

    function _ensureGpsOverlay(el) {
        if (!_daxiMapAllowsGpsVisual()) {
            var existing = document.getElementById('daxi-gps-overlay');
            if (existing) existing.style.display = 'none';
            return null;
        }
        if (!el) el = document.getElementById('daxi-main-map');
        if (!el) return null;
        var overlay = document.getElementById('daxi-gps-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'daxi-gps-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;overflow:hidden;';
            var ring = document.createElement('div');
            ring.id = 'daxi-offline-user-ring';
            ring.style.cssText = 'position:absolute;width:80px;height:80px;border-radius:50%;border:2px solid rgba(96,165,250,0.5);background:rgba(96,165,250,0.12);transform:translate(-50%,-50%);pointer-events:none;';
            var dot = document.createElement('div');
            dot.id = 'daxi-offline-user-dot';
            dot.style.cssText = 'position:absolute;width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 10px rgba(59,130,246,0.7);transform:translate(-50%,-50%);';
            overlay.appendChild(ring);
            overlay.appendChild(dot);
            el.appendChild(overlay);
        }
        overlay.style.display = '';
        return overlay;
    }

    function _updateOfflineMapUserDot(lat, lng, acc) {
        if (!_daxiMapAllowsGpsVisual()) {
            var ov = document.getElementById('daxi-gps-overlay');
            if (ov) ov.style.display = 'none';
            return;
        }
        var el = document.getElementById('daxi-main-map');
        if (!el) return;
        _ensureGpsOverlay(el);
        window._daxiOfflineCenter = { lat: lat, lng: lng };
        _repositionMbtilesGrid();
        var dot = document.getElementById('daxi-offline-user-dot');
        var ring = document.getElementById('daxi-offline-user-ring');
        if (!dot) return;
        var focus = _mapFocusPx(el);
        dot.style.left = focus.x + 'px';
        dot.style.top = focus.y + 'px';
        if (ring) {
            var r = Math.max(24, Math.min(120, (acc || 40) * 1.2));
            ring.style.width = r + 'px';
            ring.style.height = r + 'px';
            ring.style.left = focus.x + 'px';
            ring.style.top = focus.y + 'px';
        }
        if (!window._daxiGpsReadyLogged) {
            window._daxiGpsReadyLogged = true;
            _mapLog('GPS Ready');
        }
    }

    function initSimpleMap(containerId, opts) {
        opts = opts || {};
        if (window._daxiGoogleMapHasBeenShown || (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps())) {
            return;
        }
        if (window.DAXI_USE_GOOGLE_MAPS && window._clientBgMap && window.google && window.google.maps) {
            return;
        }
        var el = document.getElementById(containerId);
        if (!el) return;
        if (el._mapInit && !opts.force) return;
        if (opts.force) {
            el._mapInit = false;
            el.innerHTML = '';
            window._clientBgMap = null;
            window._daxiMbtilesWrap = null;
            window._daxiMbtilesMeta = null;
        }
        el._mapInit = true;
        window._daxiOfflineMapMode = true;
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.routesReady = true;
        _resetMapTileState();
        _purgeLegacyOsmTiles();
        el.style.background = '#070b14';
        el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.innerHTML = '';
        var cfg = (window._daxiOfflineData && window._daxiOfflineData.map) || {};
        var center = cfg.center || { lat: 19.7607, lng: -72.2039 };
        if (window._DAXI_ACTIVE_BOUNDS_LITERAL) {
            var lit = window._DAXI_ACTIVE_BOUNDS_LITERAL;
            center = {
                lat: (lit.sw.lat + lit.ne.lat) / 2,
                lng: (lit.sw.lng + lit.ne.lng) / 2
            };
        }
        var mapZoom = _offlineMapZoom(cfg);
        
        var online = (typeof window._daxiNativeOnline === 'boolean') ? window._daxiNativeOnline : navigator.onLine;
        var isHybrid = !!(window._daxiHybridShell || (window._daxiIsNativeApp && window._daxiIsNativeApp()));
        var usedMbtiles = false;
        if (online && isHybrid) {
            usedMbtiles = _initOnlineRasterLayer(el, center, Math.max(mapZoom, 14));
        }
        if (!usedMbtiles) {
            usedMbtiles = _initMbtilesLayer(el, center, mapZoom);
        }
        if (!usedMbtiles && online) {
            usedMbtiles = _initOnlineRasterLayer(el, center, Math.max(mapZoom, 14));
        }
        if (!usedMbtiles) {
            var layer = _buildFallbackMapLayer();
            el.appendChild(layer);
            if (!_hasNativeOfflineTiles()) {
                var note = _buildWebMapUnavailableNote();
                if (note) el.appendChild(note);
                window._daxiMapTileState = { loaded: MAP_TILES_MIN_READY, failed: 0, total: MAP_TILES_MIN_READY };
            }
            _tryRevealMapWhenReady();
        }
        if (usedMbtiles || _hasNativeOfflineTiles() || document.getElementById('daxi-mbtiles-layer')) {
            
        }
        if (!el._daxiResizeBound) {
            el._daxiResizeBound = true;
            window.addEventListener('resize', function() {
                _repositionMbtilesGrid();
                _repositionOfflineBookingDots();
                if (window._lastClientGpsPos) {
                    _updateOfflineMapUserDot(
                        window._lastClientGpsPos.lat,
                        window._lastClientGpsPos.lng,
                        window._lastClientGpsPos.acc
                    );
                }
            });
        }
        window._daxiOfflineCenter = { lat: center.lat, lng: center.lng };
        window._daxiOfflineZoom = mapZoom;
        window._clientBgMap = {
            panTo: function(p) {
                if (p && p.lat != null) {
                    window._daxiOfflineCenter = { lat: p.lat, lng: p.lng };
                    _repositionMbtilesGrid();
                }
            },
            panBy: function(dx, dy) {
                if (!dx && !dy) return;
                var el = document.getElementById('daxi-main-map');
                var z = window._daxiOfflineZoom || 10;
                var center = window._daxiOfflineCenter;
                if (!el || !center) return;
                var scale = 256 * Math.pow(2, z);
                var dLng = (dx || 0) / scale * 360;
                var cosLat = Math.cos(center.lat * Math.PI / 180) || 1;
                var dLat = -(dy || 0) / scale * 360 * cosLat;
                window._daxiOfflineCenter = { lat: center.lat + dLat, lng: center.lng + dLng };
                _repositionMbtilesGrid();
            },
            getZoom: function() { return window._daxiOfflineZoom || 10; },
            setZoom: function(z) {
                if (z) window._daxiOfflineZoom = z;
            },
            getCenter: function() { return window._daxiOfflineCenter; },
            setTilt: function() {}, setHeading: function() {}, fitBounds: function() {},
            addListener: function() { return { remove: function() {} }; }
        };
        window._updateOfflineMapUserDot = _updateOfflineMapUserDot;
        window._updateOfflineBookingMarker = _updateOfflineBookingMarker;
        var _fbTouch = null;
        el.addEventListener('click', function() {
            if (typeof _daxiCollapseSheetFromMapTap === 'function') _daxiCollapseSheetFromMapTap();
        });
        el.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                _fbTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
            }
        }, { passive: true });
        el.addEventListener('touchend', function(e) {
            if (!_fbTouch || !e.changedTouches.length) return;
            var dx = e.changedTouches[0].clientX - _fbTouch.x;
            var dy = e.changedTouches[0].clientY - _fbTouch.y;
            var dt = Date.now() - _fbTouch.t;
            _fbTouch = null;
            if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && dt < 450 && typeof _daxiCollapseSheetFromMapTap === 'function') {
                _daxiCollapseSheetFromMapTap();
            }
        }, { passive: true });
        if (window._lastClientGpsPos) {
            _updateOfflineMapUserDot(
                window._lastClientGpsPos.lat,
                window._lastClientGpsPos.lng,
                window._lastClientGpsPos.acc
            );
        }
        _repositionOfflineBookingDots();
    }

    function blockOrderIfOffline(e) {
        if (!isOffline()) return;
        
        var btn = e.target.closest('#orderTaxiBtn, .order-plan-btn');
        var form = e.target.closest('form[hx-post*="order/create"], form[action*="order/create"]');
        if (!btn && !form) return;
        var hxPost = (btn && btn.getAttribute && btn.getAttribute('hx-post')) || '';
        if (btn && hxPost && hxPost.indexOf('order/create') < 0 && hxPost.indexOf('order') < 0) return;
        if (canQueueOfflineWrites()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var targetForm = form || (btn && btn.closest('form'));
            if (targetForm) {
                var path = targetForm.getAttribute('hx-post') || targetForm.getAttribute('action') || '';
                if (path.indexOf('order/create') < 0 && String(path).indexOf('/order/') < 0) {
                    
                } else {
                    var body = {};
                    try {
                        new FormData(targetForm).forEach(function(v, k) { body[k] = v; });
                    } catch (err) {}
                    if (enqueueNativeOutbox('htmx_post', path, 'POST', { path: path, body: body })) {
                        showPendingOrderToast();
                        return;
                    }
                }
            }
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        if (window.DaxiNetworkState && DaxiNetworkState.showOfflineModal) {
            DaxiNetworkState.showOfflineModal('Commander');
        } else {
            alert('Vous êtes hors ligne. Connectez-vous à Internet pour passer une commande.');
        }
    }

    function cacheHtmxResponse(path, html) {
        if (_idbDisabled || !path || !html) return;
        try {
            var p = normalizeHtmxPath(path);
            var put = idbPut('htmx_cache', p, html);
            if (put && typeof put.catch === 'function') put.catch(function() {});
            var bare = p.split('?')[0];
            if (bare && bare !== p) {
                var put2 = idbPut('htmx_cache', bare, html);
                if (put2 && typeof put2.catch === 'function') put2.catch(function() {});
            }
        } catch (e) {
            disableIdb();
        }
    }

    function lookupHtmxCache(path) {
        var p = normalizeHtmxPath(path);
        return idbGet('htmx_cache', p).then(function(row) {
            if (row && row.html) return row;
            var bare = p.split('?')[0];
            if (bare && bare !== p) return idbGet('htmx_cache', bare);
            return null;
        });
    }

    function tryServeHtmxFromCache(path, target) {
        return lookupHtmxCache(path).then(function(row) {
            if (!row || !row.html) return false;
            var el = typeof target === 'string' ? document.querySelector(target) : target;
            if (el) el.innerHTML = row.html;
            return true;
        });
    }

    function onNetworkReady() {
        window._daxiNativeOnline = true;
        if (window.DaxiNetworkBanner && DaxiNetworkBanner.hide) {
            DaxiNetworkBanner.hide();
        }
        if (typeof window._daxiMapLog === 'function') {
            window._daxiMapLog('network-online');
        }
        syncBootstrap().then(function() {
            if (!isOffline()) prefetchKeyPages();
            if (!isOffline() && !window._daxiExternalMapsBlocked) {
                if (window._daxiGoogleMapHasBeenShown || window._clientBgMap) {
                    if (typeof window._daxiEnsureGoogleMapSized === 'function') window._daxiEnsureGoogleMapSized('network-ready');
                    return;
                }
                if (typeof window._daxiRecoverLiveGoogleMap === 'function') {
                    window._daxiRecoverLiveGoogleMap('offline-onNetworkReady');
                    return;
                }
                if (typeof window._daxiLoadGoogleMaps === 'function') {
                    try {
                        sessionStorage.removeItem('daxi_skip_tile_prefetch');
                        sessionStorage.removeItem('daxi_maps_probe_failed');
                    } catch (e) {}
                    window._daxiLoadGoogleMaps();
                }
            }
        });
    }

    function normalizeHtmxPath(path) {
        try {
            var u = new URL(path, location.origin || 'https://localhost');
            return u.pathname + u.search;
        } catch (e) {
            return String(path || '');
        }
    }

    function serveCachedHtmxOrFallback(path, targetSel, fallbackFn) {
        var p = normalizeHtmxPath(path);
        return tryServeHtmxFromCache(p, targetSel).then(function(ok) {
            if (ok) return true;
            var bare = p.split('?')[0];
            if (bare !== p) {
                return tryServeHtmxFromCache(bare, targetSel).then(function(ok2) {
                    if (ok2) return true;
                    if (typeof fallbackFn === 'function') fallbackFn();
                    return false;
                });
            }
            if (typeof fallbackFn === 'function') fallbackFn();
            return false;
        });
    }

    function prefetchKeyPages() {
        if (isOffline()) return;
        var path = (location.pathname || '/').toLowerCase();
        var urls;
        if (path.indexOf('/driver') === 0) {
            urls = [
                '/htmx/driver/orders/',
                '/htmx/driver/orders/?tab=available',
                '/htmx/driver/orders/?tab=accepted',
                '/htmx/driver/profile/',
                '/htmx/driver/stats/',
                '/htmx/driver/wallet/',
                '/htmx/driver/calendar/',
                '/htmx/driver/lost-objects/',
                '/htmx/driver/active-order/'
            ];
        } else if (path.indexOf('/admin') >= 0) {
            urls = [
                '/htmx/admin/orders/',
                '/htmx/admin/stats/',
                '/htmx/admin/drivers/?tab=confirmed',
                '/htmx/admin/users/',
                '/htmx/admin/calendar/',
                '/htmx/admin/lost-objects/',
                '/htmx/admin/enterprises/?tab=pending',
                '/htmx/admin/assistance/',
                '/htmx/lieux/admin/'
            ];
        } else if (path.indexOf('/entreprise') >= 0) {
            urls = [
                '/htmx/enterprise/dashboard/',
                '/htmx/enterprise/orders/',
                '/htmx/enterprise/plans/',
                '/htmx/lieux/enterprise/',
                '/htmx/lieux/enterprise/meta/'
            ];
        } else {
            urls = [
                '/htmx/blog/',
                '/htmx/forum/',
                '/htmx/client/orders/?tab=active',
                '/htmx/client/orders/?tab=history',
                '/htmx/client/account/',
                '/htmx/client/lost-objects/',
                '/htmx/lieux/client/',
                '/htmx/lieux/client/?q=&cat='
            ];
        }
        urls.forEach(function(u) {
            try {
                fetch(u, { credentials: 'include' }).then(function(r) {
                    if (!r.ok) return null;
                    return r.text();
                }).then(function(html) {
                    if (html) cacheHtmxResponse(u, html);
                }).catch(function() {});
            } catch (e) {}
        });
    }

    window.DaxiOffline = {
        sync: syncBootstrap,
        load: loadBootstrap,
        applyBootstrap: applyBootstrap,
        getData: function() { return window._daxiOfflineData || null; },
        isReadOnly: isOffline,
        prefetchMap: prefetchHaitiTiles,
        initSimpleMap: initSimpleMap,
        applyCachedUi: applyCachedUi,
        renderOfflineOrders: renderOfflineOrders,
        renderOfflineAccount: renderOfflineAccount,
        renderCachedOrdersIfAny: renderCachedOrdersIfAny,
        renderCachedAccountIfAny: renderCachedAccountIfAny,
        tryServeHtmxFromCache: tryServeHtmxFromCache,
        cacheHtmxResponse: cacheHtmxResponse,
        onNetworkReady: onNetworkReady,
        ensureOfflineMap: ensureOfflineMap,
        prefetchKeyPages: prefetchKeyPages
    };

    function init() {
        window.addEventListener('online', function() {
            onNetworkReady();
            if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.triggerOfflineSync) {
                DaxiAndroid.triggerOfflineSync();
            }
        });
        window.addEventListener('offline', function() {
            window._daxiNativeOnline = false;
            if (window.DaxiNetworkBanner && DaxiNetworkBanner.scheduleShowIfStillOffline) {
                DaxiNetworkBanner.scheduleShowIfStillOffline();
            }
            applyCachedUi('active');
            ensureOfflineMap();
        });

        document.body.addEventListener('click', blockOrderIfOffline, true);

        document.body.addEventListener('htmx:responseError', function(evt) {
            var path = (evt.detail && evt.detail.pathInfo && evt.detail.pathInfo.requestPath) || '';
            var target = (evt.detail && evt.detail.target) || null;
            if (/\/htmx\/client\/orders\/(\d+)\/sheet/.test(path)) {
                var sheetFail = path.match(/\/htmx\/client\/orders\/(\d+)\/sheet/);
                if (sheetFail && window._daxiLoadSheetOrder) {
                    window._daxiLoadSheetOrder(sheetFail[1], { cacheOnly: true });
                }
            } else if (/\/htmx\/client\/orders\/?(\?|$)/.test(path) || /\/htmx\/client\/orders\/\?/.test(path)) {
                var tab = path.indexOf('tab=history') >= 0 ? 'history' : 'active';
                if (window._daxiServeOfflineOrdersTab) {
                    window._daxiServeOfflineOrdersTab(tab, { apply: true });
                } else {
                    renderCachedOrdersIfAny(tab);
                }
            } else if (path.indexOf('/htmx/client/account') >= 0) {
                renderCachedAccountIfAny();
            } else if (path.indexOf('/htmx/') >= 0) {
                if (target) serveCachedHtmxOrFallback(path, target, null);
            }
        });

        document.body.addEventListener('htmx:beforeRequest', function(evt) {
            if (!isOffline()) return;
            var el = evt.detail && evt.detail.elt;
            var path = (evt.detail && evt.detail.pathInfo && evt.detail.pathInfo.requestPath) || '';
            var verb = (evt.detail && evt.detail.verb) || 'get';
            var target = (evt.detail && evt.detail.target) || null;
            
            var isOrderCreate = /\/htmx\/client\/order\/create/.test(path) ||
                (el && el.id === 'orderTaxiBtn');
            if (verb !== 'get' && isOrderCreate && canQueueOfflineWrites()) {
                evt.preventDefault();
                var body = {};
                if (el && el.tagName === 'FORM') {
                    try {
                        new FormData(el).forEach(function(v, k) { body[k] = v; });
                    } catch (err) {}
                } else if (evt.detail && evt.detail.parameters) {
                    body = evt.detail.parameters;
                }
                if (enqueueNativeOutbox('htmx_post', path, verb.toUpperCase(), { path: path, body: body })) {
                    showPendingOrderToast();
                    if (typeof htmx !== 'undefined' && el) {
                        el.dispatchEvent(new CustomEvent('daxi:queued-offline', { bubbles: true }));
                    }
                }
                return;
            }
            if (el && isOrderCreate) {
                evt.preventDefault();
                if (window.DaxiNetworkState && DaxiNetworkState.showOfflineModal) {
                    DaxiNetworkState.showOfflineModal('Commander');
                }
                return;
            }
            
            if (verb !== 'get') {
                evt.preventDefault();
                if (window.DaxiNetworkState && DaxiNetworkState.notifyAction) {
                    DaxiNetworkState.notifyAction('Action');
                } else if (window.DaxiNetworkState && DaxiNetworkState.showOfflineModal) {
                    DaxiNetworkState.showOfflineModal('Action');
                } else {
                    alert('Connexion requise pour cette action.');
                }
                try {
                    if (el) {
                        el.disabled = false;
                        el.style.opacity = '';
                        el.classList.remove('daxi-btn-busy', 'daxi-btn-loading');
                        el.removeAttribute('aria-busy');
                        if (el.dataset && el.dataset.origHtml) el.innerHTML = el.dataset.origHtml;
                    }
                } catch (eClr) {}
                return;
            }
            if (evt.detail.verb !== 'get') return;
            if (window._daxiHybridShell && path.indexOf('/htmx/client/account') >= 0) {
                if (window._daxiNativeOnline) return;
                evt.preventDefault();
                renderCachedAccountIfAny();
                return;
            }
            var sheetMatch = path.match(/\/htmx\/client\/orders\/(\d+)\/sheet/);
            if (sheetMatch) {
                evt.preventDefault();
                if (window._daxiLoadSheetOrder) {
                    window._daxiLoadSheetOrder(sheetMatch[1], { cacheOnly: true });
                }
                return;
            }
            var isOrdersListGet = /\/htmx\/client\/orders\/?(\?|$)/.test(path)
                || /\/htmx\/client\/orders\/\?/.test(path);
            if (isOrdersListGet) {
                evt.preventDefault();
                var tab = path.indexOf('tab=history') >= 0 ? 'history' : 'active';
                if (window._daxiServeOfflineOrdersTab) {
                    window._daxiServeOfflineOrdersTab(tab, { apply: true });
                } else {
                    serveCachedHtmxOrFallback(path, '#client-orders-htmx', function() {
                        renderOfflineOrders((window._daxiOfflineData || {}).orders, tab);
                    });
                }
                return;
            }
            if (path.indexOf('/htmx/client/account') >= 0) {
                evt.preventDefault();
                serveCachedHtmxOrFallback(path, '#account-htmx-slot', function() {
                    renderOfflineAccount(window._daxiOfflineData);
                });
            } else if (path.indexOf('/htmx/') >= 0) {
                evt.preventDefault();
                var sel = target;
                if (!sel) {
                    if (path.indexOf('/htmx/blog') >= 0) sel = '#blogFullscreenContainer';
                    else if (path.indexOf('/htmx/lieux/client') >= 0) sel = '#client-lieux-slot';
                    else if (path.indexOf('/htmx/client/lost-objects') >= 0) sel = '#client-lost-object-slot';
                    else if (path.indexOf('/htmx/lieux/enterprise') >= 0) sel = '#ent-lieux-slot';
                    else if (path.indexOf('/htmx/lieux/admin') >= 0) sel = '#admin-lieux-slot';
                }
                serveCachedHtmxOrFallback(path, sel, function() {
                    if (!sel) return;
                    var el2 = typeof sel === 'string' ? document.querySelector(sel) : sel;
                    if (el2 && !el2.innerHTML.trim()) {
                        el2.innerHTML = '<div style="padding:28px;text-align:center;color:#94a3b8;">'
                            + '<p style="font-weight:700;color:#e2e8f0;">Contenu indisponible hors ligne</p>'
                            + '<p style="font-size:12px;margin-top:6px;">Ouvrez cette page une fois en ligne pour la mettre en cache.</p></div>';
                    }
                });
            }
        });

        document.body.addEventListener('htmx:afterSwap', function(evt) {
            var target = evt.detail && evt.detail.target;
            if (!target) return;
            if (target.id === 'account-htmx-slot' && !target.innerHTML.trim()) {
                renderCachedAccountIfAny();
            }
            if (target.id === 'client-orders-htmx' && !target.innerHTML.trim()) {
                var tab = target.dataset.currentTab || 'active';
                if (window._daxiServeOfflineOrdersTab) {
                    window._daxiServeOfflineOrdersTab(tab, { apply: true });
                } else {
                    renderOfflineOrders((window._daxiOfflineData || {}).orders || [], tab);
                }
            }
            if (isOffline()) return;
            var path = evt.detail && evt.detail.pathInfo && evt.detail.pathInfo.requestPath;
            if (path && target && target.innerHTML) {
                cacheHtmxResponse(normalizeHtmxPath(path), target.innerHTML);
                var bare = String(path).split('?')[0];
                if (bare && bare !== path) cacheHtmxResponse(bare, target.innerHTML);
            }
        });

        
        (function patchFetchCache() {
            if (window._daxiOfflineFetchPatched) return;
            window._daxiOfflineFetchPatched = true;
            var orig = window.fetch;
            if (!orig) return;
            window.fetch = function(input, init) {
                var args = arguments;
                init = init || {};
                var url = typeof input === 'string' ? input : (input && input.url) || '';
                var method = String((init.method || (input && input.method) || 'GET')).toUpperCase();
                var p = normalizeHtmxPath(url);
                var isCacheable = /\/htmx\//.test(p) || /\/api\/mobile\//.test(p);
                if (method === 'GET' && isCacheable && isOffline()) {
                    return lookupHtmxCache(p).then(function(row) {
                        if (row && row.html) {
                            var json = row.html.charAt(0) === '{' || row.html.charAt(0) === '[';
                            return new Response(row.html, {
                                status: 200,
                                headers: { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8' }
                            });
                        }
                        return orig.apply(window, args);
                    });
                }
                return orig.apply(window, args).then(function(res) {
                    if (method === 'GET' && isCacheable && res && res.ok) {
                        try {
                            res.clone().text().then(function(t) {
                                if (t) cacheHtmxResponse(p, t);
                            }).catch(function() {});
                        } catch (e) {}
                    }
                    return res;
                });
            };
        })();

        function afterBootstrap(data) {
            if (isOffline()) applyCachedUi('active');
            else prefetchKeyPages();
        }

        loadBootstrap().then(function(cached) {
            if (!isOffline()) {
                return syncBootstrap().then(function(fresh) {
                    afterBootstrap(fresh || cached);
                });
            }
            afterBootstrap(cached);
            ensureOfflineMap();
            return cached;
        }).catch(function() {});
    }

    if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.getOfflineBootstrap) {
        try {
            var nativeBoot = JSON.parse(DaxiAndroid.getOfflineBootstrap() || '{}');
            if (nativeBoot && nativeBoot.ok) {
                window._daxiOfflineData = nativeBoot;
                applyBootstrap(nativeBoot);
            }
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('daxi:bootstrap-ready', function() {
        if (isOffline()) applyCachedUi('active');
    });

    _purgeLegacyOsmTiles().catch(function() { disableIdb(); });
})();