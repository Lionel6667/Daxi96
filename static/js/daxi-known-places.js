
(function (global) {
  'use strict';

  var AUTO_REUSE = 0.88;

  function fetchSimilar(label, lat, lng) {
    var url = '/api/places/similar/?label=' + encodeURIComponent(label)
      + '&lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng);
    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { candidates: [] }; })
      .then(function (data) { return (data && data.candidates) || []; })
      .catch(function () { return []; });
  }

  function promptReuseChoice(candidates, proposedLabel) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;';
      var card = document.createElement('div');
      card.style.cssText = 'background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:16px;max-width:420px;width:100%;padding:20px;color:#e5e7eb;font-family:system-ui,sans-serif;';
      card.innerHTML = '<div style="font-size:15px;font-weight:800;margin-bottom:8px;">Lieu similaire trouvé</div>'
        + '<div style="font-size:12px;color:#9ca3af;margin-bottom:14px;line-height:1.45;">'
        + 'Vous enregistrez <strong style="color:#fcd34d;">' + escapeHtml(proposedLabel) + '</strong>.'
        + ' Un lieu proche existe déjà dans DAXI :</div>'
        + '<div id="daxi-place-dup-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;"></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
        + '<button type="button" data-act="new" style="flex:1;min-width:120px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-weight:700;cursor:pointer;">Créer nouveau</button>'
        + '</div>';
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var list = card.querySelector('#daxi-place-dup-list');
      candidates.forEach(function (c) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'text-align:left;padding:12px;border-radius:10px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.1);color:#ecfdf5;cursor:pointer;';
        btn.innerHTML = '<div style="font-weight:800;font-size:13px;">' + escapeHtml(c.label) + '</div>'
          + '<div style="font-size:10px;color:#6ee7b7;margin-top:4px;">'
          + Math.round(c.distance_m) + ' m · similarité ' + Math.round((c.name_similarity || 0) * 100) + '%'
          + (c.use_count ? ' · utilisé ' + c.use_count + '×' : '')
          + '</div>';
        btn.addEventListener('click', function () {
          overlay.remove();
          resolve({ action: 'reuse', place_id: c.id });
        });
        list.appendChild(btn);
      });

      card.querySelector('[data-act="new"]').addEventListener('click', function () {
        overlay.remove();
        resolve({ action: 'new', force_new: true });
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.remove();
          resolve({ action: 'new', force_new: true });
        }
      });
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slotsNeedingPlacement(root) {
    return parseSlots(root).map(function (s) { return s.id; });
  }

  function placesFromFormData(body, prefix, orderId) {
    prefix = prefix || '';
    var places = [];
    var root = document.getElementById('daxi-coords-' + prefix + orderId);
    var openSlots = slotsNeedingPlacement(root);
    if (body.has('pickup_lat') && body.has('pickup_lng') && openSlots.indexOf('pickup') >= 0) {
      var plabel = body.get('pickup_label');
      if (!plabel) {
        var pel = document.getElementById(prefix + 'plabel-' + orderId);
        plabel = pel && pel.value ? pel.value.trim() : '';
      }
      if (plabel) {
        places.push({ slot: 'pickup', label: plabel, lat: body.get('pickup_lat'), lng: body.get('pickup_lng') });
      }
    }
    if (body.has('dest_lat') && body.has('dest_lng') && openSlots.indexOf('dest') >= 0) {
      var dlabel = body.get('destination_label');
      if (!dlabel) {
        var root = document.getElementById('daxi-coords-' + prefix + orderId);
        var del = root && root.querySelector('[data-coords-label-input="dest"]');
        dlabel = del && del.value ? del.value.trim() : '';
      }
      if (dlabel) {
        places.push({ slot: 'dest', label: dlabel, lat: body.get('dest_lat'), lng: body.get('dest_lng') });
      }
    }
    if (body.has('plan_stops_json')) {
      try {
        var stops = JSON.parse(body.get('plan_stops_json'));
        (stops || []).forEach(function (s, i) {
          if (!s || s.lat == null || s.lng == null || !s.label) return;
          if (openSlots.indexOf('stop-' + i) < 0) return;
          places.push({ slot: 'stop-' + i, label: String(s.label).trim(), lat: s.lat, lng: s.lng });
        });
      } catch (e) {  }
    }
    return places;
  }

  function resolvePlaceDecisions(places) {
    var decisions = [];
    var chain = Promise.resolve();
    places.forEach(function (p) {
      chain = chain.then(function () {
        return fetchSimilar(p.label, p.lat, p.lng).then(function (candidates) {
          if (!candidates.length) {
            decisions.push({ slot: p.slot, action: 'new' });
            return;
          }
          var best = candidates[0];
          if (best.confidence >= AUTO_REUSE) {
            decisions.push({ slot: p.slot, action: 'reuse', place_id: best.id });
            return;
          }
          var medium = candidates.filter(function (c) { return c.confidence >= 0.52; });
          if (!medium.length) {
            decisions.push({ slot: p.slot, action: 'new' });
            return;
          }
          return promptReuseChoice(medium, p.label).then(function (choice) {
            decisions.push(Object.assign({ slot: p.slot }, choice));
          });
        });
      });
    });
    return chain.then(function () { return decisions; });
  }

  function augmentCoordsFormData(body, prefix, orderId) {
    var places = placesFromFormData(body, prefix, orderId);
    if (!places.length) return Promise.resolve(body);
    return resolvePlaceDecisions(places).then(function (decisions) {
      if (decisions.length) body.append('known_place_decisions', JSON.stringify(decisions));
      return body;
    });
  }

  global.DaxiKnownPlaces = {
    augmentCoordsFormData: augmentCoordsFormData,
    fetchSimilar: fetchSimilar,
  };
})(typeof window !== 'undefined' ? window : this);