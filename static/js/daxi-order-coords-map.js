
(function (global) {
  'use strict';

  var INSTANCES = {};
  var DEFAULT_CENTER = { lat: 19.7607, lng: -72.2039 };
  var MAP_ID = 'c4948b020bfc08331f1cb94e';

  var MARKER_COLORS = {
    pickup: '#10b981',
    dest: '#6366f1',
    stop: '#8b5cf6',
  };

  function elId(prefix, orderId, part) {
    return (prefix || '') + part + '-' + orderId;
  }

  function parseCoord(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function isValidGps(lat, lng) {
    if (lat == null || lng == null) return false;
    lat = +lat;
    lng = +lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    if (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4) return false;
    return true;
  }

  function readTheme() {
    if (global.DaxiMapTheme) return global.DaxiMapTheme.readTheme();
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function mapOptions(center) {
    var theme = readTheme();
    var opts = {
      center: center || DEFAULT_CENTER,
      zoom: 12,
      mapId: MAP_ID,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      backgroundColor: global.DaxiMapTheme
        ? global.DaxiMapTheme.mapBgColor(theme)
        : (theme === 'light' ? '#F0F4F9' : '#070b14'),
    };
    if (global.google && global.google.maps && global.google.maps.ColorScheme) {
      opts.colorScheme = global.DaxiMapTheme
        ? global.DaxiMapTheme.mapColorScheme(theme)
        : (theme === 'light' ? global.google.maps.ColorScheme.LIGHT : global.google.maps.ColorScheme.DARK);
    }
    if (global.google && global.google.maps && global.google.maps.RenderingType) {
      opts.renderingType = global.google.maps.RenderingType.VECTOR;
    }
    return opts;
  }

  function markerIcon(color) {
    return {
      path: global.google.maps.SymbolPath.CIRCLE,
      scale: 13,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
    };
  }

  function whenMapsReady(fn) {
    if (global.google && global.google.maps && global.google.maps.Map) {
      fn();
      return;
    }
    var tries = 0;
    (function poll() {
      tries += 1;
      if (global.google && global.google.maps && global.google.maps.Map) {
        fn();
        return;
      }
      if (tries < 200) setTimeout(poll, 120);
    })();
  }

  function parseSlots(root) {
    try {
      var raw = root.getAttribute('data-coords-slots') || '[]';
      var slots = JSON.parse(raw);
      return Array.isArray(slots) ? slots : [];
    } catch (e) {
      return [];
    }
  }

  function parsePlanStops(root) {
    try {
      var raw = root.getAttribute('data-plan-stops') || '[]';
      var stops = JSON.parse(raw);
      return Array.isArray(stops) ? stops : [];
    } catch (e) {
      return [];
    }
  }

  function slotColor(slot) {
    if (!slot) return MARKER_COLORS.stop;
    if (slot.kind === 'pickup') return MARKER_COLORS.pickup;
    if (slot.kind === 'dest' || slot.is_last) return MARKER_COLORS.dest;
    return MARKER_COLORS.stop;
  }

  function pickupCoordsFromDom(prefix, orderId, root) {
    var plat = document.getElementById(elId(prefix, orderId, 'plat'));
    var plng = document.getElementById(elId(prefix, orderId, 'plng'));
    if (isValidGps(plat && plat.value, plng && plng.value)) {
      return { lat: plat.value, lng: plng.value };
    }
    if (root) {
      var dlat = parseCoord(root.getAttribute('data-pickup-lat'));
      var dlng = parseCoord(root.getAttribute('data-pickup-lng'));
      if (isValidGps(dlat, dlng)) {
        return { lat: dlat, lng: dlng };
      }
    }
    return null;
  }

  function collectPayload(prefix, orderId, opts) {
    opts = opts || {};
    prefix = prefix || '';
    var plat = document.getElementById(elId(prefix, orderId, 'plat'));
    var plng = document.getElementById(elId(prefix, orderId, 'plng'));
    var dlat = document.getElementById(elId(prefix, orderId, 'dlat'));
    var dlng = document.getElementById(elId(prefix, orderId, 'dlng'));
    var planHidden = document.getElementById(elId(prefix, orderId, 'plan-stops-json'));
    var plabel = document.getElementById(elId(prefix, orderId, 'plabel'));
    var root = document.getElementById('daxi-coords-' + prefix + orderId);
    var slots = root ? parseSlots(root) : [];
    var hasPlanStops = slots.some(function (s) { return s.kind === 'stop'; });
    var pickupKnown = pickupCoordsFromDom(prefix, orderId, root);

    var missing = [];
    if (!pickupKnown) missing.push('départ');
    if (hasPlanStops) {
      var stopsJson = [];
      try { stopsJson = JSON.parse((planHidden && planHidden.value) || '[]'); } catch (e) { stopsJson = []; }
      stopsJson.forEach(function (s, i) {
        if (!isValidGps(s.lat, s.lng)) missing.push('destination ' + (i + 1));
      });
      if (!stopsJson.length) missing.push('destinations');
    } else if (!isValidGps(dlat && dlat.value, dlng && dlng.value)) {
      missing.push('arrivée');
    }

    return {
      missing: missing,
      body: buildFormData(prefix, orderId, slots, hasPlanStops),
      requireAll: opts.requireAll !== false,
    };
  }

  function hasPlacedCoords(body) {
    if (!body) return false;
    if (body.has('pickup_lat') || body.has('dest_lat')) return true;
    if (body.has('plan_stops_json')) {
      try {
        var stops = JSON.parse(body.get('plan_stops_json'));
        return Array.isArray(stops) && stops.some(function (s) {
          return isValidGps(s.lat, s.lng);
        });
      } catch (e) { return false; }
    }
    return false;
  }

  function buildFormData(prefix, orderId, slots, hasPlanStops) {
    var plat = document.getElementById(elId(prefix, orderId, 'plat'));
    var plng = document.getElementById(elId(prefix, orderId, 'plng'));
    var dlat = document.getElementById(elId(prefix, orderId, 'dlat'));
    var dlng = document.getElementById(elId(prefix, orderId, 'dlng'));
    var planHidden = document.getElementById(elId(prefix, orderId, 'plan-stops-json'));
    var plabel = document.getElementById(elId(prefix, orderId, 'plabel'));
    var root = document.getElementById('daxi-coords-' + prefix + orderId);
    var body = new FormData();
    var pickupKnown = pickupCoordsFromDom(prefix, orderId, root);

    if (pickupKnown) {
      body.append('pickup_lat', pickupKnown.lat);
      body.append('pickup_lng', pickupKnown.lng);
    }
    if (plabel && plabel.value.trim()) body.append('pickup_label', plabel.value.trim());

    if (hasPlanStops && planHidden && planHidden.value) {
      body.append('plan_stops_json', planHidden.value);
    } else if (dlat && dlng && isValidGps(dlat.value, dlng.value)) {
      body.append('dest_lat', dlat.value);
      body.append('dest_lng', dlng.value);
      var dlabel = document.querySelector(
        '#daxi-coords-' + prefix + orderId + ' [data-coords-label-input="dest"]'
      );
      if (dlabel && dlabel.value.trim()) body.append('destination_label', dlabel.value.trim());
    }
    return body;
  }

  function initPlacer(root) {
    if (!root) return null;
    var orderId = root.dataset.orderId;
    var prefix = root.dataset.prefix || '';
    var key = prefix + orderId;

    if (root.dataset.coordsInited === '1') {
      var inst = INSTANCES[key];
      if (inst && inst.map && global.google && global.google.maps) {
        global.google.maps.event.trigger(inst.map, 'resize');
        if (inst.fitAll) inst.fitAll();
      }
      return inst || null;
    }

    var mapEl = document.getElementById(elId(prefix, orderId, 'coords-map'));
    if (!mapEl || !global.google || !global.google.maps) return null;

    var slots = parseSlots(root);
    if (!slots.length) return null;

    var hidden = {
      plat: document.getElementById(elId(prefix, orderId, 'plat')),
      plng: document.getElementById(elId(prefix, orderId, 'plng')),
      dlat: document.getElementById(elId(prefix, orderId, 'dlat')),
      dlng: document.getElementById(elId(prefix, orderId, 'dlng')),
      planStops: document.getElementById(elId(prefix, orderId, 'plan-stops-json')),
    };
    var statusEl = document.getElementById(elId(prefix, orderId, 'coords-status'));
    var missingEl = document.getElementById(elId(prefix, orderId, 'coords-missing'));
    var mode = slots[0].id;
    var markers = {};
    var planStopsState = parsePlanStops(root).map(function (s) {
      return {
        label: s.label || 'Étape',
        lat: s.lat != null ? s.lat : null,
        lng: s.lng != null ? s.lng : null,
      };
    });
    var hasPlanStops = slots.some(function (s) { return s.kind === 'stop'; });

    if (hasPlanStops && !planStopsState.length) {
      slots.filter(function (s) { return s.kind === 'stop'; }).forEach(function (s) {
        planStopsState.push({ label: s.label || 'Étape', lat: null, lng: null });
      });
    }

    function syncPlanStopsHidden() {
      if (!hidden.planStops) return;
      var out = planStopsState.map(function (s, i) {
        var labelInput = root.querySelector('[data-coords-label-input="stop-' + i + '"]');
        return {
          label: (labelInput && labelInput.value.trim()) || s.label || ('Destination ' + (i + 1)),
          lat: s.lat,
          lng: s.lng,
        };
      });
      hidden.planStops.value = JSON.stringify(out);
      if (out.length) {
        var last = out[out.length - 1];
        if (isValidGps(last.lat, last.lng) && hidden.dlat && hidden.dlng) {
          hidden.dlat.value = (+last.lat).toFixed(6);
          hidden.dlng.value = (+last.lng).toFixed(6);
        }
      }
    }

    function slotPlaced(slotId) {
      if (slotId === 'pickup') {
        return !!pickupCoordsFromDom(prefix, orderId, root);
      }
      if (slotId === 'dest') {
        return isValidGps(hidden.dlat && hidden.dlat.value, hidden.dlng && hidden.dlng.value);
      }
      var m = /^stop-(\d+)$/.exec(slotId);
      if (!m) return false;
      var idx = parseInt(m[1], 10);
      var s = planStopsState[idx];
      return !!(s && isValidGps(s.lat, s.lng));
    }

    function updateModeButtons() {
      root.querySelectorAll('[data-coords-mode]').forEach(function (btn) {
        var id = btn.getAttribute('data-coords-mode');
        var active = id === mode;
        var done = slotPlaced(id);
        btn.classList.toggle('daxi-coords-mode--active', active);
        btn.classList.toggle('daxi-coords-mode--done', done && !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function updateStatus() {
      var missing = slots.filter(function (s) { return !slotPlaced(s.id); });
      if (missingEl) {
        if (missing.length) {
          missingEl.innerHTML = 'Sans GPS : <span>' + missing.map(function (s) {
            return s.button_label || s.label;
          }).join(' · ') + '</span>';
        } else {
          missingEl.textContent = 'Tous les points sont placés — confirmez pour enregistrer.';
          missingEl.style.color = '#34d399';
        }
      }
      if (!statusEl) return;
      if (!missing.length) {
        statusEl.textContent = 'Tous les points sont placés — confirmez pour enregistrer.';
        statusEl.style.color = '#34d399';
      } else {
        var active = slots.find(function (s) { return s.id === mode; });
        statusEl.textContent = 'Mode : ' + ((active && active.button_label) || mode) + ' — cliquez sur la carte pour placer ce point.';
        statusEl.style.color = '#9ca3af';
      }
      updateModeButtons();
      syncPlanStopsHidden();
    }

    function syncHiddenSlot(slotId, latLng) {
      var lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
      var lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
      if (slotId === 'pickup') {
        if (hidden.plat) hidden.plat.value = lat.toFixed(6);
        if (hidden.plng) hidden.plng.value = lng.toFixed(6);
      } else if (slotId === 'dest') {
        if (hidden.dlat) hidden.dlat.value = lat.toFixed(6);
        if (hidden.dlng) hidden.dlng.value = lng.toFixed(6);
      } else {
        var m = /^stop-(\d+)$/.exec(slotId);
        if (m) {
          var idx = parseInt(m[1], 10);
          if (!planStopsState[idx]) planStopsState[idx] = { label: 'Étape', lat: null, lng: null };
          planStopsState[idx].lat = lat;
          planStopsState[idx].lng = lng;
        }
      }
      updateStatus();
    }

    function placeMarker(slot, latLng) {
      var slotId = slot.id;
      var color = slotColor(slot);
      var label = slot.marker_label || '•';
      if (!markers[slotId]) {
        markers[slotId] = new global.google.maps.Marker({
          position: latLng,
          map: map,
          draggable: true,
          title: slot.button_label || slot.label,
          label: { text: label, color: '#ffffff', fontWeight: '800', fontSize: '11px' },
          icon: markerIcon(color),
          zIndex: slot.kind === 'pickup' ? 5 : 3,
        });
        markers[slotId].addListener('dragend', function () {
          syncHiddenSlot(slotId, markers[slotId].getPosition());
        });
      } else {
        markers[slotId].setPosition(latLng);
      }
      syncHiddenSlot(slotId, latLng);

      var missing = slots.filter(function (s) { return !slotPlaced(s.id); });
      if (missing.length && missing[0].id !== mode) {
        mode = missing[0].id;
        updateModeButtons();
      }
    }

    var center = DEFAULT_CENTER;
    slots.forEach(function (slot) {
      if (slotPlaced(slot.id) && markers[slot.id]) return;
    });
    if (isValidGps(hidden.plat && hidden.plat.value, hidden.plng && hidden.plng.value)) {
      center = { lat: +hidden.plat.value, lng: +hidden.plng.value };
    } else {
      var knownPickup = pickupCoordsFromDom(prefix, orderId, root);
      if (knownPickup) {
        center = { lat: +knownPickup.lat, lng: +knownPickup.lng };
        if (hidden.plat) hidden.plat.value = (+knownPickup.lat).toFixed(6);
        if (hidden.plng) hidden.plng.value = (+knownPickup.lng).toFixed(6);
      }
    }

    var map = new global.google.maps.Map(mapEl, mapOptions(center));

    map.addListener('click', function (e) {
      if (!e || !e.latLng) return;
      var slot = slots.find(function (s) { return s.id === mode; });
      if (!slot) return;
      placeMarker(slot, e.latLng);
    });

    root.querySelectorAll('[data-coords-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.getAttribute('data-coords-mode');
        updateModeButtons();
        updateStatus();
      });
    });

    slots.forEach(function (slot) {
      if (slot.id === 'pickup') {
        var pk = pickupCoordsFromDom(prefix, orderId, root);
        if (pk) placeMarker(slot, { lat: +pk.lat, lng: +pk.lng });
      } else if (slot.id === 'dest' && isValidGps(hidden.dlat && hidden.dlat.value, hidden.dlng && hidden.dlng.value)) {
        placeMarker(slot, { lat: +hidden.dlat.value, lng: +hidden.dlng.value });
      } else if (/^stop-\d+$/.test(slot.id)) {
        var idx = parseInt(slot.id.split('-')[1], 10);
        var st = planStopsState[idx];
        if (st && isValidGps(st.lat, st.lng)) {
          placeMarker(slot, { lat: +st.lat, lng: +st.lng });
        }
      }
    });

    function fitAll() {
      var bounds = new global.google.maps.LatLngBounds();
      var has = false;
      Object.keys(markers).forEach(function (k) {
        if (markers[k] && markers[k].getPosition()) {
          bounds.extend(markers[k].getPosition());
          has = true;
        }
      });
      if (!has) {
        map.setCenter(DEFAULT_CENTER);
        map.setZoom(12);
        return;
      }
      if (Object.keys(markers).length > 1) map.fitBounds(bounds, 48);
      else map.setCenter(bounds.getCenter()), map.setZoom(14);
    }

    updateStatus();
    global.google.maps.event.addListenerOnce(map, 'idle', fitAll);

    root.dataset.coordsInited = '1';
    INSTANCES[key] = { map: map, markers: markers, fitAll: fitAll, resize: function () {
      global.google.maps.event.trigger(map, 'resize');
      fitAll();
    }};
    return INSTANCES[key];
  }

  function initAll(root) {
    var scope = root || document;
    scope.querySelectorAll('.daxi-coords-placer').forEach(function (node) {
      whenMapsReady(function () { initPlacer(node); });
    });
  }

  function resizeVisible(root) {
    var scope = root || document;
    scope.querySelectorAll('.daxi-coords-placer').forEach(function (node) {
      var key = (node.dataset.prefix || '') + (node.dataset.orderId || '');
      var inst = INSTANCES[key];
      if (inst && inst.resize) inst.resize();
    });
  }

  global.DaxiOrderCoordsMap = {
    init: initPlacer,
    initAll: initAll,
    resizeVisible: resizeVisible,
    collectPayload: collectPayload,
    hasPlacedCoords: hasPlacedCoords,
    isValidGps: isValidGps,
  };
})(typeof window !== 'undefined' ? window : this);