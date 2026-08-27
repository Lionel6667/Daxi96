(function () {
  'use strict';

  var STATE = { meta: null, place: null, departments: [], categories: [], cities: [] };

  function csrf() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    if (el) return el.value;
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  async function api(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['X-CSRFToken'] = csrf();
    var res = await fetch(url, Object.assign({ credentials: 'same-origin', headers: headers }, opts));
    return res.json();
  }

  function slot() {
    return document.getElementById('ent-lieux-slot');
  }

  function fillCities(dept, selected) {
    var cityEl = document.getElementById('ent-lx-city');
    if (!cityEl) return;
    cityEl.innerHTML = '<option value="">Ville</option>' + STATE.cities.map(function (c) {
      var val = c.name;
      return '<option value="' + esc(val) + '"' + (selected === val || selected === c.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  }

  async function loadCities(dept, selected) {
    var deptObj = STATE.departments.find(function (d) { return d.slug === dept; });
    if (deptObj && deptObj.cities && deptObj.cities.length) {
      STATE.cities = deptObj.cities;
      fillCities(dept, selected);
      return;
    }
    if (!dept) {
      STATE.cities = [];
      fillCities('', selected);
      return;
    }
    var data = await api('/htmx/lieux/enterprise/cities/?department=' + encodeURIComponent(dept));
    STATE.cities = (data && data.cities) || [];
    fillCities(dept, selected);
  }

  function renderForm() {
    var box = slot();
    if (!box) return;
    var p = STATE.place || {};
    var ent = (STATE.meta && STATE.meta.enterprise) || {};
    var listed = p.id ? '' : '<p class="ent-lieux-intro">Publiez votre entreprise dans <strong>Lieux à visiter</strong>. Choisissez département et ville, ajoutez photos et description.</p>';
    var stats = '';
    if (p.id) {
      stats = '<div class="ent-lieux-stats">' +
        '<span><i class="ri-shopping-bag-3-line"></i> ' + (p.booking_count || 0) + ' commandes</span>' +
        '<span><i class="ri-links-line"></i> ' + (p.link_clicks || 0) + ' clics lien</span>' +
        '<span><i class="ri-fire-line"></i> Score ' + (p.activity_score || 0) + '</span>' +
        (p.is_listed === false ? '<span class="ent-lieux-muted"><i class="ri-eye-off-line"></i> Retiré par l\'admin</span>' : '') +
        '</div>';
    }
    var gpsNote = ent.has_gps
      ? '<p class="ent-lieux-hint ent-lieux-hint--ok"><i class="ri-map-pin-2-fill"></i> GPS entreprise disponible — vous pouvez l\'utiliser pour le taxi.</p>'
      : '<p class="ent-lieux-hint"><i class="ri-map-pin-time-line"></i> Ajoutez votre emplacement entreprise pour activer le taxi vers votre adresse.</p>';

    box.innerHTML = listed + stats + gpsNote +
      '<div class="ent-lieux-form">' +
      '<input id="ent-lx-name" type="text" placeholder="Nom affiché" value="' + esc(p.name || ent.name || '') + '">' +
      '<div class="ent-lieux-row"><select id="ent-lx-dept"></select><select id="ent-lx-city"></select></div>' +
      '<select id="ent-lx-category"></select>' +
      '<input id="ent-lx-address" type="text" placeholder="Adresse précise (visible uniquement dans le détail)" value="' + esc(p.address || '') + '">' +
      '<input id="ent-lx-hours" type="text" placeholder="Horaires — ex. Lun–Sam 8h–22h" value="' + esc(p.hours || '') + '">' +
      '<textarea id="ent-lx-desc" rows="4" placeholder="Description qui donne envie de venir…">' + esc(p.description || '') + '</textarea>' +
      '<label class="ent-lieux-file">Photo de couverture<input id="ent-lx-cover" type="file" accept="image/*"></label>' +
      '<label class="ent-lieux-file">Galerie<input id="ent-lx-photos" type="file" accept="image/*" multiple></label>' +
      '<div id="ent-lx-gallery" class="ent-lieux-gallery"></div>' +
      '<label class="ent-lieux-check"><input id="ent-lx-published" type="checkbox"' + (p.is_published ? ' checked' : '') + '> Publier dans Lieux à visiter</label>' +
      (ent.has_gps ? '<button type="button" class="ent-lieux-sync" id="ent-lx-sync-gps"><i class="ri-focus-3-line"></i> Utiliser le GPS de mon entreprise</button>' : '') +
      '<button type="button" class="ent-lieux-save" onclick="entLxSave()"><i class="ri-save-3-line"></i> Enregistrer mon lieu</button>' +
      '</div>';

    var deptEl = document.getElementById('ent-lx-dept');
    deptEl.innerHTML = '<option value="">Département</option>' + STATE.departments.map(function (d) {
      return '<option value="' + esc(d.slug) + '"' + (p.department === d.slug ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    deptEl.onchange = function () { loadCities(deptEl.value, ''); };

    var catEl = document.getElementById('ent-lx-category');
    catEl.innerHTML = '<option value="">Catégorie</option>' + STATE.categories.map(function (c) {
      return '<option value="' + c.id + '"' + (p.category_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var gal = document.getElementById('ent-lx-gallery');
    gal.innerHTML = (p.photos || []).map(function (ph) {
      return '<div class="ent-lieux-gal-item"><img src="' + ph.url + '" alt=""><button type="button" onclick="entLxDelPhoto(' + ph.id + ')">×</button></div>';
    }).join('');

    loadCities(p.department || '', p.city || '');

    var syncBtn = document.getElementById('ent-lx-sync-gps');
    if (syncBtn) {
      syncBtn.onclick = function () {
        syncBtn.disabled = true;
        syncBtn.textContent = 'GPS sera appliqué à l\'enregistrement';
      };
    }
  }

  window.entLxDelPhoto = async function (id) {
    if (!confirm('Supprimer cette photo ?')) return;
    await api('/htmx/lieux/enterprise/photo/' + id + '/delete/', { method: 'POST' });
    window.loadEntLieux();
  };

  window.entLxSave = async function () {
    var fd = new FormData();
    fd.append('name', (document.getElementById('ent-lx-name') || {}).value || '');
    fd.append('department', (document.getElementById('ent-lx-dept') || {}).value || '');
    fd.append('city', (document.getElementById('ent-lx-city') || {}).value || '');
    fd.append('category_id', (document.getElementById('ent-lx-category') || {}).value || '');
    fd.append('address', (document.getElementById('ent-lx-address') || {}).value || '');
    fd.append('hours', (document.getElementById('ent-lx-hours') || {}).value || '');
    fd.append('description', (document.getElementById('ent-lx-desc') || {}).value || '');
    fd.append('is_published', (document.getElementById('ent-lx-published') || {}).checked ? '1' : '0');
    var syncBtn = document.getElementById('ent-lx-sync-gps');
    if (syncBtn && syncBtn.disabled) fd.append('sync_enterprise_gps', '1');
    var cover = document.getElementById('ent-lx-cover');
    if (cover && cover.files[0]) fd.append('cover', cover.files[0]);
    var photos = document.getElementById('ent-lx-photos');
    if (photos) {
      for (var i = 0; i < photos.files.length; i++) fd.append('photos', photos.files[i]);
    }
    var data = await api('/htmx/lieux/enterprise/save/', { method: 'POST', body: fd });
    if (!data.ok) {
      alert(data.error || 'Erreur');
      return;
    }
    if (typeof showToast === 'function') showToast('Lieu enregistré');
    else alert('Lieu enregistré');
    STATE.place = data.place;
    renderForm();
  };

  window.loadEntLieux = async function () {
    var box = slot();
    if (!box) return;
    box.innerHTML = '<div class="empty-state"><i class="ri-loader-4-line ent-spin"></i> Chargement…</div>';
    var meta = await api('/htmx/lieux/enterprise/meta/');
    if (!meta.ok) {
      box.innerHTML = '<div class="empty-state">Accès refusé</div>';
      return;
    }
    STATE.meta = meta;
    STATE.departments = meta.departments || [];
    STATE.categories = meta.categories || [];
    var data = await api('/htmx/lieux/enterprise/');
    STATE.place = data.place;
    renderForm();
  };
})();
