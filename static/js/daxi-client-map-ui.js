
(function (global) {
  'use strict';

  var hostApplySuggestionsBoxTheme = typeof global._daxiApplySuggestionsBoxTheme === 'function'
    ? global._daxiApplySuggestionsBoxTheme
    : null;
  var hostSyncAllSuggestionsTheme = typeof global._daxiSyncAllSuggestionsTheme === 'function'
    ? global._daxiSyncAllSuggestionsTheme
    : null;

  function readTheme(theme) {
    if (theme) return theme;
    if (global.DaxiTheme && typeof global.DaxiTheme.get === 'function') return global.DaxiTheme.get();
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applySuggestionsBoxTheme(box, theme) {
    if (!box) return;
    if (hostApplySuggestionsBoxTheme) {
      hostApplySuggestionsBoxTheme(box, readTheme(theme));
      return;
    }
    theme = readTheme(theme);
    var isLight = theme === 'light';
    box.setAttribute('data-daxi-suggest-theme', isLight ? 'light' : 'dark');
    box.classList.remove('daxi-suggest--light', 'daxi-suggest--dark');
    box.classList.add(isLight ? 'daxi-suggest--light' : 'daxi-suggest--dark');
  }

  function applyAllSuggestionsTheme(theme) {
    theme = readTheme(theme);
    if (hostSyncAllSuggestionsTheme) {
      hostSyncAllSuggestionsTheme(theme);
      return;
    }
    document.querySelectorAll('.suggestions-container').forEach(function (box) {
      applySuggestionsBoxTheme(box, theme);
    });
  }

  function isMapSurfaceTarget(el) {
    if (!el || !el.closest) return false;
    if (el.closest('#appSheet, .app-sheet, .tab-bar, nav.nav-gradient, #daxi-theme-slot, .suggestions-container, .daxi-page-overlay.show, #daxiSidebar, .daxi-sidebar, .location-share-prompt, #daxiSheetExpandFab, #daxiSheetOrderMini, .tab-bar-btn')) {
      return false;
    }
    return !!el.closest('#daxi-map-stage, #daxi-main-map, #daxiMapTapZone, .gm-style, .gm-control-active');
  }

  function handleMapSurfaceTap(source) {
    if (global._daxiPinDragging) return;
    if (typeof global._daxiHideAllPlaceSuggestions === 'function') global._daxiHideAllPlaceSuggestions();
    if (typeof global._daxiCollapseSheetFromMapTap === 'function') global._daxiCollapseSheetFromMapTap();
  }

  
  function applyMainBgMapTheme(theme) {
    theme = readTheme(theme);
    global._daxiPendingMapTheme = theme;
    if (!global._clientBgMap || !global.google || !global.google.maps) {
      if (typeof global._daxiApplyMapContainerTheme === 'function') {
        global._daxiApplyMapContainerTheme(theme);
      }
      if (!global._daxiMapsLoading && !global.googleMapsLoaded && typeof global._daxiLoadGoogleMaps === 'function') {
        global._daxiLoadGoogleMaps();
      }
      return false;
    }
    if (global.DaxiMainMapDual && global._daxiMainMapPair && global.DaxiMainMapDual.applyTheme) {
      if (global._daxiClientMapTheme !== theme) {
        global.DaxiMainMapDual.applyTheme(theme);
        global._daxiClientMapTheme = theme;
      }
      try { global.google.maps.event.trigger(global._clientBgMap, 'resize'); } catch (e) {}
      return true;
    }
    if (global._daxiClientMapTheme === theme) {
      try { global.google.maps.event.trigger(global._clientBgMap, 'resize'); } catch (e) {}
      return true;
    }
    if (typeof global._daxiReinitClientBgMap === 'function') {
      if (global._daxiReinitClientBgMap(theme)) return true;
    }
    return false;
  }

  function applyClientMapsTheme(theme) {
    theme = readTheme(theme);
    global._daxiPendingMapTheme = theme;

    if (typeof global._daxiApplyMapContainerTheme === 'function') {
      global._daxiApplyMapContainerTheme(theme);
    }
    if (global.DaxiMapPlaceholder && global.DaxiMapPlaceholder.applyTheme) {
      global.DaxiMapPlaceholder.applyTheme('daxi-map-stage', theme);
    }
    document.querySelectorAll('.daxi-map-ph-skel').forEach(function (el) {
      if (global.DaxiMapPlaceholder && global.DaxiMapPlaceholder.applyCardSkeleton) {
        global.DaxiMapPlaceholder.applyCardSkeleton(el, theme);
      }
    });
    if (global.DaxiOrderCardMap && global.DaxiOrderCardMap.syncAllThemes) {
      global.DaxiOrderCardMap.syncAllThemes(theme);
    }

    if (applyMainBgMapTheme(theme)) {
      if (typeof global._daxiReattachMainMapOverlays === 'function') global._daxiReattachMainMapOverlays();
      if (typeof global._daxiFlushPendingBookingMarkers === 'function') global._daxiFlushPendingBookingMarkers();
      if (typeof global._daxiSyncBookingMarkersFromForm === 'function') global._daxiSyncBookingMarkersFromForm();
      if (global.DaxiRoutesMap && typeof global.DaxiRoutesMap.refreshOnMap === 'function') {
        try { global.DaxiRoutesMap.refreshOnMap(); } catch (e) {}
      }
    }
  }

  function bindMapSurfaceTap() {
    if (global._daxiMapSurfaceTapBound) return;
    global._daxiMapSurfaceTapBound = true;
    var tapStart = null;
    global.addEventListener('pointerdown', function (e) {
      if (!isMapSurfaceTarget(e.target)) return;
      tapStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }, true);
    global.addEventListener('pointerup', function (e) {
      if (!tapStart || e.pointerId !== tapStart.id) return;
      if (!isMapSurfaceTarget(e.target)) {
        tapStart = null;
        return;
      }
      var dx = e.clientX - tapStart.x;
      var dy = e.clientY - tapStart.y;
      tapStart = null;
      if (Math.abs(dx) > 16 || Math.abs(dy) > 16) return;
      if (global._daxiPinDragging) return;
      if (global._daxiMapUserInteracting || global._daxiMapDidDrag) return;
      handleMapSurfaceTap('tap');
    }, true);
  }

  function installClientMapThemeHandlers() {
    global._daxiApplyClientMapsTheme = applyClientMapsTheme;
    global._daxiSyncClientMapsTheme = applyClientMapsTheme;
    global._daxiApplyMainBgMapTheme = applyMainBgMapTheme;
  }

  function boot() {
    installClientMapThemeHandlers();
    bindMapSurfaceTap();
    applyAllSuggestionsTheme();
    if (typeof global._initMapTapZone === 'function' && !global._daxiMapTapZoneReady) {
      global._initMapTapZone();
    }
    document.addEventListener('daxi-theme-change', function (e) {
      var theme = (e && e.detail && e.detail.theme) || readTheme();
      applyAllSuggestionsTheme(theme);
      applyClientMapsTheme(theme);
    });
  }

  global.DaxiClientMapUI = {
    applySuggestionsBoxTheme: applySuggestionsBoxTheme,
    applyAllSuggestionsTheme: applyAllSuggestionsTheme,
    applyMainBgMapTheme: applyMainBgMapTheme,
    applyClientMapsTheme: applyClientMapsTheme,
    handleMapSurfaceTap: handleMapSurfaceTap
  };

  installClientMapThemeHandlers();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  global.addEventListener('load', boot);
})(typeof window !== 'undefined' ? window : this);