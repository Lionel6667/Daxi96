
(function (global) {
    'use strict';

    var _recentPlaces = [];
    var _loaded = false;
    var GPS_PATTERNS = /^(ma position actuelle|ma position|my current location|position actuelle|position gps)$/i;

    function guestQs() {
        if (typeof global._daxiGuestQs === 'function') return global._daxiGuestQs();
        var gid = global._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        return gid ? '?guest_id=' + encodeURIComponent(gid) : '';
    }

    function loadRecentPlaces() {
        if (_loaded) return Promise.resolve(_recentPlaces);
        return fetch('/api/client/recent-places/' + guestQs(), { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : { places: [] }; })
            .then(function (d) {
                _recentPlaces = (d && d.places) ? d.places : [];
                _loaded = true;
                return _recentPlaces;
            })
            .catch(function () { _loaded = true; return []; });
    }

    function _panelForInput(inputEl) {
        if (!inputEl || !inputEl.id) return null;
        var id = inputEl.id + 'Suggestions';
        var panel = document.getElementById(id);
        if (panel) return panel;
        var sib = inputEl.parentElement && inputEl.parentElement.querySelector('.suggestions-container, .daxi-smart-ac-panel');
        if (sib) return sib;
        panel = document.createElement('div');
        panel.className = 'daxi-smart-ac-panel suggestions-container hidden';
        panel.id = id;
        if (inputEl.parentElement) {
            inputEl.parentElement.style.position = 'relative';
            inputEl.parentElement.appendChild(panel);
        }
        return panel;
    }

    function _renderPanel(panel, items, query) {
        if (!panel) return;
        panel.innerHTML = '';
        if (!items.length) {
            panel.classList.add('hidden');
            return;
        }
        var q = (query || '').trim().toLowerCase();
        var filtered = items.filter(function (p) {
            if (!q) return true;
            return (p.label || '').toLowerCase().indexOf(q) >= 0;
        });
        if (!filtered.length) {
            panel.classList.add('hidden');
            return;
        }
        var head = document.createElement('div');
        head.className = 'daxi-smart-ac-head';
        head.textContent = q ? 'Lieux récents' : 'Récemment utilisés';
        panel.appendChild(head);
        filtered.forEach(function (p) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'daxi-smart-ac-item';
            row.innerHTML =
                '<span class="daxi-smart-ac-icon"><i class="ri-' + (p.kind === 'dest' ? 'flag-2' : 'history') + '-line"></i></span>' +
                '<span class="daxi-smart-ac-text">' +
                '<span class="daxi-smart-ac-label">' + (p.label || '') + '</span>' +
                (p.meta ? '<span class="daxi-smart-ac-meta">' + p.meta + '</span>' : '') +
                '</span>';
            row.addEventListener('mousedown', function (e) {
                e.preventDefault();
                _selectPlace(panel._daxiInput, p);
            });
            panel.appendChild(row);
        });
        panel.classList.remove('hidden');
    }

    function _selectPlace(inputEl, place) {
        if (!inputEl || !place) return;
        var panel = _panelForInput(inputEl);
        inputEl.value = place.label;
        inputEl.dataset.placeSelected = '1';
        inputEl.dataset.lat = place.lat;
        inputEl.dataset.lng = place.lng;
        if (panel) panel.classList.add('hidden');
        if (typeof global._clearUncoveredBlock === 'function') global._clearUncoveredBlock(inputEl);
        if (inputEl.id === 'destinationAddress') {
            global._daxiPickupFromGps = false;
            var plat = document.getElementById('pickupLatHidden');
            var plng = document.getElementById('pickupLngHidden');
            if (plat) plat.value = place.lat;
            if (plng) plng.value = place.lng;
            if (typeof global._setMainMapBookingPoint === 'function') {
                global._setMainMapBookingPoint('pickup', place.lat, place.lng, 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress', { silent: true });
            }
        } else if (inputEl.id === 'destinationAddressArrival') {
            var dlat = document.getElementById('destLatHidden');
            var dlng = document.getElementById('destLngHidden');
            if (dlat) dlat.value = place.lat;
            if (dlng) dlng.value = place.lng;
            if (typeof global._setMainMapBookingPoint === 'function') {
                global._setMainMapBookingPoint('dest', place.lat, place.lng, 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: true });
            }
        }
        if (inputEl._daxiOnPlace) inputEl._daxiOnPlace(place);
    }

    function enhanceInput(inputEl, opts) {
        if (!inputEl || inputEl.dataset.recentAc) return;
        inputEl.dataset.recentAc = '1';
        if (opts && opts.onPlace) inputEl._daxiOnPlace = opts.onPlace;
        var panel = _panelForInput(inputEl);
        if (panel) {
            panel._daxiInput = inputEl;
            panel.classList.add('daxi-smart-ac-panel');
        }

        inputEl.addEventListener('focus', function () {
            loadRecentPlaces().then(function (places) {
                if (!inputEl.value.trim()) _renderPanel(panel, places, '');
            });
        });
        inputEl.addEventListener('input', function () {
            var v = inputEl.value.trim();
            if (!v) {
                loadRecentPlaces().then(function (places) { _renderPanel(panel, places, ''); });
            } else {
                loadRecentPlaces().then(function (places) { _renderPanel(panel, places, v); });
            }
            if (typeof global._clearPlaceCoordsForInput === 'function') global._clearPlaceCoordsForInput(inputEl);
        });
        inputEl.addEventListener('blur', function () {
            setTimeout(function () { if (panel) panel.classList.add('hidden'); }, 180);
        });
    }

    function invalidateCache() {
        _loaded = false;
        _recentPlaces = [];
    }

    global.DaxiRecentPlaces = {
        load: loadRecentPlaces,
        enhance: enhanceInput,
        invalidate: invalidateCache
    };
})(typeof window !== 'undefined' ? window : this);