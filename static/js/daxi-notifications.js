
(function(global) {
  'use strict';

  var ICON = '/assets/images/daxi-logo-gold.png';

  var ORDER_LABELS = {
    pending: { title: 'Commande enregistrée', msg: 'Votre demande a bien été reçue. Nous préparons votre tarif.', type: 'info' },
    order_created: { title: 'Demande enregistrée', msg: 'Votre course est bien enregistrée.', type: 'info' },
    price_proposed: { title: 'Tarif proposé', msg: 'Un tarif vous a été proposé — consultez l\'app pour accepter.', type: 'info' },
    price_confirmed: { title: 'Tarif confirmé', msg: 'Merci ! Recherche d\'un chauffeur en cours.', type: 'success' },
    price_refused: { title: 'Tarif refusé', msg: 'Vous avez refusé le tarif proposé.', type: 'warning' },
    payment_confirmed: { title: 'Paiement reçu', msg: 'Paiement confirmé. Un chauffeur va bientôt être assigné.', type: 'success' },
    payment_cash_confirmed: { title: 'Course confirmée', msg: 'Vous paierez le chauffeur en espèces. Recherche d\'un chauffeur en cours.', type: 'success' },
    payment_failed: { title: 'Paiement échoué', msg: 'Le paiement n\'a pas abouti. Réessayez depuis l\'app.', type: 'error' },
    driver_assigned: { title: 'Chauffeur assigné', msg: 'Votre chauffeur a accepté la course.', type: 'success' },
    driver_accepted: { title: 'Course acceptée', msg: 'Un chauffeur a accepté votre course.', type: 'success' },
    on_way: { title: 'Chauffeur en route', msg: 'Votre chauffeur est en route vers vous.', type: 'info' },
    driver_on_the_way: { title: 'Chauffeur en route', msg: 'Votre chauffeur est en route vers vous.', type: 'info' },
    arrived: { title: 'Chauffeur sur place', msg: 'Votre chauffeur est arrivé au point de rendez-vous.', type: 'success' },
    driver_arrived: { title: 'Chauffeur sur place', msg: 'Votre chauffeur est arrivé.', type: 'success' },
    waiting_return: { title: 'Attente avant le retour', msg: 'Arrivé à destination. Attente du trajet retour.', type: 'info' },
    in_progress: { title: 'Course démarrée', msg: 'Bonne route ! Votre course est en cours.', type: 'info' },
    completed: { title: 'Course terminée', msg: 'Merci d\'avoir voyagé avec Daxi.', type: 'success' },
    order_completed: { title: 'Course terminée', msg: 'La course est terminée.', type: 'success' },
    cancelled: { title: 'Course annulée', msg: 'Votre course a été annulée.', type: 'warning' },
    order_cancelled: { title: 'Course annulée', msg: 'La course a été annulée.', type: 'warning' },
    order_deleted: { title: 'Commande retirée', msg: 'Cette commande n\'est plus active.', type: 'warning' },
    coords_needed: { title: 'GPS requis', msg: 'Placez le départ et l\'arrivée sur la carte.', type: 'info' },
    coords_set: { title: 'Itinéraire confirmé', msg: 'Les lieux ont été localisés sur la carte.', type: 'success' },
    price_updated: { title: 'Tarif mis à jour', msg: 'Le prix de votre course a été ajusté.', type: 'info' },
    trip_paused: { title: 'Course en pause', msg: 'La course est en pause — frais d\'attente applicables.', type: 'info' },
    trip_resumed: { title: 'Course reprise', msg: 'Votre course a repris.', type: 'success' },
    trip_extended: { title: 'Trajet prolongé', msg: 'Prolongation confirmée — tarif ajusté.', type: 'info' },
    new_message: { title: 'Nouveau message', msg: 'Vous avez un nouveau message sur votre course.', type: 'info' },
    sos_ack: { title: 'SOS transmis', msg: 'Votre signal a été transmis à l\'équipe DAXI.', type: 'warning' },
    sos_alert: { title: '🆘 SOS URGENCE', msg: 'Alerte SOS — intervention immédiate.', type: 'error' },
    trip_reminder: { title: 'Rappel — 1 heure', msg: 'Votre course commence dans moins d\'1 heure.', type: 'info' },
    trip_reminder_1d: { title: 'Rappel — demain', msg: 'Votre course est prévue demain.', type: 'info' },
    trip_reminder_3d: { title: 'Rappel — 3 jours', msg: 'Votre course est dans 3 jours.', type: 'info' },
    trip_reminder_7d: { title: 'Rappel — 7 jours', msg: 'Votre course est prévue dans une semaine.', type: 'info' },
    trip_reminder_same_day: { title: 'Course aujourd\'hui', msg: 'Rappel : course prévue aujourd\'hui.', type: 'info' },
    gps_reminder: { title: 'Activez votre GPS', msg: 'Activez la localisation pour un suivi précis.', type: 'info' },
    pickup_confirm_prompt: { title: 'Confirmez le RDV', msg: 'Votre course approche — confirmez le lieu de rendez-vous.', type: 'info' },
    relocate_prompt: { title: 'Lieu de RDV', msg: 'Confirmez votre nouveau point de rendez-vous.', type: 'info' },
    now_transition: { title: 'Course activée', msg: 'Votre course planifiée est maintenant active.', type: 'info' },
    driver_unassigned: { title: 'Chauffeur indisponible', msg: 'Recherche d\'un nouveau chauffeur en cours.', type: 'warning' },
    danger_zone: { title: 'Zone sensible', msg: 'Votre chauffeur traverse une zone à vigilance accrue.', type: 'warning' },
    zone_alert: { title: 'Sur la route', msg: 'Condition de route particulière.', type: 'info' },
    new_order: { title: 'Nouvelle course', msg: 'Une nouvelle demande est disponible.', type: 'info' },
    new_order_pending_accept: { title: 'Nouvelle commande', msg: 'Une commande attend votre attention.', type: 'info' },
    order_updated: { title: 'Commande mise à jour', msg: 'Le statut d\'une commande a changé.', type: 'info' },
    order_unavailable: { title: 'Course prise', msg: 'Cette course n\'est plus disponible.', type: 'warning' },
    status_updated: { title: 'Statut mis à jour', msg: 'Le statut de la course a changé.', type: 'info' },
    status_changed: { title: 'Statut mis à jour', msg: 'Le statut de la course a changé.', type: 'info' },
    lost_object_reported: { title: 'Objet oublié', msg: 'Un objet oublié a été signalé.', type: 'warning' },
    withdrawal_request: { title: 'Demande de retrait', msg: 'Nouvelle demande de retrait en attente.', type: 'info' },
    withdrawal_approved: { title: 'Retrait approuvé', msg: 'Votre demande de retrait a été approuvée.', type: 'success' },
    withdrawal_rejected: { title: 'Retrait refusé', msg: 'Votre demande de retrait nécessite une correction.', type: 'warning' },
    account_validated: { title: 'Compte validé', msg: 'Votre compte chauffeur DAXI est actif.', type: 'success' },
    pickup_updated: { title: 'RDV modifié', msg: 'Le client a modifié le lieu de rendez-vous.', type: 'info' },
    client_cancelled: { title: 'Course annulée', msg: 'Le client a annulé la course.', type: 'warning' },
    enterprise_pending: { title: 'Nouvelle entreprise', msg: 'Demande de partenariat en attente.', type: 'info' },
    enterprise_location_pending: { title: 'Emplacement entreprise', msg: 'Un partenaire demande de l\'aide.', type: 'info' },
    driver_status_changed: { title: 'Statut chauffeur', msg: 'Un chauffeur a changé de statut.', type: 'info' }
  };

  function driverStatusMessage(data) {
    data = data || {};
    var name = (data.driver_name || '').trim() || 'Un chauffeur';
    var st = (data.status || '').trim();
    if (st === 'available') return name + ' est en ligne.';
    if (st === 'offline') return name + ' s\'est déconnecté.';
    if (st === 'busy') return name + ' est occupé.';
    return name + ' a changé de statut.';
  }

  var ADMIN_STATUS_LABELS = {
    price_confirmed: { title: 'Prix accepté', msg: 'Le client a confirmé le tarif — finalisez ou assignez un chauffeur.', type: 'success' },
    payment_confirmed: { title: 'Paiement validé', msg: 'Paiement confirmé — les chauffeurs ont été alertés.', type: 'success' },
    order_updated: { title: 'Commande mise à jour', msg: 'Une commande a été modifiée.', type: 'info' },
    new_order: { title: 'Nouvelle commande', msg: 'Une nouvelle commande attend votre attention.', type: 'info' }
  };

  function isAdminPage() {
    var el = document.querySelector('[data-page]');
    return !!(el && el.dataset && el.dataset.page === 'admin');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      '<button type="button" class="daxi-wa-notif__close" aria-label="Fermer" data-no-btn-anim>&times;</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });

    var close = el.querySelector('.daxi-wa-notif__close');
    if (close) {
      close.addEventListener('click', function(e) {
        e.stopPropagation();
        el.classList.remove('show');
        setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
      });
    }
    setTimeout(function() {
      if (!el.parentNode) return;
      el.classList.remove('show');
      setTimeout(function() { if (el.parentNode) el.remove(); }, 350);
    }, opts.duration || 7000);

    var isNative = !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform())
      || !!(global._daxiCapacitorApp || global._daxiHybridShell || global.DaxiAndroid);
    if (!opts.skipNative && !isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title || 'Daxi', { body: message || '', icon: iconUrl, badge: iconUrl, tag: 'daxi-' + (title || 'n') });
      } catch (e) {}
    }
  }

  function notifyOrderEvent(eventName, data) {
    if (data && (data.silent === true || data.silent === 1 || data.silent === '1')) {
      return;
    }
    if (global.DaxiNotifPolicy && !global.DaxiNotifPolicy.shouldShow(eventName, data)) {
      return;
    }
    var status = (data && data.status) || eventName || '';
    var cfg = ORDER_LABELS[status] || ORDER_LABELS[eventName];
    if (isAdminPage() && ADMIN_STATUS_LABELS[status]) {
      cfg = ADMIN_STATUS_LABELS[status];
    } else if (isAdminPage() && ADMIN_STATUS_LABELS[eventName]) {
      cfg = ADMIN_STATUS_LABELS[eventName];
    }
    if (!cfg) return;
    var msg = (data && data.message) || (data && data.note) || cfg.msg;
    if (eventName === 'driver_status_changed' || status === 'driver_status_changed') {
      msg = driverStatusMessage(data);
    }
    if (eventName === 'sos_alert' || status === 'sos_alert') {
      if (data && data.order_id) msg = 'Course #' + data.order_id + ' — intervention immédiate.';
      showDaxiNotification('🆘 SOS URGENCE', msg, { type: 'error', duration: 15000, skipNative: false });
      if (global.DaxiNotifPolicy) global.DaxiNotifPolicy.recordShown('sos_alert', data && data.order_id);
      return;
    }
    showDaxiNotification(cfg.title, msg, { type: cfg.type, skipNative: true });
    if (global.DaxiNotifPolicy) {
      global.DaxiNotifPolicy.recordShown(status || eventName, (data && (data.order_id || data.id)), data);
    }
  }

  global.showDaxiNotification = showDaxiNotification;
  global._daxiNotifyOrderEvent = notifyOrderEvent;
  global._daxiNotifLabels = function() { return ORDER_LABELS; };
  global.showToast = function(message, type) {
    var t = type || 'success';
    var title = t === 'error' ? 'Erreur' : (t === 'warning' ? 'Attention' : 'Daxi');
    showDaxiNotification(title, message, { type: t === 'success' ? 'success' : t });
  };
})(typeof window !== 'undefined' ? window : this);