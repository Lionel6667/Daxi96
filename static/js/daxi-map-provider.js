
(function (global) {
  'use strict';

  var _roadOverlay = null;
  var _roadOverlayGlow = null;
  var _maplibreRoadId = 'daxi-selected-road';

  function geojsonToGooglePath(geojson) {
    var coords = (geojson && geojson.coordinates) || (geojson && geojson.geometry && geojson.geometry.coordinates) || [];
    return coords.map(function (c) {
      return { lat: c[1], lng: c[0] };
    });
  }

  function clearRoadPreview() {
    if (_roadOverlay) { _roadOverlay.setMap(null); _roadOverlay = null; }
    if (_roadOverlayGlow) { _roadOverlayGlow.setMap(null); _roadOverlayGlow = null; }
    if (global.DaxiMapLibre && global._daxiMapLibreBg) {
      DaxiMapLibre.clearLayer(global._daxiMapLibreBg, _maplibreRoadId);
    }
  }

  function previewRoadOnGoogleMap(geojson, map) {
    if (!map || !global.google || !geojson) return;
    var path = geojsonToGooglePath(geojson);
    if (path.length < 2) return;
    clearRoadPreview();
    _roadOverlayGlow = new google.maps.Polyline({
      path: path, map: map, strokeColor: '#f59e0b', strokeOpacity: 0.35, strokeWeight: 12, zIndex: 4,
    });
    _roadOverlay = new google.maps.Polyline({
      path: path, map: map, strokeColor: '#fbbf24', strokeOpacity: 0.95, strokeWeight: 5, zIndex: 5,
    });
    var bounds = new google.maps.LatLngBounds();
    path.forEach(function (p) { bounds.extend(p); });
    map.fitBounds(bounds, typeof global._daxiMapPadding === 'function' ? global._daxiMapPadding(56) : 56);
  }

  function previewRoadOnMapLibre(geojson) {
    if (!global._daxiMapLibreBg || !global.DaxiMapLibre) return;
    DaxiMapLibre.drawGeoJSON(global._daxiMapLibreBg, _maplibreRoadId, geojson);
    DaxiMapLibre.fitGeoJSON(global._daxiMapLibreBg, geojson, 56);
  }

  function previewSelectedRoad(geojson) {
    if (!geojson) { clearRoadPreview(); return; }
    var map = global._clientBgMap;
    if (map && global.google && global.google.maps) {
      previewRoadOnGoogleMap(geojson, map);
    } else if (global._daxiMapLibreBg) {
      previewRoadOnMapLibre(geojson);
    }
  }

  function storeRoadOnInput(inputEl, geojson) {
    if (!inputEl) return;
    if (geojson) {
      try { inputEl.dataset.roadGeometry = JSON.stringify(geojson); } catch (e) {  }
      inputEl.dataset.geometryType = 'road';
    } else {
      delete inputEl.dataset.roadGeometry;
      delete inputEl.dataset.geometryType;
    }
  }

  function initMapLibreBackground(container) {
    if (!container || !global.DaxiMapLibre) return Promise.resolve(null);
    return DaxiMapLibre.fetchMapConfig().then(function (cfg) {
      return DaxiMapLibre.init(container, {
        styleUrl: cfg.style_url,
        localTileTemplates: cfg.local_tile_templates,
        center: [-72.335, 19.76],
        zoom: 11,
      }).then(function (map) {
        global._daxiMapLibreBg = map;
        return map;
      });
    });
  }

  function shouldPreferMapLibre() {
    return !!(global._DAXI_USE_MAPLIBRE);
  }

  global.DaxiMapProvider = {
    previewSelectedRoad: previewSelectedRoad,
    clearRoadPreview: clearRoadPreview,
    storeRoadOnInput: storeRoadOnInput,
    initMapLibreBackground: initMapLibreBackground,
    shouldPreferMapLibre: shouldPreferMapLibre,
  };
})(typeof window !== 'undefined' ? window : this);