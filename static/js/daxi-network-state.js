
(function (global) {
    'use strict';

    var STATE = { ONLINE: 'ONLINE', OFFLINE: 'OFFLINE', RECONNECTING: 'RECONNECTING' };

    function readNativeState() {
        if (typeof global.DaxiAndroid === 'undefined' || !DaxiAndroid.getNetworkState) return null;
        try {
            var raw = DaxiAndroid.getNetworkState();
            if (!raw) return null;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
            return null;
        }
    }

    function isNativeOnline() {
        var native = readNativeState();
        if (native && native.state) return native.state === STATE.ONLINE;
        if (typeof global._daxiNativeOnline === 'boolean') return global._daxiNativeOnline;
        if (typeof global._daxiNativeOnline === 'function') {
            try { return !!global._daxiNativeOnline(); } catch (e) { return false; }
        }
        return global.navigator ? global.navigator.onLine !== false : true;
    }

    function getState() {
        var native = readNativeState();
        if (native && native.state) return native.state;
        if (!global.navigator || global.navigator.onLine === false) return STATE.OFFLINE;
        return isNativeOnline() ? STATE.ONLINE : STATE.RECONNECTING;
    }

    function requiresInternet(action) {
        if (isNativeOnline()) return true;
        showOfflineModal(action);
        return false;
    }

    function ensureModal() {
        var id = 'daxi-offline-required-modal';
        var el = document.getElementById(id);
        if (el) return el;
        el = document.createElement('div');
        el.id = id;
        el.className = 'daxi-offline-modal';
        el.innerHTML =
            '<div class="daxi-offline-modal__backdrop"></div>' +
            '<div class="daxi-offline-modal__card" role="dialog" aria-labelledby="daxi-offline-modal-title">' +
            '<div class="daxi-offline-modal__icon"><i class="ri-wifi-off-line"></i></div>' +
            '<h3 id="daxi-offline-modal-title">Connexion Internet requise</h3>' +
            '<p id="daxi-offline-modal-msg">Cette fonctionnalité nécessite une connexion Internet. Connectez-vous à Internet puis réessayez.</p>' +
            '<button type="button" class="daxi-offline-modal__btn" id="daxi-offline-modal-retry">Réessayer</button>' +
            '</div>';
        var style = document.createElement('style');
        style.textContent =
            '.daxi-offline-modal{display:none;position:fixed;inset:0;z-index:20050;align-items:center;justify-content:center;padding:20px}' +
            '.daxi-offline-modal.show{display:flex}' +
            '.daxi-offline-modal__backdrop{position:absolute;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(4px)}' +
            '.daxi-offline-modal__card{position:relative;max-width:360px;width:100%;background:linear-gradient(160deg,#0f172a,#1e293b);border:1px solid rgba(148,163,184,.2);border-radius:20px;padding:24px 20px 20px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.45)}' +
            '.daxi-offline-modal__icon{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;color:#f59e0b;font-size:28px}' +
            '.daxi-offline-modal h3{margin:0 0 8px;font-size:18px;font-weight:800;color:#f8fafc}' +
            '.daxi-offline-modal p{margin:0 0 18px;font-size:13px;line-height:1.5;color:#94a3b8}' +
            '.daxi-offline-modal__btn{width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-size:14px;font-weight:800;cursor:pointer}';
        if (!document.getElementById('daxi-offline-modal-style')) {
            style.id = 'daxi-offline-modal-style';
            document.head.appendChild(style);
        }
        document.body.appendChild(el);
        el.querySelector('.daxi-offline-modal__backdrop').addEventListener('click', hideOfflineModal);
        el.querySelector('#daxi-offline-modal-retry').addEventListener('click', function () {
            hideOfflineModal();
            if (typeof global.DaxiAndroid !== 'undefined' && DaxiAndroid.refreshNetworkState) {
                DaxiAndroid.refreshNetworkState();
            }
            if (isNativeOnline()) return;
            if (global.DaxiOffline && DaxiOffline.onNetworkReady) DaxiOffline.onNetworkReady();
        });
        return el;
    }

    function showOfflineModal(actionLabel) {
        var el = ensureModal();
        var msg = document.getElementById('daxi-offline-modal-msg');
        if (msg && actionLabel) {
            msg.textContent = 'Cette fonctionnalité nécessite une connexion Internet' +
                (actionLabel ? ' (' + actionLabel + ')' : '') +
                '. Connectez-vous à Internet puis réessayez.';
        }
        el.classList.add('show');
    }

    function hideOfflineModal() {
        var el = document.getElementById('daxi-offline-required-modal');
        if (el) el.classList.remove('show');
    }

    function applyNativeState(payload) {
        if (!payload) return;
        global._daxiNetworkState = payload.state || STATE.OFFLINE;
        global._daxiNativeOnline = payload.state === STATE.ONLINE;
        if (payload.state === STATE.ONLINE) {
            hideOfflineModal();
            try { document.dispatchEvent(new CustomEvent('daxi:network-online')); } catch (e) {}
            if (global.DaxiOffline && DaxiOffline.onNetworkReady) DaxiOffline.onNetworkReady();
        } else if (payload.state === STATE.OFFLINE && global.DaxiOffline && global.DaxiOffline.applyCachedUi) {
            global.DaxiOffline.applyCachedUi('active');
        }
        if (typeof global._daxiOnNativeNetworkState === 'function') {
            global._daxiOnNativeNetworkState(payload);
        }
    }

    global._daxiIsNativeOnline = isNativeOnline;
    global._daxiGetNetworkState = getState;
    global._daxiRequiresInternet = requiresInternet;
    global._daxiShowOfflineModal = showOfflineModal;
    global._daxiHideOfflineModal = hideOfflineModal;
    global._daxiApplyNativeNetworkState = applyNativeState;

    global.DaxiNetworkState = {
        STATE: STATE,
        isOnline: isNativeOnline,
        getState: getState,
        requiresInternet: requiresInternet,
        showOfflineModal: showOfflineModal,
        hideOfflineModal: hideOfflineModal,
        applyNativeState: applyNativeState
    };
})(typeof window !== 'undefined' ? window : this);
