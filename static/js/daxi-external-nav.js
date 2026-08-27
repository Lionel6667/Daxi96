
(function (global) {
    'use strict';

    function parseCoord(val) {
        if (val == null || val === '') return NaN;
        if (typeof val === 'number') return val;
        var s = String(val).trim().replace(/\s/g, '');
        if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
        else if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/,/g, '');
        var n = parseFloat(s);
        return isFinite(n) ? n : NaN;
    }

    function fmtCoord(n) {
        if (!isFinite(n)) return '';
        return Number(n).toFixed(7);
    }

    function pointKey(p) {
        return fmtCoord(p.lat) + ',' + fmtCoord(p.lng);
    }

    function isValidPoint(p) {
        return p && isFinite(p.lat) && isFinite(p.lng);
    }

    function dedupePoints(points) {
        var seen = {};
        var out = [];
        points.forEach(function (p) {
            if (!isValidPoint(p)) return;
            var k = pointKey(p);
            if (seen[k]) return;
            seen[k] = true;
            out.push(p);
        });
        return out;
    }

    function currentGps() {
        var curLat = parseCoord(global._driverLat);
        var curLng = parseCoord(global._driverLng);
        if (isFinite(curLat) && isFinite(curLng)) return { lat: curLat, lng: curLng };
        if (global.pos && global.pos[0] && global.pos[1]) {
            return { lat: global.pos[1], lng: global.pos[0] };
        }
        return null;
    }

    function readRootData(root) {
        if (!root) return {};
        var planStops = [];
        try {
            var raw = root.getAttribute('data-plan-stops') || '[]';
            planStops = JSON.parse(raw);
            if (!Array.isArray(planStops)) planStops = [];
        } catch (e) { planStops = []; }

        return {
            orderId: root.getAttribute('data-order-id') || '',
            status: root.getAttribute('data-status') || '',
            tripType: root.getAttribute('data-trip-type') || '',
            isRoundTrip: root.getAttribute('data-is-round-trip') === '1',
            roundTripPhase: root.getAttribute('data-round-trip-phase') || '',
            pickupLat: root.getAttribute('data-pickup-lat'),
            pickupLng: root.getAttribute('data-pickup-lng'),
            rdvLat: root.getAttribute('data-rdv-lat'),
            rdvLng: root.getAttribute('data-rdv-lng'),
            destLat: root.getAttribute('data-dest-lat'),
            destLng: root.getAttribute('data-dest-lng'),
            clientGpsLat: root.getAttribute('data-client-gps-lat'),
            clientGpsLng: root.getAttribute('data-client-gps-lng'),
            pickupLabel: root.getAttribute('data-pickup-label') || 'Prise en charge',
            destLabel: root.getAttribute('data-dest-label') || 'Destination',
            planStops: planStops
        };
    }

    function readFromOrderCard(orderId) {
        var card = document.getElementById('driver-order-' + orderId);
        if (!card) return null;
        var nav = card.querySelector('[data-daxi-gps-nav]');
        return readRootData(nav || card);
    }

    
    function collectTripPoints(opts) {
        opts = opts || {};
        var points = [];
        var pickup = {
            lat: parseCoord(opts.rdvLat != null ? opts.rdvLat : opts.pickupLat),
            lng: parseCoord(opts.rdvLng != null ? opts.rdvLng : opts.pickupLng),
            label: opts.pickupLabel || 'Prise en charge',
            kind: 'pickup'
        };
        var clientGps = {
            lat: parseCoord(opts.clientGpsLat),
            lng: parseCoord(opts.clientGpsLng),
            label: 'Position client (GPS)',
            kind: 'client_gps'
        };
        var dest = {
            lat: parseCoord(opts.destLat),
            lng: parseCoord(opts.destLng),
            label: opts.destLabel || 'Destination',
            kind: 'destination'
        };

        if (isValidPoint(pickup)) points.push(pickup);

        if (isValidPoint(clientGps) && (!isValidPoint(pickup) || pointKey(clientGps) !== pointKey(pickup))) {
            points.push(clientGps);
        }

        var planStops = opts.planStops || [];
        if (planStops.length) {
            planStops.forEach(function (s, i) {
                var p = {
                    lat: parseCoord(s.lat),
                    lng: parseCoord(s.lng),
                    label: (s.label || ('Arrêt ' + (i + 1))).trim(),
                    kind: i === planStops.length - 1 ? 'destination' : 'waypoint'
                };
                if (isValidPoint(p)) points.push(p);
            });
        } else if (isValidPoint(dest)) {
            if (!points.length || pointKey(dest) !== pointKey(points[points.length - 1])) {
                points.push(dest);
            }
        }

        var isRoundTrip = opts.isRoundTrip ||
            (opts.tripType || '').toLowerCase().indexOf('retour') >= 0 ||
            (opts.tripType || '').toLowerCase() === 'round_trip';
        if (isRoundTrip && isValidPoint(pickup) && points.length > 1) {
            var returnPt = {
                lat: parseCoord(opts.pickupLat),
                lng: parseCoord(opts.pickupLng),
                label: 'Retour au départ',
                kind: 'return'
            };
            if (isValidPoint(returnPt) && pointKey(returnPt) !== pointKey(points[points.length - 1])) {
                points.push(returnPt);
            }
        }

        return dedupePoints(points);
    }

    function resolveNavTargets(opts) {
        opts = opts || {};
        var status = opts.status || '';
        var rtPhase = (opts.roundTripPhase || '').toLowerCase();
        var isRoundTrip = opts.isRoundTrip ||
            (opts.tripType || '').toLowerCase().indexOf('retour') >= 0 ||
            (opts.tripType || '').toLowerCase() === 'round_trip';
        var points = collectTripPoints(opts);
        var pickup = points.find(function (p) { return p.kind === 'pickup'; }) || points[0];
        var destination = points.filter(function (p) { return p.kind === 'destination' || p.kind === 'return'; }).pop()
            || points[points.length - 1];
        var clientGps = points.find(function (p) { return p.kind === 'client_gps'; });

        var target;
        var phase;
        if (status === 'waiting_return') {
            target = destination || points[points.length - 1];
            phase = 'waiting';
        } else if (status === 'in_progress' && isRoundTrip && rtPhase === 'return') {
            target = pickup;
            phase = 'return';
        } else if (status === 'in_progress') {
            target = destination || points[points.length - 1];
            phase = 'destination';
        } else if (clientGps && (status === 'on_way' || status === 'driver_assigned')) {
            target = clientGps;
            phase = 'client_gps';
        } else {
            target = pickup || points[0];
            phase = 'pickup';
        }

        return {
            origin: opts.useCurrentGps === false ? null : currentGps(),
            dest: target,
            destLabel: target ? target.label : 'Destination',
            phase: phase,
            allPoints: points
        };
    }

    function buildNavUrl(app, targets, mode) {
        var points = (targets.allPoints || []).filter(isValidPoint);
        var origin = targets.origin;
        var d = targets.dest;

        if (mode === 'full' && points.length >= 1) {
            d = points[points.length - 1];
            var waypoints = points.slice(0, -1);
            if (app === 'google') {
                var fullUrl = 'https://www.google.com/maps/dir/?api=1&destination=' +
                    fmtCoord(d.lat) + ',' + fmtCoord(d.lng) + '&travelmode=driving';
                if (origin && isValidPoint(origin)) {
                    fullUrl += '&origin=' + fmtCoord(origin.lat) + ',' + fmtCoord(origin.lng);
                }
                if (waypoints.length) {
                    fullUrl += '&waypoints=' + waypoints.map(function (p) {
                        return fmtCoord(p.lat) + ',' + fmtCoord(p.lng);
                    }).join('|');
                }
                return fullUrl;
            }
            if (app === 'apple') {
                var appleFull = 'https://maps.apple.com/?daddr=' + fmtCoord(d.lat) + ',' + fmtCoord(d.lng) + '&dirflg=d';
                if (origin && isValidPoint(origin)) {
                    appleFull += '&saddr=' + fmtCoord(origin.lat) + ',' + fmtCoord(origin.lng);
                }
                return appleFull;
            }
            app = 'waze';
        }

        if (!isValidPoint(d)) return '';
        var dLat = fmtCoord(d.lat);
        var dLng = fmtCoord(d.lng);
        var label = encodeURIComponent(targets.destLabel || d.label || 'Destination');

        if (app === 'google') {
            var url = 'https://www.google.com/maps/dir/?api=1&destination=' + dLat + ',' + dLng + '&travelmode=driving';
            if (origin && isValidPoint(origin)) {
                url += '&origin=' + fmtCoord(origin.lat) + ',' + fmtCoord(origin.lng);
            }
            return url;
        }
        if (app === 'waze') {
            return 'https://waze.com/ul?ll=' + dLat + ',' + dLng + '&navigate=yes';
        }
        if (app === 'apple') {
            var apple = 'https://maps.apple.com/?daddr=' + dLat + ',' + dLng + '&dirflg=d';
            if (origin && isValidPoint(origin)) {
                apple += '&saddr=' + fmtCoord(origin.lat) + ',' + fmtCoord(origin.lng);
            }
            return apple;
        }
        return 'geo:' + dLat + ',' + dLng + '?q=' + dLat + ',' + dLng + '(' + label + ')';
    }

    function toast(msg, isError, ms) {
        if (typeof global.driverShowToast === 'function') {
            global.driverShowToast(msg, !!isError, ms || 4500);
        }
    }

    function launchUrl(url) {
        if (!url) return false;
        var opened = global.open(url, '_blank');
        if (!opened) global.location.href = url;
        return true;
    }

    function openExternalNav(app, pickupLat, pickupLng, destLat, destLng, destLabel, opts) {
        opts = opts || {};
        var mode = opts.mode || 'smart';
        var targets;
        if (opts.directDest) {
            var dLat = parseCoord(destLat);
            var dLng = parseCoord(destLng);
            if (!isFinite(dLat) || !isFinite(dLng)) {
                toast('Coordonnées GPS manquantes pour ouvrir la navigation.', true);
                return false;
            }
            var origin = null;
            if (opts.useCurrentGps !== false) {
                if (global.pos && global.pos[0] && global.pos[1]) {
                    origin = { lat: global.pos[1], lng: global.pos[0] };
                }
            }
            targets = {
                origin: origin,
                dest: { lat: dLat, lng: dLng },
                destLabel: destLabel || 'Destination',
                phase: 'direct',
                allPoints: []
            };
        } else {
            opts.pickupLat = pickupLat;
            opts.pickupLng = pickupLng;
            opts.destLat = destLat;
            opts.destLng = destLng;
            opts.destLabel = destLabel;
            targets = resolveNavTargets(opts);
        }
        if (!isValidPoint(targets.dest) && mode !== 'full') {
            toast('Coordonnées GPS manquantes pour ouvrir la navigation.', true);
            return false;
        }
        if (mode === 'full' && (!targets.allPoints || !targets.allPoints.length)) {
            toast('Aucun point GPS disponible pour l\'itinéraire complet.', true);
            return false;
        }

        var url = buildNavUrl(app, targets, mode);
        if (!url) {
            toast('Impossible de construire l\'itinéraire.', true);
            return false;
        }
        launchUrl(url);

        var appNames = { google: 'Google Maps', waze: 'Waze', apple: 'Plans', geo: 'GPS' };
        var phaseLabel = {
            pickup: 'vers le client',
            client_gps: 'vers la position GPS du client',
            destination: 'vers la destination',
            return: 'retour au départ',
            waiting: 'à destination (attente)'
        }[targets.phase] || 'navigation';
        setTimeout(function () {
            toast(
                (appNames[app] || 'Navigation') + ' — ' +
                (mode === 'full' ? 'itinéraire complet (' + (targets.allPoints || []).length + ' point(s))' : phaseLabel),
                false,
                5000
            );
        }, 350);
        return true;
    }

    function openFromElement(btn) {
        if (!btn) return;
        var root = btn.closest('[data-daxi-gps-nav]');
        if (!root) return;
        var data = readRootData(root);
        var app = btn.getAttribute('data-nav-app') || 'google';
        var mode = btn.getAttribute('data-nav-mode') || 'smart';
        openExternalNav(
            app,
            data.pickupLat, data.pickupLng,
            data.destLat, data.destLng,
            data.destLabel,
            Object.assign({}, data, { mode: mode })
        );
    }

    function bindGpsNavButtons(root) {
        (root || document).querySelectorAll('[data-daxi-gps-nav] [data-nav-app]').forEach(function (btn) {
            if (btn.dataset.daxiGpsBound) return;
            btn.dataset.daxiGpsBound = '1';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                openFromElement(btn);
            });
        });
    }

    function ensureHub() {
        var hub = document.getElementById('daxi-nav-hub');
        if (hub) return hub;
        hub = document.createElement('div');
        hub.id = 'daxi-nav-hub';
        hub.className = 'daxi-nav-hub';
        hub.innerHTML =
            '<div class="daxi-nav-hub__backdrop" data-nav-hub-close></div>' +
            '<div class="daxi-nav-hub__sheet" role="dialog" aria-label="Navigation GPS">' +
            '  <div class="daxi-nav-hub__handle"></div>' +
            '  <div class="daxi-nav-hub__title"><i class="ri-navigation-fill"></i> <span data-nav-hub-title>Navigation</span></div>' +
            '  <p class="daxi-nav-hub__sub" data-nav-hub-sub></p>' +
            '  <div class="daxi-nav-hub__stops" data-nav-hub-stops></div>' +
            '  <div class="daxi-nav-hub__actions" data-nav-hub-actions></div>' +
            '  <button type="button" class="daxi-nav-hub__close" data-nav-hub-close>Fermer</button>' +
            '</div>';
        document.body.appendChild(hub);
        hub.querySelectorAll('[data-nav-hub-close]').forEach(function (el) {
            el.addEventListener('click', closeHub);
        });
        return hub;
    }

    function closeHub() {
        var hub = document.getElementById('daxi-nav-hub');
        if (hub) hub.classList.remove('is-open');
    }

    function hubActionHtml(app, mode, label, icon, extra) {
        return '<button type="button" class="daxi-nav-hub__btn daxi-nav-hub__btn--' + app + '" ' +
            'data-hub-app="' + app + '" data-hub-mode="' + mode + '" ' + (extra || '') + '>' +
            '<i class="' + icon + '"></i> ' + label + '</button>';
    }

    function openHub(orderIdOrRoot) {
        var data;
        if (typeof orderIdOrRoot === 'string' || typeof orderIdOrRoot === 'number') {
            data = readFromOrderCard(String(orderIdOrRoot));
        } else if (orderIdOrRoot && orderIdOrRoot.getAttribute) {
            data = readRootData(orderIdOrRoot.closest('[data-daxi-gps-nav]') || orderIdOrRoot);
        }
        if (!data) {
            toast('Course introuvable pour la navigation.', true);
            return;
        }

        var targets = resolveNavTargets(data);
        var points = targets.allPoints || [];
        if (!points.length) {
            toast('Aucune coordonnée GPS sur cette course.', true);
            return;
        }

        var hub = ensureHub();
        hub.querySelector('[data-nav-hub-title]').textContent =
            'Course #' + (data.orderId || '—');
        hub.querySelector('[data-nav-hub-sub]').textContent =
            points.length > 1
                ? points.length + ' point(s) · votre position actuelle sera le départ'
                : 'Votre position actuelle sera utilisée comme point de départ';

        var stopsEl = hub.querySelector('[data-nav-hub-stops]');
        stopsEl.innerHTML = points.map(function (p, i) {
            var icon = p.kind === 'pickup' ? 'A' : (p.kind === 'destination' || p.kind === 'return' ? 'B' : String(i + 1));
            return '<div class="daxi-nav-hub__stop daxi-nav-hub__stop--' + p.kind + '">' +
                '<span class="daxi-nav-hub__stop-dot">' + icon + '</span>' +
                '<div class="daxi-nav-hub__stop-body">' +
                '<div class="daxi-nav-hub__stop-label">' + (p.label || 'Point') + '</div>' +
                '<div class="daxi-nav-hub__stop-coords">' + fmtCoord(p.lat) + ', ' + fmtCoord(p.lng) + '</div>' +
                '</div>' +
                '<div class="daxi-nav-hub__stop-apps">' +
                '<button type="button" data-hub-app="google" data-hub-mode="point" data-hub-lat="' + p.lat + '" data-hub-lng="' + p.lng + '" data-hub-label="' + (p.label || '').replace(/"/g, '') + '" title="Google Maps"><i class="ri-google-fill"></i></button>' +
                '<button type="button" data-hub-app="waze" data-hub-mode="point" data-hub-lat="' + p.lat + '" data-hub-lng="' + p.lng + '" title="Waze"><i class="ri-navigation-line"></i></button>' +
                '</div></div>';
        }).join('');

        var actionsEl = hub.querySelector('[data-nav-hub-actions]');
        var smartLabel = {
            pickup: 'Vers le client',
            client_gps: 'Vers GPS client',
            destination: 'Vers la destination',
            return: 'Retour au départ',
            waiting: 'À destination'
        }[targets.phase] || 'Étape suggérée';

        actionsEl.innerHTML =
            '<div class="daxi-nav-hub__section-label">Recommandé maintenant</div>' +
            hubActionHtml('google', 'smart', smartLabel + ' — Google', 'ri-google-fill') +
            hubActionHtml('waze', 'smart', smartLabel + ' — Waze', 'ri-navigation-line') +
            (points.length > 1
                ? '<div class="daxi-nav-hub__section-label">Itinéraire complet</div>' +
                  hubActionHtml('google', 'full', 'Tous les arrêts — Google Maps', 'ri-route-line') +
                  hubActionHtml('apple', 'full', 'Tous les arrêts — Apple Plans', 'ri-map-pin-line')
                : '') +
            (data.orderId
                ? '<button type="button" class="daxi-nav-hub__btn daxi-nav-hub__btn--share" data-hub-share="' + data.orderId + '">' +
                  '<i class="ri-share-forward-line"></i> Partager le lien de suivi</button>'
                : '');

        hub.querySelectorAll('[data-hub-app]').forEach(function (btn) {
            btn.onclick = function () {
                var app = btn.getAttribute('data-hub-app');
                var mode = btn.getAttribute('data-hub-mode') || 'smart';
                if (mode === 'point') {
                    openExternalNav(app,
                        btn.getAttribute('data-hub-lat'), btn.getAttribute('data-hub-lng'),
                        btn.getAttribute('data-hub-lat'), btn.getAttribute('data-hub-lng'),
                        btn.getAttribute('data-hub-label') || 'Point',
                        Object.assign({}, data, { mode: 'smart', useCurrentGps: true })
                    );
                } else {
                    openExternalNav(app,
                        data.pickupLat, data.pickupLng,
                        data.destLat, data.destLng,
                        data.destLabel,
                        Object.assign({}, data, { mode: mode })
                    );
                }
                closeHub();
            };
        });

        var shareBtn = hub.querySelector('[data-hub-share]');
        if (shareBtn) {
            shareBtn.onclick = function () {
                closeHub();
                if (typeof global.driverShareTrip === 'function') {
                    global.driverShareTrip(shareBtn.getAttribute('data-hub-share'));
                }
            };
        }

        hub.classList.add('is-open');
    }

    global.DaxiExternalNav = {
        parseCoord: parseCoord,
        fmtCoord: fmtCoord,
        collectTripPoints: collectTripPoints,
        resolveNavTargets: resolveNavTargets,
        buildNavUrl: buildNavUrl,
        open: openExternalNav,
        openFromElement: openFromElement,
        openHub: openHub,
        closeHub: closeHub,
        bindGpsNavButtons: bindGpsNavButtons,
        readFromOrderCard: readFromOrderCard
    };

    global.driverOpenExternalNav = function (app, pickupLat, pickupLng, destLat, destLng, destLabel, opts) {
        return openExternalNav(app, pickupLat, pickupLng, destLat, destLng, destLabel, opts || {});
    };

    global.driverOpenNavHub = function (orderId) {
        return openHub(orderId);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { bindGpsNavButtons(); });
    } else {
        bindGpsNavButtons();
    }
    document.addEventListener('htmx:afterSwap', function () { bindGpsNavButtons(); });
})(typeof window !== 'undefined' ? window : this);