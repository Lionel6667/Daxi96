
(function (global) {
  var SITE = 'https://daxipro.com';

  function normalizePath(path) {
    var p = String(path || '/');
    if (!p) p = '/';
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function queryString(q) {
    if (!q) return '';
    var keys = Object.keys(q);
    if (!keys.length) return '';
    return '?' + keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
    }).join('&');
  }

  function toUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    try {
      if (/^daxi:/i.test(s)) {
        s = s.replace(/^daxi:\/\//i, SITE + '/');
      }
      return new URL(s, SITE);
    } catch (e) {
      return null;
    }
  }

  function parseUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return { type: 'unknown', raw: s };
    var u = toUrl(s);
    if (!u) return { type: 'unknown', raw: String(raw || '') };
    var path = u.pathname || '/';
    var hash = (u.hash || '').replace(/^#/, '');
    var q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    var href = u.origin + u.pathname + u.search + u.hash;

    var m;
    m = path.match(/^\/wa\/accept\/(\d+)\/([^/]+)\/?$/);
    if (m) return { type: 'driver_accept_token', orderId: m[1], token: m[2], raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/driver\/accept\/(\d+)\/?$/);
    if (m) return { type: 'driver_accept', orderId: m[1], raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/driver\/commande_(\d+)\/?$/);
    if (m) return { type: 'driver_order', orderId: m[1], raw: s, path: path, query: q, hash: hash, href: href };
    if (/^\/driver\/login\/?$/i.test(path)) return { type: 'driver_login', raw: s, path: path, query: q, hash: hash, href: href };
    if (path.indexOf('/driver') === 0) return { type: 'driver_home', raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/track\/([^/]+)\/?$/);
    if (m) return { type: 'track', token: m[1], raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/recu_(\d+)\.pdf$/i);
    if (m) return { type: 'receipt', orderId: m[1], raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/payer\/(\d+)\/?$/);
    if (m) return { type: 'pay', orderId: m[1], raw: s, path: path, query: q, hash: hash, href: href };
    m = path.match(/^\/payment\//);
    if (m) return { type: 'payment_return', orderId: (path.match(/\/(\d+)\//) || [])[1] || '', raw: s, path: path, query: q, hash: hash, href: href };
    if (path.indexOf('/admin-dashboard') === 0 || path.indexOf('/django-admin') === 0) {
      return { type: 'admin', raw: s, path: path, query: q, hash: hash, href: href };
    }
    if (path.indexOf('/entreprise') === 0) return { type: 'enterprise', raw: s, path: path, query: q, hash: hash, href: href };
    if (path.indexOf('/compte') === 0) return { type: 'account', raw: s, path: path, query: q, hash: hash, href: href };
    if (path.indexOf('/assistance') === 0) return { type: 'assistance_page', raw: s, path: path, query: q, hash: hash, href: href };
    if (path.indexOf('/blog') === 0) return { type: 'blog', raw: s, path: path, query: q, hash: hash, href: href };
    if (/^\/(politique-confidentialite|privacy-policy|suppression-donnees|data-deletion)\/?$/i.test(path)) {
      return { type: 'legal', raw: s, path: path, query: q, hash: hash, href: href };
    }
    if (q.ref) return { type: 'affiliate', code: q.ref, raw: s, path: path, query: q, hash: hash, href: href };
    if (q.payment) return { type: 'payment_query', orderId: q.order_id || '', raw: s, path: path, query: q, hash: hash, href: href };

    var hr = hash.replace(/^\/?/, '');
    if (hr) {
      var parts = hr.split('/');
      return {
        type: 'hash',
        section: parts[0] || 'commander',
        sub: parts.slice(1).join('/') || '',
        raw: s,
        path: path,
        query: q,
        hash: hash,
        href: href,
      };
    }
    if (path === '/' || path === '') return { type: 'home', raw: s, path: path, query: q, hash: hash, href: href };
    return { type: 'web_path', raw: s, path: path, query: q, hash: hash, href: href };
  }

  function backendAbs(path) {
    if (typeof window.backendUrl === 'function') return window.backendUrl(path);
    if (window.DAXI_API_BASE_URL) return String(window.DAXI_API_BASE_URL).replace(/\/$/, '') + path;
    return SITE + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function targetHref(link) {
    if (link && link.href) return link.href;
    var path = (link && link.path) || '/';
    return backendAbs(path + queryString(link && link.query) + (link && link.hash ? '#' + link.hash : ''));
  }

  function alreadyThere(link) {
    var here = normalizePath(location.pathname);
    var there = normalizePath(link && link.path);
    if (here !== there) return false;
    var wantHash = (link && link.hash) ? ('#' + String(link.hash).replace(/^#/, '')) : '';
    if (wantHash && (location.hash || '') !== wantHash) return false;
    return true;
  }

  function go(link) {
    var dest = targetHref(link);
    if (!dest) return false;
    if (alreadyThere(link)) return false;
    window.location.assign(dest);
    return true;
  }

  function toast(msg) {
    if (typeof window.showDaxiNotification === 'function') {
      window.showDaxiNotification('DAXI', msg, { type: 'info' });
      return;
    }
    if (typeof window._showMapPrecisionHint === 'function') window._showMapPrecisionHint(msg, 4000);
  }

  function applyClientHash(section, sub) {
    var sec = section || 'commander';
    var next = '#/' + sec + (sub ? '/' + sub : '');
    if (normalizePath(location.pathname) !== '/') {
      window.location.assign(SITE + '/' + next);
      return;
    }
    if (location.hash !== next) location.hash = next;
    if (typeof window.daxiNavigateFromHash === 'function') window.daxiNavigateFromHash();
  }

  function apply(raw) {
    var link = typeof raw === 'string' ? parseUrl(raw) : raw;
    if (!link || !link.type || link.type === 'unknown') return link;

    if (link.type === 'hash' || link.type === 'home') {
      if (link.type === 'affiliate' || (link.query && link.query.ref)) {
        try {
          var code = (link.query && link.query.ref) || link.code;
          sessionStorage.setItem('daxi_ref', code);
          localStorage.setItem('daxi_ref', code);
        } catch (e) {}
      }
      var sec = link.section || 'commander';
      var sub = link.sub || '';
      if (link.type === 'home' && !link.hash) {
        if (normalizePath(location.pathname) !== '/') {
          go(link);
          return link;
        }
        return link;
      }
      applyClientHash(sec, sub);
      if ((sec === 'courses' || sec === 'commandes') && sub && typeof window._daxiFocusClientOrder === 'function') {
        setTimeout(function () { window._daxiFocusClientOrder(sub); }, 400);
      }
      return link;
    }

    if (link.type === 'affiliate') {
      try {
        sessionStorage.setItem('daxi_ref', link.code);
        localStorage.setItem('daxi_ref', link.code);
      } catch (e2) {}
      applyClientHash('commander', '');
      return link;
    }

    if (link.type === 'payment_query') {
      applyClientHash('courses', link.orderId || '');
      toast('Retour paiement — la commande sera confirmée par le serveur.');
      return link;
    }

    if (
      link.type === 'admin' ||
      link.type === 'blog' ||
      link.type === 'web_path' ||
      link.type === 'legal' ||
      link.type === 'driver_home' ||
      link.type === 'driver_login' ||
      link.type === 'driver_order' ||
      link.type === 'driver_accept' ||
      link.type === 'driver_accept_token' ||
      link.type === 'enterprise' ||
      link.type === 'account' ||
      link.type === 'assistance_page' ||
      link.type === 'pay' ||
      link.type === 'payment_return' ||
      link.type === 'track' ||
      link.type === 'receipt'
    ) {
      if (link.type === 'enterprise') {
        try { sessionStorage.setItem('daxi_from_app', '1'); } catch (eEnt) {}
      }
      go(link);
      return link;
    }

    return link;
  }

  function isOffHome(raw) {
    var link = typeof raw === 'string' ? parseUrl(raw) : raw;
    if (!link || !link.type || link.type === 'unknown' || link.type === 'home') return false;
    if (link.type === 'hash' || link.type === 'affiliate' || link.type === 'payment_query') return false;
    return true;
  }

  function handle(raw) {
    var parsed = parseUrl(raw);
    apply(parsed);
    try {
      global.dispatchEvent(new CustomEvent('daxi:deeplink:parsed', { detail: parsed }));
    } catch (e) {}
    return parsed;
  }

  var api = { parse: parseUrl, apply: apply, handle: handle, isOffHome: isOffHome, targetHref: targetHref };
  global.DaxiDeepLinkRouter = api;
  if (!global.DaxiDeepLink) global.DaxiDeepLink = api;
})(window);
