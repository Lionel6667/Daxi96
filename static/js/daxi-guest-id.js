
(function (global) {
    'use strict';

    var GUEST_KEY = 'daxi_guest_id';
    var ORIGIN_KEY = 'daxi_guest_id_origin';
    var ALIASES_KEY = 'daxi_guest_id_aliases';
    var SERVER_HINT_KEY = 'daxi_guest_id_server_hint';

    function generateFallbackId() {
        var raw = [
            navigator.userAgent, screen.width, screen.height, screen.colorDepth,
            Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language
        ].join('|');
        var hash = 0;
        for (var i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        return 'fp_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
    }

    function readNativeGuestId() {
        if (typeof global.DaxiAndroid === 'undefined' || !DaxiAndroid.getGuestId) return '';
        try {
            return String(DaxiAndroid.getGuestId() || '').trim();
        } catch (e) {
            return '';
        }
    }

    function notifyGuestIdReady(id) {
        if (!id) return;
        try {
            document.dispatchEvent(new CustomEvent('daxi:guest-id-ready', { detail: { guestId: id } }));
        } catch (e) {}
        if (typeof global._daxiBootPreloadClientOrders === 'function') {
            try { global._daxiBootPreloadClientOrders(); } catch (e2) {}
        }
    }

    function persist(id, origin) {
        if (!id) return '';
        try { localStorage.setItem(GUEST_KEY, id); } catch (e) {}
        if (origin) {
            try { localStorage.setItem(ORIGIN_KEY, origin); } catch (e2) {}
        }
        global._daxiGuestId = id;
        if (typeof global.DaxiAndroid !== 'undefined' && DaxiAndroid.saveGuestId) {
            try { DaxiAndroid.saveGuestId(id); } catch (e3) {}
        }
        notifyGuestIdReady(id);
        return id;
    }

    function getAliases() {
        try {
            var raw = localStorage.getItem(ALIASES_KEY);
            if (!raw) return [];
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(Boolean) : [];
        } catch (e) {
            return [];
        }
    }

    function addAlias(alias) {
        if (!alias) return;
        var canonical = get();
        if (!canonical || alias === canonical) return;
        var list = getAliases();
        if (list.indexOf(alias) >= 0) return;
        list.push(alias);
        try { localStorage.setItem(ALIASES_KEY, JSON.stringify(list.slice(-8))); } catch (e) {}
    }

    function get() {
        if (global._daxiGuestId) return global._daxiGuestId;
        var stored = '';
        try { stored = localStorage.getItem(GUEST_KEY) || ''; } catch (e) {}
        if (stored) {
            global._daxiGuestId = stored;
            return stored;
        }
        var native = readNativeGuestId();
        if (native) {
            return persist(native, 'native');
        }
        return '';
    }

    function hasLocalCommitments() {
        if (typeof global.DaxiAndroid !== 'undefined' && DaxiAndroid.getOutboxCount) {
            try {
                if (DaxiAndroid.getOutboxCount() > 0) return true;
            } catch (e) {}
        }
        var data = global._daxiOfflineData;
        if (data && data.orders && data.orders.length) return true;
        try {
            if (localStorage.getItem('daxi_pending_orders')) return true;
        } catch (e2) {}
        return false;
    }

    function loadFingerprintJs() {
        return new Promise(function (resolve) {
            if (!global.navigator || global.navigator.onLine === false) {
                resolve(generateFallbackId());
                return;
            }
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js';
            s.onload = function () {
                if (!global.FingerprintJS) {
                    resolve(generateFallbackId());
                    return;
                }
                FingerprintJS.load().then(function (fp) {
                    return fp.get();
                }).then(function (result) {
                    resolve('fpjs_' + result.visitorId);
                }).catch(function () {
                    resolve(generateFallbackId());
                });
            };
            s.onerror = function () {
                resolve(generateFallbackId());
            };
            document.head.appendChild(s);
        });
    }

    function ensure() {
        var existing = get();
        if (existing) return Promise.resolve(existing);
        if (!global.navigator || global.navigator.onLine === false) {
            return Promise.resolve(persist(generateFallbackId(), 'local_fp'));
        }
        var provisional = persist(generateFallbackId(), 'local_fp');
        var runFp = function() {
            return loadFingerprintJs().then(function (id) {
                if (!id || id === provisional) return provisional;
                addAlias(provisional);
                return persist(id, id.indexOf('fpjs_') === 0 ? 'fpjs' : 'local_fp');
            });
        };
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(function() { runFp(); }, { timeout: 8000 });
        } else {
            setTimeout(runFp, 2500);
        }
        return Promise.resolve(provisional);
    }

    
    function reconcileWithBootstrap(data) {
        if (!data) return get();
        var serverId = (data.guest_id || '').trim();
        var canonical = get();
        var merged = data.guest_id_merged;

        if (merged && Array.isArray(merged.from) && merged.from.length) {
            merged.from.forEach(addAlias);
        }

        if (!serverId) {
            if (canonical) data.guest_id = canonical;
            return canonical || ensure();
        }

        if (!canonical) {
            return persist(serverId, 'server');
        }

        if (canonical === serverId) {
            try { localStorage.removeItem(SERVER_HINT_KEY); } catch (e) {}
            return canonical;
        }

        addAlias(serverId);
        try { localStorage.setItem(SERVER_HINT_KEY, serverId); } catch (e2) {}

        if (hasLocalCommitments()) {
            data.guest_id = canonical;
            return canonical;
        }

        return persist(serverId, 'server');
    }

    function bootstrapQuery() {
        var gid = get();
        var qs = [];
        if (gid) qs.push('guest_id=' + encodeURIComponent(gid));
        var hint = '';
        try { hint = localStorage.getItem(SERVER_HINT_KEY) || ''; } catch (e) {}
        if (hint && hint !== gid) {
            qs.push('merge_guest_id=' + encodeURIComponent(hint));
        }
        getAliases().forEach(function (alias) {
            if (alias && alias !== gid) {
                qs.push('merge_guest_id=' + encodeURIComponent(alias));
            }
        });
        return qs.length ? ('?' + qs.join('&')) : '';
    }

    function guestQs() {
        var gid = get();
        return gid ? ('?guest_id=' + encodeURIComponent(gid)) : '';
    }

    ensure();

    global.DaxiGuestId = {
        get: get,
        ensure: ensure,
        persist: persist,
        reconcileWithBootstrap: reconcileWithBootstrap,
        bootstrapQuery: bootstrapQuery,
        guestQs: guestQs,
        getAliases: getAliases,
        hasLocalCommitments: hasLocalCommitments
    };
})(typeof window !== 'undefined' ? window : this);
