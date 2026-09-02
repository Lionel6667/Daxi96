(function () {
    var KEY = 'daxi_native_shell';
    var KEY_LEGACY = 'daxi_app_shell';

    var PICKUP = 'DAXI·ADM·ORIGIN·k7#Qx9Vm2LpR8wN4tYc6HzJb0QsE5uA1FdX3!CAPHT-9281';
    var DEST = 'DAXI·ADM·ARRIVAL·m9#Wq4Rn7BkP2yLc8TzG5HvJ1XsE6uA0FdY3!OPS-7743';

    function backendAbs(path) {
        var base = '';
        try {
            if (window.DaxiApi) {
                if (typeof window.DaxiApi.baseUrl === 'function') base = window.DaxiApi.baseUrl() || '';
                else base = window.DaxiApi.base || window.DaxiApi.apiBase || window.DaxiApi.DAXI_API_BASE_URL || '';
            }
        } catch (e) {}
        if (!base && window.DAXI_API_BASE_URL) base = window.DAXI_API_BASE_URL;
        base = String(base || '').replace(/\/$/, '');
        if (base) return base + path;
        return path;
    }

    function persistPrefs(role) {
        try {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
                Capacitor.Plugins.Preferences.set({ key: KEY, value: role });
            }
        } catch (e) {}
        try {
            if (window.DaxiNative && typeof window.DaxiNative.persist === 'function') {
                window.DaxiNative.persist(KEY, role);
            }
        } catch (e2) {}
    }

    function setRole(role) {
        if (role !== 'driver' && role !== 'admin' && role !== 'enterprise') role = 'client';
        try {
            localStorage.setItem(KEY, role);
            localStorage.setItem(KEY_LEGACY, role);
        } catch (e) {}
        persistPrefs(role);
        return role;
    }

    function getRole() {
        try {
            return localStorage.getItem(KEY) || localStorage.getItem(KEY_LEGACY) || 'client';
        } catch (e) {
            return 'client';
        }
    }

    function restoreFromPrefs() {
        try {
            if (!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences)) {
                return Promise.resolve(getRole());
            }
            return Capacitor.Plugins.Preferences.get({ key: KEY }).then(function (res) {
                var v = res && res.value;
                if (v === 'driver' || v === 'admin' || v === 'client' || v === 'enterprise') {
                    try {
                        localStorage.setItem(KEY, v);
                        localStorage.setItem(KEY_LEGACY, v);
                    } catch (e) {}
                    return v;
                }
                return getRole();
            }).catch(function () { return getRole(); });
        } catch (e) {
            return Promise.resolve(getRole());
        }
    }

    function nativeLocalPath(path) {
        var p = String(path || '');
        if (!p) return '/';
        if (/^https?:\/\//i.test(p)) {
            try {
                var u = new URL(p);
                var host = (u.hostname || '').toLowerCase();
                if (host === 'daxipro.com' || host === 'www.daxipro.com' || host === 'localhost') {
                    return u.pathname + u.search + u.hash;
                }
            } catch (e) {}
            return p;
        }
        return p.charAt(0) === '/' ? p : '/' + p;
    }

    function isNativeApp() {
        try {
            return !!(window._daxiCapacitorApp || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
        } catch (e) {
            return false;
        }
    }

    function goDriver() {
        window.location.href = isNativeApp() ? '/driver/login/' : backendAbs('/driver/login/');
    }

    function goAdmin() {
        window.location.href = isNativeApp() ? '/admin-dashboard/' : backendAbs('/admin-dashboard/');
    }

    function goEnterprise() {
        window.location.href = isNativeApp() ? '/entreprise/' : backendAbs('/entreprise/');
    }

    function goClient() {
        window.location.href = isNativeApp() ? '/' : '/';
    }

    function matchesAdminGate(pickup, dest) {
        return String(pickup || '').trim() === PICKUP && String(dest || '').trim() === DEST;
    }

    function tryOpenAdminFromBooking() {
        var pickupEl = document.getElementById('destinationAddress');
        var destEl = document.getElementById('destinationAddressArrival');
        var pickup = pickupEl ? String(pickupEl.value || '').trim() : '';
        var dest = destEl ? String(destEl.value || '').trim() : '';
        if (!matchesAdminGate(pickup, dest)) return false;
        goAdmin();
        return true;
    }

    function installTitleTapGate() {
        var titleEl = document.getElementById('daxiPageTitle');
        if (!titleEl || titleEl.dataset.shellTapBound === '1') return;
        titleEl.dataset.shellTapBound = '1';
        titleEl.style.cursor = 'default';
        var taps = 0;
        var timer = null;
        titleEl.addEventListener('click', function () {
            var t = String(titleEl.textContent || '').trim().toLowerCase();
            if (t.indexOf('commande') < 0 && t.indexOf('courses') < 0) {
                taps = 0;
                return;
            }
            taps += 1;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { taps = 0; }, 1800);
            if (taps >= 5) {
                taps = 0;
                goDriver();
            }
        });
    }

    function bootRedirectIfNeeded() {
        return restoreFromPrefs().then(function (role) {
            var path = (location.pathname || '').toLowerCase();
            if (role === 'driver') {
                if (path.indexOf('/driver') >= 0) return false;
                window.location.href = isNativeApp() ? '/driver/' : backendAbs('/driver/');
                return true;
            }
            if (role === 'admin') {
                if (path.indexOf('/admin') >= 0) return false;
                window.location.href = isNativeApp() ? '/admin-dashboard/' : backendAbs('/admin-dashboard/');
                return true;
            }
            if (role === 'enterprise') {
                if (path.indexOf('/entreprise/dashboard') >= 0) return false;
                window.location.href = isNativeApp() ? '/entreprise/dashboard/' : backendAbs('/entreprise/dashboard/');
                return true;
            }
            return false;
        });
    }

    window.DaxiShellRole = {
        KEY: KEY,
        ADMIN_PICKUP: PICKUP,
        ADMIN_DEST: DEST,
        set: setRole,
        get: getRole,
        restore: restoreFromPrefs,
        goDriver: goDriver,
        goAdmin: goAdmin,
        goEnterprise: goEnterprise,
        goClient: goClient,
        persistAuth: setRole,
        clearAuth: function () { return setRole('client'); },
        matchesAdminGate: matchesAdminGate,
        tryOpenAdminFromBooking: tryOpenAdminFromBooking,
        installTitleTapGate: installTitleTapGate,
        bootRedirectIfNeeded: bootRedirectIfNeeded,
        backendAbs: backendAbs,
        nativeLocalPath: nativeLocalPath
    };


    window.DaxiAppShell = {
        KEY: KEY,
        ADM_PICKUP: PICKUP,
        ADM_DEST: DEST,
        set: function (v) { return Promise.resolve(setRole(v)); },
        get: getRole,
        goDriver: goDriver,
        goAdmin: goAdmin,
        goEnterprise: goEnterprise,
        goClient: goClient,
        persistAuth: setRole,
        tryOpenAdminFromBooking: tryOpenAdminFromBooking
    };

    function onReady(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }
    onReady(function () {
        installTitleTapGate();
        var root = document.getElementById('appSheet') || document.body;
        var obs = new MutationObserver(function () { installTitleTapGate(); });
        try { obs.observe(root, { childList: true, subtree: true }); } catch (e) {}
    });
})();
