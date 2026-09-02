
(function (global) {
  'use strict';

  var STORAGE_KEY = 'daxi-theme';
  var VALID = { dark: 1, light: 1 };

  var NAV_SLOTS = [
    '#daxi-theme-slot',
    '#daxi-theme-slot-login',
    'nav.nav-gradient #userSection',
    '#admin-app header .flex.items-center.gap-4',
    '#top-bar-inner .daxi-topbar-actions',
    '.ent-topbar-right',
    '.daxi-mini-nav__actions',
    '.page-header-inner',
    '.blog-page-header'
  ];

  function getTheme() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return VALID[t] ? t : 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function remixIconReady() {
    try {
      if (!document.fonts || !document.fonts.check) return false;
      return document.fonts.check('1em remixicon') || document.fonts.check('16px remixicon');
    } catch (e) {
      return false;
    }
  }

  function applyTheme(theme) {
    theme = VALID[theme] ? theme : 'dark';
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {  }
    updateToggle(theme);
    document.querySelectorAll('#admin-app .daxi-chat-shell').forEach(function (el) {
      el.classList.toggle('daxi-chat-shell--light', theme === 'light');
    });
    if (global.DaxiMapTheme && global.DaxiMapTheme.syncChromeTheme) {
      global.DaxiMapTheme.syncChromeTheme(theme);
    }
    if (typeof global._daxiSyncAllSuggestionsTheme === 'function') {
      global._daxiSyncAllSuggestionsTheme(theme);
    } else if (global.DaxiClientMapUI && global.DaxiClientMapUI.applyAllSuggestionsTheme) {
      global.DaxiClientMapUI.applyAllSuggestionsTheme(theme);
    }
    try {
      global.dispatchEvent(new CustomEvent('daxi-theme-change', { detail: { theme: theme } }));
      if (typeof global._daxiSyncClientMapsTheme === 'function') {
        global._daxiSyncClientMapsTheme(theme);
      } else if (typeof global._drvSyncMapsTheme === 'function') {
        global._drvSyncMapsTheme(theme);
      } else if (global.AdminMaps && typeof global.AdminMaps.syncTheme === 'function') {
        global.AdminMaps.syncTheme();
      }
    } catch (e2) {  }
  }

  function updateToggle(theme) {
    var btn = document.getElementById('daxi-theme-toggle');
    if (!btn) return;
    var isDark = theme === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('title', isDark ? 'Thème clair' : 'Thème sombre');
    btn.setAttribute('aria-label', btn.getAttribute('title'));
    var icon = btn.querySelector('i');
    if (icon) {
      if (remixIconReady()) {
        icon.className = isDark ? 'ri-sun-line' : 'ri-moon-line';
        icon.textContent = '';
        icon.style.fontFamily = '';
        icon.style.fontSize = '';
      } else {
        icon.className = '';
        icon.textContent = isDark ? '\u2600' : '\u263E';
        icon.style.fontFamily = 'system-ui, sans-serif';
        icon.style.fontSize = '1.15em';
      }
    }
    var label = btn.querySelector('.daxi-theme-toggle__label');
    if (label) label.textContent = isDark ? 'Clair' : 'Sombre';
  }

  function findSlot() {
    for (var i = 0; i < NAV_SLOTS.length; i++) {
      var el = document.querySelector(NAV_SLOTS[i]);
      if (el) return el;
    }
    return null;
  }

  function mountToggle(btn) {
    var slot = findSlot();
    if (!slot) {
      btn.style.display = 'none';
      document.body.appendChild(btn);
      return;
    }
    if (slot.id === 'daxi-theme-slot') {
      slot.appendChild(btn);
      return;
    }
    if (slot.classList.contains('ent-topbar-right') || slot.id === 'userSection') {
      slot.insertBefore(btn, slot.firstChild);
      return;
    }
    if (slot.classList.contains('page-header-inner')) {
      var actions = slot.querySelector('.daxi-mini-nav__actions');
      if (actions) actions.appendChild(btn);
      else slot.appendChild(btn);
      return;
    }
    slot.insertBefore(btn, slot.firstChild);
  }

  function ensureToggle() {
    if (document.getElementById('daxi-theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'daxi-theme-toggle';
    btn.className = 'daxi-theme-toggle';
    btn.innerHTML = '<i class="ri-sun-line" aria-hidden="true"></i><span class="daxi-theme-toggle__label">Clair</span>';
    btn.addEventListener('click', function () { DaxiTheme.toggle(); });
    mountToggle(btn);
    updateToggle(getTheme());
  }

  function bindFontRefresh() {
    if (global._daxiThemeFontBound) return;
    global._daxiThemeFontBound = true;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { updateToggle(getTheme()); });
    }
    document.querySelectorAll('link[href*="remixicon"]').forEach(function (link) {
      link.addEventListener('load', function () {
        setTimeout(function () { updateToggle(getTheme()); }, 40);
      });
    });
  }

  var DaxiTheme = {
    get: getTheme,
    set: applyTheme,
    toggle: function () {
      applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
    },
    remount: ensureToggle
  };

  global.DaxiTheme = DaxiTheme;

  function boot() {
    applyTheme(getTheme());
    ensureToggle();
    bindFontRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
