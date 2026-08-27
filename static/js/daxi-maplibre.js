
(function (global) {
  'use strict';

  var _instances = {};
  var _scriptLoaded = false;
  var _scriptLoading = null;

  var DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  var DEFAULT_CENTER = [-72.335, 19.76];
  var DEFAULT_ZOOM = 11;

  function loadMapLibre() {
    if (global.maplibregl) return Promise.resolve(global.maplibregl);
    if (_scriptLoading) return _scriptLoading;
    _scriptLoading = new Promise(function (resolve, reject) {
      if (!_scriptLoaded) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(link);
        var s = document.createElement('script');
        s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
        s.onload = function () { _scriptLoaded = true; resolve(global.maplibregl); };
        s.onerror = function () { reject(new Error('MapLibre load failed')); };
        document.head.appendChild(s);
      }
    });
    return _scriptLoading;
  }

  function buildStyle(cfg) {
    cfg = cfg || {};
    var styleUrl = cfg.styleUrl || DEFAULT_STYLE;
    if (!cfg.localTileTemplates || !cfg.localTileTemplates.length) {
      return styleUrl;
    }
    return {
      version: 8,
      sources: {
        'daxi-local': {
          type: 'vector',
          tiles: [cfg.localTileTemplates[0].url],
          minzoom: 0,
          maxzoom: 14,
        },
        'openfreemap': {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet',
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
      ],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    };
  }

  function init(container, opts) {
    opts = opts || {};
    if (!container) return Promise.resolve(null);
    var id = container.id || ('daxi-ml-' + Date.now());
    container.id = id;
    if (_instances[id]) {
      _instances[id].resize();
      return Promise.resolve(_instances[id]);
    }
    return loadMapLibre().then(function (maplibregl) {
      var isDark = (global.DaxiTheme && global.DaxiTheme.get() === 'dark')
        || document.documentElement.getAttribute('data-theme') === 'dark';
      var map = new maplibregl.Map({
        container: container,
        style: buildStyle(opts),
        center: opts.center || DEFAULT_CENTER,
        zoom: opts.zoom != null ? opts.zoom : DEFAULT_ZOOM,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', function () {
        if (isDark) {
          try {
            map.setPaintProperty('background', 'background-color', '#070b14');
          } catch (e) {  }
        }
      });
      _instances[id] = map;
      return map;
    });
  }

  function drawGeoJSON(map, sourceId, geojson, paint) {
    if (!map || !geojson) return;
    paint = paint || { 'line-color': '#f59e0b', 'line-width': 5, 'line-opacity': 0.9 };
    function apply() {
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
        return;
      }
      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: sourceId + '-line',
        type: 'line',
        source: sourceId,
        paint: paint,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }

  function clearLayer(map, sourceId) {
    if (!map) return;
    var lid = sourceId + '-line';
    if (map.getLayer(lid)) map.removeLayer(lid);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }

  function fitGeoJSON(map, geojson, padding) {
    if (!map || !geojson || !global.maplibregl) return;
    try {
      var coords = [];
      if (geojson.type === 'LineString') coords = geojson.coordinates;
      else if (geojson.geometry && geojson.geometry.coordinates) coords = geojson.geometry.coordinates;
      if (!coords.length) return;
      var bounds = coords.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: padding || 48, maxZoom: 16 });
    } catch (e) {  }
  }

  function fetchMapConfig() {
    return fetch('/api/geo/map-config/', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { style_url: DEFAULT_STYLE }; });
  }

  global.DaxiMapLibre = {
    init: init,
    load: loadMapLibre,
    drawGeoJSON: drawGeoJSON,
    clearLayer: clearLayer,
    fitGeoJSON: fitGeoJSON,
    fetchMapConfig: fetchMapConfig,
    getInstance: function (id) { return _instances[id]; },
  };
})(typeof window !== 'undefined' ? window : this);