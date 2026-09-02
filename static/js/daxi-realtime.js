
(function (global) {
    'use strict';

    var sockets = {};
    var BASE_MS = 1000;
    var MAX_MS = 30000;
    var MAX_ATTEMPTS = 12;

    function jitter(ms) {
        var spread = Math.floor(ms * 0.25);
        return ms + Math.floor(Math.random() * spread);
    }

    function wsUrl(path) {
        var base = global.DAXI_API_BASE_URL || global._daxiLiveBaseUrl || '';
        if (base) {
            try {
                var u = new URL(String(base).replace(/\/$/, ''));
                var proto = u.protocol === 'https:' ? 'wss' : 'ws';
                return proto + '://' + u.host + path;
            } catch (e) {}
        }
        var locProto = location.protocol === 'https:' ? 'wss' : 'ws';
        var host = location.host;
        if (location.protocol === 'file:' && global._daxiLiveBaseUrl) {
            try {
                var u2 = new URL(global._daxiLiveBaseUrl);
                locProto = u2.protocol === 'https:' ? 'wss' : 'ws';
                host = u2.host;
            } catch (e2) {}
        }
        return locProto + '://' + host + path;
    }

    function cleanupSocket(entry) {
        if (!entry) return;
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        if (entry.ws) {
            try { entry.ws.onopen = entry.ws.onclose = entry.ws.onmessage = entry.ws.onerror = null; } catch (e) {}
            try {
                if (entry.ws.readyState <= 1) entry.ws.close();
            } catch (e2) {}
            entry.ws = null;
        }
    }

    function closeEntry(key, entry) {
        if (!entry) return;
        entry.closed = true;
        cleanupSocket(entry);
        delete sockets[key];
    }

    function disconnect(key) {
        var entry = sockets[key];
        if (!entry) return;
        closeEntry(key, entry);
        delete sockets[key];
    }

    function disconnectAll() {
        Object.keys(sockets).forEach(function (k) { disconnect(k); });
    }

    function resyncAfterReconnect() {
        if (global.DaxiOffline && DaxiOffline.sync) {
            global.DaxiOffline.sync().catch(function () {});
        }
        if (typeof global._loadDaxiSheetOrders === 'function') {
            try { global._loadDaxiSheetOrders({ keepOpen: true, metaOnly: true }); } catch (e) {}
        }
        if (typeof global._daxiScanLiveTracking === 'function') {
            try { global._daxiScanLiveTracking(); } catch (e2) {}
        }
    }

    function scheduleReconnect(key, entry) {
        if (entry.closed) return;
        entry.attempts = (entry.attempts || 0) + 1;
        if (entry.attempts > MAX_ATTEMPTS) return;
        var delay = Math.min(BASE_MS * Math.pow(2, entry.attempts - 1), MAX_MS);
        entry.timer = setTimeout(function () {
            if (!entry.closed) openSocket(key, entry);
        }, jitter(delay));
    }

    function openSocket(key, entry) {
        if (entry.closed) return;
        if (entry.ws && entry.ws.readyState <= 1) return;

        cleanupSocket(entry);

        try {
            entry.ws = new WebSocket(entry.url);
        } catch (e) {
            scheduleReconnect(key, entry);
            return;
        }

        entry.ws.onopen = function () {
            entry.attempts = 0;
            entry.reconnectMs = BASE_MS;
            if (entry.handlers.onOpen) entry.handlers.onOpen();
            if (entry.resyncOnOpen !== false) resyncAfterReconnect();
        };

        entry.ws.onmessage = function (e) {
            try {
                var msg = JSON.parse(e.data);
                var ev = msg.event || msg.type;
                var data = msg.data || msg;
                if (entry.handlers.onEvent) entry.handlers.onEvent(ev, data, msg);
                if (entry.handlers.onMessage) entry.handlers.onMessage(msg);
            } catch (err) {}
        };

        entry.ws.onclose = function () {
            entry.ws = null;
            if (entry.handlers.onClose) entry.handlers.onClose();
            if (!entry.closed) scheduleReconnect(key, entry);
        };

        entry.ws.onerror = function () {
            try { if (entry.ws) entry.ws.close(); } catch (e) {}
        };
    }

    function connect(key, url, handlers, options) {
        options = options || {};
        var existing = sockets[key];
        if (existing && !existing.closed && existing.url === url) {
            if (existing.ws && existing.ws.readyState <= 1) return existing;
            closeEntry(key, existing);
        } else if (existing) {
            closeEntry(key, existing);
        }

        var entry = {
            ws: null,
            url: url,
            handlers: handlers || {},
            attempts: 0,
            reconnectMs: BASE_MS,
            closed: false,
            resyncOnOpen: options.resyncOnOpen
        };
        sockets[key] = entry;
        openSocket(key, entry);
        return entry;
    }

    function connectOrder(orderId, handlers) {
        var guestQs = '';
        if (typeof global._daxiWsGuestQs === 'function') {
            guestQs = global._daxiWsGuestQs();
        } else if (global.DaxiGuestId && DaxiGuestId.guestQs) {
            guestQs = DaxiGuestId.guestQs();
        }
        var path = '/ws/orders/' + orderId + '/' + guestQs;
        var url = wsUrl(path);
        return connect('order:' + orderId, url, handlers, { resyncOnOpen: true });
    }

    if (global.addEventListener) {
        global.addEventListener('online', function () {
            Object.keys(sockets).forEach(function (key) {
                var entry = sockets[key];
                if (entry && !entry.closed) {
                    entry.attempts = 0;
                    openSocket(key, entry);
                }
            });
        });
        global.addEventListener('daxi:network-online', function () {
            Object.keys(sockets).forEach(function (key) {
                var entry = sockets[key];
                if (entry && !entry.closed) {
                    entry.attempts = 0;
                    openSocket(key, entry);
                }
            });
            resyncAfterReconnect();
        });
    }

    global.DaxiRealtime = {
        connect: connect,
        connectOrder: connectOrder,
        disconnect: disconnect,
        disconnectAll: disconnectAll,
        wsUrl: wsUrl,
        resyncAfterReconnect: resyncAfterReconnect,
        ORDER_EVENTS: [
            'new_order', 'new_order_pending_accept', 'new_order_needs_coords', 'order_updated', 'order_deleted',
            'order_unavailable', 'order_cancelled', 'order_completed', 'payment_confirmed', 'payment_cash_confirmed', 'payment_failed',
            'price_proposed', 'price_confirmed', 'price_refused', 'price_updated',
            'driver_assigned', 'driver_accepted', 'driver_unassigned', 'driver_on_the_way', 'driver_arrived',
            'status_updated', 'status_changed', 'in_progress', 'coords_set', 'coords_needed',
            'trip_paused', 'trip_resumed', 'trip_extended', 'pickup_updated', 'pickup_confirm_prompt',
            'relocate_prompt', 'now_transition', 'gps_reminder', 'trip_reminder',
            'trip_reminder_1d', 'trip_reminder_3d', 'trip_reminder_7d', 'trip_reminder_same_day',
            'new_message', 'danger_zone', 'zone_alert', 'driver_location', 'driver_status_changed',
            'lost_object_reported', 'sos_alert', 'withdrawal_request', 'enterprise_withdrawal',
            'enterprise_pending', 'enterprise_location_pending'
        ],
        isOrderEvent: function (ev) {
            return this.ORDER_EVENTS.indexOf(ev) >= 0;
        }
    };
})(window);
