
(function (global) {
    'use strict';

    var PREFS = { mode: 'ask', app: 'google' };

    function loadPrefs() {
        var s = global.DJANGO_SESSION || {};
        PREFS.mode = s.nav_pref_mode || 'ask';
        PREFS.app = s.nav_pref_app || 'google';
    }

    function parseCoord(val) {
        if (global.DaxiExternalNav && DaxiExternalNav.parseCoord) {
            return DaxiExternalNav.parseCoord(val);
        }
        var n = parseFloat(String(val || '').replace(',', '.'));
        return isFinite(n) ? n : NaN;
    }

    function orderNavData(order) {
        if (!order) return {};
        var planStops = [];
        try {
            var raw = order.planStops || order.plan_stops_json || order.plan_stops;
            if (typeof raw === 'string') planStops = JSON.parse(raw);
            else if (Array.isArray(raw)) planStops = raw;
        } catch (e) { planStops = []; }

        return {
            orderId: order.id,
            status: order.status,
            tripType: order.tripType || order.trip_type || '',
            isRoundTrip: order.isRoundTrip === true || order.is_round_trip === true ||
                String(order.tripType || order.trip_type || '').toLowerCase().indexOf('retour') >= 0,
            roundTripPhase: order.roundTripPhase || order.round_trip_phase || '',
            pickupLat: order.pickupLat || order.pickup_lat,
            pickupLng: order.pickupLng || order.pickup_lng,
            rdvLat: order.rdvLat || order.rdv_lat || order.meetingLat || order.meeting_lat || order.pickupLat || order.pickup_lat,
            rdvLng: order.rdvLng || order.rdv_lng || order.meetingLng || order.meeting_lng || order.pickupLng || order.pickup_lng,
            destLat: order.destLat || order.destination_lat,
            destLng: order.destLng || order.destination_lng,
            clientGpsLat: order.clientGpsLat || order.client_gps_lat,
            clientGpsLng: order.clientGpsLng || order.client_gps_lng,
            pickupLabel: order.pickup || order.pickup_display || 'Prise en charge',
            destLabel: order.destination || order.destination_display || 'Destination',
            planStops: planStops
        };
    }

    
    function resolveLeg(prevStatus, newStatus, order) {
        var d = orderNavData(order);
        var prev = (prevStatus || '').trim();
        var next = (newStatus || '').trim();

        if (next === 'on_way' && prev === 'driver_assigned') {
            var clat = parseCoord(d.clientGpsLat);
            var clng = parseCoord(d.clientGpsLng);
            var rlat = parseCoord(d.rdvLat);
            var rlng = parseCoord(d.rdvLng);
            var plat = parseCoord(d.pickupLat);
            var plng = parseCoord(d.pickupLng);
            var useClientGps = isFinite(clat) && isFinite(clng);
            return {
                key: d.orderId + '-leg-pickup',
                title: 'Vers le client',
                detail: 'Prise en charge du passager',
                lat: useClientGps ? clat : (isFinite(rlat) ? rlat : plat),
                lng: useClientGps ? clng : (isFinite(rlng) ? rlng : plng),
                label: useClientGps ? 'Position GPS client' : d.pickupLabel,
                rideState: 'TO_CLIENT'
            };
        }

        if (next === 'in_progress' && prev === 'arrived') {
            var stops = (d.planStops || []).filter(function (s) {
                return isFinite(parseCoord(s.lat)) && isFinite(parseCoord(s.lng));
            });
            var target;
            if (stops.length) {
                target = {
                    lat: parseCoord(stops[0].lat),
                    lng: parseCoord(stops[0].lng),
                    label: stops[0].label || 'Premier arrêt'
                };
            } else {
                target = {
                    lat: parseCoord(d.destLat),
                    lng: parseCoord(d.destLng),
                    label: d.destLabel
                };
            }
            if (!isFinite(target.lat) || !isFinite(target.lng)) return null;
            return {
                key: d.orderId + '-leg-dest-' + prev,
                title: 'Vers la destination',
                detail: stops.length > 1
                    ? 'Premier arrêt — confirmez sur DAXI avant le suivant'
                    : 'Transport du client vers sa destination',
                lat: target.lat,
                lng: target.lng,
                label: target.label,
                rideState: 'IN_TRIP'
            };
        }

        if (next === 'in_progress' && prev === 'waiting_return') {
            return {
                key: d.orderId + '-leg-return',
                title: 'Retour au départ',
                detail: 'Ramener le client au point de départ initial',
                lat: parseCoord(d.pickupLat),
                lng: parseCoord(d.pickupLng),
                label: d.pickupLabel,
                rideState: 'IN_TRIP'
            };
        }

        return null;
    }

    function openExternal(app, leg) {
        if (!leg || !isFinite(leg.lat) || !isFinite(leg.lng)) {
            toast('Coordonnées GPS manquantes pour ce trajet.', true);
            return;
        }
        if (global.DaxiExternalNav && DaxiExternalNav.open) {
            DaxiExternalNav.open(
                app,
                leg.lat, leg.lng,
                leg.lat, leg.lng,
                leg.label,
                { directDest: true, useCurrentGps: true }
            );
            return;
        }
        var url = 'https://www.google.com/maps/dir/?api=1&destination=' +
            leg.lat + ',' + leg.lng + '&travelmode=driving';
        global.open(url, '_blank');
    }

    function applySiteNav(leg) {
        if (leg.rideState === 'IN_TRIP' && typeof global._transitionTo === 'function' && global.RIDE) {
            global._transitionTo(global.RIDE.IN_TRIP);
        } else if (leg.rideState === 'TO_CLIENT' && typeof global._transitionTo === 'function' && global.RIDE) {
            global._transitionTo(global.RIDE.TO_CLIENT);
        }
        if (typeof global._applyStateMachineRoutes === 'function') {
            global._applyStateMachineRoutes();
        }
        toast('Navigation DAXI activée pour : ' + leg.title, false);
    }

    function toast(msg, isError) {
        if (typeof global.driverShowToast === 'function') {
            global.driverShowToast(msg, !!isError, 4000);
        }
    }

    function savePrefs(mode, app, remember) {
        if (!remember) return Promise.resolve();
        PREFS.mode = mode;
        PREFS.app = app || PREFS.app;
        if (global.DJANGO_SESSION) {
            global.DJANGO_SESSION.nav_pref_mode = mode;
            global.DJANGO_SESSION.nav_pref_app = app;
        }
        var body = new URLSearchParams();
        body.set('nav_pref_mode', mode);
        body.set('nav_pref_app', app || 'google');
        return fetch('/htmx/driver/profile/update/', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'X-CSRFToken': typeof global.getCsrf === 'function' ? global.getCsrf() : '',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        }).catch(function () {});
    }

    function ensureModal() {
        var el = document.getElementById('daxi-nav-leg-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'daxi-nav-leg-modal';
        el.className = 'daxi-nav-leg-modal';
        el.innerHTML =
            '<div class="daxi-nav-leg-modal__backdrop" data-close></div>' +
            '<div class="daxi-nav-leg-modal__sheet" role="dialog" aria-labelledby="daxi-nav-leg-title">' +
            '  <div class="daxi-nav-leg-modal__handle"></div>' +
            '  <div class="daxi-nav-leg-modal__badge">Nouveau trajet</div>' +
            '  <h3 id="daxi-nav-leg-title" class="daxi-nav-leg-modal__title"></h3>' +
            '  <p class="daxi-nav-leg-modal__detail"></p>' +
            '  <button type="button" class="daxi-nav-leg-modal__btn daxi-nav-leg-modal__btn--site" data-choice="site">' +
            '    <i class="ri-map-2-line"></i> Navigation DAXI <span class="daxi-nav-leg-modal__rec">Recommandé</span>' +
            '  </button>' +
            '  <div class="daxi-nav-leg-modal__ext-label">Ou ouvrir dans :</div>' +
            '  <div class="daxi-nav-leg-modal__ext-grid">' +
            '    <button type="button" data-choice="google"><i class="ri-google-fill"></i> Google Maps</button>' +
            '    <button type="button" data-choice="waze"><i class="ri-navigation-line"></i> Waze</button>' +
            '    <button type="button" data-choice="apple"><i class="ri-map-pin-line"></i> Apple Plans</button>' +
            '  </div>' +
            '  <label class="daxi-nav-leg-modal__remember">' +
            '    <input type="checkbox" id="daxi-nav-leg-remember"> Mémoriser mon choix (modifiable dans Mon profil)' +
            '  </label>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('[data-close]').addEventListener('click', closeModal);
        return el;
    }

    function closeModal() {
        var el = document.getElementById('daxi-nav-leg-modal');
        if (el) el.classList.remove('is-open');
    }

    function showPrompt(leg, order) {
        var modal = ensureModal();
        leg._orderData = orderNavData(order);
        modal.querySelector('.daxi-nav-leg-modal__title').textContent = leg.title;
        modal.querySelector('.daxi-nav-leg-modal__detail').textContent = leg.detail;
        var rememberBox = modal.querySelector('#daxi-nav-leg-remember');
        if (rememberBox) rememberBox.checked = false;

        modal.querySelectorAll('[data-choice]').forEach(function (btn) {
            btn.onclick = function () {
                var choice = btn.getAttribute('data-choice');
                var remember = rememberBox && rememberBox.checked;
                if (choice === 'site') {
                    applySiteNav(leg);
                    savePrefs('site', PREFS.app, remember);
                } else {
                    openExternal(choice, leg);
                    savePrefs('external', choice, remember);
                }
                closeModal();
            };
        });
        modal.classList.add('is-open');
    }

    function handleLegStart(order, prevStatus, newStatus) {
        loadPrefs();
        var leg = resolveLeg(prevStatus, newStatus, order);
        if (!leg) return;

        if (PREFS.mode === 'site') {
            applySiteNav(leg);
            return;
        }
        if (PREFS.mode === 'external') {
            openExternal(PREFS.app || 'google', leg);
            return;
        }
        showPrompt(leg, order);
    }

    function updatePrefsFromForm(mode, app) {
        PREFS.mode = mode || 'ask';
        PREFS.app = app || 'google';
        if (global.DJANGO_SESSION) {
            global.DJANGO_SESSION.nav_pref_mode = PREFS.mode;
            global.DJANGO_SESSION.nav_pref_app = PREFS.app;
        }
    }

    global.DaxiDriverNavPrompt = {
        loadPrefs: loadPrefs,
        resolveLeg: resolveLeg,
        handleLegStart: handleLegStart,
        updatePrefsFromForm: updatePrefsFromForm,
        ensureModal: ensureModal,
        getPrefs: function () { return Object.assign({}, PREFS); }
    };

    loadPrefs();
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ensureModal);
        } else {
            ensureModal();
        }
    }
})(typeof window !== 'undefined' ? window : this);