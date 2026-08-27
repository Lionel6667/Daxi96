
(function() {
  'use strict';

  var _placesService = null;
  var _detailsHost = null;
  var _detailsService = null;
  var _pending = [];
  var _ready = false;

  function el(id) {
    return document.getElementById(id);
  }

  async function ensurePlacesReady() {
    if (!window.google || !window.google.maps) return false;
    try {
      if (typeof google.maps.importLibrary === 'function') {
        await google.maps.importLibrary('places');
      }
    } catch (e) {
      console.warn('[EntPlaces] importLibrary failed', e);
    }
    var p = google.maps.places;
    return !!(p && (
      (p.AutocompleteSuggestion && typeof p.AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function') ||
      p.AutocompleteService
    ));
  }

  function predictionLabel(item) {
    if (item.description) return item.description;
    var pp = item.placePrediction;
    if (!pp) return '';
    var main = (pp.mainText && pp.mainText.text) || '';
    var sec = (pp.secondaryText && pp.secondaryText.text) || '';
    return sec ? (main + ', ' + sec) : main;
  }

  async function fetchSuggestions(query, inputEl) {
    query = (query || '').trim();
    if (query.length < 2) return [];

    var catalogItems = [];
    if (window.DaxiPlacesCatalog) {
      try {
        if (!DaxiPlacesCatalog.ready() && DaxiPlacesCatalog.load) {
          await DaxiPlacesCatalog.load();
        }
        (DaxiPlacesCatalog.search(query, 8) || []).forEach(function(p) {
          if (!p) return;
          catalogItems.push({
            _catalog: true,
            place_id: p.place_id,
            description: p.description || p.label || '',
            lat: p.lat,
            lng: p.lng
          });
        });
      } catch (e) {}
    }

    var googleItems = [];
    if (await ensurePlacesReady()) {
      var places = google.maps.places;
      if (places.AutocompleteService) {
        if (places.AutocompleteSessionToken && !inputEl._entAcToken) {
          inputEl._entAcToken = new places.AutocompleteSessionToken();
        }
        if (!_placesService) _placesService = new places.AutocompleteService();
        googleItems = await new Promise(function(resolve) {
          var req = { input: query, componentRestrictions: { country: 'ht' } };
          if (inputEl._entAcToken) req.sessionToken = inputEl._entAcToken;
          _placesService.getPlacePredictions(req, function(predictions, status) {
            if (status !== places.PlacesServiceStatus.OK || !predictions || !predictions.length) {
              resolve([]);
              return;
            }
            resolve(predictions.map(function(p) {
              return { _newApi: false, prediction: p, place_id: p.place_id, description: p.description };
            }));
          });
        });
      }
      if (!googleItems.length && places.AutocompleteSuggestion && typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function') {
        try {
          var token = inputEl._entAcToken || null;
          var req = {
            input: query,
            includedRegionCodes: ['ht'],
            locationBias: { west: -74.5, south: 17.9, east: -71.6, north: 20.1 }
          };
          if (token) req.sessionToken = token;
          var result = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
          var suggestions = (result && result.suggestions) ? result.suggestions : [];
          googleItems = suggestions.map(function(s) {
            return {
              _newApi: true,
              placePrediction: s.placePrediction,
              description: predictionLabel({ placePrediction: s.placePrediction })
            };
          }).filter(function(x) { return x.description; });
        } catch (e) {
          console.warn('[EntPlaces] AutocompleteSuggestion unavailable (enable Places API New or use legacy)', e);
        }
      }
    }

    var seen = {};
    var merged = [];
    catalogItems.concat(googleItems).forEach(function(item) {
      var key = String(item.place_id || item.description || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = 1;
      merged.push(item);
    });
    return merged.slice(0, 8);
  }

  function ensureSuggestionsBox(inputEl) {
    var boxId = inputEl.id + '-suggestions';
    var box = el(boxId);
    if (!box) {
      box = document.createElement('div');
      box.id = boxId;
      box.className = 'ent-suggestions-box hidden';
      box.setAttribute('data-no-translate', '1');
      document.body.appendChild(box);
    }
    return box;
  }

  function positionBox(inputEl, box) {
    if (!inputEl || !box || box.classList.contains('hidden')) return;
    var rect = inputEl.getBoundingClientRect();
    var maxH = 220;
    var spaceBelow = window.innerHeight - rect.bottom - 12;
    var spaceAbove = rect.top - 12;
    var above = spaceBelow < 120 && spaceAbove > spaceBelow;
    var h = Math.min(maxH, Math.max(100, above ? spaceAbove - 8 : spaceBelow - 8));
    var topPx = above ? Math.max(8, rect.top - h - 6) : rect.bottom + 4;

    box.style.position = 'fixed';
    box.style.left = Math.max(8, rect.left) + 'px';
    box.style.width = Math.max(120, rect.width) + 'px';
    box.style.right = 'auto';
    box.style.top = topPx + 'px';
    box.style.maxHeight = h + 'px';
    box.style.zIndex = '100500';
    box.style.boxSizing = 'border-box';
  }

  function hideBox(box) {
    if (!box) return;
    box.classList.add('hidden');
    box.innerHTML = '';
    box.style.position = '';
    box.style.left = '';
    box.style.width = '';
    box.style.top = '';
    box.style.maxHeight = '';
    box.style.zIndex = '';
  }

  function resetSession(inputEl) {
    if (inputEl) inputEl._entAcToken = null;
  }

  function resolveItemCoords(inputEl, item) {
    if (!item) return Promise.resolve(null);
    if (item._catalog && item.lat != null && item.lng != null) {
      return Promise.resolve({ lat: item.lat, lng: item.lng, name: item.description || '' });
    }
    if (item._newApi && item.placePrediction) {
      return (async function() {
        try {
          var place = item.placePrediction.toPlace();
          await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
          var lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
          var lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
          var name = place.formattedAddress || item.description || (inputEl && inputEl.value) || '';
          return { lat: lat, lng: lng, name: name };
        } catch (e) {
          return null;
        }
      })();
    }
    var pred = item.prediction || item;
    if (!pred.place_id) return Promise.resolve(null);
    if (!_detailsService) {
      _detailsHost = _detailsHost || document.createElement('div');
      _detailsService = new google.maps.places.PlacesService(_detailsHost);
    }
    return new Promise(function(resolve) {
      _detailsService.getDetails({
        placeId: pred.place_id,
        fields: ['geometry', 'formatted_address', 'name']
      }, function(place, status) {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry) {
          resolve(null);
          return;
        }
        var name = pred.description || place.formatted_address || place.name || (inputEl && inputEl.value) || '';
        resolve({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          name: name
        });
      });
    });
  }

  async function selectItem(inputEl, item, onSelected) {
    if (!inputEl || !item) return;
    if (item._catalog && item.lat != null && item.lng != null) {
      onSelected({ lat: item.lat, lng: item.lng, name: item.description || inputEl.value });
      return;
    }

    if (item._newApi && item.placePrediction) {
      try {
        var place = item.placePrediction.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
        resetSession(inputEl);
        var lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
        var lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
        var name = place.formattedAddress || item.description || inputEl.value;
        onSelected({ lat: lat, lng: lng, name: name });
      } catch (e) {
        console.warn('[EntPlaces] place fetch failed', e);
      }
      return;
    }

    var pred = item.prediction || item;
    if (!pred.place_id) return;
    if (!_detailsService) {
      _detailsHost = _detailsHost || document.createElement('div');
      _detailsService = new google.maps.places.PlacesService(_detailsHost);
    }
    _detailsService.getDetails({
      placeId: pred.place_id,
      fields: ['geometry', 'formatted_address', 'name']
    }, function(place, status) {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry) return;
      resetSession(inputEl);
      var name = pred.description || place.formatted_address || place.name || inputEl.value;
      onSelected({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        name: name
      });
    });
  }

  function bindInput(inputEl, onPlace, clearCoords) {
    if (!inputEl || inputEl.dataset.entPlacesInit) return;
    inputEl.dataset.entPlacesInit = '1';
    var box = ensureSuggestionsBox(inputEl);
    var timer = null;
    var reqSeq = 0;

    function applySelection(data) {
      if (typeof window.entIsPlaceCovered === 'function' && !window.entIsPlaceCovered(data.lat, data.lng)) {
        if (typeof window.entRejectUncoveredPlace === 'function') {
          window.entRejectUncoveredPlace(inputEl, clearCoords);
        }
        return;
      }
      if (typeof window.entClearUncoveredBlock === 'function') {
        window.entClearUncoveredBlock(inputEl);
      }
      inputEl.value = data.name;
      inputEl.dataset.daxiUncovered = '';
      if (typeof onPlace === 'function') onPlace(data);
    }

    function fill(query) {
      query = (query || '').trim();
      if (query.length < 2) {
        hideBox(box);
        return;
      }
      var reqId = ++reqSeq;
      fetchSuggestions(query, inputEl).then(async function(items) {
        if (reqId !== reqSeq) return;
        if (document.activeElement !== inputEl) return;
        if (!items || !items.length) {
          hideBox(box);
          return;
        }
        var filtered = [];
        for (var i = 0; i < Math.min(items.length, 8); i++) {
          var data = await resolveItemCoords(inputEl, items[i]);
          if (!data) continue;
          if (typeof window.entIsPlaceCovered === 'function' && !window.entIsPlaceCovered(data.lat, data.lng)) continue;
          filtered.push(items[i]);
        }
        if (reqId !== reqSeq || document.activeElement !== inputEl) return;
        if (!filtered.length) {
          hideBox(box);
          return;
        }
        box.innerHTML = '';
        filtered.slice(0, 6).forEach(function(item) {
          var row = document.createElement('div');
          row.className = 'ent-suggestion-item';
          row.textContent = item.description;
          row.addEventListener('mousedown', function(e) {
            e.preventDefault();
            hideBox(box);
            selectItem(inputEl, item, applySelection);
          });
          box.appendChild(row);
        });
        box.classList.remove('hidden');
        positionBox(inputEl, box);
      }).catch(function(e) {
        console.warn('[EntPlaces] suggestions failed', e);
        hideBox(box);
      });
    }

    inputEl.addEventListener('input', function() {
      if (typeof clearCoords === 'function') clearCoords();
      if (typeof window.entClearUncoveredBlock === 'function') {
        window.entClearUncoveredBlock(inputEl);
      }
      clearTimeout(timer);
      timer = setTimeout(function() { fill(inputEl.value); }, 180);
    });

    inputEl.addEventListener('focus', function() {
      var q = (inputEl.value || '').trim();
      if (q.length >= 2) fill(q);
    });

    inputEl.addEventListener('blur', function() {
      clearTimeout(timer);
      setTimeout(function() { hideBox(box); }, 180);
    });

    var reposition = function() {
      if (!box.classList.contains('hidden')) positionBox(inputEl, box);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }

  function register(inputId, onPlace, clearCoords) {
    _pending.push({ inputId: inputId, onPlace: onPlace, clearCoords: clearCoords });
    if (_ready) bindById(inputId, onPlace, clearCoords);
  }

  function bindById(inputId, onPlace, clearCoords) {
    var inputEl = el(inputId);
    if (!inputEl) return;
    bindInput(inputEl, onPlace, clearCoords);
  }

  async function init() {
    if (window.DaxiPlacesCatalog && DaxiPlacesCatalog.load) {
      try { await DaxiPlacesCatalog.load(); } catch (e) {}
    }
    var googleOk = await ensurePlacesReady();
    if (!googleOk && !(window.DaxiPlacesCatalog && DaxiPlacesCatalog.ready && DaxiPlacesCatalog.ready())) {
      console.warn('[EntPlaces] Google Places API unavailable');
      return;
    }
    _ready = true;
    refresh();
  }

  function refresh() {
    if (!_ready) return;
    _pending.forEach(function(cfg) {
      bindById(cfg.inputId, cfg.onPlace, cfg.clearCoords);
    });
  }

  window.EntPlaces = {
    register: register,
    init: init,
    refresh: refresh
  };
})();