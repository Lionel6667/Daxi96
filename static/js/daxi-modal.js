
(function (global) {
  'use strict';

  var STYLES_ID = 'daxi-modal-styles';

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    var s = document.createElement('style');
    s.id = STYLES_ID;
    s.textContent = [
      '.daxi-modal-root{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:daxiModalFade .22s ease}',
      '.daxi-modal-card{max-width:380px;width:100%;border-radius:18px;border:1px solid rgba(148,163,184,.22);background:linear-gradient(165deg,#0f172a 0%,#111827 55%,#0b1220 100%);box-shadow:0 28px 80px rgba(0,0,0,.55);overflow:hidden;animation:daxiModalPop .28s cubic-bezier(.2,.9,.2,1)}',
      '.daxi-modal-card--image{max-width:min(92vw,520px)}',
      '.daxi-modal-head{padding:18px 20px 0;display:flex;align-items:flex-start;gap:12px}',
      '.daxi-modal-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px}',
      '.daxi-modal-icon--info{background:rgba(59,130,246,.18);color:#93c5fd}',
      '.daxi-modal-icon--success{background:rgba(16,185,129,.18);color:#6ee7b7}',
      '.daxi-modal-icon--warn{background:rgba(245,158,11,.18);color:#fcd34d}',
      '.daxi-modal-icon--error{background:rgba(239,68,68,.18);color:#fca5a5}',
      '.daxi-modal-title{margin:0;font-size:16px;font-weight:900;color:#f8fafc;line-height:1.35}',
      '.daxi-modal-body{padding:10px 20px 18px;color:#cbd5e1;font-size:14px;line-height:1.55;white-space:pre-wrap}',
      '.daxi-modal-actions{display:flex;gap:10px;padding:0 16px 16px}',
      '.daxi-modal-btn{flex:1;padding:12px 14px;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer;transition:transform .12s ease,opacity .12s ease}',
      '.daxi-modal-btn:active{transform:scale(.98)}',
      '.daxi-modal-btn--ghost{background:rgba(51,65,85,.65);color:#e2e8f0}',
      '.daxi-modal-btn--primary{background:linear-gradient(135deg,#f59e0b,#f97316);color:#111827}',
      '.daxi-modal-btn--danger{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff}',
      '.daxi-modal-img-wrap{padding:0 16px 16px}',
      '.daxi-modal-img{width:100%;max-height:70vh;object-fit:contain;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:#020617}',
      '@keyframes daxiModalFade{from{opacity:0}to{opacity:1}}',
      '@keyframes daxiModalPop{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}',
      '.daxi-car-thumb-btn{cursor:pointer;padding:0;border:none;background:transparent}',
      '.daxi-car-thumb-btn:focus-visible{outline:2px solid #f59e0b;outline-offset:2px;border-radius:10px}'
    ].join('');
    document.head.appendChild(s);
  }

  function iconFor(type) {
    if (type === 'success') return '<i class="ri-checkbox-circle-fill"></i>';
    if (type === 'warn') return '<i class="ri-error-warning-fill"></i>';
    if (type === 'error') return '<i class="ri-close-circle-fill"></i>';
    return '<i class="ri-information-fill"></i>';
  }

  function closeRoot(root) {
    if (!root || !root.parentNode) return;
    root.style.opacity = '0';
    setTimeout(function () { root.remove(); }, 180);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildModal(opts) {
    injectStyles();
    opts = opts || {};
    var type = opts.type || 'info';
    var title = opts.title || (type === 'error' ? 'Erreur' : type === 'warn' ? 'Attention' : 'Daxi');
    var message = opts.message || '';
    var root = document.createElement('div');
    root.className = 'daxi-modal-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    var cardClass = 'daxi-modal-card' + (opts.image ? ' daxi-modal-card--image' : '');
    var html = '<div class="' + cardClass + '">';
    html += '<div class="daxi-modal-head"><div class="daxi-modal-icon daxi-modal-icon--' + type + '">' + iconFor(type) + '</div>';
    html += '<h2 class="daxi-modal-title">' + escapeHtml(title) + '</h2></div>';
    if (message) html += '<div class="daxi-modal-body">' + escapeHtml(message) + '</div>';
    if (opts.image) {
      html += '<div class="daxi-modal-img-wrap"><img class="daxi-modal-img" src="' + opts.image + '" alt="' + (opts.imageAlt || 'Image') + '"></div>';
    }
    html += '<div class="daxi-modal-actions"></div></div>';
    root.innerHTML = html;

    var actions = root.querySelector('.daxi-modal-actions');
    (opts.buttons || []).forEach(function (btn, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'daxi-modal-btn ' + (btn.className || 'daxi-modal-btn--ghost');
      b.textContent = btn.label || 'OK';
      b.addEventListener('click', function () {
        closeRoot(root);
        if (btn.onClick) btn.onClick();
      });
      actions.appendChild(b);
    });

    root.addEventListener('click', function (e) {
      if (e.target === root && opts.backdropClose) closeRoot(root);
    });
    document.body.appendChild(root);
    root.style.pointerEvents = 'none';
    setTimeout(function () {
      if (!root || !root.parentNode) return;
      root.style.pointerEvents = '';
      var primary = root.querySelector('.daxi-modal-btn--primary, .daxi-modal-btn--danger');
      if (primary) primary.focus();
    }, 380);
    return root;
  }

  function alert(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      buildModal({
        type: opts.type || 'info',
        title: opts.title || 'Daxi',
        message: String(message || ''),
        buttons: [{ label: opts.okLabel || 'OK', className: 'daxi-modal-btn--primary', primary: true, onClick: resolve }]
      });
    });
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      setTimeout(function () {
        buildModal({
          type: opts.type || 'warn',
          title: opts.title || 'Confirmation',
          message: String(message || ''),
          backdropClose: false,
          buttons: [
            { label: opts.cancelLabel || 'Annuler', className: 'daxi-modal-btn--ghost', onClick: function () { resolve(false); } },
            { label: opts.okLabel || 'Confirmer', className: opts.danger ? 'daxi-modal-btn--danger' : 'daxi-modal-btn--primary', primary: true, onClick: function () { resolve(true); } }
          ]
        });
      }, 50);
    });
  }

  function image(url, opts) {
    opts = opts || {};
    if (!url) return Promise.resolve();
    return new Promise(function (resolve) {
      buildModal({
        type: 'info',
        title: opts.title || 'Véhicule',
        image: url,
        imageAlt: opts.alt || 'Véhicule',
        buttons: [{ label: 'Fermer', className: 'daxi-modal-btn--primary', primary: true, onClick: resolve }]
      });
    });
  }

  function patchNative() {
    if (global.__daxiModalPatched) return;
    global.__daxiModalPatched = true;
    global.__daxiNativeAlert = global.alert;
    global.alert = function (msg) {
      return alert(msg, { type: 'info' });
    };
  }

  function bindCarThumbs(scope) {
    (scope || document).querySelectorAll('.daxi-car-thumb-btn[data-daxi-car-img]').forEach(function (btn) {
      if (btn.dataset.daxiCarBound) return;
      btn.dataset.daxiCarBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        image(btn.getAttribute('data-daxi-car-img'), { title: 'Photo du véhicule', alt: 'Véhicule' });
      });
    });
  }

  function bindHtmxConfirm() {
    if (!global.htmx || global.__daxiHtmxConfirmBound) return;
    global.__daxiHtmxConfirmBound = true;
    document.body.addEventListener('htmx:confirm', function (evt) {
      var question = String((evt.detail && evt.detail.question) || '').trim();
      if (!question) {
        return;
      }
      evt.preventDefault();
      confirm(question, { type: 'warn' }).then(function (ok) {
        if (ok && evt.detail && typeof evt.detail.issueRequest === 'function') {
          evt.detail.issueRequest(true);
        }
      });
    });
  }

  function init() {
    injectStyles();
    patchNative();
    bindCarThumbs(document);
    bindHtmxConfirm();
    if (global.MutationObserver) {
      var obs = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) bindCarThumbs(node);
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  global.DaxiModal = {
    alert: alert,
    confirm: confirm,
    image: image,
    init: init,
    bindCarThumbs: bindCarThumbs
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('htmx:load', function () {
    bindHtmxConfirm();
    bindCarThumbs(document);
  });
})(typeof window !== 'undefined' ? window : this);