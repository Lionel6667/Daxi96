
(function(global) {
  'use strict';

  function detectPage() {
    var body = document.body;
    var pageEl = (body && body.dataset && body.dataset.page)
      ? body
      : document.querySelector('[data-page]');
    return ((pageEl && pageEl.dataset && pageEl.dataset.page)
      || (body && body.dataset && body.dataset.daxiPage)
      || 'client').toLowerCase();
  }

  function oid(data) {
    if (!data) return null;
    return data.order_id || data.id || data.orderId || null;
  }

  function stopTracker(orderId) {
    var t = global._daxiTrackers && global._daxiTrackers[orderId];
    if (!t) return;
    if (t.pollTimer) clearInterval(t.pollTimer);
    if (t.ws) try { t.ws.close(); } catch (e) {}
    delete global._daxiTrackers[orderId];
  }

  
  function removeClientOrder(orderId) {
    if (!orderId) return;
    stopTracker(orderId);
    if (global._daxiInvalidateSheetCache) global._daxiInvalidateSheetCache(orderId);
    if (global._daxiOnOrderCancelled) {
      global._daxiOnOrderCancelled(orderId, { silent: true });
      return;
    }
    if (global._daxiOnPriceRefused) global._daxiOnPriceRefused(orderId);
  }

  function removeAdminOrder(orderId) {
    if (!orderId) return;
    var card = document.getElementById('order-card-' + orderId);
    if (card) {
      card.remove();
      var grid = document.getElementById('orders-container');
      if (grid && !grid.querySelector('[id^="order-card-"]')) {
        grid.innerHTML = '<div class="text-center py-12 text-gray-500"><div class="text-5xl mb-4">📭</div><p class="text-lg font-medium">Aucune commande dans cet onglet</p></div>';
      }
      return true;
    }
    return false;
  }

  function refreshClient(orderId, ev, data) {
    if (ev === 'order_cancelled' || ev === 'cancelled' || ev === 'order_deleted' || ev === 'price_refused') {
      removeClientOrder(orderId);
      return;
    }
    if (orderId && global._daxiPatchSheetStatus && data) {
      global._daxiPatchSheetStatus(orderId, data);
    } else if (orderId && global._daxiPatchSheetStatus) {
      global._daxiPatchSheetStatus(orderId, { status: ev });
    }
    if (global._daxiOnClientOrdersRealtime) global._daxiOnClientOrdersRealtime(orderId, ev, data);
    if (ev === 'price_proposed' || ev === 'payment_confirmed' || ev === 'coords_set'
        || ev === 'driver_accepted' || ev === 'driver_assigned' || ev === 'driver_on_the_way'
        || ev === 'driver_arrived' || ev === 'in_progress') {
      if (orderId && global._daxiRefreshOrderSheet) global._daxiRefreshOrderSheet(orderId, { forceDom: true });
    } else if (typeof global._loadDaxiSheetOrders === 'function') {
      global._loadDaxiSheetOrders({ keepOpen: true, metaOnly: true });
    }
    if (orderId && global._daxiUpdateMainMapForOrder) {
      global._daxiUpdateMainMapForOrder(orderId);
    }
  }

  function refreshDriver(orderId) {
    if (typeof global.refreshDrawerOrders === 'function') global.refreshDrawerOrders(true);
    if (typeof global._driverRefreshAcceptedDrawer === 'function') global._driverRefreshAcceptedDrawer();
    if (orderId && typeof global._driverRefreshActiveOrder === 'function') {
      global._driverRefreshActiveOrder(orderId);
    }
  }

  function refreshAdmin(orderId, ev) {
    if (orderId && (ev === 'order_cancelled' || ev === 'cancelled' || ev === 'order_deleted')) {
      if (removeAdminOrder(orderId)) {
        if (typeof global.refreshAllAdminBadges === 'function') global.refreshAllAdminBadges();
        if (typeof global.loadDashboardStats === 'function') global.loadDashboardStats();
        return;
      }
    }
    if (typeof global.refreshAllAdminBadges === 'function') global.refreshAllAdminBadges();
    if (typeof global.loadDashboardStats === 'function') global.loadDashboardStats();
    if (global.ADMIN && global.ADMIN.currentSection === 'orders') {
      if (typeof global.invalidateAdminOrdersCache === 'function') global.invalidateAdminOrdersCache();
      if (typeof global.reloadAdminOrdersHtmx === 'function') global.reloadAdminOrdersHtmx();
      else if (typeof global.loadAdminOrders === 'function') global.loadAdminOrders(global.adminOrdersCurrentFilter || 'all', { force: true });
    }
    if (global.ADMIN && global.ADMIN.currentSection === 'live-map' && typeof global.refreshAdminLiveMap === 'function') {
      global.refreshAdminLiveMap();
    }
    if (global.ADMIN && global.ADMIN.currentSection === 'sos' && typeof global.loadAdminSosAlerts === 'function') {
      global.loadAdminSosAlerts(true);
    }
    if (global.ADMIN && global.ADMIN.currentSection === 'lost-objects' && typeof global.loadAdminLostObjects === 'function') {
      global.loadAdminLostObjects();
    }
    if (global.ADMIN && global.ADMIN.currentSection === 'drivers' && typeof global.loadAdminDrivers === 'function') {
      global.loadAdminDrivers();
    }
  }

  function refreshEnterprise(orderId) {
    if (typeof global.loadOrders === 'function') global.loadOrders(global._currentTab || 'active');
    if (typeof global.loadDashboardData === 'function') global.loadDashboardData();
  }

  var HANDLERS = {
    client: refreshClient,
    driver: refreshDriver,
    admin: refreshAdmin,
    enterprise: refreshEnterprise
  };

  var PAGE = 'client';

  function handle(ev, data) {
    if (!ev) return;
    data = data || {};
    var orderId = oid(data);
    var fn = HANDLERS[PAGE];
    if (fn) fn(orderId, ev, data);
  }

  function isRealtimeEvent(ev) {
    if (!ev) return false;
    if (global.DaxiRealtime && global.DaxiRealtime.isOrderEvent(ev)) return true;
    var extra = [
      'driver_unassigned', 'gps_reminder', 'now_transition', 'pickup_confirm_prompt',
      'relocate_prompt', 'new_order_needs_coords', 'withdrawal_request', 'enterprise_withdrawal',
      'enterprise_pending', 'enterprise_location_pending', 'lost_object_reported', 'sos_alert',
      'driver_status_changed', 'driver_pending', 'driver_location', 'danger_zone', 'status_changed', 'order_deleted'
    ];
    return extra.indexOf(ev) >= 0;
  }

  function init() {
    PAGE = detectPage();
    global.DaxiRealtimeSync = {
      handle: handle,
      isRealtimeEvent: isRealtimeEvent,
      removeClientOrder: removeClientOrder,
      removeAdminOrder: removeAdminOrder,
      PAGE: PAGE
    };

    function presenceContext() {
      var active = (global._daxiSheetOrderList || []).find(function(o) { return o.active; });
      var oid = active ? String(active.id) : '';
      if (!oid && PAGE === 'driver') {
        var hash = String(location.hash || '').replace(/^#order-/, '');
        if (/^\d+$/.test(hash)) oid = hash;
      }
      var chatOpen = '';
      if (oid) {
        var chat = document.getElementById('client-chat-panel-' + oid)
          || document.getElementById('chat-messages-' + oid);
        if (chat) {
          var panel = chat.closest('.daxi-oc-chat') || chat.parentElement;
          if (panel && panel.offsetParent !== null && !panel.classList.contains('hidden')) {
            chatOpen = oid;
          }
        }
      }
      var priceVisible = false;
      if (oid) {
        priceVisible = !!(
          document.getElementById('price-proposal-card')
          || document.querySelector('#daxi-sheet-order-slot #price-proposal-card')
          || document.querySelector('[data-order-id="' + oid + '"] .daxi-oc-btn--accept')
        );
      }
      return {
        viewing_order_id: oid || undefined,
        viewing_chat_order_id: chatOpen || undefined,
        viewing_price_proposal: priceVisible ? '1' : undefined,
        view: global._daxiSheetView || undefined
      };
    }

    function heartbeat() {
      if (PAGE === 'admin') return;
      if (document.visibilityState !== 'visible') return;
      var body = new URLSearchParams();
      var gid = global.localStorage && localStorage.getItem('daxi_guest_id');
      if (gid) body.set('guest_id', gid);
      var ctx = presenceContext();
      Object.keys(ctx).forEach(function(k) {
        if (ctx[k] != null && ctx[k] !== '') body.set(k, ctx[k]);
      });
      var csrf = '';
      if (typeof global.getCSRFToken === 'function') csrf = global.getCSRFToken() || '';
      if (!csrf && typeof global.getCsrfToken === 'function') csrf = global.getCsrfToken() || '';
      fetch('/api/notifications/presence/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRFToken': csrf
        },
        body: body.toString()
      }).catch(function() {});
    }

    if (PAGE !== 'admin') {
      heartbeat();
      setInterval(heartbeat, 45000);
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') heartbeat();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);