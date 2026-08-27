
(function () {
  function readCsrf() {
    try {
      if (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) {
        return String(window.DJANGO_SESSION.csrf_token);
      }
    } catch (e) {}
    try {
      if (typeof window.getCsrfToken === 'function') {
        var t = window.getCsrfToken();
        if (t) return String(t);
      }
    } catch (e2) {}
    try {
      if (typeof window.getCSRFToken === 'function') {
        var t2 = window.getCSRFToken();
        if (t2) return String(t2);
      }
    } catch (e3) {}
    try {
      var el = document.querySelector('[name=csrfmiddlewaretoken]');
      if (el && el.value) return el.value;
    } catch (e4) {}
    try {
      var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e5) {}
    return '';
  }

  function install() {
    if (window._daxiHtmxCsrfInstalled) return;
    window._daxiHtmxCsrfInstalled = true;
    document.body.addEventListener('htmx:configRequest', function (e) {
      if (!e || !e.detail) return;
      var csrf = readCsrf();
      if (!csrf) return;
      e.detail.headers = e.detail.headers || {};
      var existing = e.detail.headers['X-CSRFToken'] || e.detail.headers['x-csrftoken'] || '';
      if (!String(existing).trim()) {
        e.detail.headers['X-CSRFToken'] = csrf;
      }
      var verb = String(e.detail.verb || 'get').toLowerCase();
      if (verb !== 'get' && verb !== 'head') {
        e.detail.parameters = e.detail.parameters || {};
        if (!e.detail.parameters.csrfmiddlewaretoken) {
          e.detail.parameters.csrfmiddlewaretoken = csrf;
        }
      }
    });

    function clearBusy(evt) {
      var el = evt && evt.detail && evt.detail.elt;
      if (!el) return;
      var btn = el.matches && el.matches('button,[role=button]') ? el : (el.closest && el.closest('button,[role=button]'));
      if (!btn) return;
      try {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        btn.classList.remove('daxi-btn-busy', 'daxi-btn-loading', 'btn-loading');
        btn.removeAttribute('aria-busy');
        if (btn.dataset) {
          if (btn.dataset.daxiBtnOrigHtml) {
            btn.innerHTML = btn.dataset.daxiBtnOrigHtml;
            delete btn.dataset.daxiBtnOrigHtml;
          } else if (btn.dataset.origHtml) {
            btn.innerHTML = btn.dataset.origHtml;
          }
        }
      } catch (err) {}
      if (window.DaxiActionButtons && DaxiActionButtons.markBusy) {
        try { DaxiActionButtons.markBusy(btn, false); } catch (e6) {}
      }
      if (window.DaxiDriverButtons && DaxiDriverButtons.markBusy) {
        try { DaxiDriverButtons.markBusy(btn, false); } catch (e7) {}
      }
    }

    ['htmx:sendError', 'htmx:responseError', 'htmx:timeout', 'htmx:afterRequest'].forEach(function (ev) {
      document.body.addEventListener(ev, clearBusy);
    });
  }

  window.DaxiHtmxCsrf = { read: readCsrf, install: install };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
