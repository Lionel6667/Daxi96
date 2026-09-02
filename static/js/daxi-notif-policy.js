
(function(global) {
  'use strict';

  var USER_ACTION_TTL_MS = {
    price_confirmed: 3 * 60 * 1000,
    price_refused: 3 * 60 * 1000,
    payment_confirmed: 3 * 60 * 1000,
    payment_cash_confirmed: 3 * 60 * 1000,
    payment_failed: 2 * 60 * 1000,
    order_created: 2 * 60 * 1000,
    order_cancelled: 3 * 60 * 1000,
    coords_set: 90 * 1000,
    sos_triggered: 5 * 60 * 1000
  };

  var EVENT_TO_ACTION = {
    price_confirmed: 'price_confirmed',
    price_refused: 'price_refused',
    payment_confirmed: 'payment_confirmed',
    payment_cash_confirmed: 'payment_cash_confirmed',
    payment_failed: 'payment_failed',
    pending: 'order_created',
    order_created: 'order_created',
    cancelled: 'order_cancelled',
    order_cancelled: 'order_cancelled',
    coords_set: 'coords_set',
    sos_ack: 'sos_triggered'
  };

  var NEVER_SHOW = {
    price_refused: 1,
    status_updated: 1,
    status_changed: 1,
    order_updated: 1
  };

  var RETRY_AFTER_MS = {
    sos_alert: 5 * 60 * 1000,
    cancelled: 10 * 60 * 1000,
    order_cancelled: 10 * 60 * 1000,
    danger_zone: 15 * 60 * 1000,
    zone_alert: 8 * 60 * 1000,
    driver_unassigned: 15 * 60 * 1000,
    price_proposed: 30 * 60 * 1000,
    new_message: 20 * 60 * 1000,
    driver_assigned: 15 * 60 * 1000,
    driver_accepted: 15 * 60 * 1000,
    on_way: 15 * 60 * 1000,
    driver_on_the_way: 15 * 60 * 1000,
    arrived: 15 * 60 * 1000,
    driver_arrived: 15 * 60 * 1000,
    pickup_confirm_prompt: 30 * 60 * 1000,
    relocate_prompt: 20 * 60 * 1000,
    completed: 2 * 3600 * 1000,
    order_completed: 2 * 3600 * 1000
  };

  function orderIdFrom(data, eventName) {
    data = data || {};
    return data.order_id || data.id || data.orderId || null;
  }

  function eventKey(data, eventName) {
    return ((data && data.status) || eventName || '').trim();
  }

  function actionKey(action, orderId) {
    return 'daxi:act:' + action + ':' + orderId;
  }

  function deliveryKey(event, orderId) {
    return 'daxi:notif:shown:' + orderId + ':' + event;
  }

  function markUserAction(orderId, action) {
    if (!orderId || !action) return;
    try {
      sessionStorage.setItem(actionKey(action, orderId), String(Date.now()));
    } catch (e) {}
  }

  function hadRecentUserAction(event, orderId) {
    var action = EVENT_TO_ACTION[event];
    if (!action || !orderId) return false;
    try {
      var raw = sessionStorage.getItem(actionKey(action, orderId));
      if (!raw) return false;
      var ttl = USER_ACTION_TTL_MS[action] || 120000;
      return (Date.now() - parseInt(raw, 10)) < ttl;
    } catch (e) {
      return false;
    }
  }

  function isViewingOrder(orderId) {
    if (!orderId) return false;
    var active = (global._daxiSheetOrderList || []).find(function(o) { return o.active; });
    return !!(active && String(active.id) === String(orderId));
  }

  function isViewingChat(orderId) {
    if (!orderId) return false;
    var chat = document.getElementById('client-chat-panel-' + orderId)
      || document.getElementById('chat-messages-' + orderId);
    if (!chat) return false;
    var panel = chat.closest('.daxi-oc-chat') || chat.parentElement;
    return !!(panel && panel.offsetParent !== null && !panel.classList.contains('hidden'));
  }

  function alreadyShown(event, orderId) {
    if (!orderId) return false;
    try {
      var raw = localStorage.getItem(deliveryKey(event, orderId));
      if (!raw) return false;
      if (NEVER_SHOW[event]) return true;
      var retry = RETRY_AFTER_MS[event];
      if (!retry) return true;
      return (Date.now() - parseInt(raw, 10)) < retry;
    } catch (e) {
      return false;
    }
  }

  function recordShown(event, orderId) {
    if (!orderId || !event) return;
    try {
      localStorage.setItem(deliveryKey(event, orderId), String(Date.now()));
    } catch (e) {}
  }

  function shouldShow(eventName, data) {
    data = data || {};
    if (data.silent === true || data.silent === 1 || data.silent === '1') return false;

    var event = eventKey(data, eventName);
    if (!event) return false;

    var oid = orderIdFrom(data, eventName);

    if (NEVER_SHOW[event]) return false;
    if (hadRecentUserAction(event, oid)) return false;
    if (alreadyShown(event, oid)) return false;

    if (event === 'new_message' && isViewingChat(oid)) return false;
    if (event === 'price_proposed' && isViewingOrder(oid)) {
      if (document.getElementById('price-proposal-card')
        || document.querySelector('[data-order-id="' + oid + '"] .daxi-oc-btn--accept')) {
        return false;
      }
    }
    if ((event === 'driver_assigned' || event === 'driver_accepted' || event === 'on_way'
      || event === 'driver_on_the_way' || event === 'arrived' || event === 'driver_arrived'
      || event === 'in_progress') && isViewingOrder(oid)) {
      return false;
    }

    return true;
  }

  global.DaxiNotifPolicy = {
    shouldShow: shouldShow,
    recordShown: recordShown,
    markUserAction: markUserAction,
    NEVER_SHOW: NEVER_SHOW
  };
})(typeof window !== 'undefined' ? window : this);