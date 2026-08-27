
(function (global) {
    'use strict';

    var ICON = '/assets/images/daxi-app-icon.png';

    var ORDER_LABELS = {
        pending: { title: 'Commande enregistrée', msg: 'Votre demande a bien été reçue.', type: 'info' },
        price_proposed: { title: 'Prix proposé', msg: 'Un tarif vous a été proposé pour votre course.', type: 'info' },
        price_confirmed: { title: 'Prix confirmé', msg: 'Le tarif a été confirmé.', type: 'success' },
        driver_assigned: { title: 'Chauffeur assigné', msg: 'Votre chauffeur a été assigné à la course.', type: 'success' },
        on_way: { title: 'Chauffeur en route', msg: 'Votre chauffeur est en route vers vous.', type: 'info' },
        arrived: { title: 'Chauffeur arrivé', msg: 'Votre chauffeur est arrivé au point de départ.', type: 'success' },
        in_progress: { title: 'Course démarrée', msg: 'Votre course est en cours.', type: 'info' },
        completed: { title: 'Course terminée', msg: 'Merci d\'avoir voyagé avec Daxi.', type: 'success' },
        cancelled: { title: 'Course annulée', msg: 'La course a été annulée.', type: 'warning' },
        payment_confirmed: { title: 'Paiement confirmé', msg: 'Le paiement a été enregistré.', type: 'success' },
        new_message: { title: 'Nouveau message', msg: 'Vous avez un nouveau message.', type: 'info' },
        trip_reminder: { title: 'Rappel de course', msg: 'Votre course planifiée approche.', type: 'info' },
        new_order: { title: 'Nouvelle commande', msg: 'Une nouvelle course est disponible.', type: 'info' },
        order_updated: { title: 'Commande mise à jour', msg: 'Le statut d\'une commande a changé.', type: 'info' },
        order_cancelled: { title: 'Course annulée', msg: 'Une commande a été annulée.', type: 'warning' },
        withdrawal_request: { title: 'Demande de retrait', msg: 'Une nouvelle demande de retrait est en attente.', type: 'info' },
        lost_object_reported: { title: 'Objet oublié', msg: 'Un objet oublié a été signalé.', type: 'warning' },
        sos_alert: { title: 'Alerte SOS', msg: 'Intervention immédiate requise.', type: 'error' },
        chauffeur_valide: { title: 'Compte validé', msg: 'Votre compte chauffeur est actif.', type: 'success' }
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showDaxiNotification(title, message, opts) {
        opts = opts || {};
        var type = opts.type || 'info';
        var iconUrl = opts.icon || ICON;
        var existing = document.querySelectorAll('.daxi-wa-notif');
        if (existing.length > 4) existing[0].remove();

        var el = document.createElement('div');
        el.className = 'daxi-wa-notif daxi-wa-notif--' + type;
        el.innerHTML =
            '<div class="daxi-wa-notif__avatar"><img src="' + escapeHtml(iconUrl) + '" alt="Daxi"></div>' +
            '<div class="daxi-wa-notif__body">' +
                '<div class="daxi-wa-notif__head"><span class="daxi-wa-notif__app">Daxi</span><span class="daxi-wa-notif__time">maintenant</span></div>' +
                '<div class="daxi-wa-notif__title">' + escapeHtml(title || 'Daxi') + '</div>' +
                '<div class="daxi-wa-notif__msg">' + escapeHtml(message || '') + '</div>' +
            '</div>' +
            '<button type="button" class="daxi-wa-notif__close" aria-label="Fermer">&times;</button>';
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('show'); });

        var close = el.querySelector('.daxi-wa-notif__close');
        if (close) {
            close.addEventListener('click', function (e) {
                e.stopPropagation();
                el.classList.remove('show');
                setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
            });
        }
        if (opts.onClick) {
            el.addEventListener('click', function (e) {
                if (!e.target.closest('.daxi-wa-notif__close')) opts.onClick();
            });
        }
        setTimeout(function () {
            if (!el.parentNode) return;
            el.classList.remove('show');
            setTimeout(function () { if (el.parentNode) el.remove(); }, 350);
        }, opts.duration || 7000);

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && !opts.skipNative) {
            try {
                var notifOpts = { body: message || '', icon: iconUrl, badge: iconUrl };
                if (type === 'error' && (opts.event === 'sos_alert' || (title && title.indexOf('SOS') >= 0))) {
                    notifOpts.requireInteraction = true;
                    if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 600]);
                }
                new Notification(title || 'Daxi', notifOpts);
            } catch (e) {}
        }
    }

    function notifyOrderEvent(eventName, data) {
        if (data && (data.silent === true || data.silent === 1 || data.silent === '1')) return;
        var status = (data && data.status) || eventName || '';
        var cfg = ORDER_LABELS[status] || ORDER_LABELS[eventName];
        if (!cfg) return;
        var msg = (data && data.message) || cfg.msg;
        if (eventName === 'sos_alert' || status === 'sos_alert') {
            if (data && data.order_id) msg = 'Course #' + data.order_id + ' — intervention immédiate.';
            showDaxiNotification('🆘 SOS URGENCE', msg, { type: 'error', event: 'sos_alert', duration: 15000 });
            return;
        }
        showDaxiNotification(cfg.title, msg, { type: cfg.type });
    }

    global.showDaxiNotification = showDaxiNotification;
    global._daxiNotifyOrderEvent = notifyOrderEvent;
    global._daxiNotifLabels = function () { return ORDER_LABELS; };

    global.showToast = function (message, type) {
        var t = type || 'success';
        var title = t === 'error' ? 'Erreur' : (t === 'warning' ? 'Attention' : 'Daxi');
        showDaxiNotification(title, message, { type: t === 'success' ? 'success' : t });
    };
})(typeof window !== 'undefined' ? window : this);
