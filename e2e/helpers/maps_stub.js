/**
 * Shared Google Maps JS stub for local E2E (no API key).
 * Covers Map#getCenter/getZoom, SymbolPath.CIRCLE, LatLngBounds#getCenter,
 * and event.trigger used by order-card / explorer / admin maps.
 */
const MAPS_STUB_JS = `
(function(){
  function noop(){ return { remove: function(){} }; }
  function LatLng(a,b){
    var lat = typeof a === 'object' && a ? (a.lat != null ? +a.lat : +a) : +a;
    var lng = typeof a === 'object' && a ? (a.lng != null ? +a.lng : +b) : +b;
    this._lat = Number.isFinite(lat) ? lat : 18.5944;
    this._lng = Number.isFinite(lng) ? lng : -72.3074;
    this.lat = function(){ return this._lat; };
    this.lng = function(){ return this._lng; };
  }
  function LatLngBounds(sw, ne){
    this._pts = [];
    if (sw) this.extend(sw);
    if (ne) this.extend(ne);
    this.extend = function(p){
      if (!p) return;
      var lat = typeof p.lat === 'function' ? p.lat() : (p.lat != null ? +p.lat : +p[0]);
      var lng = typeof p.lng === 'function' ? p.lng() : (p.lng != null ? +p.lng : +p[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) this._pts.push({lat:lat,lng:lng});
    };
    this.getCenter = function(){
      if (!this._pts.length) return new LatLng(18.5944, -72.3074);
      var s=0,g=0;
      for (var i=0;i<this._pts.length;i++){ s+=this._pts[i].lat; g+=this._pts[i].lng; }
      return new LatLng(s/this._pts.length, g/this._pts.length);
    };
    this.isEmpty = function(){ return !this._pts.length; };
  }
  function Map(el, opts){
    this.__el = el || document.createElement('div');
    this.__center = (opts && opts.center) ? opts.center : new LatLng(18.5944, -72.3074);
    this.__zoom = (opts && opts.zoom != null) ? opts.zoom : 12;
    this.addListener = function(){ return noop(); };
    this.setCenter = function(c){ this.__center = c; };
    this.getCenter = function(){
      var c = this.__center;
      if (c && typeof c.lat === 'function') return c;
      if (c && c.lat != null) return new LatLng(c.lat, c.lng);
      return new LatLng(18.5944, -72.3074);
    };
    this.setZoom = function(z){ this.__zoom = z; };
    this.getZoom = function(){ return this.__zoom; };
    this.panTo = function(c){ this.setCenter(c); };
    this.fitBounds = function(){};
    this.setOptions = function(){};
    this.getDiv = function(){ return this.__el; };
    this.getBounds = function(){ return new LatLngBounds(); };
    this.setMapTypeId = function(){};
  }
  function Marker(opts){
    this.__map = opts && opts.map;
    this.setMap = function(m){ this.__map = m; };
    this.setPosition = function(){};
    this.getPosition = function(){ return new LatLng(18.5944, -72.3074); };
    this.setIcon = function(){};
    this.setTitle = function(){};
    this.setVisible = function(){};
    this.addListener = function(){ return noop(); };
  }
  function Circle(){ this.setMap = function(){}; this.setCenter = function(){}; this.setRadius = function(){}; }
  function Polyline(){ this.setMap = function(){}; this.setPath = function(){}; this.setOptions = function(){}; }
  function Polygon(){ this.setMap = function(){}; }
  window.google = window.google || {};
  window.google.maps = window.google.maps || {
    Map: Map,
    LatLng: LatLng,
    LatLngBounds: LatLngBounds,
    Marker: Marker,
    Circle: Circle,
    Polyline: Polyline,
    Polygon: Polygon,
    SymbolPath: { CIRCLE: 0, FORWARD_CLOSED_ARROW: 1, FORWARD_OPEN_ARROW: 2, BACKWARD_CLOSED_ARROW: 3, BACKWARD_OPEN_ARROW: 4 },
    Animation: { DROP: 1, BOUNCE: 2 },
    DirectionsService: function(){ this.route = function(r, cb){ if (typeof cb === 'function') cb({ routes: [] }, 'OK'); }; },
    DirectionsRenderer: function(){ this.setMap = function(){}; this.setDirections = function(){}; this.setOptions = function(){}; },
    Geocoder: function(){ this.geocode = function(r, cb){ if (typeof cb === 'function') cb([], 'ZERO_RESULTS'); }; },
    event: {
      addListener: function(){ return noop(); },
      addListenerOnce: function(){ return noop(); },
      trigger: function(){},
      removeListener: function(){},
      clearInstanceListeners: function(){}
    },
    places: {
      Autocomplete: function(){ this.addListener = function(){ return noop(); }; this.getPlace = function(){ return { geometry: { location: new LatLng(18.5944, -72.3074) } }; }; this.setBounds = function(){}; },
      AutocompleteService: function(){ this.getPlacePredictions = function(r, cb){ if (typeof cb === 'function') cb([], 'ZERO_RESULTS'); }; },
      PlacesService: function(){ this.getDetails = function(r, cb){ if (typeof cb === 'function') cb(null, 'ZERO_RESULTS'); }; }
    },
    MapTypeId: { ROADMAP: 'roadmap', HYBRID: 'hybrid', SATELLITE: 'satellite', TERRAIN: 'terrain' },
    TravelMode: { DRIVING: 'DRIVING', WALKING: 'WALKING' },
    DirectionsStatus: { OK: 'OK' },
    ControlPosition: { TOP_LEFT: 1, TOP_RIGHT: 2, LEFT_TOP: 5, RIGHT_BOTTOM: 12, BOTTOM_CENTER: 11 },
    geometry: {
      spherical: {
        computeDistanceBetween: function(){ return 1000; },
        computeHeading: function(){ return 0; }
      }
    }
  };
  // AdvancedMarkerElement soft stub (some pages probe for it)
  try {
    window.google.maps.marker = window.google.maps.marker || {};
    window.google.maps.marker.AdvancedMarkerElement = function(opts){
      this.map = opts && opts.map;
      this.position = opts && opts.position;
      this.content = opts && opts.content;
    };
  } catch (e) {}
  if (typeof window.__entMapsReady === 'function') {
    try { window.__entMapsReady(); } catch (e) {}
  }
  try { window.__daxiMapsStubbed = true; } catch (e) {}
})();
`.trim();

/**
 * Route-intercept Google Maps script + inject early via addInitScript so
 * page code never sees a half-initialized google.maps (getCenter / SymbolPath).
 * @param {import('@playwright/test').Page} page
 */
async function stubGoogleMaps(page) {
  await page
    .addInitScript({ content: MAPS_STUB_JS })
    .catch(() => {});
  await page
    .route('**/maps.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: MAPS_STUB_JS,
      });
    })
    .catch(() => {});
  await page
    .route('**/maps.gstatic.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '/* maps.gstatic stub */',
      });
    })
    .catch(() => {});
}

module.exports = { MAPS_STUB_JS, stubGoogleMaps };
