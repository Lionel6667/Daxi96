
(function(global) {
  'use strict';

  var BTN_SEL = [
    'button',
    '[role="button"]',
    '.daxi-oc-btn',
    '.daxi-pp-btn',
    '.drv-oc-btn',
    '.drv-oc-mapbtn',
    '.ent-btn',
    '.admin-btn',
    '.daxi-chat-send-btn',
    '.daxi-chat-icon-btn',
    '#chat-send-btn',
    '#orderTaxiBtn',
    '.learn-more-btn',
    '.plan-card-btn',
    '.fab-btn',
    '#complete-fab',
    '#continue-fab',
    '#pause-fab',
    '#chat-fab',
    '#orders-pill',
    '.dsb-nav-item',
    'a.daxi-action-btn'
  ].join(',');

  var SKIP_SEL = '[disabled], .daxi-btn-busy, [data-no-btn-anim], .daxi-wa-notif__close, .modal-close, .sheet-close';

  var SUCCESS_MS = 900;
  var LOADING_MIN_MS = 280;
  var GUARDS = {};

  function isActionBtn(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches(SKIP_SEL)) return false;
    if (!el.matches(BTN_SEL)) return false;
    if (el.closest('#chat-msgs, .daxi-wa, .daxi-wa-notif')) return false;
    return true;
  }

  function markBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.classList.add('daxi-btn-busy');
      btn.setAttribute('aria-busy', 'true');
      if (!btn.dataset.daxiBtnOrigHtml && (btn.tagName === 'BUTTON' || btn.getAttribute('role') === 'button')) {
        btn.dataset.daxiBtnOrigHtml = btn.innerHTML;
      }
      if ((btn.tagName === 'BUTTON' || btn.getAttribute('role') === 'button') && !btn.querySelector('.daxi-btn-spinner')) {
        var label = (btn.textContent || '').trim();
        btn.innerHTML = '<span class="daxi-btn-spinner" aria-hidden="true"></span><span class="daxi-btn-label">' + label + '</span>';
      }
      if (btn.tagName === 'BUTTON') btn.disabled = true;
      else btn.style.pointerEvents = 'none';
    } else {
      btn.classList.remove('daxi-btn-busy', 'daxi-btn-loading', 'btn-loading');
      btn.removeAttribute('aria-busy');
      if (btn.dataset.daxiBtnOrigHtml) {
        btn.innerHTML = btn.dataset.daxiBtnOrigHtml;
        delete btn.dataset.daxiBtnOrigHtml;
      }
      if (btn.tagName === 'BUTTON' && !btn.hasAttribute('data-keep-disabled')) btn.disabled = false;
      else btn.style.pointerEvents = '';
    }
  }

  function flashSuccess(btn) {
    if (!btn) return;
    btn.classList.add('daxi-btn-success');
    setTimeout(function() { btn.classList.remove('daxi-btn-success'); }, SUCCESS_MS);
  }

  function flashError(btn) {
    if (!btn) return;
    btn.classList.add('daxi-btn-error');
    setTimeout(function() { btn.classList.remove('daxi-btn-error'); }, SUCCESS_MS);
  }

  function acquireGuard(key) {
    if (!key) return true;
    if (GUARDS[key]) return false;
    GUARDS[key] = true;
    return true;
  }

  function releaseGuard(key) {
    if (key) delete GUARDS[key];
  }

  function runWithBtn(btn, work, opts) {
    opts = opts || {};
    if (opts.guardKey && !acquireGuard(opts.guardKey)) return;
    if (!btn || btn.classList.contains('daxi-btn-busy')) {
      if (opts.guardKey) releaseGuard(opts.guardKey);
      return;
    }
    var started = Date.now();
    markBusy(btn, true);
    var done = function(ok) {
      var wait = Math.max(0, LOADING_MIN_MS - (Date.now() - started));
      setTimeout(function() {
        markBusy(btn, false);
        if (ok) flashSuccess(btn);
        else flashError(btn);
        if (opts.onDone) opts.onDone(ok);
        if (opts.guardKey) releaseGuard(opts.guardKey);
      }, wait);
    };
    try {
      var result = work();
      if (result && typeof result.then === 'function') {
        result.then(function() { done(true); }).catch(function() { done(false); });
      } else {
        done(true);
      }
    } catch (e) {
      done(false);
    }
  }

  function injectStyles() {
    if (document.getElementById('daxi-action-btn-styles')) return;
    var s = document.createElement('style');
    s.id = 'daxi-action-btn-styles';
    s.textContent = [
      '.daxi-btn-press{transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease;transform-origin:center;will-change:transform;}',
      '.daxi-btn-press:active:not(:disabled):not(.daxi-btn-busy){transform:scale(.96);}',
      '.daxi-btn-busy{opacity:.84;cursor:wait!important;pointer-events:none;}',
      '.daxi-btn-busy::after,.daxi-btn-busy.btn-loading::after,.daxi-btn-busy.daxi-btn-loading::after{display:none!important;}',
      '.daxi-btn-success{animation:daxiBtnSuccess .9s ease;}',
      '.daxi-btn-error{animation:daxiBtnError .9s ease;}',
      '@keyframes daxiBtnSuccess{0%{box-shadow:0 0 0 0 rgba(16,185,129,.55)}70%{box-shadow:0 0 0 10px rgba(16,185,129,0)}100%{box-shadow:none}}',
      '@keyframes daxiBtnError{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{box-shadow:none}}',
      '.daxi-btn-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(127,127,127,.25);border-top-color:currentColor;border-radius:50%;animation:daxiBtnSpin .65s linear infinite;vertical-align:-2px;margin-right:6px;flex-shrink:0;}',
      '@keyframes daxiBtnSpin{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(s);
  }

  function decorateButtons(scope) {
    (scope || document).querySelectorAll(BTN_SEL).forEach(function(btn) {
      if (!isActionBtn(btn)) return;
      btn.classList.add('daxi-btn-press');
    });
  }

  function bindHtmx() {
    document.body.addEventListener('htmx:beforeRequest', function(evt) {
      if (evt.defaultPrevented) return;
      var el = evt.detail && evt.detail.elt;
      var btn = el && (el.matches('button,[role=button]') ? el : el.closest('button,[role=button]'));
      if (!btn || !isActionBtn(btn)) return;
      markBusy(btn, true);
    });
    function endBusy(evt, ok) {
      var el = evt.detail && evt.detail.elt;
      var btn = el && (el.matches('button,[role=button]') ? el : el.closest('button,[role=button]'));
      if (!btn || !isActionBtn(btn)) return;
      markBusy(btn, false);
      if (ok) flashSuccess(btn);
      else flashError(btn);
    }
    document.body.addEventListener('htmx:afterRequest', function(evt) {
      endBusy(evt, !(evt.detail && evt.detail.failed));
    });
    document.body.addEventListener('htmx:sendError', function(evt) { endBusy(evt, false); });
    document.body.addEventListener('htmx:responseError', function(evt) { endBusy(evt, false); });
    document.body.addEventListener('htmx:timeout', function(evt) { endBusy(evt, false); });
  }

  function init() {
    injectStyles();
    decorateButtons(document);
    bindHtmx();
    var root = document.getElementById('appSheet') || document.body;
    var obs = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) decorateButtons(node);
        });
      });
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  var api = {
    init: init,
    runWithBtn: runWithBtn,
    markBusy: markBusy,
    flashSuccess: flashSuccess,
    flashError: flashError,
    decorate: decorateButtons,
    acquireGuard: acquireGuard,
    releaseGuard: releaseGuard
  };

  global.DaxiActionButtons = api;
  global.DaxiDriverButtons = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);