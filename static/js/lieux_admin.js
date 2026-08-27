(function () {
  'use strict';
  var STATE = { places: [], categories: [], enterprises: [], editingId: null };

  function csrf() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    if (el) return el.value;
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function api(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) headers['X-CSRFToken'] = csrf();
    else headers['X-CSRFToken'] = csrf();
    var res = await fetch(url, Object.assign({ credentials: 'same-origin', headers: headers }, opts));
    return res.json();
  }

  window.loadLieuxAdmin = async function () {
    var data = await api('/htmx/lieux/admin/');
    if (!data.ok) return;
    STATE.places = data.places || [];
    STATE.categories = data.categories || [];
    STATE.enterprises = data.enterprises || [];
    renderLieuxList();
    renderLieuxCats();
  };

  function renderLieuxCats() {
    var box = document.getElementById('lx-admin-cats');
    if (!box) return;
    if (!STATE.categories.length) {
      box.innerHTML = '<p class="text-xs text-gray-400">Aucune catégorie.</p>';
      return;
    }
    box.innerHTML = STATE.categories.map(function (c) {
      return '<div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-900">' +
        '<i class="' + escapeHtml(c.icon || 'ri-map-pin-2-fill') + '" style="color:' + escapeHtml(c.color || '#c27803') + ';font-size:18px"></i>' +
        '<div class="flex-1 min-w-0"><div class="text-sm font-bold text-white">' + escapeHtml(c.name) + '</div>' +
        '<div class="text-[11px] text-gray-500">' + escapeHtml(c.slug || '') + '</div></div>' +
        '<button type="button" class="px-3 py-1 rounded-lg bg-red-700 text-xs font-bold" onclick="lxCatDelete(' + c.id + ')">Supprimer</button></div>';
    }).join('');
  }

  window.lxCatCreate = async function () {
    var nameEl = document.getElementById('lx-new-cat-name');
    var iconEl = document.getElementById('lx-new-cat-icon');
    var colorEl = document.getElementById('lx-new-cat-color');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) { alert('Nom de catégorie obligatoire.'); return; }
    var fd = new FormData();
    fd.append('name', name);
    fd.append('icon', iconEl && iconEl.value.trim() ? iconEl.value.trim() : 'ri-map-pin-2-fill');
    fd.append('color', colorEl ? colorEl.value : '#c27803');
    fd.append('is_active', '1');
    var data = await api('/htmx/lieux/admin/category/save/', { method: 'POST', body: fd });
    if (!data.ok) { alert(data.error || 'Erreur'); return; }
    if (nameEl) nameEl.value = '';
    if (iconEl) iconEl.value = '';
    loadLieuxAdmin();
  };

  window.lxCatDelete = async function (id) {
    if (!confirm('Supprimer cette catégorie ? Les lieux associés resteront sans catégorie.')) return;
    await api('/htmx/lieux/admin/category/' + id + '/delete/', { method: 'POST' });
    loadLieuxAdmin();
  };

  function renderLieuxList() {
    var box = document.getElementById('lx-admin-list');
    if (!box) return;
    if (!STATE.places.length) {
      box.innerHTML = '<p class="text-sm text-gray-400">Aucun lieu. Ajoute le premier restaurant, hôtel ou marché.</p>';
      return;
    }
    box.innerHTML = STATE.places.map(function (p) {
      var img = p.cover ? '<img src="' + p.cover + '" alt="">' : '<div style="width:84px;height:84px;border-radius:12px;background:#1e293b;flex-shrink:0"></div>';
      return '<div class="lx-admin-card">' + img +
        '<div style="flex:1;min-width:0"><div class="font-bold text-white">' + escapeHtml(p.name) +
        (p.featured ? ' · <span class="text-amber-400">Coup de cœur</span>' : '') + '</div>' +
        '<div class="text-xs text-gray-400">' + escapeHtml(p.category_name || 'Sans catégorie') + ' · ' + escapeHtml(p.address || '') + '</div>' +
        '<div class="text-xs mt-1">' + (p.is_published ? '<span class="text-green-400">Publié</span>' : '<span class="text-amber-400">Brouillon</span>') + '</div></div>' +
        '<div class="flex flex-col gap-2"><button type="button" class="px-3 py-1 rounded-lg bg-slate-700 text-xs font-bold" onclick="lxEdit(' + p.id + ')">Éditer</button>' +
        '<button type="button" class="px-3 py-1 rounded-lg bg-red-700 text-xs font-bold" onclick="lxDelete(' + p.id + ')">Supprimer</button></div></div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function lxSetCoords(lat, lng) {
    var latEl = document.getElementById('lx-lat');
    var lngEl = document.getElementById('lx-lng');
    if (latEl) latEl.value = Number(lat).toFixed(6);
    if (lngEl) lngEl.value = Number(lng).toFixed(6);
  }

  function lxInitMap(lat, lng) {
    var el = document.getElementById('lx-map');
    if (!el || !window.google || !google.maps) return;
    var has = isFinite(lat) && isFinite(lng);
    var center = { lat: has ? Number(lat) : 19.7586, lng: has ? Number(lng) : -72.2014 };
    if (!STATE.map) {
      STATE.map = new google.maps.Map(el, {
        zoom: has ? 16 : 13,
        center: center,
        mapTypeControl: false,
        streetViewControl: false,
      });
      STATE.marker = new google.maps.Marker({
        map: STATE.map,
        draggable: true,
        position: center,
      });
      STATE.map.addListener('click', function (e) {
        STATE.marker.setPosition(e.latLng);
        lxSetCoords(e.latLng.lat(), e.latLng.lng());
      });
      STATE.marker.addListener('dragend', function () {
        var p = STATE.marker.getPosition();
        lxSetCoords(p.lat(), p.lng());
      });
    } else {
      google.maps.event.trigger(STATE.map, 'resize');
      STATE.map.setCenter(center);
      STATE.map.setZoom(has ? 16 : 13);
      STATE.marker.setPosition(center);
    }
    if (has) lxSetCoords(lat, lng);
  }

  window.lxNew = function () {
    STATE.editingId = null;
    fillForm({});
    document.getElementById('lx-admin-editor').classList.remove('hidden');
    setTimeout(function () { lxInitMap(NaN, NaN); }, 80);
  };

  window.lxEdit = function (id) {
    var p = STATE.places.find(function (x) { return x.id === id; });
    if (!p) return;
    STATE.editingId = id;
    fillForm(p);
    document.getElementById('lx-admin-editor').classList.remove('hidden');
    document.getElementById('lx-admin-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { lxInitMap(p.latitude, p.longitude); }, 80);
  };

  window.lxCancel = function () {
    document.getElementById('lx-admin-editor').classList.add('hidden');
    STATE.editingId = null;
  };

  window.lxDelete = async function (id) {
    if (!confirm('Supprimer ce lieu ?')) return;
    await api('/htmx/lieux/admin/' + id + '/delete/', { method: 'POST' });
    loadLieuxAdmin();
  };

  function fillForm(p) {
    document.getElementById('lx-name').value = p.name || '';
    document.getElementById('lx-address').value = p.address || '';
    document.getElementById('lx-hours').value = p.hours || '';
    document.getElementById('lx-desc').value = p.description || '';
    document.getElementById('lx-lat').value = p.latitude || '';
    document.getElementById('lx-lng').value = p.longitude || '';
    document.getElementById('lx-published').checked = p.is_published !== false;
    document.getElementById('lx-featured').checked = !!p.featured;
    var cat = document.getElementById('lx-category');
    cat.innerHTML = '<option value="">Catégorie</option>' + STATE.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (p.category_id === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
    }).join('');
    var ent = document.getElementById('lx-enterprise');
    ent.innerHTML = '<option value="">Entreprise partenaire (optionnel)</option>' + STATE.enterprises.map(function (e) {
      return '<option value="' + e.id + '"' + (p.enterprise_id === e.id ? ' selected' : '') + '>' + escapeHtml(e.name) + '</option>';
    }).join('');
    var gal = document.getElementById('lx-gallery');
    gal.innerHTML = (p.photos || []).map(function (ph) {
      return '<div class="relative"><img src="' + ph.url + '" style="width:72px;height:72px;object-fit:cover;border-radius:8px"><button type="button" class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs" onclick="lxDelPhoto(' + ph.id + ')">×</button></div>';
    }).join('');
  }

  window.lxDelPhoto = async function (id) {
    await api('/htmx/lieux/admin/photo/' + id + '/delete/', { method: 'POST' });
    loadLieuxAdmin().then(function () { if (STATE.editingId) lxEdit(STATE.editingId); });
  };

  window.lxSave = async function () {
    if (!document.getElementById('lx-lat').value || !document.getElementById('lx-lng').value) {
      alert('Place le lieu sur la carte avant d’enregistrer.');
      return;
    }
    var fd = new FormData();
    fd.append('name', document.getElementById('lx-name').value);
    fd.append('address', document.getElementById('lx-address').value);
    fd.append('hours', document.getElementById('lx-hours').value);
    fd.append('description', document.getElementById('lx-desc').value);
    fd.append('latitude', document.getElementById('lx-lat').value);
    fd.append('longitude', document.getElementById('lx-lng').value);
    fd.append('category_id', document.getElementById('lx-category').value);
    fd.append('enterprise_id', document.getElementById('lx-enterprise').value);
    fd.append('is_published', document.getElementById('lx-published').checked ? '1' : '0');
    fd.append('featured', document.getElementById('lx-featured').checked ? '1' : '0');
    var cover = document.getElementById('lx-cover').files[0];
    if (cover) fd.append('cover', cover);
    var photos = document.getElementById('lx-photos').files;
    for (var i = 0; i < photos.length; i++) fd.append('photos', photos[i]);
    var url = STATE.editingId ? '/htmx/lieux/admin/' + STATE.editingId + '/save/' : '/htmx/lieux/admin/save/';
    var data = await api(url, { method: 'POST', body: fd });
    if (!data.ok) { alert(data.error || 'Erreur'); return; }
    document.getElementById('lx-cover').value = '';
    document.getElementById('lx-photos').value = '';
    lxCancel();
    loadLieuxAdmin();
  };
})();
