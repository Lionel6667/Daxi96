
(function (global) {
  'use strict';

  function readTheme(theme) {
    return theme || document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function mapBgColor(theme) {
    return readTheme(theme) === 'light' ? '#F0F4F9' : '#070b14';
  }

  function mapColorScheme(theme) {
    theme = readTheme(theme);
    if (global.google && global.google.maps && global.google.maps.ColorScheme) {
      return theme === 'light' ? global.google.maps.ColorScheme.LIGHT : global.google.maps.ColorScheme.DARK;
    }
    return theme === 'light' ? 'LIGHT' : 'DARK';
  }

  function ensureVeil(container, fullscreen) {
    var root = container || document.body;
    var veil = root.querySelector('.daxi-map-theme-veil');
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'daxi-map-theme-veil' + (fullscreen ? ' daxi-map-theme-veil--fullscreen' : '');
      veil.setAttribute('aria-hidden', 'true');
      root.appendChild(veil);
    }
    if (!fullscreen && root !== document.body) {
      var pos = global.getComputedStyle(root).position;
      if (pos === 'static') root.style.position = 'relative';
    }
    return veil;
  }

  
  function crossfade(container, toTheme, swapFn, opts) {
    opts = opts || {};
    var veil = ensureVeil(container, !!opts.fullscreen);
    var busy = false;

    veil.style.background = mapBgColor(toTheme);
    veil.classList.remove('daxi-map-theme-veil--out');
    veil.classList.remove('daxi-map-theme-veil--in');

    global.requestAnimationFrame(function () {
      veil.classList.add('daxi-map-theme-veil--in');
    });

    global.setTimeout(function () {
      if (busy) return;
      busy = true;
      swapFn(function finish() {
        veil.classList.remove('daxi-map-theme-veil--in');
        veil.classList.add('daxi-map-theme-veil--out');
        global.setTimeout(function () {
          veil.classList.remove('daxi-map-theme-veil--out');
        }, 460);
      });
    }, opts.delayIn != null ? opts.delayIn : 400);
  }

  function applyMapTheme(map, theme) {
    if (!map || typeof map.setOptions !== 'function') return false;
    theme = readTheme(theme);
    try {
      map.setOptions({
        colorScheme: mapColorScheme(theme),
        backgroundColor: mapBgColor(theme)
      });
      if (global.google && global.google.maps && global.google.maps.event) {
        try { global.google.maps.event.trigger(map, 'resize'); } catch (e2) {}
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  
  function applyMainMapTheme(map, theme) {
    if (!map || typeof map.setOptions !== 'function') return false;
    theme = readTheme(theme);
    try {
      var scheme = mapColorScheme(theme);
      var bg = mapBgColor(theme);
      var zoom = null;
      var tilt = 0;
      try { zoom = map.getZoom(); } catch (e0) {}
      try { tilt = map.getTilt ? map.getTilt() : 0; } catch (e1) {}

      map.setOptions({
        colorScheme: scheme,
        backgroundColor: bg
      });

      if (tilt > 4 && zoom != null && typeof map.setZoom === 'function') {
        map.setZoom(zoom);
      }
      if (global.google && global.google.maps && global.google.maps.event) {
        try { global.google.maps.event.trigger(map, 'resize'); } catch (e4) {}
      }
      return true;
    } catch (e5) {
      return false;
    }
  }

  
  function applyMainMapThemeInstant(map, theme, container) {
    if (!map || typeof map.setOptions !== 'function') return false;
    theme = readTheme(theme);
    var stage = container || document.getElementById('daxi-map-stage');
    var veil = null;
    if (stage) {
      veil = ensureVeil(stage, false);
      veil.style.transition = 'none';
      veil.style.opacity = '1';
      veil.style.background = mapBgColor(theme);
      veil.classList.add('daxi-map-theme-veil--in');
    }
    var ok = applyMainMapTheme(map, theme);
    if (veil) {
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () {
          veil.style.transition = '';
          veil.style.opacity = '';
          veil.classList.remove('daxi-map-theme-veil--in');
          veil.classList.add('daxi-map-theme-veil--out');
          global.setTimeout(function () {
            veil.classList.remove('daxi-map-theme-veil--out');
          }, 320);
        });
      });
    }
    return ok;
  }

  function syncChromeTheme(theme) {
    theme = readTheme(theme);
    var ids = ['daxiMenuFab', 'client-map-whatsapp', 'menu-toggle', 'menuToggle', 'menu-btn', 'daxi-theme-toggle', 'theme-btn'];
    var props = ['background', 'background-color', 'border', 'border-color', 'color', 'box-shadow'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('data-theme-mode', theme);
      props.forEach(function (p) { el.style.removeProperty(p); });
      var icon = el.querySelector('i');
      if (icon) icon.style.removeProperty('color');
    });
  }

  global.DaxiMapTheme = {
    readTheme: readTheme,
    mapBgColor: mapBgColor,
    mapColorScheme: mapColorScheme,
    applyMapTheme: applyMapTheme,
    applyMainMapTheme: applyMainMapTheme,
    applyMainMapThemeInstant: applyMainMapThemeInstant,
    crossfade: crossfade,
    syncChromeTheme: syncChromeTheme
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { syncChromeTheme(readTheme()); });
  } else {
    syncChromeTheme(readTheme());
  }
})(typeof window !== 'undefined' ? window : this);