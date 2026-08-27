
(function (global) {
  'use strict';

  function toggle(orderId, opts) {
    opts = opts || {};
    var details = document.getElementById('order-details-' + orderId);
    var btn = document.getElementById('voir-plus-btn-' + orderId);
    if (!details || !btn) return;

    var isOpen = details.classList.contains('is-open') || details.style.display === 'block';
    var nextOpen = !isOpen;

    details.classList.toggle('is-open', nextOpen);
    details.hidden = !nextOpen;
    details.style.display = nextOpen ? 'block' : 'none';
    btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');

    var lbl = btn.querySelector('.daxi-oc-expand-label');
    if (lbl) {
      lbl.textContent = nextOpen ? (opts.labelLess || 'Voir moins') : (opts.labelMore || 'Voir plus');
    } else {
      btn.innerHTML = nextOpen
        ? '<i class="ri-arrow-up-s-line"></i> ' + (opts.labelLess || 'Voir moins')
        : '<i class="ri-arrow-down-s-line"></i> ' + (opts.labelMore || 'Voir plus');
    }

    var icon = btn.querySelector('i');
    if (icon && lbl) {
      icon.className = nextOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line';
    }

    if (nextOpen) {
      if (global.DaxiOrderCardMap && typeof global.DaxiOrderCardMap.scheduleRefresh === 'function') {
        global.DaxiOrderCardMap.scheduleRefresh(orderId);
      } else if (global.AdminMaps && typeof global.AdminMaps.scheduleOrderMapRefresh === 'function') {
        global.AdminMaps.scheduleOrderMapRefresh(orderId);
      } else if (global.googleMapsLoaded && typeof global.initAllMapDivs === 'function') {
        setTimeout(global.initAllMapDivs, 100);
      }
    }
    if (nextOpen) {
      var msgs = details.querySelector('.daxi-chat-shell__msgs');
      if (msgs && global.htmx) {
        global.htmx.process(msgs);
        if (!msgs.dataset.loaded) {
          global.htmx.trigger(msgs, 'revealed');
          msgs.dataset.loaded = '1';
        }
      }
      if (global.DaxiChatComposer) global.DaxiChatComposer.init();
      if (global.DaxiTheme) {
        var theme = global.DaxiTheme.get();
        details.querySelectorAll('.daxi-chat-shell').forEach(function (el) {
          el.classList.toggle('daxi-chat-shell--light', theme === 'light');
        });
      }
    }
  }

  global.DaxiOrderExpand = { toggle: toggle };
  global.toggleOrderDetails = function (orderId) {
    toggle(orderId, { labelMore: 'Contact & détails', labelLess: 'Masquer les détails' });
  };
})(typeof window !== 'undefined' ? window : this);