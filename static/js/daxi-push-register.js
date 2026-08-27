
(function (global) {
    'use strict';

    function _sessionRole() {
        var s = global.DJANGO_SESSION || {};
        return {
            driver_id: s.driver_id || '',
            enterprise_id: s.current_enterprise_id || s.enterprise_id || ''
        };
    }

    function _deviceId() {
        try {
            return localStorage.getItem('daxi_device_id') || '';
        } catch (e) {
            return '';
        }
    }

    function _fcmConfig() {
        var cfg = global.DAXI_FIREBASE_CONFIG || {};
        if (!cfg || !cfg.apiKey || !cfg.projectId || !cfg.appId || !cfg.messagingSenderId) return null;
        if (/^(your-|xxx|test|placeholder)/i.test(String(cfg.apiKey))) return null;
        if (!/^1:\d+:(web|android|ios):[a-zA-Z0-9_-]+$/.test(String(cfg.appId))) return null;
        return cfg;
    }

    function _vapidKey() {
        var key = global.DAXI_FIREBASE_VAPID_KEY || '';
        return key && key.length > 20 ? key : '';
    }

    function _getTokenOpts(reg) {
        var opts = {};
        if (reg) opts.serviceWorkerRegistration = reg;
        var vapid = _vapidKey();
        // Sans clé custom: FCM utilise la VAPID par défaut du projet (recommandé si Console non ouverte).
        if (vapid) opts.vapidKey = vapid;
        return opts;
    }

    function _guestId() {
        return global._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    }

    function _csrf() {
        if (global.getCsrfToken) return global.getCsrfToken();
        var m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    function _isNativeAndroid() {
        return !!(global.DaxiAndroid && global.DaxiAndroid.getFcmToken)
            || /DaxiAndroid/i.test(navigator.userAgent || '')
            || global._daxiNativePermissionHost
            || global._daxiHybridShell
            || global._daxiUseNativeGps
            || global._daxiCapacitorApp
            || !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
    }

    function registerPushToken(token, platform) {
        token = (token || '').trim();
        if (!token) return Promise.resolve();
        var role = _sessionRole();
        var body = {
            token: token,
            guest_id: _guestId(),
            platform: platform || (/DaxiAndroid/i.test(navigator.userAgent) ? 'android' : 'web'),
            device_id: _deviceId()
        };
        if (role.driver_id) body.driver_id = role.driver_id;
        if (role.enterprise_id) body.enterprise_id = role.enterprise_id;
        return fetch('/api/notifications/register-device/', {
            method: 'POST',
            headers: (function () {
                var h = { 'Content-Type': 'application/json', 'X-CSRFToken': _csrf() };
                var access = localStorage.getItem('daxi_access');
                if (access) h['Authorization'] = 'Bearer ' + access;
                return h;
            })(),
            credentials: 'include',
            body: JSON.stringify(body)
        }).catch(function () {});
    }

    function registerFromAndroid() {
        if (!global.DaxiAndroid || !global.DaxiAndroid.getFcmToken) return;
        var token = global.DaxiAndroid.getFcmToken();
        if (token) registerPushToken(token, 'android');
    }

    function _loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
            var s = document.createElement('script');
            var done = false;
            function finish(ok) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (ok) resolve();
                else reject(new Error('script load failed'));
            }
            var timer = setTimeout(function () { finish(false); }, 12000);
            s.src = src;
            s.onload = function () { finish(true); };
            s.onerror = function () { finish(false); };
            document.head.appendChild(s);
        });
    }

    function _getMessagingApp(fcmCfg) {
        if (!global.firebase || !global.firebase.initializeApp) return null;
        try {
            return global.firebase.app();
        } catch (e) {
            return global.firebase.initializeApp(fcmCfg);
        }
    }

    function registerWebFcm() {
        if (global._daxiPushRegistered) {
            return Promise.resolve({ ok: true, skipped: true });
        }
        if (_isNativeAndroid()) {
            registerFromAndroid();
            return Promise.resolve({ ok: true, platform: 'android', skipped: true });
        }
        if (/DaxiAndroid/i.test(navigator.userAgent || '')) {
            registerFromAndroid();
            return Promise.resolve({ ok: true, platform: 'android' });
        }
        if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') {
            return Promise.resolve({ ok: false, reason: 'unsupported' });
        }
        if (Notification.permission !== 'granted') {
            return Promise.resolve({ ok: false, reason: 'permission' });
        }

        var fcmCfg = _fcmConfig();
        if (!fcmCfg) {
            return Promise.resolve({ ok: false, reason: 'config' });
        }

        var loadFirebase = (global.firebase && global.firebase.messaging)
            ? Promise.resolve()
            : _loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js')
                .then(function () {
                    if (global.firebase && global.firebase.messaging) return;
                    return _loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');
                });

        return loadFirebase
            .then(function () {
                if (!global.firebase || !global.firebase.messaging) {
                    return { ok: false, reason: 'firebase' };
                }
                try {
                    var app = _getMessagingApp(fcmCfg);
                    if (!app) return { ok: false, reason: 'firebase' };
                    var messaging = global.firebase.messaging(app);
                    return navigator.serviceWorker.register('/firebase-messaging-sw.js')
                        .then(function (reg) {
                            return messaging.getToken(_getTokenOpts(reg));
                        })
                        .catch(function () {
                            return messaging.getToken(_getTokenOpts(null));
                        })
                        .then(function (token) {
                            if (!token) return { ok: false, reason: 'token' };
                            return registerPushToken(token, 'web').then(function () {
                                global._daxiPushRegistered = true;
                                return { ok: true, platform: 'web' };
                            });
                        })
                        .catch(function (err) {
                            if (!navigator.onLine) return { ok: false, reason: 'network' };
                            var msg = (err && err.message) ? String(err.message) : '';
                            var code = (err && err.code) ? String(err.code) : '';
                            var detail = (msg || code || 'unknown').trim();
                            if (/network|fetch|failed to fetch|timeout/i.test(msg)) {
                                return { ok: false, reason: 'network', detail: detail };
                            }
                            if (/permission|denied|not-allowed/i.test(msg + ' ' + code)) {
                                return { ok: false, reason: 'permission', detail: detail };
                            }
                            return { ok: false, reason: 'token', detail: detail };
                        });
                } catch (e) {
                    return { ok: false, reason: 'error' };
                }
            })
            .catch(function () { return { ok: false, reason: 'network' }; });
    }

    function ensurePushRegistration() {
        if (_isNativeAndroid()) {
            registerFromAndroid();
            if (global._daxiFcmToken && typeof global._daxiRegisterPushToken === 'function') {
                try { global._daxiRegisterPushToken(); } catch (e) {}
            }
            var token = global.DaxiAndroid && global.DaxiAndroid.getFcmToken && global.DaxiAndroid.getFcmToken();
            if (token) return Promise.resolve({ ok: true, platform: 'android' });
            return Promise.resolve({ ok: true, platform: 'android', pendingToken: true });
        }
        registerFromAndroid();
        if (!_fcmConfig()) {
            return Promise.resolve({ ok: false, reason: 'config' });
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            return registerWebFcm();
        }
        return Promise.resolve({ ok: false, reason: 'permission' });
    }

    if (typeof global._daxiRegisterPushToken !== 'function') {
        global._daxiRegisterPushToken = registerPushToken;
    }
    global._daxiEnsurePushRegistration = ensurePushRegistration;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(ensurePushRegistration, 1200);
        });
    } else {
        setTimeout(ensurePushRegistration, 1200);
    }
})(typeof window !== 'undefined' ? window : this);