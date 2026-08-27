
(function (global) {
  function parseUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return { type: 'unknown', raw: s };
    var u;
    try {
      if (/^daxi:/i.test(s)) {
        s = s.replace(/^daxi:\/\//i, 'https://daxipro.com/');
      }
      u = new URL(s, 'https://daxipro.com');
    } catch (e) {
      return { type: 'unknown', raw: String(raw || '') };
    }
    var path = u.pathname || '/';
    var hash = (u.hash || '').replace(/^#/, '');
    var q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });

    var m;
    m = path.match(/^\/wa\/accept\/(\d+)\/([^/]+)\/?$/);
    if (m) return { type: 'driver_accept_token', orderId: m[1], token: m[2], raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/driver\/accept\/(\d+)\/?$/);
    if (m) return { type: 'driver_accept', orderId: m[1], raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/driver\/commande_(\d+)\/?$/);
    if (m) return { type: 'driver_order', orderId: m[1], raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/driver') === 0) return { type: 'driver_home', raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/track\/([^/]+)\/?$/);
    if (m) return { type: 'track', token: m[1], raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/recu_(\d+)\.pdf$/);
    if (m) return { type: 'receipt', orderId: m[1], raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/payer\/(\d+)\/?$/);
    if (m) return { type: 'pay', orderId: m[1], raw: s, path: path, query: q, hash: hash };
    m = path.match(/^\/payment\/(\d+)\//);
    if (m) return { type: 'payment_return', orderId: m[1], raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/admin-dashboard') === 0) return { type: 'admin', raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/entreprise') === 0) return { type: 'enterprise', raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/compte') === 0) return { type: 'account', raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/assistance') === 0) return { type: 'assistance', raw: s, path: path, query: q, hash: hash };
    if (path.indexOf('/blog') === 0) return { type: 'blog', raw: s, path: path, query: q, hash: hash };
    if (q.ref) return { type: 'affiliate', code: q.ref, raw: s, path: path, query: q, hash: hash };
    if (q.payment) return { type: 'payment_query', orderId: q.order_id || '', raw: s, path: path, query: q, hash: hash };

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
      };
    }
    if (path === '/' || path === '') return { type: 'home', raw: s, path: path, query: q, hash: hash };
    return { type: 'web_path', raw: s, path: path, query: q, hash: hash };
  }

  function backendAbs(path) {
    if (typeof window.backendUrl === 'function') return window.backendUrl(path);
    if (window.DAXI_API_BASE_URL) return String(window.DAXI_API_BASE_URL).replace(/\/$/, '') + path;
    return path;
  }

  function toast(msg) {
    if (typeof window.showDaxiNotification === 'function') {
      window.showDaxiNotification('DAXI', msg, { type: 'info' });
      return;
    }
    if (typeof window._showMapPrecisionHint === 'function') window._showMapPrecisionHint(msg, 4000);
  }

  function apply(raw) {
    var link = typeof raw === 'string' ? parseUrl(raw) : raw;
    if (!link || !link.type || link.type === 'unknown') return link;

    if (link.type === 'hash' || link.type === 'home') {
      var sec = link.section || 'commander';
      var sub = link.sub || '';
      if (link.type === 'affiliate' || (link.query && link.query.ref)) {
        try {
          var code = link.query.ref || link.code;
          sessionStorage.setItem('daxi_ref', code);
          localStorage.setItem('daxi_ref', code);
        } catch (e) {}
      }
      location.hash = '#/' + sec + (sub ? '/' + sub : '');
      if (typeof window.daxiNavigateFromHash === 'function') window.daxiNavigateFromHash();
      
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
      location.hash = '#/commander';
      return link;
    }

    if (link.type === 'assistance') {
      location.hash = '#/assistance';
      if (typeof window.daxiNavigateFromHash === 'function') window.daxiNavigateFromHash();
      return link;
    }

    if (link.type === 'account') {
      location.hash = '#/compte';
      if (typeof window.daxiNavigateFromHash === 'function') window.daxiNavigateFromHash();
      return link;
    }

    if (link.type === 'payment_query' || link.type === 'payment_return' || link.type === 'pay') {
      location.hash = '#/courses' + (link.orderId ? '/' + link.orderId : '');
      if (typeof window.daxiNavigateFromHash === 'function') window.daxiNavigateFromHash();
      toast('Retour paiement — la commande sera confirmée par le serveur.');
      return link;
    }

    if (link.type === 'track') {
      fetch(backendAbs('/api/track/' + encodeURIComponent(link.token) + '/'), { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          window._daxiSharedTrack = data;
          toast(data ? 'Course partagée ouverte' : 'Lien de suivi invalide ou expiré');
        })
        .catch(function () { toast('Lien de suivi indisponible'); });
      return link;
    }

    if (link.type === 'receipt') {
      window.open(backendAbs('/recu_' + link.orderId + '.pdf' + (raw && String(raw).indexOf('?') >= 0 ? String(raw).slice(String(raw).indexOf('?')) : '')), '_blank');
      return link;
    }

    if (link.type === 'driver_accept_token') {
      toast('Vérification du lien chauffeur…');
      fetch(backendAbs('/wa/accept/' + link.orderId + '/' + encodeURIComponent(link.token) + '/'), {
        credentials: 'include',
        redirect: 'follow',
        headers: { 'X-Daxi-Native': '1' },
      }).then(function (r) {
        toast(r.ok ? 'Lien d’acceptation ouvert. Connectez-vous si demandé.' : 'Lien d’acceptation invalide ou expiré.');
      }).catch(function () {
        toast('Impossible d’ouvrir le lien d’acceptation.');
      });
      return link;
    }

    if (link.type === 'enterprise') {
      var entPath = link.path || '/entreprise/';
      var qs = '';
      if (link.query) {
        var keys = Object.keys(link.query);
        if (keys.length) {
          qs = '?' + keys.map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(link.query[k]);
          }).join('&');
        }
      }
      var dest = backendAbs(entPath + qs);
      try { sessionStorage.setItem('daxi_from_app', '1'); } catch (eEnt) {}
      window.location.assign(dest);
      return link;
    }

    if (link.type === 'admin' || link.type === 'blog' || link.type === 'web_path' || link.type === 'driver_home' || link.type === 'driver_order' || link.type === 'driver_accept') {
      var go = backendAbs((link.path || '/') + (function () {
        if (!link.query) return '';
        var keys = Object.keys(link.query);
        if (!keys.length) return '';
        return '?' + keys.map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(link.query[k]);
        }).join('&');
      })() + (link.hash ? '#' + link.hash : ''));
      window.location.assign(go);
      return link;
    }

    return link;
  }

  function handle(raw) {
    var parsed = parseUrl(raw);
    apply(parsed);
    try {
      global.dispatchEvent(new CustomEvent('daxi:deeplink:parsed', { detail: parsed }));
    } catch (e) {}
    return parsed;
  }

  global.DaxiDeepLink = { parse: parseUrl, apply: apply, handle: handle };
})(window);
