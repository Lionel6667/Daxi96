var _daxiMaps = {}; 
var _dirService = null;

const DAXI_NAV_CFG = {
    introMs: 4000,
    drivePitch: 65,
    camSmooth: 0.105,
    zoomSmooth: 0.085,
    bearSmooth: 0.09,
    posSmooth: 0.1,
    driveZoomDefault: 18.5,
    driveZoomMin: 13.2,
    driveZoomMax: 20.0,
    lookAhead: 0.00092,
    enterDriveMs: 2200
};


const DAXI_TRACK_CFG = {
    pitch: 52,
    padding: 65,
    resumeAfterMs: 8000
};

function _daxiRestoreMapTilt(map, pitch) {
    if (!map || pitch == null) return;
    var now = Date.now();
    if (map._daxiTiltLast && now - map._daxiTiltLast < 4000) return;
    map._daxiTiltLast = now;
    if (map._daxiTiltTimer) clearTimeout(map._daxiTiltTimer);
    map._daxiTiltTimer = setTimeout(function() {
        try {
            if (window._daxiPinDragging) return;
            var cur = map.getTilt ? map.getTilt() : 0;
            if (Math.abs(cur - pitch) > 3) map.setTilt(pitch);
        } catch (e) {}
    }, 150);
}


const lerp = (a, b, t) => a + (b - a) * t;
const _toRad = d => d * Math.PI / 180;
const _toDeg = r => r * 180 / Math.PI;
function _calcBearing(a, b) {
    const lat1 = _toRad(a[1]), lat2 = _toRad(b[1]);
    const dLng = _toRad(b[0] - a[0]);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (_toDeg(Math.atan2(y, x)) + 360) % 360;
}
function _lerpBear(a, b, t) {
    return (a + (((b - a + 540) % 360) - 180) * t + 360) % 360;
}
function _lookAheadPt(p, bearDeg, off) {
    const r = _toRad(bearDeg);
    return [p[0] + Math.sin(r) * off, p[1] + Math.cos(r) * off];
}


function _df(v) {
    if (v === undefined || v === null || v === '' || v === 'None' || v === 'NaN') return 0;
    var n = parseFloat(String(v).replace(',', '.'));
    return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : 0;
}
function _daxiSafeLL(ll) {
    if (!ll) return [-72.333, 18.533];
    var lng = 0, lat = 0;
    if (Array.isArray(ll)) { lng = ll[0]; lat = ll[1]; }
    else { lng = ll.lng; lat = ll.lat; }
    lng = parseFloat(lng);
    lat = parseFloat(lat);
    return [isFinite(lng) && lng !== 0 ? lng : -72.333, isFinite(lat) && lat !== 0 ? lat : 18.533];
}


let MapOverlay;


function _daxiDriver3D(lat, lng, map) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = (window.DaxiMapMarkers && DaxiMapMarkers.driverOverlayElement)
      ? DaxiMapMarkers.driverOverlayElement({ size: 36 })
      : (function () {
          var fallback = document.createElement('div');
          fallback.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);';
          return fallback;
        })();
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    overlay._el = el;
    return overlay;
}

function _daxiClientBlueDotEl(opts) {
    opts = opts || {};
    var el = document.createElement('div');
    if (opts.overlay) {
        el.style.cssText = 'position:relative;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;';
    } else {
        el.style.cssText = 'position:relative;width:22px;height:22px;pointer-events:none;display:flex;align-items:center;justify-content:center;';
    }
    var pulse = document.createElement('div');
    pulse.style.cssText = 'position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.2);animation:daxiSpin 4s linear infinite reverse;';
    var dot = document.createElement('div');
    dot.style.cssText = 'position:relative;width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #ffffff;box-shadow:0 0 8px rgba(59,130,246,0.6);flex-shrink:0;';
    el.appendChild(pulse);
    el.appendChild(dot);
    return el;
}

function _daxiMe3D(lat, lng, map) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = _daxiClientBlueDotEl({ overlay: true });
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    return overlay;
}

function _daxiDest3D(lat, lng, map, markerId) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var uid = markerId || ('dest' + Math.random().toString(36).slice(2, 7));
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:36px;height:50px;transform:translate(-50%, -100%);pointer-events:none;';
    el.innerHTML = `
      <svg width="36" height="50" viewBox="0 0 36 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pinGrad-${uid}" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stop-color="#f87171"/>
            <stop offset="100%" stop-color="#b91c1c"/>
          </radialGradient>
        </defs>
        <path d="M18 2 C9.163 2 2 9.163 2 18 C2 29 18 48 18 48 C18 48 34 29 34 18 C34 9.163 26.837 2 18 2 Z"
              fill="url(#pinGrad-${uid})" />
        <circle cx="18" cy="18" r="7" fill="rgba(255,255,255,0.9)"/>
        <circle cx="18" cy="18" r="3.5" fill="#ef4444"/>
      </svg>`;
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    return overlay;
}


function _fetchRoute(lng1, lat1, lng2, lat2, optWaypoints, retryOrOpts) {
    var retryCount = 0;
    if (retryOrOpts != null && typeof retryOrOpts === 'number') {
        retryCount = retryOrOpts;
    } else if (retryOrOpts != null && typeof retryOrOpts === 'object') {
        retryCount = 0;
    }
    lat1 = parseFloat(lat1);
    lng1 = parseFloat(lng1);
    lat2 = parseFloat(lat2);
    lng2 = parseFloat(lng2);
    if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
        return Promise.resolve(null);
    }
    var origin = { lat: lat1, lng: lng1 };
    var dest = { lat: lat2, lng: lng2 };
    var wps = (optWaypoints || []).map(function(p) {
        if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
        return { lat: p.lat, lng: p.lng };
    });
    if (window.DaxiRoutes && typeof DaxiRoutes.computeRoute === 'function') {
        return DaxiRoutes.computeRoute(origin, dest, wps).then(function(route) {
            if (!route || !route.path || route.path.length < 2) {
                if (retryCount < 2) {
                    return new Promise(function(resolve) {
                        setTimeout(function() {
                            resolve(_fetchRoute(lng1, lat1, lng2, lat2, optWaypoints, retryCount + 1));
                        }, 450 * (retryCount + 1));
                    });
                }
                return null;
            }
            var path = route.path.map(function(pt) {
                return {
                    lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat,
                    lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng
                };
            });
            path = _daxiSimplifyRoutePath(path);
            return {
                path: path,
                distanceText: route.distanceText,
                durationText: route.durationText,
                distanceKm: parseFloat((route.distanceText || '0').replace(' km', '')) || 0
            };
        });
    }
    return new Promise(resolve => {
        if (!window.google || !google.maps) { resolve(null); return; }
        if (!_dirService) _dirService = new google.maps.DirectionsService();
        var routeReq = {
            origin:      { lat: lat1, lng: lng1 },
            destination: { lat: lat2, lng: lng2 },
            travelMode:  google.maps.TravelMode.DRIVING,
            region:      'ht'
        };
        if (optWaypoints && optWaypoints.length) {
            routeReq.waypoints = optWaypoints.map(function(p) {
                var lat = Array.isArray(p) ? p[0] : p.lat;
                var lng = Array.isArray(p) ? p[1] : p.lng;
                return { location: { lat: lat, lng: lng }, stopover: false };
            });
            routeReq.optimizeWaypoints = false;
        }
        _dirService.route(routeReq, (result, status) => {
            if (status !== 'OK' || !result || !result.routes || !result.routes[0]) {
                if (retryCount < 2) {
                    setTimeout(function() {
                        resolve(_fetchRoute(lng1, lat1, lng2, lat2, optWaypoints, retryCount + 1));
                    }, 450 * (retryCount + 1));
                    return;
                }
                resolve(null); return;
            }
            var route = result.routes[0];
            var path = [];
            if (route.legs) {
                route.legs.forEach(function(leg) {
                    (leg.steps || []).forEach(function(step) {
                        (step.path || []).forEach(function(pt) {
                            path.push({
                                lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat,
                                lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng
                            });
                        });
                    });
                });
            }
            if (path.length < 2 && route.overview_path && route.overview_path.length >= 2) {
                path = route.overview_path.map(function(p) {
                    return { lat: p.lat(), lng: p.lng() };
                });
            }
            path = _daxiSimplifyRoutePath(path);
            if (path.length < 2) { resolve(null); return; }
            const leg = route.legs && route.legs[0];
            resolve({
                path: path,
                distanceM: leg ? leg.distance.value : null,
                durationS: leg ? leg.duration.value : null,
                distanceText: leg ? leg.distance.text : null,
                durationText: leg ? leg.duration.text : null
            });
        });
    });
}

function _daxiHUD(id, hasDest, hasDriver, dist, dur, eta) { }

function _daxiHaversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dp/2)*Math.sin(dp/2) + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);
    return 2 * R * Math.asin(Math.sqrt(a));
}

function _daxiShowPickupModal(orderId, opts) {
    opts = opts || {};
    if (opts.order) _daxiUpsertSheetOrderMeta(_daxiEnrichOrderMeta(opts.order));
    var kind = opts.isLaterConfirm ? 'later' : 'relocate';
    var meta = _daxiOrderMetaFromOpts(orderId, opts);
    if (!opts.isLaterConfirm && meta.is_later) return;
    if (!_daxiShouldShowPickupPrompt(orderId, kind)) return;
    _daxiMarkPickupPromptShown(orderId);
    var isLater = !!opts.isLaterConfirm || meta.is_later;
    var drift = opts.driftMeters != null ? Math.round(opts.driftMeters) : null;
    var sched = meta.scheduled_at ? _daxiFormatScheduledAt(meta.scheduled_at) : '';
    var pickup = meta.pickup || 'Lieu de rendez-vous';
    var dest = meta.destination || 'Destination';
    var statusLabel = meta.status_label || meta.status || '';
    var priceStr = meta.price != null ? _daxiFormatUsd(meta.price, 2) : '';
    var title = isLater ? 'Confirmer le lieu de rendez-vous' : 'Votre position a changé';
    var badge = isLater ? 'Course planifiée · départ dans moins d\'1 h' : 'Écart de position détecté';
    var explain = opts.message || (isLater
        ? 'Votre course planifiée approche. Le chauffeur se rendra au lieu de prise en charge indiqué ci-dessous. Si vous avez changé d\'endroit, mettez à jour le rendez-vous maintenant pour éviter tout malentendu.'
        : 'Nous avons détecté que vous n\'êtes plus au lieu de rendez-vous enregistré pour cette commande. Indiquez au chauffeur s\'il doit venir à votre position actuelle ou attendre au point initial.');
    if (drift && !isLater) {
        explain += ' (écart d\'environ ' + drift + ' m par rapport au lieu enregistré)';
    }
    var wrap = document.createElement('div');
    wrap.className = 'daxi-pickup-modal-wrap';
    wrap.id = 'daxi-pickup-modal-' + orderId;
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100010;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = '<div style="background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:20px;max-width:380px;width:100%;color:#e2e8f0;max-height:90vh;overflow-y:auto;">'
        + '<div style="font-size:11px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">' + badge + '</div>'
        + '<div style="font-size:16px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:6px;"><i class="ri-map-pin-line"></i> ' + title + '</div>'
        + '<div style="font-size:12px;color:#94a3b8;line-height:1.45;margin-bottom:12px;">' + explain + '</div>'
        + '<div style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);border-radius:12px;padding:10px 12px;margin-bottom:10px;">'
        + '<div style="font-size:10px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Commande concernée</div>'
        + '<div style="font-size:13px;font-weight:800;color:#f8fafc;">#' + orderId + (statusLabel ? (' · ' + statusLabel) : '') + (priceStr ? (' · ' + priceStr) : '') + '</div>'
        + '</div>'
        + '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:12px;line-height:1.45;">'
        + '<div style="color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Itinéraire prévu</div>'
        + '<div style="color:#f1f5f9;font-weight:700;"><i class="ri-record-circle-line" style="color:#4ade80;"></i> ' + pickup + '</div>'
        + '<div style="color:#64748b;margin:4px 0 4px 8px;">↓</div>'
        + '<div style="color:#f1f5f9;font-weight:700;"><i class="ri-map-pin-fill" style="color:#f87171;"></i> ' + dest + '</div>'
        + (sched ? ('<div style="margin-top:8px;color:#94a3b8;font-size:11px;"><i class="ri-time-line"></i> Départ prévu : ' + sched + '</div>') : '')
        + '</div>'
        + '<div style="font-size:11px;color:#64748b;line-height:1.4;margin-bottom:14px;padding:8px 10px;background:rgba(255,255,255,.03);border-radius:10px;">'
        + '<strong style="color:#94a3b8;">Que faire ?</strong> Votre choix est enregistré une seule fois pour cette commande. Le chauffeur et notre équipe seront informés automatiquement.'
        + '</div>'
        + (isLater ? '<input id="daxi-pickup-manual-' + orderId + '" type="text" placeholder="Ou saisir une nouvelle adresse…" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:rgba(255,255,255,.06);color:#f8fafc;font-size:13px;margin-bottom:10px;box-sizing:border-box;">' : '')
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        + '<button type="button" data-act="gps" style="padding:12px;border-radius:11px;border:none;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-weight:800;cursor:pointer;text-align:left;">'
        + '<div>Utiliser ma position GPS actuelle</div>'
        + '<div style="font-size:10px;font-weight:500;opacity:.85;margin-top:2px;">Le chauffeur viendra là où vous êtes maintenant</div></button>'
        + (isLater
            ? '<button type="button" data-act="keep" style="padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.3);background:rgba(255,255,255,.06);color:#e2e8f0;font-weight:700;cursor:pointer;text-align:left;">'
            + '<div>Conserver le lieu actuel</div>'
            + '<div style="font-size:10px;font-weight:500;opacity:.75;margin-top:2px;">Garder l\'adresse de prise en charge déjà enregistrée</div></button>'
            : '<button type="button" data-act="decline" style="padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.3);background:rgba(255,255,255,.06);color:#e2e8f0;font-weight:700;cursor:pointer;text-align:left;">'
            + '<div>Non, garder le lieu initial</div>'
            + '<div style="font-size:10px;font-weight:500;opacity:.75;margin-top:2px;">Le chauffeur ira au point de rendez-vous d\'origine</div></button>')
        + (isLater ? '<button type="button" data-act="manual" style="padding:11px;border-radius:11px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fcd34d;font-weight:700;cursor:pointer;">Valider l\'adresse saisie ci-dessus</button>' : '')
        + '</div></div>';
    document.body.appendChild(wrap);
    if (isLater && window.google && google.maps && google.maps.places) {
        var inp = document.getElementById('daxi-pickup-manual-' + orderId);
        if (inp) _daxiAttachInlinePlacesAC(inp);
    }
    wrap.addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        if (act === 'decline') {
            _daxiMarkPickupPromptDone(orderId);
            _daxiPostPickupChoice(orderId, 'decline', null, null, null, true);
            wrap.remove();
            return;
        }
        if (act === 'keep') {
            _daxiMarkPickupPromptDone(orderId);
            _daxiPostPickupChoice(orderId, 'keep', null, null, null, true);
            wrap.remove();
            return;
        }
        if (act === 'gps') {
            if (!navigator.geolocation) { alert('GPS indisponible'); return; }
            navigator.geolocation.getCurrentPosition(function(pos) {
                var validated = _daxiValidateGeoPos(pos, 'pickup-choice-gps');
                if (!validated) { alert('Précision GPS insuffisante (≤200 m requis). Réessayez.'); return; }
                _daxiMarkPickupPromptDone(orderId);
                _daxiPostPickupChoice(orderId, 'gps', validated.lat, validated.lng, _daxiMyPositionLabel(), isLater);
                wrap.remove();
            }, function() { alert('Impossible d\'obtenir votre position'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
            return;
        }
        if (act === 'manual') {
            var manual = document.getElementById('daxi-pickup-manual-' + orderId);
            var lat = manual && manual.dataset.lat, lng = manual && manual.dataset.lng;
            if (!lat || !lng) { alert('Choisissez une adresse dans les suggestions Google'); return; }
            _daxiMarkPickupPromptDone(orderId);
            _daxiPostPickupChoice(orderId, 'manual', parseFloat(lat), parseFloat(lng), manual.value, true);
            wrap.remove();
        }
    });
}

function _daxiPostPickupChoice(orderId, choice, lat, lng, address, useConfirmEndpoint) {
    var body = new URLSearchParams();
    if (useConfirmEndpoint || choice === 'keep' || choice === 'decline') {
        body.set('choice', choice);
    }
    if (lat != null) body.set('lat', String(lat));
    if (lng != null) body.set('lng', String(lng));
    if (address) body.set('address', address);
    var gid = localStorage.getItem('daxi_guest_id');
    if (gid) body.set('guest_id', gid);
    var url = (useConfirmEndpoint || choice === 'keep' || choice === 'decline')
        ? '/htmx/client/orders/' + orderId + '/confirm-pickup/'
        : '/htmx/client/orders/' + orderId + '/update-pickup/';
    fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': (typeof getCsrfToken === 'function' ? getCsrfToken() : '') }, body: body.toString() })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d && d.pickup_lat) {
                var el = document.getElementById('daximap-' + orderId);
                if (el) {
                    el.dataset.pickupLat = String(d.pickup_lat);
                    el.dataset.pickupLng = String(d.pickup_lng);
                    el.dataset.meetingLat = String(d.pickup_lat);
                    el.dataset.meetingLng = String(d.pickup_lng);
                }
                if (window._loadDaxiSheetOrders) setTimeout(function() { window._loadDaxiSheetOrders({ keepOpen: true, metaOnly: true }); }, 400);
            }
        }).catch(function() {});
}

window._daxiGpsWatchers = window._daxiGpsWatchers || {};

function _daxiStartClientGpsWatch(orderId) {
    if (!orderId || window._daxiGpsWatchers[orderId] || !navigator.geolocation) return;
    if (window.DaxiGpsTrace) DaxiGpsTrace.ok('CLIENT', 'CLIENT_GPS_WATCH_START', { orderId: orderId });
    var known = (window.DaxiWebGps && DaxiWebGps.getExploitableFix('CLIENT')) || window._lastClientGpsPos;
    if (known) {
        var kLat = known.lat, kLng = known.lng, kAcc = known.accuracy || known.acc;
        if (kLat != null && kLng != null && kAcc != null && kAcc <= DAXI_GPS_VALIDATED_MAX_M) {
            var body0 = new URLSearchParams();
            body0.set('lat', String(kLat));
            body0.set('lng', String(kLng));
            body0.set('accuracy', String(Math.round(kAcc)));
            var gid0 = localStorage.getItem('daxi_guest_id') || '';
            if (gid0) body0.set('guest_id', gid0);
            _daxiClientFetch('/htmx/client/orders/' + orderId + '/update-gps/', {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body0
            }).catch(function() {});
        }
    }
    window._daxiGpsWatchers[orderId] = navigator.geolocation.watchPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        var acc = pos.coords.accuracy || 9999;
        if (window.DaxiClientGps) {
            var ev = DaxiClientGps.processGeoPos(pos, 'order-watch');
            if (!ev || ev.decision !== 'ACCEPT') return;
            lat = ev.lat;
            lng = ev.lng;
            acc = ev.acc;
        } else if (acc > DAXI_GPS_VALIDATED_MAX_M) {
            return;
        }
        var src = (window.DaxiAndroid && DaxiAndroid.getCurrentLocation) ? 'Android' : 'GPS';
        if (window.DaxiGpsTrace) DaxiGpsTrace.gps('CLIENT', { lat: lat, lng: lng, accuracy: acc, source: src, orderId: orderId });
        var body = new URLSearchParams();
        body.set('lat', String(lat));
        body.set('lng', String(lng));
        if (pos.coords.accuracy != null) body.set('accuracy', String(Math.round(pos.coords.accuracy)));
        var gid = localStorage.getItem('daxi_guest_id') || '';
        if (gid) body.set('guest_id', gid);
        if (window.DaxiGpsTrace) DaxiGpsTrace.ok('CLIENT', 'CLIENT_POST_UPDATE_GPS_SEND', { lat: lat, lng: lng, accuracy: acc, source: src, orderId: orderId, channel: 'http' });
        _daxiClientFetch('/htmx/client/orders/' + orderId + '/update-gps/', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        }).then(function(r) {
            if (window.DaxiGpsTrace) {
                if (r.ok) DaxiGpsTrace.ok('CLIENT', 'CLIENT_POST_UPDATE_GPS_RESPONSE', { lat: lat, lng: lng, accuracy: acc, orderId: orderId, httpStatus: r.status, channel: 'http' });
                else DaxiGpsTrace.fail('CLIENT', 'CLIENT_POST_UPDATE_GPS_RESPONSE', { lat: lat, lng: lng, accuracy: acc, orderId: orderId, httpStatus: r.status, channel: 'http', reason: 'http_error' });
            }
            return r.json();
        }).then(function(d) {
            if (d && d.error && window.DaxiGpsTrace) {
                DaxiGpsTrace.fail('CLIENT', 'CLIENT_POST_UPDATE_GPS_RESPONSE', { lat: lat, lng: lng, orderId: orderId, reason: d.error });
            }
            if (d && d.success && window.DaxiGpsTrace) {
                DaxiGpsTrace.ok('CLIENT', 'CLIENT_POST_UPDATE_GPS_BACKEND_OK', { lat: lat, lng: lng, orderId: orderId, extra: d });
            }
            if (d && d.relocate_prompt) {
                if (d.order && d.order.is_later) return;
                _daxiShowPickupModal(orderId, {
                    message: d.message || undefined,
                    driftMeters: d.drift_meters,
                    order: d.order
                });
            }
        }).catch(function(err) {
            if (window.DaxiGpsTrace) DaxiGpsTrace.fail('CLIENT', 'CLIENT_POST_UPDATE_GPS_RESPONSE', { lat: lat, lng: lng, orderId: orderId, reason: String(err && err.message || err) });
        });
    }, function(err) {
        if (window.DaxiGpsTrace) DaxiGpsTrace.fail('CLIENT', 'CLIENT_GPS_WATCH_ERROR', { orderId: orderId, reason: String(err && err.message || err && err.code || err) });
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

function _daxiStopClientGpsWatch(orderId) {
    var wid = window._daxiGpsWatchers[orderId];
    if (wid != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(wid);
        delete window._daxiGpsWatchers[orderId];
    }
}


window._daxiTrackers = window._daxiTrackers || {};
var _DAXI_TRACK_STATUSES = ['pending', 'price_proposed', 'price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress'];
var _DAXI_MAIN_TRACK_STATUSES = ['driver_assigned', 'on_way', 'arrived', 'in_progress'];

window._daxiMainOrderTrack = window._daxiMainOrderTrack || {
    driver: null, legLine: null, legGlow: null, legPath: null, orderId: null
};

function _daxiSnapPointToPath(lat, lng, path, accuracy) {
    if (window.DaxiMapSnap && DaxiMapSnap.snapForDisplay) {
        var r = DaxiMapSnap.snapForDisplay(lat, lng, path, accuracy, 60);
        return r.snapped ? { lat: r.lat, lng: r.lng } : { lat: lat, lng: lng };
    }
    if (window.DaxiMapSnap && DaxiMapSnap.snapToPath) return DaxiMapSnap.snapToPath(lat, lng, path, 60);
    if (!path || path.length < 2 || lat == null || lng == null) return { lat: lat, lng: lng };
    var p = { lat: +lat, lng: +lng };
    var best = p;
    var bestDist = Infinity;
    for (var i = 0; i < path.length - 1; i++) {
        var a = path[i];
        var b = path[i + 1];
        var ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat;
        var abx = bx - ax, aby = by - ay;
        var apx = p.lng - ax, apy = p.lat - ay;
        var ab2 = abx * abx + aby * aby;
        var t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var c = { lat: ay + aby * t, lng: ax + abx * t };
        var dLat = (c.lat - p.lat) * 111320;
        var dLng = (c.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180);
        var d = Math.sqrt(dLat * dLat + dLng * dLng);
        if (d < bestDist) { bestDist = d; best = c; }
    }
    return bestDist > 200 ? p : best;
}

function _daxiPathFromPolyline(poly) {
    if (!poly || !poly.getLength) return [];
    var out = [];
    for (var i = 0; i < poly.getLength(); i++) {
        var pt = poly.getAt(i);
        out.push({ lat: pt.lat(), lng: pt.lng() });
    }
    return out;
}

function _daxiClearMainMapOrderTrack() {
    var t = window._daxiMainOrderTrack;
    if (!t) return;
    if (t.driver && t.driver.setMap) t.driver.setMap(null);
    if (t.legLine && t.legLine.setMap) t.legLine.setMap(null);
    if (t.legGlow && t.legGlow.setMap) t.legGlow.setMap(null);
    window._daxiMainOrderTrack = { driver: null, legLine: null, legGlow: null, legPath: null, orderId: null };
}

function _daxiDrawMainMapLeg(path, color) {
    if (!window._clientBgMap || !path || path.length < 2) return;
    var t = window._daxiMainOrderTrack;
    color = color || '#a855f7';
    if (!t.legGlow) {
        t.legGlow = new google.maps.Polyline({
            strokeColor: color, strokeOpacity: 0.22, strokeWeight: 12,
            map: window._clientBgMap, zIndex: 498
        });
    }
    if (!t.legLine) {
        t.legLine = new google.maps.Polyline({
            strokeColor: color, strokeOpacity: 0.92, strokeWeight: 5,
            map: window._clientBgMap, zIndex: 499
        });
    }
    t.legGlow.setPath(path);
    t.legLine.setPath(path);
    t.legGlow.setMap(window._clientBgMap);
    t.legLine.setMap(window._clientBgMap);
}

function _daxiSetMainMapDriverMarker(lat, lng) {
    if (!window._clientBgMap || !isFinite(lat) || !isFinite(lng) || lat === 0) return;
    var t = window._daxiMainOrderTrack;
    if (!t.driver) {
        t.driver = _daxiDriver3D(lat, lng, window._clientBgMap);
    } else if (t.driver.setPosition) {
        t.driver.setPosition({ lat: lat, lng: lng });
    }
}

function _daxiSyncMainMapOrderTracking(el) {
    if (!el || !window._clientBgMap || !window.google || !google.maps) return;
    var orderId = el.id.replace('daximap-', '');
    var status = el.dataset.orderStatus || '';
    var vLa = _df(el.dataset.driverLat), vLo = _df(el.dataset.driverLng);
    var pLa = _df(el.dataset.meetingLat) || _df(el.dataset.pickupLat);
    var pLo = _df(el.dataset.meetingLng) || _df(el.dataset.pickupLng);
    var dLa = _df(el.dataset.destLat), dLo = _df(el.dataset.destLng);

    if (_DAXI_MAIN_TRACK_STATUSES.indexOf(status) < 0 || !isFinite(vLa) || !isFinite(vLo) || vLa === 0) {
        if (window._daxiMainOrderTrack && String(window._daxiMainOrderTrack.orderId) === String(orderId)) {
            _daxiClearMainMapOrderTrack();
        }
        return;
    }

    window._daxiMainOrderTrack.orderId = orderId;
    var legTo = null;
    var legColor = '#a855f7';
    if (status === 'in_progress' && isFinite(dLa) && isFinite(dLo)) {
        legTo = { lat: dLa, lng: dLo };
        legColor = '#34d399';
    } else if (isFinite(pLa) && isFinite(pLo)) {
        legTo = { lat: pLa, lng: pLo };
        legColor = (status === 'on_way' || status === 'arrived') ? '#a855f7' : '#6366f1';
    }

    function fitTrack(lat, lng) {
        var now = Date.now();
        window._daxiMainFitLast = window._daxiMainFitLast || {};
        var last = window._daxiMainFitLast[orderId] || 0;
        if (now - last < 10000) return;
        window._daxiMainFitLast[orderId] = now;
        var bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: lat, lng: lng });
        if (isFinite(pLa) && isFinite(pLo)) bounds.extend({ lat: pLa, lng: pLo });
        if (isFinite(dLa) && isFinite(dLo)) bounds.extend({ lat: dLa, lng: dLo });
        if (!bounds.isEmpty()) {
            window._clientBgMap.fitBounds(bounds, _daxiMapPaddingFullscreen());
            _daxiRestoreBookingMapTilt(window._clientBgMap);
        }
    }

    function applyPos(lat, lng) {
        _daxiSetMainMapDriverMarker(lat, lng);
        if (document.body.classList.contains('daxi-sheet-collapsed-mode') ||
            (window._daxiMainMapFocusOrderId && String(window._daxiMainMapFocusOrderId) === String(orderId))) {
            fitTrack(lat, lng);
        }
    }

    if (!legTo) {
        applyPos(vLa, vLo);
        return;
    }

    if (status === 'arrived' && isFinite(pLa) && isFinite(pLo)) {
        applyPos(pLa, pLo);
        if (isFinite(dLa) && isFinite(dLo)) {
            _fetchRoute(pLo, pLa, dLo, dLa).then(function(route) {
                if (!route || !route.path || String(window._daxiMainOrderTrack.orderId) !== String(orderId)) return;
                _daxiDrawMainMapLeg(route.path, '#34d399');
            });
        }
        return;
    }

    _fetchRoute(vLo, vLa, legTo.lng, legTo.lat).then(function(route) {
        if (!route || !route.path || String(window._daxiMainOrderTrack.orderId) !== String(orderId)) return;
        window._daxiMainOrderTrack.legPath = route.path;
        if (window.DaxiMapSnap && DaxiMapSnap.setActiveRoutePath) DaxiMapSnap.setActiveRoutePath(route.path);
        var snapped = _daxiSnapPointToPath(vLa, vLo, route.path);
        _daxiDrawMainMapLeg(route.path, legColor);
        applyPos(snapped.lat, snapped.lng);
    });
}
window._daxiSyncMainMapOrderTracking = _daxiSyncMainMapOrderTracking;

function _daxiPatchSheetStatus(orderId, data) {
    if (!orderId || !data) return;
    data = data || {};
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (data.status) {
        if (slot) {
            var card = slot.querySelector('[data-order-id="' + orderId + '"]');
            if (!card) card = slot.querySelector('[data-order-id][data-status]');
            if (card) card.setAttribute('data-status', data.status);
            slot.querySelectorAll('.daxi-oc-badge').forEach(function(b) {
                b.textContent = _daxiStatusLabel(data.status);
                b.className = 'daxi-oc-badge daxi-oc-badge--' + data.status;
            });
        }
        var listCard = document.getElementById('co-' + orderId);
        if (listCard) {
            listCard.setAttribute('data-status', data.status);
            listCard.querySelectorAll('.daxi-oc-badge').forEach(function(b) {
                b.textContent = _daxiStatusLabel(data.status);
                b.className = 'daxi-oc-badge daxi-oc-badge--' + data.status;
            });
            if (typeof _daxiSyncClientOrdersCacheFromDom === 'function') {
                var ordersTab = (document.getElementById('client-orders-htmx') || {}).dataset.currentTab || 'active';
                _daxiSyncClientOrdersCacheFromDom(ordersTab);
            }
        }
        _daxiUpsertSheetOrderMeta(_daxiEnrichOrderMeta(Object.assign({ id: orderId }, data)));
    }
    if (data.driver_lat != null && data.driver_lng != null) {
        _daxiApplyDriverPos(orderId, data.driver_lat, data.driver_lng, data.status);
    } else if (data.status) {
        _daxiApplyDriverPos(orderId, null, null, data.status);
    }
    var total = data.total_price != null ? data.total_price : (data.total != null ? data.total : data.price);
    if (total != null && window._daxiApplyPriceToUI) {
        _daxiApplyPriceToUI(orderId, parseFloat(total));
    }
    if (window._daxiUpdateOrderMini) _daxiUpdateOrderMini();
}

function _daxiApplyDriverPos(orderId, lat, lng, status) {
    if (lat != null && lng != null && window.DaxiGpsTrace) {
        DaxiGpsTrace.ok('CLIENT', 'CLIENT_WS_DRIVER_LOCATION_RECV', { lat: lat, lng: lng, orderId: orderId, extra: { status: status } });
    }
    var el = document.getElementById('daximap-' + orderId);
    if (el) {
        if (lat != null && lng != null && isFinite(lat) && isFinite(lng) && lat !== 0) {
            el.dataset.driverLat = String(lat);
            el.dataset.driverLng = String(lng);
        }
        if (status) el.dataset.orderStatus = status;
        if (window.DaxiOrderCardMap && DaxiOrderCardMap.scheduleRefresh) {
            DaxiOrderCardMap.scheduleRefresh(orderId);
        }
        if (window._daxiMainMapFocusOrderId && String(window._daxiMainMapFocusOrderId) === String(orderId)) {
            _daxiSyncMainMapOrderTracking(el);
        }
        return;
    }
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng) || lat === 0) return;
    if (!window._daxiMainMapFocusOrderId || String(window._daxiMainMapFocusOrderId) !== String(orderId)) return;
    var st = status || '';
    if (!st && window._daxiSheetOrderList) {
        var om = window._daxiSheetOrderList.find(function(o) { return String(o.id) === String(orderId); });
        if (om) st = om.status || '';
    }
    if (st && _DAXI_MAIN_TRACK_STATUSES.indexOf(st) >= 0) {
        window._daxiMainOrderTrack.orderId = orderId;
        _daxiSetMainMapDriverMarker(lat, lng);
        if (window.DaxiGpsTrace) DaxiGpsTrace.ok('CLIENT', 'CLIENT_DRIVER_UI_APPLY', { lat: lat, lng: lng, orderId: orderId, extra: { status: st } });
    }
}

function _daxiStopLiveTracking(orderId) {
    var t = window._daxiTrackers[orderId];
    if (!t) return;
    if (window.DaxiRealtime && DaxiRealtime.disconnect) {
        DaxiRealtime.disconnect('order:' + orderId);
    } else if (t.ws) {
        try { t.ws.close(); } catch (e) {}
    }
    if (t.pollTimer) clearInterval(t.pollTimer);
    delete window._daxiTrackers[orderId];
}

function _daxiStartLiveTracking(orderId) {
    if (!orderId || window._daxiTrackers[orderId]) return;
    if (window.DaxiGpsTrace) DaxiGpsTrace.ok('CLIENT', 'CLIENT_LIVE_TRACKING_START', { orderId: orderId });
    var tracker = { orderId: orderId, ws: null, pollTimer: null, lastStatus: null };

    function _daxiOnOrderStatusChange(d, prevStatus) {
        if (!d || !d.status) return;
        var st = d.status;
        if (st === prevStatus) return;
        if (st === 'price_proposed' || st === 'coords_set' || st === 'driver_assigned' || st === 'on_way' || st === 'arrived' || st === 'in_progress') {
            if (window._daxiNotifyOrderEvent && (st === 'price_proposed' || st === 'coords_set')) _daxiNotifyOrderEvent(st, d);
            if (st === 'price_proposed' && window._daxiRefreshOrderSheet) {
                _daxiRefreshOrderSheet(orderId, { forceDom: true, checkoutTransition: true });
            } else if (st === 'coords_set' && window._daxiRefreshOrderSheet) {
                _daxiRefreshOrderSheet(orderId, { silent: true, cacheOnly: true });
            } else if (window._daxiRefreshOrderSheet) {
                _daxiRefreshOrderSheet(orderId, { forceDom: true, checkoutTransition: true });
            }
        } else if (st === 'payment_confirmed') {
            if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { forceDom: true });
            _daxiPatchSheetStatus(orderId, d);
            if (typeof window._daxiMaybeAskNotificationsNow === 'function') {
                window._daxiMaybeAskNotificationsNow('payment_confirmed');
            }
        } else if (st === 'cancelled' || st === 'completed' || st === 'price_refused') {
            if (window._daxiNotifyOrderEvent) _daxiNotifyOrderEvent(st, d);
            _daxiPatchSheetStatus(orderId, d);
        } else {
            _daxiPatchSheetStatus(orderId, d);
        }
    }

    function applyFromData(d) {
        if (!d) return;
        var prevStatus = tracker.lastStatus;
        if (d.status) tracker.lastStatus = d.status;
        if (d.driver_lat && d.driver_lng) {
            _daxiApplyDriverPos(orderId, d.driver_lat, d.driver_lng, d.status);
        } else if (d.status) {
            _daxiApplyDriverPos(orderId, null, null, d.status);
        }
        var total = d.total_price != null ? d.total_price : (d.total != null ? d.total : d.price);
        if (total != null && window._daxiApplyPriceToUI) {
            _daxiApplyPriceToUI(orderId, parseFloat(total));
        }
        if (d.status && d.status !== prevStatus) {
            _daxiOnOrderStatusChange(d, prevStatus);
        }
        if (d.status === 'completed' || d.status === 'cancelled') {
            _daxiStopLiveTracking(orderId);
            _daxiStopClientGpsWatch(orderId);
            if (window._loadDaxiSheetOrders) setTimeout(function() {
                _loadDaxiSheetOrders({ keepOpen: true, metaOnly: true });
            }, 400);
        }
        if (d.relocate_prompt) {
            var pollMeta = _daxiEnrichOrderMeta({
                id: orderId,
                pickup: d.pickup,
                destination: d.destination,
                scheduled_at: d.scheduled_at,
                is_later: d.is_later,
                status: d.status,
                price: d.price
            });
            _daxiUpsertSheetOrderMeta(pollMeta);
            _daxiShowPickupModal(orderId, {
                driftMeters: d.drift_meters,
                message: d.message,
                order: pollMeta
            });
        }
    }

    function poll() {
        fetch('/htmx/client/orders/' + orderId + '/status/', { credentials: 'include' })
            .then(function(r) { return r.json(); })
            .then(applyFromData)
            .catch(function() {});
    }

    _daxiStartClientGpsWatch(orderId);

    function handleWsMessage(msg) {
        try {
            if (msg.event === 'driver_location' && msg.data) {
                _daxiApplyDriverPos(orderId, msg.data.lat, msg.data.lng, tracker.lastStatus);
            } else if (msg.event === 'status_updated' && msg.data) {
                applyFromData(msg.data);
                _daxiPatchSheetStatus(orderId, msg.data);
                _daxiNotifyOrderEvent(msg.data.status, Object.assign({ silent: 1 }, msg.data));
            } else if (msg.event === 'driver_accepted' || msg.event === 'driver_on_the_way' || msg.event === 'driver_assigned' || msg.event === 'driver_arrived' || msg.event === 'in_progress') {
                applyFromData(msg.data || {});
                _daxiPatchSheetStatus(orderId, msg.data || {});
                if (msg.event === 'driver_accepted' || msg.event === 'driver_assigned') {
                    if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { forceDom: true });
                    if (window._loadDaxiSheetOrders) setTimeout(function() {
                        _loadDaxiSheetOrders({ keepOpen: true, metaOnly: true });
                    }, 300);
                }
                _daxiNotifyOrderEvent(msg.event.replace('driver_on_the_way', 'on_way').replace('driver_arrived', 'arrived').replace('driver_accepted', 'driver_assigned'), Object.assign({ silent: 1 }, msg.data || {}));
            } else if (msg.event === 'price_proposed' || msg.event === 'payment_confirmed' || msg.event === 'order_cancelled' || msg.event === 'price_updated' || msg.event === 'coords_set' || msg.event === 'trip_paused' || msg.event === 'trip_resumed' || msg.event === 'trip_extended') {
                if (msg.event !== 'payment_confirmed') {
                    _daxiNotifyOrderEvent(msg.event === 'order_cancelled' ? 'cancelled' : msg.event, msg.data || {});
                }
                if (msg.event === 'price_proposed' || msg.event === 'payment_confirmed' || msg.event === 'trip_paused' || msg.event === 'trip_resumed' || msg.event === 'trip_extended') {
                    if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { forceDom: true, checkoutTransition: true });
                } else if (msg.event === 'coords_set') {
                    _daxiPatchSheetStatus(orderId, msg.data || {});
                    if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { silent: true, cacheOnly: true });
                } else {
                    _daxiPatchSheetStatus(orderId, msg.data || {});
                    if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { silent: true, cacheOnly: true });
                }
                if (msg.event === 'payment_confirmed' && window._daxiApplyBookingMarkersLock) window._daxiApplyBookingMarkersLock();
                if (msg.event === 'payment_confirmed' && typeof window._daxiMaybeAskNotificationsNow === 'function') {
                    window._daxiMaybeAskNotificationsNow('payment_confirmed');
                }
            } else if (msg.event === 'relocate_prompt') {
                var relocMeta = _daxiEnrichOrderMeta(msg.data || { id: orderId });
                _daxiUpsertSheetOrderMeta(relocMeta);
                _daxiShowPickupModal(orderId, {
                    message: (msg.data && msg.data.message) || undefined,
                    driftMeters: msg.data && msg.data.drift_meters,
                    order: relocMeta
                });
            } else if (msg.event === 'pickup_confirm_prompt') {
                var laterMeta = _daxiEnrichOrderMeta(msg.data || { id: orderId });
                _daxiUpsertSheetOrderMeta(laterMeta);
                _daxiShowPickupModal(orderId, {
                    isLaterConfirm: true,
                    message: (msg.data && msg.data.message) || undefined,
                    order: laterMeta
                });
            } else if (msg.event === 'price_confirmed') {
                applyFromData(msg.data || {});
                _daxiPatchSheetStatus(orderId, msg.data || {});
                if (window._daxiRefreshOrderSheet) _daxiRefreshOrderSheet(orderId, { forceDom: true });
            } else if (msg.event === 'new_message') {
                _daxiNotifyOrderEvent('new_message', Object.assign({ order_id: orderId }, msg.data || {}));
                var msgArea = document.getElementById('chat-messages-' + orderId);
                if (msgArea) htmx.trigger(msgArea, 'revealed');
            } else if ((msg.event === 'danger_zone' || msg.event === 'zone_alert') && msg.data) {
                window._daxiClientDangerAlert && window._daxiClientDangerAlert(orderId, msg.data.message || 'Zone sensible', msg.data);
            } else if (window.DaxiRealtime && window.DaxiRealtime.isOrderEvent(msg.event)) {
                applyFromData(msg.data || {});
                var evData = msg.data || {};
                if (!evData.silent && evData.silent !== 1 && evData.silent !== '1') {
                    _daxiNotifyOrderEvent(msg.event, evData);
                }
            }
        } catch (err) {}
    }

    if (window.DaxiRealtime && DaxiRealtime.connectOrder) {
        tracker.rtEntry = DaxiRealtime.connectOrder(orderId, {
            onOpen: function() { tracker.wsConnected = true; poll(); },
            onClose: function() { tracker.wsConnected = false; },
            onMessage: handleWsMessage
        });
        tracker.ws = tracker.rtEntry && tracker.rtEntry.ws;
    } else {
        try {
            var proto = location.protocol === 'https:' ? 'wss' : 'ws';
            var wsGuestQs = typeof _daxiWsGuestQs === 'function' ? _daxiWsGuestQs() : '';
            tracker.ws = new WebSocket(proto + '://' + location.host + '/ws/orders/' + orderId + '/' + wsGuestQs);
            tracker.ws.onmessage = function(e) {
                try { handleWsMessage(JSON.parse(e.data)); } catch (err) {}
            };
            tracker.ws.onopen = function() { tracker.wsConnected = true; poll(); };
            tracker.ws.onclose = function() {
                tracker.wsConnected = false;
                if (window._daxiTrackers[orderId]) {
                    setTimeout(function() {
                        if (window._daxiTrackers[orderId]) {
                            delete window._daxiTrackers[orderId];
                            _daxiStartLiveTracking(orderId);
                        }
                    }, 3500);
                }
            };
        } catch (err) {}
    }

    tracker.pollTimer = setInterval(function() {
        if (!tracker.wsConnected || tracker.ws.readyState !== 1) poll();
    }, 12000);
    poll();
    window._daxiTrackers[orderId] = tracker;
}

function _daxiScanLiveTracking() {
    document.querySelectorAll('[data-daximap="1"]').forEach(function(el) {
        var id = el.id.replace('daximap-', '');
        var st = el.dataset.orderStatus || '';
        if (_DAXI_TRACK_STATUSES.indexOf(st) >= 0) _daxiStartLiveTracking(id);
    });
}
window._daxiScanLiveTracking = _daxiScanLiveTracking;

function _daxiParsePlanStopsFromEl(el) {
    if (!el) return [];
    var raw = el.dataset.planStops;
    if (!raw) return [];
    try {
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter(function(s) {
            return s && isFinite(_df(s.lat)) && isFinite(_df(s.lng));
        });
    } catch (e) { return []; }
}

function _daxiMapPaddingFullscreen() {
    return _daxiMapPadding(32);
}

function _daxiFitLatLngBounds(map, points, padding) {
    if (!map || !points || !points.length || !window.google || !google.maps) return;
    var bounds = new google.maps.LatLngBounds();
    points.forEach(function(p) {
        if (p && isFinite(p.lat) && isFinite(p.lng)) bounds.extend(p);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, padding || _daxiMapPaddingFullscreen());
}

function _daxiDirectionsRoute(origin, dest, waypoints) {
    if (window.DaxiRoutes && typeof DaxiRoutes.computeRoute === 'function') {
        return DaxiRoutes.computeRoute(origin, dest, waypoints);
    }
    return Promise.resolve(null);
}

function _daxiPlanStopMarkerOnMap(lat, lng, num, map) {
    if (!map || !window.google || !google.maps) return null;
    return new google.maps.Marker({
        map: map,
        position: { lat: lat, lng: lng },
        zIndex: 1000 + num,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: '#a855f7',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
        },
        label: { text: String(num), color: '#fff', fontWeight: '900', fontSize: '9px' }
    });
}

function _daxiFetchOrderRouteForMap(pLa, pLo, dLa, dLo, planStops) {
    planStops = planStops || [];
    if (planStops.length > 1) {
        var last = planStops[planStops.length - 1];
        var mids = planStops.slice(0, -1);
        return _daxiDirectionsRoute(
            { lat: pLa, lng: pLo },
            { lat: _df(last.lat), lng: _df(last.lng) },
            mids
        );
    }
    if (!isFinite(dLa) || !isFinite(dLo)) return Promise.resolve(null);
    var smartP = (typeof _fetchSmartRoute === 'function')
        ? _fetchSmartRoute(pLa, pLo, dLa, dLo)
        : Promise.resolve(null);
    return smartP.then(function(route) {
        if (route && route.path && route.path.length >= 2) return route;
        if (typeof _fetchRoute === 'function') return _fetchRoute(pLo, pLa, dLo, dLa);
        return null;
    }).then(function(route) {
        if (route && route.path && route.path.length >= 2) return route;
        return null;
    });
}

function _daxiDrawOrderRouteOnMainMap(pLa, pLo, dLa, dLo, planStops, attempt) {
    attempt = attempt || 0;
    if (!window._clientBgMap || !window.google || !google.maps) {
        if (attempt < 4) setTimeout(function() { _daxiDrawOrderRouteOnMainMap(pLa, pLo, dLa, dLo, planStops, attempt + 1); }, 120);
        return;
    }
    _daxiFetchOrderRouteForMap(pLa, pLo, dLa, dLo, planStops).then(function(route) {
        if (route && route.path && route.path.length >= 2) {
            _drawBookingRoutePath(route.path, route.distanceText, route.durationText);
            return;
        }
        if (attempt < 3) {
            setTimeout(function() { _daxiDrawOrderRouteOnMainMap(pLa, pLo, dLa, dLo, planStops, attempt + 1); }, 350 * (attempt + 1));
        }
    });
}

function _daxiOrderRoutePoints(pLa, pLo, dLa, dLo, planStops) {
    var pts = [];
    if (isFinite(pLa) && isFinite(pLo)) pts.push({ lat: pLa, lng: pLo });
    (planStops || []).forEach(function(s) {
        pts.push({ lat: _df(s.lat), lng: _df(s.lng) });
    });
    if (!planStops || !planStops.length) {
        if (isFinite(dLa) && isFinite(dLo)) pts.push({ lat: dLa, lng: dLo });
    }
    return pts;
}

function _daxiFitOrderOnMainMap(el, pLa, pLo, dLa, dLo) {
    if (!window._clientBgMap) return;
    var planStops = _daxiParsePlanStopsFromEl(el);
    var pad = _daxiMapPaddingFullscreen();
    var status = el ? (el.dataset.orderStatus || '') : '';
    var hasDriverTrack = el && _DAXI_MAIN_TRACK_STATUSES.indexOf(status) >= 0
        && isFinite(_df(el.dataset.driverLat)) && isFinite(_df(el.dataset.driverLng));
    if (hasDriverTrack) {
        _daxiSyncMainMapOrderTracking(el);
    } else {
        _daxiClearMainMapOrderTrack();
        _daxiDrawOrderRouteOnMainMap(pLa, pLo, dLa, dLo, planStops, 0);
    }
    var pts = _daxiOrderRoutePoints(pLa, pLo, dLa, dLo, planStops);
    if (!hasDriverTrack && pts.length > 1) {
        _daxiFitLatLngBounds(window._clientBgMap, pts, pad);
        _daxiRestoreBookingMapTilt(window._clientBgMap);
    } else if (!hasDriverTrack && isFinite(pLa) && isFinite(pLo)) {
        window._clientBgMap.setCenter({ lat: pLa, lng: pLo });
        window._clientBgMap.setZoom(15);
        _daxiRestoreBookingMapTilt(window._clientBgMap);
    }
}


function _daxiShouldUseOrderCardMap(el) {
    if (!window.DaxiOrderCardMap || !el || !el.closest) return false;
    return !!el.closest('#client-orders-htmx, #orders-list, #sb-orders, .daximap-wrap--card');
}

function initDaxiMaps3D(root) {
    if (!window.google || !window.google.maps || typeof google.maps.Map !== 'function') return;
    var scope = (root && root.querySelectorAll) ? root : document;

    scope.querySelectorAll('[data-daximap="1"]:not([data-map-ready])').forEach(async function(el) {
        if (_daxiShouldUseOrderCardMap(el)) return;
        el.dataset.mapReady = '1';
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.8s ease';

        var id  = el.id.replace('daximap-', '');
        var prevInst = window._daxiMaps && window._daxiMaps[id];
        if (prevInst && prevInst._rafId) {
            cancelAnimationFrame(prevInst._rafId);
            prevInst._rafId = null;
        }
        var skelFailsafe = setTimeout(function() {
            var skel = document.getElementById('daximap-skel-' + id);
            if (skel && skel.style.display !== 'none') {
                skel.style.opacity = '0';
                setTimeout(function() { skel.style.display = 'none'; }, 400);
            }
            el.style.opacity = '1';
        }, 7000);
        var pLa = _df(el.dataset.meetingLat) || _df(el.dataset.pickupLat);
        var pLo = _df(el.dataset.meetingLng) || _df(el.dataset.pickupLng);
        var dLa = _df(el.dataset.destLat),   dLo = _df(el.dataset.destLng);
        var vLa = _df(el.dataset.driverLat), vLo = _df(el.dataset.driverLng); 
        var planStops = _daxiParsePlanStopsFromEl(el);
        var hasDest = !!(dLa && dLo);
        var hasDriver = !!(vLa && vLo);


        const statusAttr = el.dataset.orderStatus || '';
        const caseA = hasDriver && (statusAttr === 'driver_assigned' || statusAttr === 'on_way' || statusAttr === 'arrived');
        const isInProgress = hasDriver && (statusAttr === 'in_progress');
        const caseActive = caseA || isInProgress;

        const center = _daxiSafeLL([pLo, pLa]);
        if (!isFinite(center[0])) center[0] = -72.333;
        if (!isFinite(center[1])) center[1] = 18.533;

        el.innerHTML = ''; 

        var trackTheme = el.dataset.daxiColorScheme || document.documentElement.getAttribute('data-theme') || 'dark';
        var mapOpts = {
            center: { lat: center[1], lng: center[0] },
            zoom: DAXI_NAV_CFG.driveZoomDefault,
            tilt: DAXI_TRACK_CFG.pitch,
            heading: 0,
            disableDefaultUI: true,
            gestureHandling: 'greedy',
            mapId: 'c4948b020bfc08331f1cb94e',
            colorScheme: _daxiMapColorScheme(trackTheme),
            backgroundColor: _daxiMapBgColor(trackTheme),
            tiltInteractionEnabled: true,
            headingInteractionEnabled: true
        };
        var map;
        try {
            map = new google.maps.Map(el, mapOpts);
        } catch (mapErr) {
            delete mapOpts.mapId;
            map = new google.maps.Map(el, mapOpts);
        }
        try { map.setTilt(DAXI_TRACK_CFG.pitch); } catch (e) {}


        const _pickupPolyGlow = new google.maps.Polyline({
            path: [], strokeColor: '#7e22ce', strokeWeight: 14, zIndex: 6
        });
        const _pickupPoly = new google.maps.Polyline({
            path: [], strokeColor: '#a855f7', strokeWeight: 6, zIndex: 7
        });
        const _tripPolyGlow = new google.maps.Polyline({
            path: [], strokeColor: '#065f46', strokeWeight: 14, zIndex: 4
        });
        const _tripPoly = new google.maps.Polyline({
            path: [], strokeColor: '#34d399', strokeWeight: 6, zIndex: 5
        });

        var inst = { 
            map: map, 
            id: id,
            _isLight: trackTheme === 'light',
            targetPos: [center[0], center[1]],
            currentPos: [center[0], center[1]],
            sBear: 0,
            camC: [center[0], center[1]],
            camB: 0,
            isFollowing: false,
            isIntro: true,
            lastT: 0,
            driverMarker: null,
            userMarker: null,
            destMarker: null,
            _interpFrom: [center[0], center[1]],
            _interpTo:   [center[0], center[1]],
            _interpStart: 0,
            _interpDur: 2800,

            isTracking: false,
            _userInteracting: false,
            _lastInteractTime: 0,
            stopMarkers: [],
            planStops: planStops,
            _needsBoundsUpdate: true,
            _routeLegLastAt: 0
        };
        _daxiMaps[id] = inst;

        function _throttledLegRouteRefresh(newVLo, newVLa) {
            var now = performance.now();
            if (now - inst._routeLegLastAt < 12000) return;
            inst._routeLegLastAt = now;
            if (caseA && pLa && pLo) {
                _fetchRoute(newVLo, newVLa, pLo, pLa).then(function(route1) {
                    if (route1 && route1.path) { _pickupPoly.setPath(route1.path); _pickupPolyGlow.setPath(route1.path); }
                });
            } else if (isInProgress && dLa && dLo) {
                _fetchRoute(newVLo, newVLa, dLo, dLa).then(function(routeTrip) {
                    if (routeTrip && routeTrip.path) { _tripPoly.setPath(routeTrip.path); _tripPolyGlow.setPath(routeTrip.path); }
                });
            }
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    if (mutation.attributeName === 'data-driver-lat' || mutation.attributeName === 'data-driver-lng') {
                        var newVLa = _df(el.dataset.driverLat), newVLo = _df(el.dataset.driverLng);
                        if (isFinite(newVLa) && isFinite(newVLo) && newVLa !== 0) {
                            inst._interpFrom = [...inst.currentPos];
                            inst._interpTo = [newVLo, newVLa];
                            inst.targetPos = [newVLo, newVLa];
                            inst._interpStart = performance.now();
                            if (caseActive) _throttledLegRouteRefresh(newVLo, newVLa);
                        }
                    }
                }
            });
        });
        observer.observe(el, { attributes: true });


        if (!isInProgress) {
            inst.userMarker = _daxiMe3D(pLa, pLo, map);
        }
        
        if (caseActive) {
            inst.driverMarker = _daxiDriver3D(vLa, vLo, map);
            inst.currentPos = [vLo, vLa];
            inst.targetPos  = [vLo, vLa];
            inst.camC       = [vLo, vLa];
            inst._interpFrom = [vLo, vLa];
            inst._interpTo = [vLo, vLa];
            if (isInProgress && hasDest) {
                inst.destMarker = _daxiDest3D(dLa, dLo, map, id);
            }
        } else if (hasDest) {
            inst.destMarker = _daxiDest3D(dLa, dLo, map, id);
        }

        if (planStops.length > 1) {
            planStops.slice(0, -1).forEach(function(s, i) {
                var m = _daxiPlanStopMarkerOnMap(_df(s.lat), _df(s.lng), i + 1, map);
                if (m) inst.stopMarkers.push(m);
            });
        }

        function _applySheetRoute(route) {
            if (!route || !route.path) return;
            _tripPoly.setPath(route.path);
            _tripPolyGlow.setPath(route.path);
            _tripPoly.setMap(map);
            _tripPolyGlow.setMap(map);
            if (!caseActive) {
                var pts = _daxiOrderRoutePoints(pLa, pLo, dLa, dLo, planStops);
                if (pts.length > 1) {
                    _daxiFitLatLngBounds(map, pts, DAXI_TRACK_CFG.padding);
                    _daxiRestoreMapTilt(map, DAXI_TRACK_CFG.pitch);
                }
            }
        }


        if (caseA && pLa && pLo) {
            _fetchRoute(vLo, vLa, pLo, pLa).then(route1 => {
                if (route1 && route1.path) {
                    _pickupPoly.setPath(route1.path);
                    _pickupPolyGlow.setPath(route1.path);
                    _pickupPoly.setMap(map);
                    _pickupPolyGlow.setMap(map);
                }
            });
        } else if (isInProgress && hasDest && dLa && dLo) {
            _fetchRoute(vLo, vLa, dLo, dLa).then(routeTrip => {
                if (routeTrip && routeTrip.path) {
                    _tripPoly.setPath(routeTrip.path);
                    _tripPolyGlow.setPath(routeTrip.path);
                    _tripPoly.setMap(map);
                    _tripPolyGlow.setMap(map);
                }
            });
        } else if (!caseActive && hasDest && pLa && pLo) {
            (function trySheetRoute(attempt) {
                _daxiFetchOrderRouteForMap(pLa, pLo, dLa, dLo, planStops).then(function(route) {
                    if (route && route.path) _applySheetRoute(route);
                    else if (attempt < 2) setTimeout(function() { trySheetRoute(attempt + 1); }, 450);
                });
            })(0);
        }


        function frame(ts) {
            const dt = inst.lastT ? Math.min((ts - inst.lastT) / 16.67, 3) : 1;
            inst.lastT = ts;

            if (inst._interpStart > 0 && caseActive) {
                const elapsed = performance.now() - inst._interpStart;
                const t = Math.min(elapsed / inst._interpDur, 1);
                const eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
                inst.currentPos[0] = inst._interpFrom[0] + (inst._interpTo[0] - inst._interpFrom[0]) * eased;
                inst.currentPos[1] = inst._interpFrom[1] + (inst._interpTo[1] - inst._interpFrom[1]) * eased;
                if (t >= 1) {
                    inst.currentPos[0] = inst._interpTo[0];
                    inst.currentPos[1] = inst._interpTo[1];
                }
            } else if (caseActive) {
                inst.currentPos[0] += (inst._interpTo[0] - inst.currentPos[0]) * 0.05 * dt;
                inst.currentPos[1] += (inst._interpTo[1] - inst.currentPos[1]) * 0.05 * dt;
            }

            if (caseActive && inst.driverMarker) {
                var posLat = inst.currentPos[1];
                var posLng = inst.currentPos[0];
                var legPath = isInProgress
                    ? _daxiPathFromPolyline(_tripPoly.getPath())
                    : _daxiPathFromPolyline(_pickupPoly.getPath());
                if (legPath.length > 1) {
                    var snapped = _daxiSnapPointToPath(posLat, posLng, legPath);
                    posLat = snapped.lat;
                    posLng = snapped.lng;
                }
                const dx = inst._interpTo[0] - inst._interpFrom[0];
                const dy = inst._interpTo[1] - inst._interpFrom[1];
                let targetBear = inst.sBear;
                if (Math.abs(dx) + Math.abs(dy) > 1e-8) {
                    targetBear = _calcBearing(inst._interpFrom, inst._interpTo);
                }
                inst.sBear = _lerpBear(inst.sBear, targetBear, DAXI_NAV_CFG.bearSmooth * dt);
                
                inst.driverMarker.setPosition({ lat: posLat, lng: posLng });
                if (inst.driverMarker._el) {
                    inst.driverMarker._el.style.transform = inst.isFollowing 
                        ? `rotateX(${DAXI_NAV_CFG.drivePitch}deg)` 
                        : `rotateZ(${inst.sBear}deg)`;
                }
            }

            if (inst.isFollowing && !inst.isIntro && caseActive) {
                const focal = _lookAheadPt(inst.currentPos, inst.sBear, DAXI_NAV_CFG.lookAhead);
                inst.camC[0] = lerp(inst.camC[0], focal[0], DAXI_NAV_CFG.camSmooth * dt);
                inst.camC[1] = lerp(inst.camC[1], focal[1], DAXI_NAV_CFG.camSmooth * dt);
                const safeCamB = (window._hasDeviceOrientation) ? window._userHeading : inst.sBear;
                inst.camB = _lerpBear(inst.camB, safeCamB, DAXI_NAV_CFG.camSmooth * dt);
                inst._camFrame = (inst._camFrame || 0) + 1;
                if (inst._camFrame % 3 === 0) {
                    map.moveCamera({
                        center: { lat: inst.camC[1], lng: inst.camC[0] },
                        heading: inst.camB,
                        tilt: DAXI_NAV_CFG.drivePitch
                    });
                }
            }


            if (inst.isTracking && !inst.isIntro) {
                const nowT = performance.now();

                if (inst._userInteracting && nowT - inst._lastInteractTime > DAXI_TRACK_CFG.resumeAfterMs) {
                    inst._userInteracting = false;
                }
                if (!inst._userInteracting && inst._needsBoundsUpdate) {
                    inst._needsBoundsUpdate = false;
                    const tb = new google.maps.LatLngBounds();
                    if (caseActive) tb.extend({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
                    if (pLa && pLo) tb.extend({ lat: pLa, lng: pLo });
                    if (hasDest && dLa && dLo) tb.extend({ lat: dLa, lng: dLo });
                    if (!tb.isEmpty()) {
                        map.fitBounds(tb, { padding: DAXI_TRACK_CFG.padding });
                        _daxiRestoreMapTilt(map, DAXI_TRACK_CFG.pitch);
                    }
                }
            }

            inst._rafId = requestAnimationFrame(frame);
        }
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
            clearTimeout(skelFailsafe);
            requestAnimationFrame(frame);
            try { google.maps.event.trigger(map, 'resize'); } catch (e) {}
            el.style.opacity = '1';


            const skel = document.getElementById('daximap-skel-' + id);
            if (skel) { skel.style.opacity = '0'; setTimeout(() => skel.style.display = 'none', 500); }


            const bounds = new google.maps.LatLngBounds();
            if (!isInProgress && pLa && pLo) bounds.extend({ lat: pLa, lng: pLo });
            if (caseActive) bounds.extend({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
            if (hasDest && dLa && dLo) bounds.extend({ lat: dLa, lng: dLo });
            map.fitBounds(bounds, { padding: 50 });
            _daxiRestoreMapTilt(map, DAXI_TRACK_CFG.pitch);


            const _onUserInteract = () => {
                if (!inst.isIntro) {
                    inst._userInteracting = true;
                    inst._lastInteractTime = performance.now();
                    const rcBtn = document.getElementById('daximap-recenter-' + id);
                    if (rcBtn && inst.isTracking) rcBtn.style.display = 'flex';
                }
            };
            map.addListener('dragstart', _onUserInteract);
            map.addListener('zoom_changed', _onUserInteract);

            inst.doEnterDrive = () => {
                if (inst.introExitScheduled) return;
                inst.introExitScheduled = true;
                const intro = document.getElementById('daximap-intro-' + id);
                if (intro) {
                    intro.style.transition = 'opacity 0.6s ease';
                    intro.style.opacity = '0';
                    setTimeout(() => intro.style.display = 'none', 600);
                }
                inst.isIntro = false;

                if (caseActive) {

                    inst.isTracking = true;
                    inst._needsBoundsUpdate = true;
                    map.setTilt(DAXI_TRACK_CFG.pitch);
                } else {
                    map.fitBounds(bounds, { padding: 80 });
                    _daxiRestoreMapTilt(map, DAXI_TRACK_CFG.pitch);
                }
            };

            const vBtn = document.getElementById('daximap-see-btn-' + id);
            if (vBtn) {
                vBtn.onclick = () => { vBtn.style.display = 'none'; inst.doEnterDrive(); };
            } else {
                setTimeout(() => inst.doEnterDrive(), 2000);
            }
        });
    });
    _daxiScanLiveTracking();
}

window.addEventListener('load', () => {
    setTimeout(function() {
        if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.init === 'function') {
            DaxiOrderCardMap.init();
        } else if (typeof initDaxiMaps3D === 'function') {
            initDaxiMaps3D();
        }
    }, 500);
});


document.addEventListener('htmx:afterSettle', function(evt) {
    if (!window.google || !window.google.maps) return;
    var root = evt.detail && evt.detail.target ? evt.detail.target : null;
    if (!root || !root.querySelectorAll) return;
    var needsInit = false;
    root.querySelectorAll('[data-daximap="1"]').forEach(function(el) {
        var oid = (el.id || '').replace('daximap-', '');
        var inst = oid && window._daxiMaps && window._daxiMaps[oid];
        var liveOk = false;
        if (inst && inst.map) {
            try {
                var liveDiv = inst.map.getDiv();
                liveOk = liveDiv && liveDiv.isConnected && liveDiv === el;
            } catch (e) {}
        }
        if (liveOk && el.dataset.mapReady) return;
        if (!liveOk && typeof _daxiPrepareMapSlot === 'function') _daxiPrepareMapSlot(oid);
        needsInit = true;
    });
    if (needsInit) {
        setTimeout(function() {
            if (root.id === 'daxi-sheet-order-slot' && window.DaxiOrderCardMap) {
                if (typeof DaxiOrderCardMap.init === 'function') DaxiOrderCardMap.init(root);
                if (typeof DaxiOrderCardMap.resizeVisible === 'function') DaxiOrderCardMap.resizeVisible(root);
            } else if (typeof initDaxiMaps3D === 'function') {
                initDaxiMaps3D(root);
            }
        }, 200);
    }
});


function daxiSeeMap(id) {
    var inst = _daxiMaps[id];
    if (inst && inst.doEnterDrive) inst.doEnterDrive();
}

function daxiMapRecenter(id) {
    var inst = _daxiMaps[id];
    if (!inst) return;
    inst._userInteracting = false;
    inst._needsBoundsUpdate = true;
    var rcBtn = document.getElementById('daximap-recenter-' + id);
    if (rcBtn) rcBtn.style.display = 'none';
}

function daxiToggleStyle(id) {
    var inst = _daxiMaps[id];
    if (!inst || !inst.map) return;
    var nextLight = !inst._isLight;
    var el = document.getElementById('daximap-' + id);
    if (!el) return;
    if (google.maps && google.maps.event) {
        try { google.maps.event.clearInstanceListeners(inst.map); } catch (e) {}
    }
    delete window._daxiMaps[id];
    el.innerHTML = '';
    delete el.dataset.mapReady;
    el.style.opacity = '0';
    el.dataset.daxiColorScheme = nextLight ? 'light' : 'dark';
    if (typeof initDaxiMaps3D === 'function') initDaxiMaps3D();
    var btn = document.getElementById('daximap-style-' + id);
    if (btn) btn.innerHTML = nextLight
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#f59e0b"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="#e2e8f0"/></svg>';
}

function daxiMapToggleFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    if (!wrap) return;
    if (wrap.classList.contains('daxi-fs')) { daxiMapExitFs(id); return; }
    wrap.classList.add('daxi-fs');
    Object.assign(wrap.style, { position:'fixed', inset:'0', zIndex:'99999', height:'100dvh', borderRadius:'0' });
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) { document.body.appendChild(closeBtn); closeBtn.style.display = 'flex'; }
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (fsBtn) fsBtn.style.display = 'none';
    var inst = _daxiMaps[id];
    if (inst) { inst._userInteracting = false; inst._needsBoundsUpdate = true; }
}

function daxiMapExitFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    if (!wrap) return;
    wrap.classList.remove('daxi-fs');
    Object.assign(wrap.style, { position:'relative', inset:'', zIndex:'', height:'260px', borderRadius:'' });
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) { wrap.appendChild(closeBtn); closeBtn.style.display = 'none'; }
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (fsBtn) fsBtn.style.display = 'flex';
    var inst = _daxiMaps[id];
    if (inst) inst._needsBoundsUpdate = true;
}

function daxiMapOpenOnMainMap(id) {
    id = String(id || '');
    if (!id) return;
    var el = document.getElementById('daximap-' + id);
    if (!el) {
        if (window._daxiLoadSheetOrder) window._daxiLoadSheetOrder(id, { preferCache: false });
        return;
    }
    if (!window._clientBgMap || !window.google || !google.maps) {
        if (window.showDaxiNotification) {
            showDaxiNotification(_daxiT('map_view_title', 'Carte'), _daxiT('map_loading', 'Chargement de la carte…'), { type: 'info' });
        }
        return;
    }
    var wrapFs = document.getElementById('daximap-wrap-' + id);
    if (wrapFs && wrapFs.classList.contains('daxi-fs') && typeof daxiMapExitFs === 'function') {
        daxiMapExitFs(id);
    }
    if (typeof closeDaxiPage === 'function') closeDaxiPage();
    window._daxiMainMapFocusOrderId = id;
    var pLa = _df(el.dataset.meetingLat) || _df(el.dataset.pickupLat);
    var pLo = _df(el.dataset.meetingLng) || _df(el.dataset.pickupLng);
    var dLa = _df(el.dataset.destLat), dLo = _df(el.dataset.destLng);
    if (!isFinite(pLa) || !isFinite(pLo)) return;
    if (typeof _setMainMapBookingPoint === 'function') {
        _setMainMapBookingPoint('pickup', pLa, pLo, '', '', '', { silent: true });
        if (isFinite(dLa) && isFinite(dLo)) {
            _setMainMapBookingPoint('dest', dLa, dLo, '', '', '', { silent: true });
        }
    }
    window._daxiSuppressGpsRepan = true;
    if (typeof _daxiSetSheetCollapsed === 'function') _daxiSetSheetCollapsed(true);
    else if (window._daxiCollapseSheet) window._daxiCollapseSheet();
    setTimeout(function() {
        _daxiFitOrderOnMainMap(el, pLa, pLo, dLa, dLo);
        if (isFinite(dLa) && isFinite(dLo) && typeof _updateBookingRoute === 'function') {
            _updateBookingRoute();
        }
        window._daxiSuppressGpsRepan = false;
    }, 180);
}
window.daxiMapOpenOnMainMap = daxiMapOpenOnMainMap;

function _daxiUpdateMainMapForOrder(orderId) {
    if (!orderId || !window._clientBgMap) return;
    if (window._daxiMainMapFocusOrderId && String(window._daxiMainMapFocusOrderId) !== String(orderId)) return;
    var el = document.getElementById('daximap-' + orderId);
    if (!el) return;
    var pLa = _df(el.dataset.meetingLat) || _df(el.dataset.pickupLat);
    var pLo = _df(el.dataset.meetingLng) || _df(el.dataset.pickupLng);
    var dLa = _df(el.dataset.destLat), dLo = _df(el.dataset.destLng);
    if (!isFinite(pLa) || !isFinite(pLo)) return;
    if (typeof _setMainMapBookingPoint === 'function') {
        _setMainMapBookingPoint('pickup', pLa, pLo, '', '', '', { silent: true });
        if (isFinite(dLa) && isFinite(dLo)) {
            _setMainMapBookingPoint('dest', dLa, dLo, '', '', '', { silent: true });
        }
    }
    if (document.body.classList.contains('daxi-sheet-collapsed-mode') ||
        String(window._daxiMainMapFocusOrderId) === String(orderId)) {
        _daxiFitOrderOnMainMap(el, pLa, pLo, dLa, dLo);
    }
}
window._daxiUpdateMainMapForOrder = _daxiUpdateMainMapForOrder;

function _daxiClearBookingRouteHud() {
    if (window._bookingRouteLine) window._bookingRouteLine.setMap(null);
    if (window._bookingRouteGlow) window._bookingRouteGlow.setMap(null);
    if (window.DaxiMapSnap && DaxiMapSnap.setActiveRoutePath) DaxiMapSnap.setActiveRoutePath(null);
    else window._daxiActiveRoutePath = null;
    document.body.classList.remove('daxi-route-hud-visible');
    var hud = document.getElementById('daxiRouteStatsHud');
    if (hud) { hud.innerHTML = ''; hud.style.display = 'none'; }
}


(function _daxiOrientationInit() {
    window._hasDeviceOrientation = false;
    window._userHeading = 0;

    function _applyHeading(deg) {
        var h = ((deg % 360) + 360) % 360;
        window._userHeading = h;
        window._hasDeviceOrientation = true;
    }


    if (window.AbsoluteOrientationSensor) {
        try {
            var sensor = new AbsoluteOrientationSensor({ frequency: 30, referenceFrame: 'screen' });
            sensor.addEventListener('reading', function() {

                var q = sensor.quaternion;
                var heading = Math.atan2(2*(q[0]*q[1] + q[2]*q[3]), 1 - 2*(q[1]*q[1] + q[2]*q[2]));
                _applyHeading(-heading * 180 / Math.PI);
            });
            sensor.addEventListener('error', function() {});
            sensor.start();
            return;
        } catch(e) {}
    }


    if (window.DeviceOrientationEvent) {
        var _addOri = function() {
            window.addEventListener('deviceorientationabsolute', function(e) {
                if (e.absolute && e.alpha !== null) _applyHeading(-e.alpha);
            }, true);
            window.addEventListener('deviceorientation', function(e) {
                if (e.alpha !== null) {
                    var h = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : -e.alpha;
                    _applyHeading(h);
                }
            }, true);
        };

        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            document.addEventListener('touchend', function _reqOri() {
                document.removeEventListener('touchend', _reqOri);
                DeviceOrientationEvent.requestPermission().then(function(s) {
                    if (s === 'granted') _addOri();
                }).catch(function() {});
            }, { once: true });
        } else {
            _addOri();
        }
    }
})();
