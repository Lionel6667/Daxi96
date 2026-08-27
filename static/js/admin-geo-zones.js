
(function (global) {

  'use strict';

  var _pollers = {};
  var _downloadModal = { slug: '', name: '', activate: false };

  function csrf() {
    return (typeof global.getCsrfToken === 'function') ? global.getCsrfToken() : '';
  }

  function adminFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = opts.headers || {};
    if (opts.method === 'POST') opts.headers['X-CSRFToken'] = csrf();
    return fetch(url, opts);
  }

  function formatEta(sec) {
    if (!sec || sec < 0) return '—';
    if (sec < 60) return sec + ' s';
    return Math.floor(sec / 60) + ' min';
  }

  function statusClass(status) {
    return 'geo-status-' + (status || 'none');
  }

  function renderProgressPanel(job, container) {
    if (!container) return;
    var pct = Math.min(100, Math.max(0, job.progress_pct || 0));
    var logsHtml = (job.logs || []).map(function (l) {
      var cls = l.level === 'error' ? 'text-red-400' : 'text-gray-400';
      return '<div class="' + cls + '">[' + (l.ts || '').slice(11, 19) + '] ' + (l.message || '') + '</div>';
    }).join('');

    var cancelBtn = (job.status === 'queued' || job.status === 'running')
      ? '<button type="button" onclick="adminGeoCancelJob(' + job.id + ')" class="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-[10px] font-bold border border-red-500/30"><i class="ri-stop-circle-line"></i> Annuler l\'import</button>'
      : '';

    var qtyLabel = job.quantity_label || 'Données';
    var doneLabel = job.progress_done_label != null ? job.progress_done_label : (job.bytes_done_mb || 0);
    var totalLabel = job.progress_total_label != null ? job.progress_total_label : (job.bytes_total_mb || '?');
    var speedLabel = (job.progress_unit === 'entities' && job.speed_eps)
      ? (job.speed_eps.toLocaleString('fr-FR') + ' ent./s')
      : ((job.speed_mbps || 0).toFixed(1) + ' Mo/s');

    container.classList.remove('hidden');
    container.innerHTML =
      '<div class="text-xs font-bold text-white mb-2">' + (job.zone_name || 'Zone') + ' — ' + (job.stage_display || job.stage) + '</div>'
      + '<div class="geo-progress-bar mb-2"><div class="geo-progress-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="grid grid-cols-2 gap-2 text-[10px] text-gray-400 mb-3">'
      + '<div>Progression <strong class="text-white">' + pct.toFixed(0) + '%</strong></div>'
      + '<div>Vitesse <strong class="text-white">' + speedLabel + '</strong></div>'
      + '<div>' + qtyLabel + ' <strong class="text-white">' + doneLabel + ' / ' + totalLabel + '</strong></div>'
      + '<div>Restant <strong class="text-white">' + formatEta(job.eta_seconds) + '</strong></div>'
      + '<div>Fichiers <strong class="text-white">' + (job.files_done || 0) + '/' + (job.files_total || 0) + '</strong></div>'
      + '<div>Statut <strong class="text-white">' + (job.status || '') + '</strong></div>'
      + '</div>'
      + (job.error_message ? '<div class="text-red-400 text-xs mb-2">' + job.error_message + '</div>' : '')
      + cancelBtn
      + '<div class="geo-logs-box bg-black/30 rounded-lg p-2 mt-2">' + (logsHtml || '<span class="text-gray-600">En attente de logs…</span>') + '</div>';

    var box = container.querySelector('.geo-logs-box');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function pollJob(jobId, zoneId) {
    if (_pollers[jobId]) return;
    var container = zoneId ? document.getElementById('geo-zone-progress-' + zoneId) : null;
    var modal = document.getElementById('geo-job-modal-body');

    function tick() {
      adminFetch('/htmx/admin/geo/jobs/' + jobId + '/')
        .then(function (r) { return r.json(); })
        .then(function (job) {
          if (container) renderProgressPanel(job, container);
          if (modal) renderProgressPanel(job, modal);

          if (job.status === 'completed') {
            clearInterval(_pollers[jobId]);
            delete _pollers[jobId];
            if (typeof global.showToast === 'function') global.showToast('Import terminé — ' + (job.zone_name || ''), 'success');
            loadAdminGeoZones(true);
          } else if (job.status === 'failed' || job.status === 'cancelled') {
            clearInterval(_pollers[jobId]);
            delete _pollers[jobId];
            if (job.status === 'failed' && typeof global.showToast === 'function') {
              global.showToast('Import échoué', 'error');
            }
            loadAdminGeoZones(true);
          }
        })
        .catch(function () {});
    }

    tick();
    _pollers[jobId] = setInterval(tick, 2000);
  }

  function startPollingFromDom(root) {
    if (!root) return;
    root.querySelectorAll('[data-geo-job-banner]').forEach(function (el) {
      var jid = parseInt(el.getAttribute('data-geo-job-banner'), 10);
      var zid = parseInt(el.getAttribute('data-geo-zone-id'), 10);
      if (jid) pollJob(jid, zid || null);
    });
    root.querySelectorAll('.geo-dept-card[data-active-job-id]').forEach(function (el) {
      var jid = parseInt(el.getAttribute('data-active-job-id'), 10);
      var zid = parseInt(el.getAttribute('data-zone-id'), 10);
      if (jid) pollJob(jid, zid || null);
    });
    root.querySelectorAll('[data-city-job-id]').forEach(function (el) {
      var jid = parseInt(el.getAttribute('data-city-job-id'), 10);
      var zid = parseInt(el.getAttribute('data-city-zone-id'), 10);
      if (jid && zid) pollJob(jid, zid);
    });
  }

  function loadAdminGeoZones(force) {
    var loader = document.getElementById('geo-htmx-loader');
    if (!loader) return;
    if (!force && loader.dataset.loaded === '1') return;

    loader.innerHTML = '<div class="text-center py-12"><i class="ri-loader-4-line animate-spin text-2xl text-gray-400"></i></div>';
    adminFetch('/htmx/admin/geo/zones/')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        loader.innerHTML = html;
        loader.dataset.loaded = '1';
        if (window.htmx) htmx.process(loader);
        refreshGeoStats();
        startPollingFromDom(loader);
      })
      .catch(function () {
        loader.innerHTML = '<p class="text-center py-8 text-red-400">Erreur de chargement — <button type="button" onclick="loadAdminGeoZones(true)" class="underline">réessayer</button></p>';
      });
  }

  function refreshGeoStats() {
    adminFetch('/api/geo/stats/').then(function (r) { return r.json(); }).then(function (s) {
      var el = document.getElementById('geo-stat-available');
      if (el) el.textContent = s.zones_available || 0;
      el = document.getElementById('geo-stat-places');
      if (el) el.textContent = s.places_published || 0;
      el = document.getElementById('geo-stat-roads');
      if (el) el.textContent = s.roads_published || 0;
    }).catch(function () {});
  }

  function adminGeoOpenDownloadModal(slug, name, activate) {
    _downloadModal = { slug: slug, name: name, activate: !!activate };
    var modal = document.getElementById('geo-download-modal');
    var body = document.getElementById('geo-download-modal-body');
    var title = document.getElementById('geo-download-modal-title');
    if (!modal || !body) return;

    if (title) title.textContent = (activate ? 'Activer & télécharger — ' : 'Télécharger OSM — ') + name;
    body.innerHTML = '<p class="text-xs text-gray-400"><i class="ri-loader-4-line animate-spin"></i> Chargement des villes…</p>';
    modal.classList.remove('hidden');

    adminFetch('/htmx/admin/geo/department-cities/' + slug + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cities = data.cities || [];
        var html = ''
          + '<label class="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer mb-2">'
          + '<input type="checkbox" id="geo-dl-all-dept" class="rounded geo-city-check">'
          + '<span class="text-sm font-bold text-emerald-300">Tout le département</span>'
          + '</label>'
          + '<p class="text-[10px] text-gray-500 mb-2">Ou sélectionnez une ou plusieurs villes :</p>'
          + '<div class="space-y-1" id="geo-dl-city-list">';

        cities.forEach(function (c) {
          var badge = '<span class="geo-status-badge ' + statusClass(c.geo_status) + ' text-[9px] px-1.5 py-0.5 rounded-full">' + (c.geo_status_display || '') + '</span>';
          html += '<label class="flex items-center gap-2 p-2 rounded-lg bg-black/20 cursor-pointer hover:bg-black/30">'
            + '<input type="checkbox" class="geo-dl-city rounded geo-city-check" value="' + c.slug + '">'
            + '<span class="text-xs text-gray-300 flex-1">' + c.name + '</span>'
            + badge
            + '</label>';
        });

        html += '</div>';
        if (!cities.length) {
          html = '<p class="text-xs text-amber-300">Aucune ville configurée — seul le téléchargement du département entier est disponible.</p>'
            + '<label class="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer mt-2">'
            + '<input type="checkbox" id="geo-dl-all-dept" class="rounded" checked>'
            + '<span class="text-sm font-bold text-emerald-300">Tout le département</span>'
            + '</label>';
        }
        body.innerHTML = html;

        var allCb = document.getElementById('geo-dl-all-dept');
        if (allCb) {
          allCb.addEventListener('change', function () {
            var cityCbs = body.querySelectorAll('.geo-dl-city');
            cityCbs.forEach(function (cb) {
              cb.disabled = allCb.checked;
              if (allCb.checked) cb.checked = false;
            });
          });
        }
      })
      .catch(function () {
        body.innerHTML = '<p class="text-xs text-red-400">Impossible de charger les villes.</p>';
      });
  }

  function adminGeoCloseDownloadModal() {
    var modal = document.getElementById('geo-download-modal');
    if (modal) modal.classList.add('hidden');
  }

  function adminGeoSubmitDownloadModal() {
    var slug = _downloadModal.slug;
    if (!slug) return;

    var allDept = false;
    var allCb = document.getElementById('geo-dl-all-dept');
    if (allCb) allDept = allCb.checked;

    var citySlugs = [];
    document.querySelectorAll('.geo-dl-city:checked').forEach(function (cb) {
      if (cb.value) citySlugs.push(cb.value);
    });

    if (!allDept && !citySlugs.length) {
      if (typeof global.showToast === 'function') global.showToast('Choisissez au moins une ville ou tout le département', 'error');
      return;
    }

    var submitBtn = document.getElementById('geo-download-modal-submit');
    if (submitBtn) submitBtn.disabled = true;

    adminFetch('/htmx/admin/geo/download-department/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: slug,
        all_department: allDept,
        cities: citySlugs,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (submitBtn) submitBtn.disabled = false;
        if (!res.ok || res.data.error) {
          if (typeof global.showToast === 'function') global.showToast(res.data.error || 'Erreur', 'error');
          return;
        }
        adminGeoCloseDownloadModal();
        var msg = 'Import démarré';
        if (res.data.zones_started && res.data.zones_started.length) {
          msg += ' — ' + res.data.zones_started.join(', ');
        }
        if (typeof global.showToast === 'function') global.showToast(msg, 'success');
        (res.data.jobs || []).forEach(function (j) {
          if (j.job_id) pollJob(j.job_id, j.zone_id);
        });
        loadAdminGeoZones(true);
      })
      .catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        if (typeof global.showToast === 'function') global.showToast('Erreur réseau', 'error');
      });
  }

  function adminGeoCancelJob(jobId) {
    if (!jobId) return;
    var confirmFn = (global.DaxiModal && global.DaxiModal.confirm)
      ? function (m, o) { return global.DaxiModal.confirm(m, o); }
      : function (m) { return Promise.resolve(global.confirm(m)); };

    confirmFn('Annuler cet import en cours ?', { okLabel: 'Annuler l\'import' }).then(function (ok) {
      if (!ok) return;
      adminFetch('/htmx/admin/geo/jobs/' + jobId + '/cancel/', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            if (typeof global.showToast === 'function') global.showToast(data.error, 'error');
            return;
          }
          if (_pollers[jobId]) {
            clearInterval(_pollers[jobId]);
            delete _pollers[jobId];
          }
          if (typeof global.showToast === 'function') global.showToast('Import annulé', 'info');
          loadAdminGeoZones(true);
        });
    });
  }

  function adminGeoActivateDepartment(slug) {
    adminGeoOpenDownloadModal(slug, slug, true);
  }

  function adminGeoDownloadDepartment(slug) {
    var card = document.querySelector('.geo-dept-card[data-dept-slug="' + slug + '"]');
    var name = card ? card.getAttribute('data-dept-name') || slug : slug;
    adminGeoOpenDownloadModal(slug, name, false);
  }

  function adminGeoStartImport(zoneId) {
    if (!zoneId) return;
    adminFetch('/htmx/admin/geo/zones/' + zoneId + '/import/', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          if (typeof global.showToast === 'function') global.showToast(data.error, 'error');
          return;
        }
        if (typeof global.showToast === 'function') global.showToast('Import démarré', 'info');
        pollJob(data.job_id, data.zone_id);
      });
  }

  function adminGeoWatchJob(jobId) {
    if (!jobId) return;
    var modal = document.getElementById('geo-job-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.getElementById('geo-job-modal-body').innerHTML = '<p class="text-gray-400 text-sm">Chargement…</p>';
    }
    pollJob(jobId);
  }

  function adminGeoDeactivateDepartment(slug) {
    if (!slug) return;
    var confirmFn = (global.DaxiModal && global.DaxiModal.confirm)
      ? function (m, o) { return global.DaxiModal.confirm(m, o); }
      : function (m) { return Promise.resolve(global.confirm(m)); };

    confirmFn(
      'Désactiver ce département ?\n\nLes imports en cours seront annulés. Les données cartographiques déjà téléchargées restent en base.',
      { okLabel: 'Désactiver' }
    ).then(function (ok) {
      if (!ok) return;
      adminFetch('/htmx/admin/geo/deactivate-department/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            if (typeof global.showToast === 'function') global.showToast(data.error, 'error');
            return;
          }
          if (typeof global.showToast === 'function') global.showToast('Département désactivé', 'info');
          loadAdminGeoZones(true);
        });
    });
  }

  global.loadAdminGeoZones = loadAdminGeoZones;
  global.adminGeoStartImport = adminGeoStartImport;
  global.adminGeoWatchJob = adminGeoWatchJob;
  global.adminGeoActivateDepartment = adminGeoActivateDepartment;
  global.adminGeoDownloadDepartment = adminGeoDownloadDepartment;
  global.adminGeoDeactivateDepartment = adminGeoDeactivateDepartment;
  global.adminGeoOpenDownloadModal = adminGeoOpenDownloadModal;
  global.adminGeoCloseDownloadModal = adminGeoCloseDownloadModal;
  global.adminGeoSubmitDownloadModal = adminGeoSubmitDownloadModal;
  global.adminGeoCancelJob = adminGeoCancelJob;

})(window);