
(function (global) {
  'use strict';

  var _places = [];
  var _byId = {};
  var _ready = false;
  var _loading = null;

  function normalize(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matches(queryNorm, searchText) {
    if (!queryNorm || queryNorm.length < 2) return false;
    var st = normalize(searchText);
    if (!st) return false;
    if (st.indexOf(queryNorm) >= 0) return true;
    var parts = queryNorm.split(' ').filter(function (p) { return p.length >= 2; });
    if (!parts.length) return queryNorm.indexOf(st) >= 0 || st.indexOf(queryNorm) >= 0;
    return parts.every(function (p) { return st.indexOf(p) >= 0; });
  }

  function score(queryNorm, entry) {
    var desc = normalize(entry.description || '');
    if (desc === queryNorm) return 1;
    if (desc.indexOf(queryNorm) === 0) return 0.9;
    if (desc.indexOf(queryNorm) >= 0) return 0.8;
    if (entry.source === 'known') return 0.75;
    return 0.6;
  }

  function isDaxiId(id) {
    return !!(id && String(id).indexOf('daxi_') === 0);
  }

  function isGoogleId(id) {
    return !!(id && !isDaxiId(id) && /^[A-Za-z0-9_-]{10,}$/.test(String(id)));
  }

  function ingest(list) {
    _places = [];
    _byId = {};
    (list || []).forEach(function (p) {
      if (!p || !p.place_id) return;
      var item = Object.assign({ _daxiLocal: true }, p);
      _places.push(item);
      _byId[p.place_id] = item;
    });
    _ready = true;
  }

  function load(force) {
    if (_ready && !force) return Promise.resolve(_places);
    if (_loading && !force) return _loading;
    _loading = fetch('/api/places/catalog/', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { places: [] }; })
      .then(function (data) {
        ingest(data.places || []);
        return _places;
      })
      .catch(function (err) {
        console.warn('[DaxiPlacesCatalog] load failed', err);
        _ready = true;
        return [];
      })
      .finally(function () { _loading = null; });
    return _loading;
  }

  function search(query, limit) {
    limit = limit || 12;
    var q = normalize(query);
    if (q.length < 2) return [];
    var scored = [];
    for (var i = 0; i < _places.length; i++) {
      var p = _places[i];
      var st = p.search_text || p.description || '';
      if (!matches(q, st)) continue;
      scored.push({ s: score(q, p), p: p });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, limit).map(function (x) { return x.p; });
  }

  function getById(placeId) {
    return _byId[placeId] || null;
  }

  function ready() {
    return _ready;
  }

  global.DaxiPlacesCatalog = {
    load: load,
    search: search,
    getById: getById,
    isDaxiId: isDaxiId,
    isGoogleId: isGoogleId,
    ready: ready,
    normalize: normalize,
  };
})(window);