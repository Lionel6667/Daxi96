
(function (global) {
    'use strict';

    var STORE_KEY = 'daxi_auth_snapshot';
    var DB_NAME = 'daxi_offline_v1';
    var DB_VER = 3;

    var AUTH = {
        AUTHENTICATED: 'authenticated',
        GUEST: 'guest',
        EXPIRED: 'expired',
        OFFLINE_UNVERIFIED: 'offline_unverified'
    };

    function openDb() {
        return new Promise(function (resolve) {
            try {
                var req = indexedDB.open(DB_NAME, DB_VER);
                req.onupgradeneeded = function (e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('bootstrap')) db.createObjectStore('bootstrap');
                    if (!db.objectStoreNames.contains('htmx_cache')) db.createObjectStore('htmx_cache');
                    if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth');
                };
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { resolve(null); };
            } catch (e) {
                resolve(null);
            }
        });
    }

    function idbPutAuth(snapshot) {
        return openDb().then(function (db) {
            if (!db) return;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction('auth', 'readwrite');
                    tx.objectStore('auth').put({ data: snapshot, saved_at: Date.now() }, STORE_KEY);
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function () { resolve(); };
                } catch (e) {
                    resolve();
                }
            });
        });
    }

    function idbGetAuth() {
        return openDb().then(function (db) {
            if (!db) return null;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction('auth', 'readonly');
                    var req = tx.objectStore('auth').get(STORE_KEY);
                    req.onsuccess = function () {
                        var row = req.result;
                        resolve(row && row.data ? row.data : null);
                    };
                    req.onerror = function () { resolve(null); };
                } catch (e) {
                    resolve(null);
                }
            });
        });
    }

    function isOnline() {
        if (global.DaxiNetworkState && DaxiNetworkState.isOnline) {
            return global.DaxiNetworkState.isOnline();
        }
        if (typeof global._daxiIsNativeOnline === 'function') return global._daxiIsNativeOnline();
        return global.navigator ? global.navigator.onLine !== false : true;
    }

    function deriveState(user, fromServer) {
        if (user && user.authenticated) {
            return fromServer ? AUTH.AUTHENTICATED : AUTH.OFFLINE_UNVERIFIED;
        }
        return AUTH.GUEST;
    }

    function applyToDjangoSession(user, mapsKey) {
        global.DJANGO_SESSION = global.DJANGO_SESSION || {};
        var u = user || {};
        global.DJANGO_SESSION.is_authenticated = !!u.authenticated;
        global.DJANGO_SESSION.user_name = u.name || '';
        global.DJANGO_SESSION.user_email = u.email || '';
        global.DJANGO_SESSION.user_phone = u.phone || '';
        global.DJANGO_SESSION.user_id = u.user_id || '';
        global.DJANGO_SESSION.first_name = (u.name || '').split(' ')[0] || '';
        if (mapsKey) global.DJANGO_SESSION.google_maps_key = mapsKey;
    }

    function saveFromBootstrap(data, fromServer) {
        if (!data) return Promise.resolve();
        var user = data.user || {};
        var snapshot = {
            state: deriveState(user, fromServer !== false && isOnline()),
            user: {
                authenticated: !!user.authenticated,
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                user_id: user.user_id || ''
            },
            saved_at: Date.now(),
            verified_online: !!(fromServer !== false && isOnline())
        };
        global._daxiAuthState = snapshot.state;
        applyToDjangoSession(snapshot.user, data.google_maps_key);
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify(snapshot)); } catch (e) {}
        return idbPutAuth(snapshot);
    }

    function restoreCached() {
        var cached = null;
        try {
            var raw = sessionStorage.getItem(STORE_KEY);
            if (raw) cached = JSON.parse(raw);
        } catch (e) {}
        if (cached) {
            global._daxiAuthState = cached.state || AUTH.GUEST;
            applyToDjangoSession(cached.user);
            return Promise.resolve(cached);
        }
        return idbGetAuth().then(function (row) {
            if (!row) return null;
            global._daxiAuthState = row.state || AUTH.GUEST;
            applyToDjangoSession(row.user);
            try { sessionStorage.setItem(STORE_KEY, JSON.stringify(row)); } catch (e2) {}
            return row;
        });
    }

    function getAuthState() {
        if (global._daxiAuthState) return global._daxiAuthState;
        if (global.DJANGO_SESSION && global.DJANGO_SESSION.is_authenticated) {
            return isOnline() ? AUTH.AUTHENTICATED : AUTH.OFFLINE_UNVERIFIED;
        }
        return AUTH.GUEST;
    }

    function isAuthenticated() {
        var st = getAuthState();
        return st === AUTH.AUTHENTICATED || st === AUTH.OFFLINE_UNVERIFIED;
    }

    function clearOnLogout() {
        global._daxiAuthState = AUTH.GUEST;
        try {
            sessionStorage.removeItem(STORE_KEY);
            localStorage.removeItem('daxi_access');
        } catch (e) {}
        if (global.DJANGO_SESSION) global.DJANGO_SESSION.is_authenticated = false;
        return idbPutAuth({ state: AUTH.GUEST, user: { authenticated: false }, saved_at: Date.now() });
    }

    function clearOnAccountDelete() {
        clearOnLogout();
        if (typeof global.DaxiAndroid !== 'undefined' && DaxiAndroid.clearAccountData) {
            try { DaxiAndroid.clearAccountData(); } catch (e) {}
        }
    }

    restoreCached();

    global.DaxiSessionStore = {
        AUTH: AUTH,
        saveFromBootstrap: saveFromBootstrap,
        restoreCached: restoreCached,
        getAuthState: getAuthState,
        isAuthenticated: isAuthenticated,
        clearOnLogout: clearOnLogout,
        clearOnAccountDelete: clearOnAccountDelete
    };
})(typeof window !== 'undefined' ? window : this);
