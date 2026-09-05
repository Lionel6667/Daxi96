(function (global) {
  'use strict';

  var loaded = false;
  var loading = null;
  var v = function () { return global._DAXI_ASSET_V || '20260902t'; };

  var CHUNKS = [
    '/static/js/vubez2/vubez2-inline-04.js',
    '/static/js/vubez2/vubez2-inline-06.js',
    '/static/js/vubez2/vubez2-inline-07.js'
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + '?v=' + v();
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('chunk failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = CHUNKS.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      loaded = true;
      try {
        global.dispatchEvent(new Event('daxi:vubez2-ready'));
      } catch (e) {}
      if (typeof global._daxiLazyLoadPlaces === 'function') {
        global._daxiLazyLoadPlaces();
      }
    }).catch(function () {
      loading = null;
    });
    return loading;
  }

  global._daxiEnsureVubez2Chunks = ensure;

  function stub(name) {
    var impl = function () {
      var args = arguments;
      var self = this;
      return ensure().then(function () {
        var fn = global[name];
        if (fn && fn !== impl && typeof fn === 'function') {
          return fn.apply(self, args);
        }
      });
    };
    impl._daxiStub = true;
    global[name] = impl;
  }

  [
    'tabGoBook', 'tabGoOrders', 'tabGoTarif', 'tabGoAccount',
    'openPlanModal', 'toggleAssistanceFab',
    'handleTouristAttractions', 'initPlacesAutocomplete',
    'openSidebar', 'closeSidebar',
    'openSidebarExplorer', 'openSidebarLieux', 'openSidebarRoutes',
    'openSidebarReviews', 'openSidebarOrders', 'openSidebarLostObject',
    'openFullscreenBlog', 'closeFullscreenBlog',
    'sharePlanLink', 'switchOrdersTab', 'daxiPageBack',
    'toggleClientMapTilt', 'openDaxiPage'
  ].forEach(stub);

  /* ---- Early closePlanModal (must work before chunk 04 loads) ---- */
  function earlyClosePlanModal(skipBlock) {
    var modal = document.getElementById('planDetailModal');
    if (!modal) return;
    modal.classList.add('hide');
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    modal.style.pointerEvents = 'none';
    document.body.style.overflow = '';
    if (!skipBlock) global.__preventOpenOrderModalUntil = Date.now() + 400;
    setTimeout(function () {
      modal.classList.remove('hide');
      modal.style.display = '';
      modal.style.opacity = '';
      modal.style.visibility = '';
      modal.style.pointerEvents = '';
    }, 50);
  }
  global.closePlanModal = earlyClosePlanModal;

  /* ---- Early Android / system back (before chunk 07) ---- */
  function _isVisibleOverlay(el) {
    if (!el) return false;
    if (el.classList && (el.classList.contains('show') || el.classList.contains('active') || el.classList.contains('is-on') || el.classList.contains('open'))) return true;
    var d = el.style && el.style.display;
    if (d && d !== 'none') return true;
    try {
      var cs = window.getComputedStyle(el);
      return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05;
    } catch (e) { return false; }
  }

  function earlyHandleSystemBack() {
    try {
      var sidebar = document.getElementById('sidebarMenu');
      if (sidebar && sidebar.classList.contains('active')) {
        if (typeof global.closeSidebar === 'function' && !global.closeSidebar._daxiStub) {
          global.closeSidebar();
        } else {
          sidebar.classList.remove('active');
          var so = document.getElementById('sidebarOverlay');
          if (so) so.classList.remove('active');
          document.body.classList.remove('sidebar-open');
        }
        return true;
      }
      var planModal = document.getElementById('planDetailModal');
      if (planModal && planModal.classList.contains('show')) {
        earlyClosePlanModal();
        return true;
      }
      var help = document.getElementById('daxiBookingHelpOverlay');
      if (help && help.classList.contains('show')) {
        help.classList.remove('show');
        help.style.display = 'none';
        return true;
      }
      var cardPay = document.getElementById('daxiCardPaymentOverlay');
      if (cardPay && cardPay.classList.contains('show')) {
        cardPay.classList.remove('show');
        cardPay.style.display = 'none';
        return true;
      }
      var loginModal = document.getElementById('loginModal');
      if (loginModal && _isVisibleOverlay(loginModal)) {
        loginModal.style.display = 'none';
        loginModal.classList.remove('show', 'active');
        return true;
      }
      var signupModal = document.getElementById('daxiSignupModal');
      if (signupModal && _isVisibleOverlay(signupModal)) {
        signupModal.style.display = 'none';
        signupModal.classList.remove('show', 'active');
        return true;
      }
      var forgot = document.getElementById('forgotPasswordModal');
      if (forgot && _isVisibleOverlay(forgot)) {
        forgot.style.display = 'none';
        forgot.classList.remove('show', 'active');
        return true;
      }
      var blogModal = document.getElementById('blogFullscreenModal');
      if (blogModal && blogModal.classList.contains('show')) {
        blogModal.classList.remove('show');
        blogModal.style.display = 'none';
        return true;
      }
      var pageOverlay = document.getElementById('daxiPageOverlay');
      if (pageOverlay && pageOverlay.classList.contains('show')) {
        ensure().then(function () {
          if (typeof global.daxiPageBack === 'function' && !global.daxiPageBack._daxiStub) {
            global.daxiPageBack();
          } else {
            pageOverlay.classList.remove('show', 'slide-in');
            document.body.classList.remove('daxi-page-open');
            document.body.style.overflow = '';
          }
        });
        return true;
      }
    } catch (e) {}
    return false;
  }
  global.daxiHandleSystemBack = earlyHandleSystemBack;

  /* ---- Booking controls: work on FIRST tap (do not wait for lazy chunks) ---- */
  function syncPassengers(delta) {
    var passHidden = document.getElementById('passengerCount');
    var passDisplay = document.getElementById('passengerDisplay');
    var passMinus = document.getElementById('passMinus');
    var passPlus = document.getElementById('passPlus');
    var n = parseInt(passHidden && passHidden.value, 10) || 1;
    n = Math.max(1, Math.min(10, n + delta));
    if (passHidden) passHidden.value = String(n);
    if (passDisplay) passDisplay.textContent = String(n);
    if (passMinus) passMinus.disabled = n <= 1;
    if (passPlus) passPlus.disabled = n >= 10;
  }

  function setTripTypeEarly(value, activeId, inactiveId) {
    var tripTypeHidden = document.getElementById('tripTypeHidden');
    if (tripTypeHidden) tripTypeHidden.value = value;
    var activeBtn = document.getElementById(activeId);
    var inactiveBtn = document.getElementById(inactiveId);
    if (activeBtn) activeBtn.classList.add('active');
    if (inactiveBtn) inactiveBtn.classList.remove('active');
    var waitBlock = document.getElementById('roundTripWaitBlock');
    if (waitBlock) {
      var isRt = value === 'aller-retour';
      waitBlock.classList.toggle('hidden', !isRt);
      waitBlock.style.display = isRt ? '' : 'none';
      waitBlock.hidden = !isRt;
    }
    if (typeof global._syncRoundTripWaitUi === 'function') {
      try { global._syncRoundTripWaitUi(); } catch (e) {}
    }
    if (typeof global._syncBookingHiddenFields === 'function') {
      try { global._syncBookingHiddenFields(); } catch (e) {}
    }
    ensure();
  }

  function toggleNotesEarly() {
    var notesExpand = document.getElementById('notesExpand');
    var notesChevron = document.getElementById('notesChevron');
    if (!notesExpand) return;
    var open = notesExpand.classList.toggle('open');
    if (notesChevron) {
      notesChevron.className = 'daxi-row-chevron ' + (open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line');
    }
    if (open) {
      var ta = document.getElementById('bookingDescription');
      if (ta) setTimeout(function () { try { ta.focus(); } catch (e) {} }, 80);
    }
  }

  function wireEarlyUi() {
    if (global._daxiEarlyUiWired) return;
    global._daxiEarlyUiWired = true;

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var el;

      el = t.closest('#planCloseBtn, #planBackBtn, .plan-close-btn, .plan-back-btn');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        earlyClosePlanModal();
        return;
      }

      el = t.closest('#passMinus');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        syncPassengers(-1);
        ensure();
        return;
      }
      el = t.closest('#passPlus');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        syncPassengers(1);
        ensure();
        return;
      }
      el = t.closest('#oneWayBtn');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        setTripTypeEarly('aller simple', 'oneWayBtn', 'roundTripBtn');
        return;
      }
      el = t.closest('#roundTripBtn');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        setTripTypeEarly('aller-retour', 'roundTripBtn', 'oneWayBtn');
        return;
      }
      el = t.closest('#notesToggleRow');
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        toggleNotesEarly();
        ensure();
      }
    }, true);
  }

  function arm() {
    wireEarlyUi();
    var once = { once: true, passive: true, capture: true };
    document.addEventListener('pointerdown', function () { ensure(); }, once);
    document.addEventListener('keydown', function () { ensure(); }, once);
    document.addEventListener('focusin', function (e) {
      var id = e.target && e.target.id;
      if (id === 'destinationAddress' || id === 'destinationAddressArrival') ensure();
    }, { once: true, capture: true });
    // Load chunks ASAP — idle delay left first taps without full handlers.
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(function () { ensure(); }, { timeout: 200 });
    } else {
      setTimeout(function () { ensure(); }, 50);
    }
    setTimeout(function () { ensure(); }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
})(typeof window !== 'undefined' ? window : this);
