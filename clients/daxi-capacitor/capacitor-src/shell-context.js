(function (global) {
  'use strict';

  var CACHE_KEY = 'daxi_shell_context_v1';

  function apiBase() {
    var base = '';
    try {
      if (global.DAXI_API_BASE_URL) base = global.DAXI_API_BASE_URL;
      else if (global.DaxiApi && typeof global.DaxiApi.baseUrl === 'function') base = global.DaxiApi.baseUrl() || '';
    } catch (e) {}
    if (!base) {
      try {
        if (global.location && (global.location.protocol === 'http:' || global.location.protocol === 'https:')) {
          base = global.location.origin || '';
        }
      } catch (e2) {}
    }
    return String(base || '').replace(/\/$/, '');
  }

  function absMediaUrl(val) {
    var s = String(val || '').trim();
    if (!s || /^(blob:|data:|capacitor:)/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    var base = apiBase();
    if (!base) return s;
    return base + (s.charAt(0) === '/' ? s : '/' + s);
  }

  function pageName() {
    if (global._daxiShellPage) return String(global._daxiShellPage);
    var p = (global.location && global.location.pathname) || '/';
    p = p.toLowerCase();
    if (p.indexOf('/driver/login') >= 0) return 'driver_login';
    if (p.indexOf('/driver') >= 0) return 'driver';
    if (p.indexOf('/entreprise/dashboard') >= 0) return 'enterprise_dashboard';
    if (p.indexOf('/entreprise') >= 0) return 'enterprise';
    if (p.indexOf('/admin-dashboard') >= 0) return 'admin_dashboard';
    return 'client';
  }

  function normalizeSession(session) {
    if (!session) return session;
    if (session.driver_photo) session.driver_photo = absMediaUrl(session.driver_photo);
    if (session.google_maps_key && !global.GOOGLE_MAPS_API_KEY) {
      global.GOOGLE_MAPS_API_KEY = session.google_maps_key;
    }
    if (!session.enterprise_id && session.current_enterprise_id) {
      session.enterprise_id = session.current_enterprise_id;
    }
    return session;
  }

  function cachePayload(data) {
    if (!data || !data.ok) return;
    try {
      global.sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadCached() {
    try {
      var raw = global.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      return applyPayload(JSON.parse(raw), true);
    } catch (e) {
      return false;
    }
  }

  function redirectForPage(page, session) {
    var driverId = session && session.driver_id;
    var entId = (session && (session.enterprise_id || session.current_enterprise_id)) || null;
    if (page === 'driver' && !driverId) return '/driver/login/';
    if (page === 'driver_login' && driverId) return '/driver/';
    if (page === 'enterprise_dashboard' && !entId) return '/entreprise/';
    if (page === 'admin_dashboard' && !(session && session.is_admin)) return '/';
    return null;
  }

  function applyPayload(data, fromCache) {
    if (!data || !data.ok) return false;
    if (data.session) data.session = normalizeSession(data.session);
    if (!data.redirect && data.session) {
      data.redirect = redirectForPage(pageName(), data.session);
    }
    if (data.redirect && !fromCache) {
      var dest = String(data.redirect);
      if (dest.charAt(0) !== '/') dest = '/' + dest.replace(/^\/+/, '');
      if (global.location && global.location.pathname + global.location.search !== dest) {
        global.location.replace(dest);
      }
      return true;
    }
    if (data.session) {
      global.DJANGO_SESSION = data.session;
      if (data.session.csrf_token && typeof global.rememberCsrfToken === 'function') {
        try {
          global.rememberCsrfToken(data.session.csrf_token);
        } catch (eCsrf) {}
      }
    }
    var key = (data.google_maps_api_key || (data.session && data.session.google_maps_key)) || '';
    if (key) {
      global.GOOGLE_MAPS_API_KEY = key;
      global.DJANGO_CONFIG = global.DJANGO_CONFIG || {};
      global.DJANGO_CONFIG.googleMapsApiKey = key;
      if (data.django_config) {
        Object.keys(data.django_config).forEach(function (k) {
          global.DJANGO_CONFIG[k] = data.django_config[k];
        });
      }
    }
    if (data.firebase_config) global.DAXI_FIREBASE_CONFIG = data.firebase_config;
    if (data.firebase_vapid) global.DAXI_FIREBASE_VAPID_KEY = data.firebase_vapid;
    if (!fromCache) cachePayload(data);
    global._daxiShellContextReady = true;
    try {
      global.dispatchEvent(new Event('daxi:shell-context-ready'));
    } catch (eEv) {}
    return true;
  }

  function sessionFromBootstrap(data, page) {
    var src = (data && data.session) || {};
    var session = Object.assign(
      {
        is_admin: false,
        driver_id: null,
        driver_name: null,
        driver_photo: null,
        driver_is_verified: true,
        nav_pref_mode: 'ask',
        nav_pref_app: 'google',
        is_authenticated: !!(data.user && data.user.authenticated),
        user_name: (data.user && data.user.name) || null,
        first_name: null,
        user_email: (data.user && data.user.email) || null,
        user_phone: (data.user && data.user.phone) || null,
        csrf_token: data.csrf_token || src.csrf_token || '',
        google_maps_key: data.google_maps_key || src.google_maps_key || '',
        enterprise_id: null,
        current_enterprise_id: null,
        enterprise_ids: [],
        has_enterprise: false,
        enterprise_url: '/entreprise/',
      },
      src,
    );
    if (!session.csrf_token && data.csrf_token) session.csrf_token = data.csrf_token;
    if (!session.google_maps_key && data.google_maps_key) session.google_maps_key = data.google_maps_key;
    if (!session.enterprise_id && session.current_enterprise_id) {
      session.enterprise_id = session.current_enterprise_id;
    }
    return session;
  }

  function loadFromBootstrap() {
    var base = apiBase();
    if (!base) return loadCached();
    var url = base + '/api/mobile/bootstrap/';
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Daxi-Native', '1');
      xhr.setRequestHeader('X-Daxi-Hybrid', '1');
      xhr.send();
      if (xhr.status < 200 || xhr.status >= 300) return loadCached();
      var data = JSON.parse(xhr.responseText || '{}');
      if (!data || !data.ok) return loadCached();
      var page = pageName();
      var session = sessionFromBootstrap(data, page);
      return applyPayload({
        ok: true,
        redirect: redirectForPage(page, session),
        session: session,
        google_maps_api_key: data.google_maps_key || session.google_maps_key || '',
        django_config: { googleMapsApiKey: data.google_maps_key || '', appApi: '/api/app/' },
      });
    } catch (e) {
      return loadCached();
    }
  }

  function loadSync() {
    var base = apiBase();
    if (!base) return loadCached();
    var url = base + '/api/mobile/shell-context/?page=' + encodeURIComponent(pageName());
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Daxi-Native', '1');
      xhr.setRequestHeader('X-Daxi-Hybrid', '1');
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        return applyPayload(JSON.parse(xhr.responseText || '{}'));
      }
    } catch (e) {}
    return loadFromBootstrap();
  }

  global._daxiLoadShellContext = loadSync;
  global._daxiReloadShellContext = function () {
    return loadSync();
  };
  if (global._daxiCapacitorApp
    || (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform())
    || /DaxiAndroid|Capacitor/i.test(String(global.navigator && global.navigator.userAgent || ''))
    || !(global.DJANGO_SESSION && (global.DJANGO_SESSION.google_maps_key || global.GOOGLE_MAPS_API_KEY))) {
    loadSync();
    try {
      global.addEventListener('online', function () {
        if (typeof global._daxiReloadShellContext === 'function') global._daxiReloadShellContext();
      });
    } catch (eOn) {}
  }
})(typeof window !== 'undefined' ? window : this);
