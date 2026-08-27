
(function(global) {
  'use strict';

  var PLAN_ICONS = { '1': 'ri-road-map-line', '2': 'ri-time-line', '3': 'ri-sun-line', '4': 'ri-moon-line', '5': 'ri-flight-land-line', '6': 'ri-vip-crown-line' };
  var carouselAbort = null;

  var PLAN_WIZARD = {
    1: [
      ['ep1-departure', 'ep1-destination'],
      ['ep1-date', 'ep1-time', 'ep1-passengers'],
      ['submit']
    ],
    2: [
      ['ep2-departure'],
      ['ep2-date', 'ep2-time', 'ep2-destination', 'ep2-passengers'],
      ['submit']
    ],
    3: [
      ['ep3-departure'],
      ['ep3-date', 'ep3-time', 'ep3-destination', 'ep3-passengers'],
      ['submit']
    ],
    4: [
      ['ep4-departure', 'ep4-occasion'],
      ['ep4-date', 'ep4-time', 'ep4-destination', 'ep4-passengers'],
      ['submit']
    ],
    5: [
      ['ep5-sign-name', 'ep5-arrival-date', 'ep5-arrival-time'],
      ['ep5-destination', 'ep5-passengers'],
      ['submit']
    ],
    6: [
      ['ep6-departure', 'ep6-frequency'],
      ['ep6-destination', 'ep6-notes'],
      ['submit']
    ]
  };

  function $(id) { return document.getElementById(id); }

  function getCatalog() {
    var el = $('ent-plans-catalog-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent || '{}'); } catch (e) { return null; }
  }

  function loadCatalogFromApi() {
    var embedded = getCatalog();
    if (embedded && Object.keys(embedded).length) {
      return Promise.resolve(embedded);
    }
    return fetch('/api/client/service-plans/?lang=fr', { credentials: 'same-origin' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.plans) return data.plans;
        return embedded || {};
      })
      .catch(function() { return embedded || {}; });
  }

  function fieldWrap(id) {
    var input = $(id);
    if (!input) return null;
    return input.closest('.form-group') || input.closest('.form-row') || input.parentElement;
  }

  function initEntPlanWizard(n) {
    var modal = $('ent-plan-modal-' + n);
    var steps = PLAN_WIZARD[n];
    if (!modal || !steps || modal.dataset.wizardReady) return;

    var panels = [];
    steps.forEach(function(group, idx) {
      var panel = document.createElement('div');
      panel.className = 'ent-plan-step-panel';
      panel.dataset.step = String(idx + 1);
      if (idx > 0) panel.hidden = true;
      group.forEach(function(fid) {
        if (fid === 'submit') {
          var btn = modal.querySelector('.ent-submit-btn');
          if (btn) panel.appendChild(btn);
          return;
        }
        var wrap = fieldWrap(fid);
        if (wrap) panel.appendChild(wrap);
      });
      modal.querySelector('.plan-modal-sheet').appendChild(panel);
      panels.push(panel);
    });

    var nav = document.createElement('div');
    nav.className = 'ent-plan-wizard-nav';
    nav.innerHTML = '<button type="button" class="ent-plan-wizard-back" style="display:none">Retour</button>'
      + '<button type="button" class="ent-plan-wizard-next">Continuer</button>';
    modal.querySelector('.plan-modal-sheet').appendChild(nav);

    var stepIdx = 0;
    var stepEls = modal.querySelectorAll('.ent-plan-step');
    var backBtn = nav.querySelector('.ent-plan-wizard-back');
    var nextBtn = nav.querySelector('.ent-plan-wizard-next');

    function syncSteps() {
      panels.forEach(function(p, i) { p.hidden = i !== stepIdx; });
      for (var i = 0; i < stepEls.length; i++) {
        stepEls[i].classList.toggle('active', i === stepIdx);
        stepEls[i].classList.toggle('done', i < stepIdx);
      }
      backBtn.style.display = stepIdx > 0 ? '' : 'none';
      nextBtn.textContent = stepIdx >= panels.length - 1 ? 'Confirmer' : 'Continuer';
    }

    function validateStep() {
      var ids = steps[stepIdx].filter(function(x) { return x !== 'submit'; });
      for (var i = 0; i < ids.length; i++) {
        var input = $(ids[i]);
        if (!input) continue;
        if (input.hasAttribute('required') && !input.value.trim()) {
          input.focus();
          return false;
        }
      }
      return true;
    }

    backBtn.onclick = function() {
      if (stepIdx > 0) { stepIdx--; syncSteps(); }
    };
    nextBtn.onclick = function() {
      if (!validateStep()) return;
      if (stepIdx >= panels.length - 1) {
        if (typeof global.submitEntPlan === 'function') global.submitEntPlan(n);
        return;
      }
      stepIdx++;
      syncSteps();
    };

    modal.dataset.wizardReady = '1';
    modal.dataset.wizardStep = '0';
    syncSteps();
  }

  function resetEntPlanWizard(n) {
    var modal = $('ent-plan-modal-' + n);
    if (!modal || !modal.dataset.wizardReady) return;
    var panels = modal.querySelectorAll('.ent-plan-step-panel');
    for (var i = 0; i < panels.length; i++) panels[i].hidden = i !== 0;
    var stepEls = modal.querySelectorAll('.ent-plan-step');
    for (var j = 0; j < stepEls.length; j++) {
      stepEls[j].classList.toggle('active', j === 0);
      stepEls[j].classList.remove('done');
    }
    var backBtn = modal.querySelector('.ent-plan-wizard-back');
    var nextBtn = modal.querySelector('.ent-plan-wizard-next');
    if (backBtn) backBtn.style.display = 'none';
    if (nextBtn) nextBtn.textContent = 'Continuer';
  }

  
  global.initEntPlansCarousel = function() {
    var stage = $('entPlansStage');
    if (!stage) return;
    var plansContainer = $('entPlansContainer');
    var planCards = stage.querySelectorAll('.plan-card');
    var dots = stage.querySelectorAll('#entPlansDots .dot');
    var leftArrow = stage.querySelector('.nav-arrow.left');
    var rightArrow = stage.querySelector('.nav-arrow.right');
    if (!plansContainer || !planCards.length) return;

    if (carouselAbort) {
      carouselAbort.abort();
      carouselAbort = null;
    }
    carouselAbort = new AbortController();
    var signal = carouselAbort.signal;

    var total = planCards.length;
    var current = 0;
    var isProgrammatic = false;
    var scrollTimer = null;
    var autoTimer = null;
    var autoDelay = 4500;

    function scrollToCenter(index, behavior) {
      var card = planCards[index];
      if (!card) return;
      var target = card.offsetLeft - (plansContainer.clientWidth - card.offsetWidth) / 2;
      isProgrammatic = true;
      plansContainer.scrollTo({ left: Math.max(0, target), behavior: behavior || 'smooth' });
      setTimeout(function() { isProgrammatic = false; }, behavior === 'smooth' ? 520 : 80);
    }

    function nearestIndex() {
      var center = plansContainer.scrollLeft + plansContainer.clientWidth / 2;
      var best = 0, bestDist = Infinity;
      for (var i = 0; i < planCards.length; i++) {
        var card = planCards[i];
        var d = Math.abs((card.offsetLeft + card.offsetWidth / 2) - center);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    }

    function setActive(index, behavior) {
      if (index < 0) index = total - 1;
      if (index >= total) index = 0;
      current = index;
      for (var i = 0; i < planCards.length; i++) {
        planCards[i].classList.toggle('active', i === index);
      }
      for (var j = 0; j < dots.length; j++) {
        dots[j].classList.toggle('active', j === index);
      }
      var lbl = $('entPlansRailLabel');
      var fill = $('entPlansRailFill');
      if (lbl) lbl.textContent = (index + 1) + ' / ' + total;
      if (fill) fill.style.width = Math.round(((index + 1) / total) * 100) + '%';
      scrollToCenter(index, behavior);
    }

    function startAuto() {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = setInterval(function() {
        setActive(current + 1, 'smooth');
      }, autoDelay);
    }

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    plansContainer.addEventListener('scroll', function() {
      if (isProgrammatic) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() { setActive(nearestIndex(), 'smooth'); }, 90);
    }, { passive: true, signal: signal });

    plansContainer.addEventListener('touchstart', stopAuto, { passive: true, signal: signal });
    plansContainer.addEventListener('mousedown', stopAuto, { signal: signal });
    stage.addEventListener('mouseenter', stopAuto, { signal: signal });
    stage.addEventListener('mouseleave', startAuto, { signal: signal });

    if (leftArrow) {
      leftArrow.onclick = function() { stopAuto(); setActive(current - 1, 'smooth'); };
    }
    if (rightArrow) {
      rightArrow.onclick = function() { stopAuto(); setActive(current + 1, 'smooth'); };
    }
    for (var d = 0; d < dots.length; d++) {
      (function(idx) { dots[idx].onclick = function() { stopAuto(); setActive(idx, 'smooth'); }; })(d);
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        setActive(0, 'auto');
        startAuto();
      });
    });
  };

  
  function renderPlanDetail(planId, data) {
    var hero = $('entPlanDetailHero');
    var title = $('entPlanDetailTitle');
    var sub = $('entPlanDetailSub');
    var price = $('entPlanDetailPrice');
    var desc = $('entPlanDetailDesc');
    var ctaDesc = $('entPlanDetailCtaDesc');
    var featGrid = $('entPlanDetailFeatures');
    var galGrid = $('entPlanDetailGallery');
    var icon = $('entPlanDetailIcon');

    var heroPath = (data.hero || '').replace(/^\//, '');
    if (hero) hero.style.backgroundImage = "linear-gradient(135deg,rgba(0,0,0,.55),rgba(0,0,0,.2)),url('/" + heroPath + "')";
    if (title) title.textContent = data.title || '';
    if (sub) sub.textContent = data.subtitle || '';
    if (price) price.textContent = data.price || '';
    if (desc) desc.textContent = data.description || '';
    if (ctaDesc) ctaDesc.textContent = data.ctaDesc || '';
    if (icon) icon.innerHTML = '<i class="' + (PLAN_ICONS[String(planId)] || 'ri-star-line') + '"></i>';

    if (featGrid) {
      featGrid.innerHTML = '';
      (data.features || []).forEach(function(f) {
        var card = document.createElement('div');
        card.className = 'ent-pd-feature';
        card.innerHTML = '<div class="ent-pd-feature-icon"><i class="' + (f.icon || 'ri-check-line') + '"></i></div>'
          + '<div><div class="ent-pd-feature-title">' + f.title + '</div><div class="ent-pd-feature-desc">' + f.desc + '</div></div>';
        featGrid.appendChild(card);
      });
    }

    if (galGrid) {
      galGrid.innerHTML = '';
      (data.gallery || []).forEach(function(src) {
        var img = document.createElement('img');
        img.src = '/' + String(src).replace(/^\//, '');
        img.alt = data.title || '';
        img.className = 'ent-pd-gallery-img';
        img.loading = 'lazy';
        img.onclick = function() {
          var viewer = $('entPlanImageViewer');
          var vimg = $('entPlanViewerImg');
          if (viewer && vimg) { vimg.src = img.src; viewer.classList.add('show'); }
        };
        galGrid.appendChild(img);
      });
    }

    var bookBtn = $('entPlanDetailBookBtn');
    if (bookBtn) {
      bookBtn.onclick = function() {
        global.closeEntPlanDetailModal();
        global.openEntPlanBookModal(planId);
      };
      bookBtn.innerHTML = (data.pricing_mode === 'fixed' || planId === '5')
        ? '<i class="ri-calendar-check-line"></i> Réserver ce plan'
        : '<i class="ri-calendar-check-line"></i> Commander ce service';
    }

    global.__entCurrentPlanDetail = String(planId);
  }

  global.openEntPlanModal = function(planId) {
    planId = String(planId);
    loadCatalogFromApi().then(function(catalog) {
      var data = catalog && (catalog[planId] || (catalog.plans && catalog.plans[planId]));
      if (!data) return;
      renderPlanDetail(planId, data);
      var modal = $('ent-plan-detail-modal');
      if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        modal.scrollTop = 0;
      }
    });
  };

  global.closeEntPlanDetailModal = function() {
    var modal = $('ent-plan-detail-modal');
    if (modal) modal.classList.remove('show');
    var viewer = $('entPlanImageViewer');
    if (viewer) viewer.classList.remove('show');
    document.body.style.overflow = '';
  };

  global.openEntPlanBookModal = function(n) {
    n = Number(n);
    var m = $('ent-plan-modal-' + n);
    if (m) {
      initEntPlanWizard(n);
      resetEntPlanWizard(n);
      m.classList.add('show');
      document.body.style.overflow = 'hidden';
      global._entInitPlanAcFields(n);
    }
  };

  global.closeEntPlanModal = function(n) {
    var m = $('ent-plan-modal-' + n);
    if (m) m.classList.remove('show');
    if (!$('ent-plan-detail-modal') || !$('ent-plan-detail-modal').classList.contains('show')) {
      document.body.style.overflow = '';
    }
  };

  global._entInitPlanAcFields = function(n) {
    if (global.EntPlaces && typeof global.EntPlaces.refresh === 'function') {
      global.EntPlaces.refresh();
      return;
    }
    if (!global.google || !global.google.maps || !global.google.maps.places) return;
    var fields = [];
    if (n === 1) fields = ['ep1-departure', 'ep1-destination'];
    else if (n === 2) fields = ['ep2-departure'];
    else if (n === 3) fields = ['ep3-departure'];
    else if (n === 4) fields = ['ep4-departure'];
    else if (n === 5) fields = ['ep5-destination'];
    fields.forEach(function(fid) {
      var input = $(fid);
      if (!input || input.dataset.acInit) return;
      input.dataset.acInit = '1';
      var ac = new google.maps.places.Autocomplete(input, { componentRestrictions: { country: 'ht' }, fields: ['geometry', 'formatted_address', 'name'] });
      ac.addListener('place_changed', function() {
        var place = ac.getPlace();
        if (!place.geometry) return;
        var lat = $(fid + '-lat'), lng = $(fid + '-lng');
        if (lat) lat.value = place.geometry.location.lat();
        if (lng) lng.value = place.geometry.location.lng();
      });
    });
  };

  document.addEventListener('DOMContentLoaded', function() {
    var closeBtn = $('entPlanDetailClose');
    if (closeBtn) closeBtn.onclick = global.closeEntPlanDetailModal;
    var viewer = $('entPlanImageViewer');
    var viewerClose = $('entPlanViewerClose');
    if (viewerClose) viewerClose.onclick = function() { if (viewer) viewer.classList.remove('show'); };
    if (viewer) viewer.onclick = function(e) { if (e.target === viewer) viewer.classList.remove('show'); };

    document.querySelectorAll('.plan-modal-overlay').forEach(function(m) {
      m.addEventListener('click', function(e) {
        if (e.target === m) {
          m.classList.remove('show');
          if (!$('ent-plan-detail-modal') || !$('ent-plan-detail-modal').classList.contains('show')) {
            document.body.style.overflow = '';
          }
        }
      });
    });
  });

})(window);