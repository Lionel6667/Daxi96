

(function (global) {

    'use strict';


    function _fcmConfig() {
        var cfg = global.DAXI_FIREBASE_CONFIG || {};
        if (cfg && cfg.apiKey) return cfg;
        return {
            apiKey: 'AIzaSyCH9A_IC6adKJCD-st5ddfmqr3DbjrPLZY',
            authDomain: 'julmin-taxis.firebaseapp.com',
            projectId: 'julmin-taxis',
            messagingSenderId: '490163081258',
            appId: '1:490163081258:web:ab2fb6bb8c12ae1793f18e'
        };
    }

    function _vapidKey() {
        return global.DAXI_FIREBASE_VAPID_KEY || 'BPsvNMF0v2XilPFDCMub9-F0Vao4lNw7bDlTZ_RuIneOy37xNkiXHr2WCidf_HD5kxOI9uiZ_7momDE5apV8shg';
    }


    function _guestId() {

        return global._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';

    }


    function _csrf() {

        if (global.getCsrfToken) return global.getCsrfToken();

        var m = document.cookie.match(/csrftoken=([^;]+)/);

        return m ? decodeURIComponent(m[1]) : '';

    }


    function registerPushToken(token, platform) {

        token = (token || '').trim();

        if (!token) return Promise.resolve();

        var body = {

            token: token,

            guest_id: _guestId(),

            platform: platform || (/DaxiAndroid/i.test(navigator.userAgent) ? 'android' : 'web')

        };

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

            s.src = src;

            s.onload = resolve;

            s.onerror = reject;

            document.head.appendChild(s);

        });

    }


    function registerWebFcm() {

        if (global._daxiPushRegistered) {
            return Promise.resolve({ ok: true, skipped: true });
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
        var vapid = _vapidKey();
        if (!fcmCfg || !vapid) {
            return Promise.resolve({ ok: false, reason: 'config' });
        }

        return _loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js')
            .then(function () { return _loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js'); })
            .then(function () {
                if (!global.firebase || !global.firebase.messaging) {
                    return { ok: false, reason: 'firebase' };
                }
                try {
                    if (!global._daxiFcmApp) {
                        global._daxiFcmApp = global.firebase.initializeApp(fcmCfg, 'daxi-push');
                    }
                    var messaging = global.firebase.messaging(global._daxiFcmApp);
                    if (!global._daxiFcmOnMessageBound) {
                        global._daxiFcmOnMessageBound = true;
                        messaging.onMessage(function(payload) {
                            var n = (payload && payload.notification) || {};
                            var title = n.title || 'Daxi';
                            var body = n.body || '';
                            if (global.showDaxiNotification) {
                                global.showDaxiNotification(title, body, { type: 'info' });
                            } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                try {
                                    new Notification(title, { body: body, icon: n.icon || 'assets/images/daxi-app-icon.png' });
                                } catch (e) {}
                            }
                        });
                    }
                    return navigator.serviceWorker.register('/firebase-messaging-sw.js')
                        .then(function (reg) {
                            return messaging.getToken({
                                vapidKey: vapid,
                                serviceWorkerRegistration: reg
                            });
                        })
                        .then(function (token) {
                            if (!token) return { ok: false, reason: 'token' };
                            return registerPushToken(token, 'web').then(function () {
                                global._daxiPushRegistered = true;
                                return { ok: true, platform: 'web' };
                            });
                        });

                } catch (e) {
                    return { ok: false, reason: 'error' };
                }

            })

            .catch(function () { return { ok: false, reason: 'network' }; });

    }


    function ensurePushRegistration() {
        registerFromAndroid();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            return registerWebFcm();
        }
        return Promise.resolve({ ok: false, reason: 'permission' });
    }


    global._daxiRegisterPushToken = registerPushToken;

    global._daxiEnsurePushRegistration = ensurePushRegistration;


    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', function () {

            setTimeout(ensurePushRegistration, 1200);

        });

    } else {

        setTimeout(ensurePushRegistration, 1200);

    }

})(typeof window !== 'undefined' ? window : this);

