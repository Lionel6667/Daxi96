import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  apiLog,
  attachCsrfHeader,
  backendUrl,
  nativePageUrl,
  backendWsUrl,
  classifyFetchError,
  classifyHttpStatus,
  getApiBase,
  getStoredCsrf,
  installDaxiApiGlobal,
  isDaxiBackend,
  pathOnly,
  rememberCsrfFromPayload,
  rememberCsrfFromResponse,
  rememberCsrfToken,
} from './backend.js';

const OFFLINE_MSG =
  'Vous êtes actuellement hors-ligne. Veuillez rétablir votre connexion internet pour effectuer cette action.';

const WRITE_RE = /^(POST|PUT|PATCH|DELETE)$/i;
const API_RE = /\/(htmx|api)\//;
const BACKEND_FETCH_TIMEOUT_MS = 45000;

function liveBase() {
  return getApiBase();
}

function absUrl(u) {
  return backendUrl(u);
}

function isWrite(method, url) {
  const m = (method || 'GET').toUpperCase();
  if (!WRITE_RE.test(m)) return false;
  const s = String(url || '');
  
  if (API_RE.test(s)) return true;
  if (/\/(order|payment|chat|login|register|wallet|sos|htmx|api)\//i.test(s)) return true;
  return false;
}

function toast(msg) {
  let el = document.getElementById('daxi-cap-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'daxi-cap-toast';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:24px;z-index:99999;background:#0f172a;color:#f8fafc;border:1px solid #f59e0b;border-radius:14px;padding:14px 16px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.style.display = 'none';
  }, 4200);
}

function openIdb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('daxi_offline_v1', 3);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bootstrap')) db.createObjectStore('bootstrap');
        if (!db.objectStoreNames.contains('htmx_cache')) db.createObjectStore('htmx_cache');
        if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function cachePut(key, payload) {
  const db = await openIdb();
  if (!db) {
    try {
      localStorage.setItem('daxi_cache_' + key, JSON.stringify({ payload, saved_at: Date.now() }));
    } catch (e) {}
    return;
  }
  await new Promise((resolve) => {
    try {
      const tx = db.transaction('htmx_cache', 'readwrite');
      tx.objectStore('htmx_cache').put({ html: payload, saved_at: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

async function cacheGet(key) {
  const db = await openIdb();
  if (!db) {
    try {
      const raw = localStorage.getItem('daxi_cache_' + key);
      return raw ? JSON.parse(raw).payload : null;
    } catch (e) {
      return null;
    }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('htmx_cache', 'readonly');
      const req = tx.objectStore('htmx_cache').get(key);
      req.onsuccess = () => resolve(req.result && req.result.html);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function cacheKey(url) {
  return pathOnly(url);
}

let nativeOnline = true;
let networkToastsReady = false;
let offlineGraceTimer = null;
const OFFLINE_GRACE_MS = 12000;

function waitForOnline(maxMs) {
  const limit = maxMs == null ? 8000 : maxMs;
  if (nativeOnline || navigator.onLine) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(nativeOnline || navigator.onLine), limit);
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('online', onUp);
      resolve(!!ok);
    }
    function onUp() {
      finish(true);
    }
    window.addEventListener('online', onUp);
  });
}
window._daxiWaitForOnline = waitForOnline;

function commitOffline(opts) {
  if (!nativeOnline) return;
  nativeOnline = false;
  window._daxiNativeOnline = false;
  window.dispatchEvent(new Event('offline'));
  if (networkToastsReady && !(opts && opts.silent)) {
    toast(OFFLINE_MSG);
    haptic(ImpactStyle.Medium);
  }
}

function setOnline(on, opts) {
  const next = !!on;
  if (next) {
    if (offlineGraceTimer) {
      clearTimeout(offlineGraceTimer);
      offlineGraceTimer = null;
    }
    if (nativeOnline) return;
    nativeOnline = true;
    window._daxiNativeOnline = true;
    window.dispatchEvent(new Event('online'));
    if (typeof window._daxiRetryMainMapLoad === 'function' && !window._daxiGoogleMapHasBeenShown) {
      window._daxiRetryMainMapLoad();
    } else if (typeof window._daxiLoadGoogleMaps === 'function' && !window._clientBgMap) {
      window._daxiLoadGoogleMaps();
    }
    if (typeof window._daxiBootLoadOrders === 'function') window._daxiBootLoadOrders();
    if (typeof window._daxiBootPreloadClientOrders === 'function') window._daxiBootPreloadClientOrders();
    return;
  }
  if (!nativeOnline) return;
  if (opts && opts.immediate) {
    commitOffline(opts);
    return;
  }
  if (offlineGraceTimer) return;
  offlineGraceTimer = setTimeout(() => {
    offlineGraceTimer = null;
    commitOffline(opts);
  }, OFFLINE_GRACE_MS);
}

window._daxiIsNativeOnline = () => nativeOnline;
window.DaxiNetworkState = {
  isOnline: () => nativeOnline,
};

async function initNetwork() {
  try {
    const status = await Network.getStatus();
    const on = status.connected !== false || navigator.onLine !== false;
    setOnline(on, { silent: true });
    Network.addListener('networkStatusChange', (s) => {
      const pluginOn = !!s.connected;
      const browserOn = navigator.onLine !== false;
      if (!pluginOn && browserOn) {
        setOnline(true, { silent: true });
        return;
      }
      setOnline(pluginOn && browserOn);
    });
  } catch (e) {
    setOnline(navigator.onLine !== false, { silent: true });
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }
  setTimeout(() => {
    networkToastsReady = true;
  }, 2500);
}

function blockIfOffline(method, url) {
  if (nativeOnline) return false;
  if (!isWrite(method, url)) return false;
  toast(OFFLINE_MSG);
  return true;
}

function rememberApiError(kind, url, extra) {
  const rec = { kind: kind, url: pathOnly(url), at: Date.now(), extra: extra || null };
  if (window.DaxiApi) window.DaxiApi.lastError = rec;
  apiLog(kind === 'TIMEOUT' ? 'Timeout' : kind === 'NETWORK_ERROR' ? 'Network error' : 'Response: ' + kind, rec.url);
  return rec;
}

function patchWebSocket() {
  const Orig = window.WebSocket;
  if (!Orig || Orig.__daxiPatched) return;
  function DaxiWebSocket(url, protocols) {
    const next = backendWsUrl(url);
    apiLog('WS ' + next);
    return protocols !== undefined ? new Orig(next, protocols) : new Orig(next);
  }
  DaxiWebSocket.prototype = Orig.prototype;
  DaxiWebSocket.__daxiPatched = true;
  window.WebSocket = DaxiWebSocket;
}

function captureCsrfFromBody(text) {
  if (!text || text.charAt(0) !== '{') return;
  try {
    rememberCsrfFromPayload(JSON.parse(text));
  } catch (e) {}
}

function wrapGetCsrfToken() {
  const prev = window.getCsrfToken;
  if (prev && prev.__daxiWrapped) return;
  window.getCsrfToken = function () {
    return getStoredCsrf() || (typeof prev === 'function' ? prev() : '');
  };
  window.getCsrfToken.__daxiWrapped = true;
}

function enableHtmxCredentials() {
  if (window.htmx && window.htmx.config) window.htmx.config.withCredentials = true;
}

function patchNetworking() {
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      init = init || {};
      let url = typeof input === 'string' ? input : input && input.url;
      url = backendUrl(url);
      const method = (init.method || (input && input.method) || 'GET').toUpperCase();
      const backend = isDaxiBackend(url);
      if (backend && blockIfOffline(method, url)) {
        rememberApiError('NETWORK_ERROR', url, { reason: 'offline' });
        return Promise.reject(new Error('offline_write_blocked'));
      }
      if (typeof input === 'string') input = url;
      else if (input && input.url) input = new Request(url, input);
      if (backend) {
        const headers = new Headers(init.headers || {});
        headers.set('ngrok-skip-browser-warning', 'true');
        headers.set('X-Daxi-Hybrid', '1');
        headers.set('X-Daxi-Native', '1');
        attachCsrfHeader(headers, method);
        init.headers = headers;
        init.credentials = 'include';
        apiLog(method + ' ' + pathOnly(url));
        if (!init.signal && typeof AbortController !== 'undefined') {
          const ctrl = new AbortController();
          init.signal = ctrl.signal;
          const t = setTimeout(() => ctrl.abort(), BACKEND_FETCH_TIMEOUT_MS);
          const clear = () => clearTimeout(t);
          return origFetch(input, init)
            .then(async (res) => {
              clear();
              rememberCsrfFromResponse(res);
              const kind = classifyHttpStatus(res.status);
              if (!res.ok) rememberApiError(kind, url, { status: res.status });
              else apiLog('Response: ' + res.status);
              if (res.ok && method === 'GET' && API_RE.test(url)) {
                try {
                  const clone = res.clone();
                  const text = await clone.text();
                  captureCsrfFromBody(text);
                  cachePut(cacheKey(url), text);
                  if (url.indexOf('/api/mobile/bootstrap/') >= 0 && window.DaxiSessionStore) {
                    try {
                      const data = JSON.parse(text);
                      rememberCsrfFromPayload(data);
                      window.DaxiSessionStore.saveFromBootstrap(data, true);
                    } catch (e) {}
                  }
                } catch (e) {}
              } else {
                try {
                  const ct = res.headers.get('content-type') || '';
                  if (ct.indexOf('json') >= 0) {
                    const clone = res.clone();
                    captureCsrfFromBody(await clone.text());
                  }
                } catch (e2) {}
              }
              return res;
            })
            .catch(async (err) => {
              clear();
              if (method === 'GET') {
                const back = await waitForOnline(8000);
                if (back) {
                  try {
                    const retryRes = await origFetch(input, init);
                    rememberCsrfFromResponse(retryRes);
                    return retryRes;
                  } catch (eRetry) {}
                }
                try {
                  const cached = await cacheGet(cacheKey(url));
                  if (cached != null) {
                    return new Response(cached, {
                      status: 200,
                      headers: { 'Content-Type': 'text/html; charset=utf-8' },
                    });
                  }
                } catch (e3) {}
              }
              rememberApiError(classifyFetchError(err), url);
              throw err;
            });
        }
      }
      return origFetch(input, init).then(async (res) => {
        if (backend) rememberCsrfFromResponse(res);
        if (backend && res.ok && method === 'GET' && API_RE.test(url)) {
          try {
            const clone = res.clone();
            const text = await clone.text();
            captureCsrfFromBody(text);
            cachePut(cacheKey(url), text);
            if (url.indexOf('/api/mobile/bootstrap/') >= 0 && window.DaxiSessionStore) {
              try {
                const data = JSON.parse(text);
                rememberCsrfFromPayload(data);
                window.DaxiSessionStore.saveFromBootstrap(data, true);
              } catch (e) {}
            }
          } catch (e) {}
        }
        return res;
      });
    };
  }

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._daxiMethod = (method || 'GET').toUpperCase();
    this._daxiUrl = backendUrl(url);
    this._daxiBackend = isDaxiBackend(this._daxiUrl);
    const ret = XO.call(this, method, this._daxiUrl);
    if (this._daxiBackend) this.withCredentials = true;
    return ret;
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this._daxiBackend && blockIfOffline(this._daxiMethod, this._daxiUrl)) {
      rememberApiError('NETWORK_ERROR', this._daxiUrl, { reason: 'offline' });
      this.dispatchEvent(new Event('error'));
      return;
    }
    if (this._daxiBackend) {
      try {
        this.setRequestHeader('ngrok-skip-browser-warning', 'true');
        this.setRequestHeader('X-Daxi-Hybrid', '1');
        this.setRequestHeader('X-Daxi-Native', '1');
        const csrf = getStoredCsrf();
        if (csrf && this._daxiMethod !== 'GET' && this._daxiMethod !== 'HEAD') {
          this.setRequestHeader('X-CSRFToken', csrf);
        }
      } catch (e) {}
      try {
        this.timeout = this.timeout || BACKEND_FETCH_TIMEOUT_MS;
      } catch (e2) {}
      apiLog(this._daxiMethod + ' ' + pathOnly(this._daxiUrl));
    }
    const xhr = this;
    xhr.addEventListener('load', function () {
      if (!xhr._daxiBackend) return;
      try {
        const h = xhr.getResponseHeader('X-CSRFToken');
        if (h) rememberCsrfToken(h);
      } catch (e) {}
      captureCsrfFromBody(xhr.responseText || '');
      if (xhr.status >= 400) rememberApiError(classifyHttpStatus(xhr.status), xhr._daxiUrl, { status: xhr.status });
      else apiLog('Response: ' + xhr.status);
      if (xhr._daxiMethod === 'GET' && xhr.status >= 200 && xhr.status < 300 && API_RE.test(xhr._daxiUrl || '')) {
        cachePut(cacheKey(xhr._daxiUrl), xhr.responseText || '');
      }
    });
    xhr.addEventListener('timeout', function () {
      if (xhr._daxiBackend) rememberApiError('TIMEOUT', xhr._daxiUrl);
    });
    xhr.addEventListener('error', function () {
      if (xhr._daxiBackend) rememberApiError('NETWORK_ERROR', xhr._daxiUrl);
    });
    return XS.call(this, body);
  };

  patchWebSocket();
  enableHtmxCredentials();
  document.addEventListener('htmx:load', enableHtmxCredentials);
  installMediaRewriter();

  document.addEventListener('htmx:configRequest', (evt) => {
    if (!evt.detail) return;
    const path = evt.detail.path || '';
    if (isDaxiBackend(path)) {
      evt.detail.path = backendUrl(path);
      evt.detail.headers = evt.detail.headers || {};
      evt.detail.headers['ngrok-skip-browser-warning'] = 'true';
      evt.detail.headers['X-Daxi-Hybrid'] = '1';
      evt.detail.headers['X-Daxi-Native'] = '1';
      evt.detail.credentials = 'include';
      const csrf = getStoredCsrf();
      const verb = (evt.detail.verb || 'GET').toUpperCase();
      if (csrf && verb !== 'GET' && verb !== 'HEAD') {
        evt.detail.headers['X-CSRFToken'] = csrf;
      }
      apiLog(verb + ' ' + pathOnly(evt.detail.path || ''));
    }
  });

  document.addEventListener(
    'htmx:beforeRequest',
    (evt) => {
      const d = evt.detail || {};
      const method = (d.verb || d.requestConfig?.verb || 'GET').toUpperCase();
      const path = d.path || d.pathInfo?.requestPath || '';
      if (d.xhr) d.xhr.withCredentials = true;
      if (blockIfOffline(method, path)) {
        evt.preventDefault();
        try {
          const el = d.elt;
          if (el) {
            el.disabled = false;
            el.style.opacity = '';
            el.classList.remove('daxi-btn-busy', 'daxi-btn-loading');
            el.removeAttribute('aria-busy');
            if (el.dataset && el.dataset.origHtml) el.innerHTML = el.dataset.origHtml;
          }
        } catch (e) {}
        toast(OFFLINE_MSG);
      }
    },
    true,
  );

  document.addEventListener(
    'submit',
    (evt) => {
      const form = evt.target;
      if (!form || !form.tagName || form.tagName !== 'FORM') return;
      const hxAction = form.getAttribute('hx-post') || form.getAttribute('hx-put') || form.getAttribute('hx-patch') || form.getAttribute('hx-delete') || '';
      if (!hxAction) return;
      const method = form.getAttribute('hx-delete')
        ? 'DELETE'
        : form.getAttribute('hx-patch')
          ? 'PATCH'
          : form.getAttribute('hx-put')
            ? 'PUT'
            : 'POST';
      if (blockIfOffline(method, hxAction)) {
        evt.preventDefault();
        evt.stopPropagation();
        toast(OFFLINE_MSG);
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (evt) => {
      const el = evt.target && evt.target.closest
        ? evt.target.closest('[hx-post],[hx-put],[hx-patch],[hx-delete]')
        : null;
      if (!el) return;
      const method = el.getAttribute('hx-delete')
        ? 'DELETE'
        : el.getAttribute('hx-patch')
          ? 'PATCH'
          : el.getAttribute('hx-put')
            ? 'PUT'
            : 'POST';
      const url =
        el.getAttribute('hx-post') ||
        el.getAttribute('hx-put') ||
        el.getAttribute('hx-patch') ||
        el.getAttribute('hx-delete') ||
        '';
      if (!url) return;
      if (blockIfOffline(method, url)) {
        evt.preventDefault();
        evt.stopPropagation();
        toast(OFFLINE_MSG);
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (evt) => {
      const a = evt.target && evt.target.closest ? evt.target.closest('a[href]') : null;
      if (!a) return;
      if (a.hasAttribute('download')) return;
      if (String(a.getAttribute('target') || '') === '_blank') return;
      if (a.getAttribute('hx-get') || a.getAttribute('hx-post') || a.getAttribute('hx-put') || a.getAttribute('hx-patch') || a.getAttribute('hx-delete')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') return;
      if (/^(mailto:|tel:|sms:|javascript:|whatsapp:|daxi:)/i.test(href)) return;
      let dest;
      try {
        dest = new URL(href, window.location.href);
      } catch (e) {
        return;
      }
      if (dest.protocol !== 'http:' && dest.protocol !== 'https:') return;
      const host = dest.hostname;
      const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (!local && dest.origin === window.location.origin) {
        if (!nativeOnline && /\/(entreprise|driver|admin)/i.test(dest.pathname)) {
          evt.preventDefault();
          evt.stopPropagation();
          toast('Connexion internet requise pour ouvrir cette page.');
        }
        return;
      }
      if (!local && !/ngrok|daxipro\.com$/i.test(host) && dest.origin !== window.location.origin) return;
      if (!nativeOnline && /\/(entreprise|driver|admin)/i.test(dest.pathname)) {
        evt.preventDefault();
        evt.stopPropagation();
        toast('Connexion internet requise pour ouvrir cette page.');
        return;
      }
      const next = nativePageUrl(dest.pathname + dest.search + dest.hash);
      if (!next || next === href || next === dest.href) return;
      evt.preventDefault();
      evt.stopPropagation();
      if (/\/entreprise(\/|\?|#|$)/i.test(dest.pathname)) {
        try { sessionStorage.setItem('daxi_from_app', '1'); } catch (eEnt) {}
      }
      window.location.assign(next);
    },
    true,
  );
}

let gpsWatchId = null;

async function readNativeGps() {
  if (!window._daxiGpsPerm) {
    throw new Error('permission');
  }
  const last = window._daxiLastNativeGps;
  if (last && last.ts && Date.now() - last.ts < 8000) return last;
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 5000,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    altitude: pos.coords.altitude,
    speed: pos.coords.speed,
    heading: pos.coords.heading,
    ts: Date.now(),
  };
}

function startGpsWatch() {
  if (gpsWatchId != null) return;
  Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 30000 }, (pos, err) => {
    if (err || !pos || !pos.coords) return;
    window._daxiLastNativeGps = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      ts: Date.now(),
    };
    try {
      if (typeof window._daxiOnNativeGpsFix === 'function') {
        window._daxiOnNativeGpsFix(window._daxiLastNativeGps);
      }
    } catch (eFix) {}
  }).then((id) => {
    gpsWatchId = id;
  }).catch(() => {});
}

function pushLog(msg, extra) {
  try {
    const debug = !!(window.DAXI_API_DEBUG_LOGS || window.DAXI_PUSH_DEBUG);
    if (extra && extra.token && !debug) {
      extra = Object.assign({}, extra, { token: String(extra.token).slice(0, 8) + '…' });
    }
    const line = extra ? msg + ' ' + JSON.stringify(extra) : msg;
    console.log('[DAXI PUSH] ' + line);
  } catch (e) {}
}

function installDaxiDeepLink() {
  if (window.DaxiDeepLink && window.DaxiDeepLink._daxiNative) return window.DaxiDeepLink;
  const api = {
    _daxiNative: true,
    _pending: null,
    handle(raw) {
      const url = String(raw || '').trim();
      if (!url) return;
      pushLog('Deep link received', { url: url.slice(0, 120) });
      this._pending = url;
      try {
        sessionStorage.setItem('daxi_pending_deeplink', url);
      } catch (e) {}
      Preferences.set({ key: 'daxi_pending_deeplink', value: url }).catch(() => {});
      if (this.execute(url)) this.clear();
    },
    ready() {
      const queued = this._pending || (function () {
        try { return sessionStorage.getItem('daxi_pending_deeplink') || ''; } catch (e) { return ''; }
      })();
      if (!queued) {
        Preferences.get({ key: 'daxi_pending_deeplink' }).then((r) => {
          if (r && r.value) api.handle(r.value);
        }).catch(() => {});
        return;
      }
      if (this.execute(queued)) this.clear();
    },
    clear() {
      this._pending = null;
      try { sessionStorage.removeItem('daxi_pending_deeplink'); } catch (e) {}
      Preferences.remove({ key: 'daxi_pending_deeplink' }).catch(() => {});
    },
    execute(raw) {
      const url = String(raw || '');
      const tarif = url.match(/#\/tarif\/([^/?#]+)/) || url.match(/daxi:\/\/tarif\/([^/?#]+)/i);
      if (tarif) {
        location.hash = '#/tarif/' + tarif[1];
        pushLog('Deep link executed', { kind: 'tarif' });
        return true;
      }
      const track = url.match(/(?:\/track\/|daxi:\/\/track\/)([^/?#]+)/i);
      if (track) {
        fetch(absUrl('/api/track/' + track[1] + '/'), { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            toast('Course partagée ouverte');
            window._daxiSharedTrack = data;
          })
          .catch(() => {});
        pushLog('Deep link executed', { kind: 'track' });
        return true;
      }
      const oidMatch = url.match(/(?:commande\/|#courses\/|#order-|\/orders?\/|order[_-]|daxi:\/\/order\/)(\d+)/i);
      const oid = (oidMatch && oidMatch[1]) || '';
      const isDriver = /\/driver/i.test(url) || /#order-/.test(url);

      if (isDriver) {
        if (!/\/driver/i.test(location.pathname || '')) {
          return false;
        }
        pushLog('Deep link executed', { role: 'driver', order_id: oid });
        if (oid && typeof window._daxiFocusDriverOrder === 'function') {
          window._daxiFocusDriverOrder(oid);
          return true;
        }
        if (oid) {
          location.hash = 'order-' + oid;
          return true;
        }
        return false;
      }

      if (typeof window._daxiFocusClientOrder === 'function') {
        if (oid) {
          pushLog('Deep link executed', { role: 'client', order_id: oid });
          window._daxiFocusClientOrder(oid);
          return true;
        }
      }
      if (oid && typeof window.openOrderSheet === 'function') {
        try {
          window.openOrderSheet(oid);
          pushLog('Deep link executed', { via: 'openOrderSheet', order_id: oid });
          return true;
        } catch (e) {}
      }
      return false;
    },
  };
  window.DaxiDeepLink = api;
  return api;
}

async function getStableDeviceId() {
  try {
    const pref = await Preferences.get({ key: 'daxi_device_id' });
    if (pref && pref.value) return pref.value;
  } catch (e) {}
  let id = '';
  try { id = localStorage.getItem('daxi_device_id') || ''; } catch (e2) {}
  if (!id) {
    id = 'daxi-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  try { localStorage.setItem('daxi_device_id', id); } catch (e3) {}
  Preferences.set({ key: 'daxi_device_id', value: id }).catch(() => {});
  return id;
}

async function postPushToken(token) {
  if (!token) return;
  const deviceId = await getStableDeviceId();
  const body = {
    token,
    guest_id: window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '',
    platform: Capacitor.getPlatform(),
    device_id: deviceId,
  };
  const headers = { 'Content-Type': 'application/json', 'X-Daxi-Native': '1' };
  const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1];
  if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf);
  try {
    const resp = await fetch(absUrl('/api/notifications/register-device/'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (resp.ok) pushLog('Token registered');
    else pushLog('Token registered', { status: resp.status });
  } catch (e) {
    pushLog('Token registered', { error: 'network' });
  }
}

window._daxiRegisterPushToken = function () {
  if (window._daxiFcmToken) postPushToken(window._daxiFcmToken);
};

async function ensurePushChannels() {
  if (Capacitor.getPlatform() !== 'android') return;
  const channels = [
    { id: 'daxi_orders', name: 'Courses DAXI', description: 'Suivi de vos courses', importance: 4, sound: 'default', vibration: true, visibility: 1 },
    { id: 'daxi_urgent', name: 'Alertes DAXI', description: 'Alertes importantes', importance: 5, sound: 'default', vibration: true, visibility: 1 },
    { id: 'daxi_sos', name: 'SOS DAXI', description: 'Alertes d’urgence', importance: 5, sound: 'default', vibration: true, visibility: 1 },
  ];
  for (const ch of channels) {
    try {
      await PushNotifications.createChannel(ch);
    } catch (e) {}
  }
}

function registerPushIfGranted() {
  ensurePushChannels().finally(() => {
    PushNotifications.register().catch(() => {});
  });
}

async function initPush() {
  if (!Capacitor.isNativePlatform()) return;
  if (window._daxiPushBound) return;
  window._daxiPushBound = true;
  installDaxiDeepLink();
  try {
    await ensurePushChannels();
    const permNow = await PushNotifications.checkPermissions();
    pushLog('Permission status', { receive: permNow && permNow.receive });
    PushNotifications.addListener('registration', (token) => {
      let value = (token && token.value) || '';
      // iOS Capacitor = APNs hex ; le vrai token FCM arrive via AppDelegate (Firebase Messaging).
      if (Capacitor.getPlatform() === 'ios') {
        if (window._daxiFcmTokenNative) {
          value = window._daxiFcmTokenNative;
        } else if (value && value.indexOf(':') === -1) {
          window._daxiApnsHexPending = value;
          pushLog('iOS APNs ok — attente token FCM natif');
          return;
        }
      }
      window._daxiFcmToken = value;
      pushLog('FCM/APNs registration success');
      postPushToken(window._daxiFcmToken);
    });
    window.addEventListener('daxi-fcm-token', (ev) => {
      try {
        const t = (ev && ev.detail && ev.detail.token) || window._daxiFcmTokenNative || '';
        if (!t) return;
        window._daxiFcmToken = t;
        window._daxiFcmTokenNative = t;
        pushLog('FCM token iOS injecté');
        postPushToken(t);
      } catch (e) {}
    });
    PushNotifications.addListener('registrationError', (err) => {
      pushLog('FCM/APNs registration error', { error: err && err.error ? String(err.error).slice(0, 80) : 'unknown' });
      apiLog('push registration error ' + (err && err.error ? err.error : ''));
    });
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      pushLog('Notification received', { title: notif && notif.title });
      haptic(ImpactStyle.Medium);
      try {
        const data = (notif && notif.data) || {};
        if (data.order_id && typeof window._daxiFocusClientOrder === 'function' && document.visibilityState === 'visible') {
          
        }
      } catch (e) {}
    });
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      pushLog('Notification action');
      const data = (action && action.notification && action.notification.data) || {};
      const oid = data.order_id || '';
      const target = data.deep_link || data.url || data.link || (oid ? '/#courses/' + oid : '');
      if (target) handleDeepLink(target);
      else if (oid && typeof window._daxiFocusClientOrder === 'function') {
        window._daxiFocusClientOrder(oid);
      }
    });
    const perm = permNow;
    if (perm.receive === 'granted') {
      window._daxiNativePushGranted = true;
      try {
        localStorage.setItem('daxi_notif_asked', '1');
      } catch (eLs) {}
      try {
        await Preferences.set({ key: 'daxi_notif_asked', value: '1' });
      } catch (ePref) {}
      registerPushIfGranted();
    } else {
      try {
        const pref = await Preferences.get({ key: 'daxi_notif_asked' });
        if (pref && pref.value === '1') {
          try {
            localStorage.setItem('daxi_notif_asked', '1');
          } catch (eLs2) {}
        }
      } catch (ePref2) {}
    }
  } catch (e) {}
}

function installNativeBridge() {
  window._daxiUseNativeGps = true;
  window.DaxiAndroid = Object.assign(window.DaxiAndroid || {}, {
    getPlatform: () => Capacitor.getPlatform(),
    isOnline: () => nativeOnline,
    getLiveBaseUrl: () => getApiBase(),
    isLocationEnabled: () => !!window._daxiGpsPerm,
    getCurrentLocation: () => {
      try {
        if (!window._daxiGpsPerm) return JSON.stringify({ error: 'permission' });
        const last = window._daxiLastNativeGps;
        return last && last.lat != null
          ? JSON.stringify(last)
          : JSON.stringify({ error: 'pending' });
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    },
    refreshLocation: () => {
      if (!window._daxiGpsPerm) return;
      if (gpsWatchId != null) return;
      readNativeGps()
        .then((p) => {
          window._daxiLastNativeGps = p;
        })
        .catch(() => {});
    },
    getFcmToken: () => window._daxiFcmToken || '',
    notifyMapReady: () => {},
    requestLocationPermission: () => {
      Geolocation.requestPermissions()
        .then(async (perm) => {
          const ok = perm.location === 'granted' || perm.coarseLocation === 'granted';
          window._daxiGpsPerm = ok;
          if (!ok) {
            if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
            return;
          }
          startGpsWatch();
          if (window._daxiOnNativeLocationGranted) {
            window._daxiOnNativeLocationGranted(undefined, undefined, undefined);
          }
          readNativeGps()
            .then((p) => {
              window._daxiLastNativeGps = p;
              if (window._daxiOnNativeGpsFix) window._daxiOnNativeGpsFix(p);
            })
            .catch(() => {});
        })
        .catch(() => {
          if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
        });
    },
    requestNotificationPermission: () => {
      const deny = () => {
        if (window._daxiOnNativeNotifPermissionDenied) window._daxiOnNativeNotifPermissionDenied();
      };
      const webFallback = () => {
        const web = window._daxiRequestWebPushPermission;
        if (typeof web !== 'function') {
          deny();
          return;
        }
        web().then((r) => {
          if (r && r.ok) {
            if (window._daxiOnNativeNotifPermissionGranted) window._daxiOnNativeNotifPermissionGranted();
          } else {
            deny();
          }
        }).catch(deny);
      };
      try {
        if (!PushNotifications || typeof PushNotifications.requestPermissions !== 'function') {
          webFallback();
          return;
        }
        PushNotifications.requestPermissions()
          .then(async (perm) => {
            if (perm.receive !== 'granted') {
              deny();
              return;
            }
            try {
              await PushNotifications.register();
              pushLog('FCM/APNs registration success');
            } catch (e) {}
            if (window._daxiOnNativeNotifPermissionGranted) window._daxiOnNativeNotifPermissionGranted();
          })
          .catch(webFallback);
      } catch (e) {
        webFallback();
      }
    },
  });
}

async function initGps() {
  
  
  try {
    let perm = await Geolocation.checkPermissions();
    let granted = perm.location === 'granted' || perm.coarseLocation === 'granted';
    window._daxiGpsPerm = granted;
    if (!granted) return; 
    startGpsWatch();
    if (window._daxiOnNativeLocationGranted) {
      window._daxiOnNativeLocationGranted(undefined, undefined, undefined);
    }
    readNativeGps()
      .then((p) => {
        window._daxiLastNativeGps = p;
        if (window._daxiOnNativeGpsFix) window._daxiOnNativeGpsFix(p);
      })
      .catch(() => {});
  } catch (e) {
    window._daxiGpsPerm = false;
  }
}

async function restoreOfflineReads() {
  if (nativeOnline) return;
  const cached = await cacheGet('/api/mobile/bootstrap/');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (window.DaxiSessionStore) window.DaxiSessionStore.saveFromBootstrap(data, false);
      if (window.DaxiOffline && DaxiOffline.applyBootstrap) DaxiOffline.applyBootstrap(data);
      window._daxiOfflineData = data;
    } catch (e) {}
  }
}

async function restoreShellRoleAndRedirect() {
  try {
    if (sessionStorage.getItem('daxi_shell_nav') === '1') return false;
  } catch (eNav) {}
  let role = '';
  try {
    role = localStorage.getItem('daxi_native_shell') || localStorage.getItem('daxi_app_shell') || '';
  } catch (e) {}
  try {
    const pref = await Preferences.get({ key: 'daxi_native_shell' });
    if (pref && pref.value) role = pref.value;
  } catch (e2) {}
  if (role !== 'driver' && role !== 'admin' && role !== 'enterprise') return false;
  try {
    localStorage.setItem('daxi_native_shell', role);
    localStorage.setItem('daxi_app_shell', role);
  } catch (e3) {}
  const path = String(location.pathname || '').toLowerCase();
  const base = getApiBase().replace(/\/$/, '');
  if (role === 'driver') {
    if (path.indexOf('/driver') >= 0) return false;
    location.replace(base ? base + '/driver/' : '/driver/');
    return true;
  }
  if (role === 'admin') {
    if (path.indexOf('/admin') >= 0) return false;
    location.replace(base ? base + '/admin-dashboard/' : '/admin-dashboard/');
    return true;
  }
  if (path.indexOf('/entreprise/dashboard') >= 0) return false;
  location.replace(base ? base + '/entreprise/dashboard/' : '/entreprise/dashboard/');
  return true;
}

function markNative() {
  document.documentElement.classList.add('daxi-native-shell');
  window._daxiIsNativeApp = () => true;
  window._daxiCapacitorApp = true;
  window._daxiHybridShell = true;
}

function rewriteMediaUrl(val) {
  let s = String(val || '').trim();
  if (!s || /^(blob:|data:|capacitor:)/i.test(s)) return s;
  if (s.indexOf('//') === 0) s = 'https:' + s;
  const base = getApiBase();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        u.protocol = 'https:';
        s = u.toString();
      }
      if (/cloudinary\.com$/i.test(u.hostname) || /\.cloudinary\.com$/i.test(u.hostname)) {
        return s.replace(/^http:\/\//i, 'https://');
      }
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return (base || window.location.origin) + u.pathname + u.search;
      }
      return s;
    }
    const origin = base || (typeof location !== 'undefined' ? location.origin : '');
    if (!origin) return s;
    if (s.startsWith('/')) return origin + s;
    if (/^(media|static|assets|uploads)\//i.test(s)) return origin + '/' + s;
  } catch (e) {}
  return s;
}

function rewriteStyleUrls(el) {
  if (!el || !el.style) return;
  ['backgroundImage', 'background'].forEach((prop) => {
    const v = el.style[prop];
    if (!v || v.indexOf('url(') < 0) return;
    el.style[prop] = v.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, q, u) => {
      const next = rewriteMediaUrl(u.trim());
      if (next === u.trim()) return full;
      return 'url(' + q + next + q + ')';
    });
  });
}

function rewriteMediaIn(root) {
  if (!root) return;
  const scope = root.querySelectorAll ? root : null;
  const nodes = [];
  if (root.tagName === 'IMG' || root.tagName === 'SOURCE' || root.tagName === 'VIDEO' || root.tagName === 'AUDIO') {
    nodes.push(root);
  }
  if (scope) {
    scope.querySelectorAll('img, source, video, audio, [style*="url("]').forEach((el) => nodes.push(el));
  }
  nodes.forEach((el) => {
    ['src', 'poster', 'srcset'].forEach((attr) => {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v) return;
      if (attr === 'srcset') {
        const next = v.split(',').map((part) => {
          const bits = part.trim().split(/\s+/);
          if (!bits[0]) return part;
          bits[0] = rewriteMediaUrl(bits[0]);
          return bits.join(' ');
        }).join(', ');
        if (next !== v) el.setAttribute(attr, next);
        return;
      }
      const next = rewriteMediaUrl(v);
      if (next !== v) el.setAttribute(attr, next);
    });
    if (el.tagName === 'IMG') {
      el.setAttribute('loading', 'eager');
      el.setAttribute('fetchpriority', 'high');
    }
    rewriteStyleUrls(el);
  });
  if (root.getAttribute && root.getAttribute('style') && root.getAttribute('style').indexOf('url(') >= 0) {
    rewriteStyleUrls(root);
  }
}

function installMediaRewriter() {
  const run = () => rewriteMediaIn(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  document.addEventListener('htmx:afterSwap', (evt) => {
    rewriteMediaIn((evt.detail && evt.detail.target) || document);
  });
  document.addEventListener(
    'error',
    (evt) => {
      const el = evt.target;
      if (!el || el.tagName !== 'IMG') return;
      const tries = Number(el.dataset.daxiImgRetry || 0);
      if (tries >= 3) return;
      el.dataset.daxiImgRetry = String(tries + 1);
      const raw = el.getAttribute('src') || '';
      let next = rewriteMediaUrl(raw);
      if (/\.png(\?|$)/i.test(next) && /\/payments\//i.test(next)) {
        next = next.replace(/\.png(\?|$)/i, '.svg$1');
      }
      el.removeAttribute('crossorigin');
      waitForOnline(8000).then(() => {
        if (next && next !== raw) el.setAttribute('src', next);
        else if (raw) el.setAttribute('src', raw.split('#')[0] + (raw.indexOf('?') >= 0 ? '&' : '?') + '_daxi_r=' + Date.now());
      });
    },
    true,
  );
  const mo = new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        rewriteMediaIn(n);
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

async function haptic(style) {
  try {
    await Haptics.impact({ style: style || ImpactStyle.Light });
  } catch (e) {}
}

async function nativeShare(opts) {
  const title = opts.title || 'Daxi';
  const text = opts.text || '';
  const url = opts.url || '';
  try {
    await haptic(ImpactStyle.Medium);
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch (e) {
    if (url) {
      try {
        await Clipboard.write({ string: url });
        toast('Lien copié');
      } catch (e2) {}
    }
    return false;
  }
}

async function shareMyLocation() {
  const gps = window._daxiLastNativeGps;
  if (!gps || !gps.lat) {
    toast('Position indisponible. Activez la localisation.');
    return;
  }
  const maps = 'https://maps.google.com/?q=' + gps.lat + ',' + gps.lng;
  await nativeShare({
    title: 'Ma position Daxi',
    text: 'Voici ma position pour la prise en charge.',
    url: maps,
  });
}

function hookShareUi() {
  const origShare = window.sharePlanLink;
  window.sharePlanLink = function (slug) {
    const url = liveBase() + '/#/tarif/' + slug;
    nativeShare({ title: 'Forfait Daxi', text: 'Découvre ce forfait Daxi', url: url });
    if (typeof origShare === 'function' && !Capacitor.isNativePlatform()) origShare(slug);
  };
  if (navigator.share) {
    const webShare = navigator.share.bind(navigator);
    navigator.share = function (data) {
      if (Capacitor.isNativePlatform()) {
        return nativeShare({
          title: data.title || 'Daxi',
          text: data.text || '',
          url: data.url || '',
        });
      }
      return webShare(data);
    };
  }
  document.addEventListener(
    'click',
    (evt) => {
      const btn = evt.target && evt.target.closest
        ? evt.target.closest('#enableLocationBtn, [data-daxi-share-location], .location-share-actions button')
        : null;
      if (!btn) return;
      const label = (btn.textContent || '').toLowerCase();
      if (label.indexOf('position') >= 0 || btn.id === 'enableLocationBtn') {
        haptic(ImpactStyle.Light);
      }
    },
    true,
  );
}

function handleDeepLink(url) {
  if (!url) return;
  const raw = String(url);
  installDaxiDeepLink();
  window.dispatchEvent(new CustomEvent('daxi:deeplink', { detail: { url: raw } }));
  window.DaxiDeepLink.handle(raw);
}

async function initDeepLinks() {
  try {
    App.addListener('appUrlOpen', (event) => handleDeepLink(event.url));
    App.addListener('backButton', () => {
      if (typeof window.daxiHandleSystemBack === 'function' && window.daxiHandleSystemBack()) return;
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      App.minimizeApp();
    });
    const launch = await App.getLaunchUrl();
    if (launch && launch.url) handleDeepLink(launch.url);
  } catch (e) {}
}

async function initChrome() {
  const apply = async () => {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    try {
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: dark ? '#070B14' : '#F8FAFC' });
    } catch (e) {}
  };
  await apply();
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  } catch (e2) {}
}

function mapLog(msg, extra) {
  if (window.DAXI_API_DEBUG_LOGS === false) return;
  if (extra !== undefined) console.info('[DAXI MAP]', msg, extra);
  else console.info('[DAXI MAP]', msg);
}

function initNativeMap() {
  window.DAXI_USE_GOOGLE_MAPS = true;
  window.DAXI_USE_MAPLIBRE = false;
  window._DAXI_USE_MAPLIBRE = false;
  mapLog('Starting Google Maps');
  if (typeof window._daxiLoadGoogleMaps === 'function') {
    window._daxiLoadGoogleMaps();
    return;
  }
  const retry = () => {
    if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', retry);
  else setTimeout(retry, 0);
}

async function initLocalAlerts() {}

async function notifyLocal(title, body) {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 100000),
          title: title,
          body: body,
          schedule: { at: new Date(Date.now() + 400) },
        },
      ],
    });
  } catch (e) {}
}

async function persistNative(key, value) {
  try {
    await Preferences.set({ key: key, value: String(value) });
  } catch (e) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e2) {}
  }
}

window.DaxiNative = {
  platform: () => Capacitor.getPlatform(),
  isNative: () => Capacitor.isNativePlatform(),
  share: nativeShare,
  shareLocation: shareMyLocation,
  haptic,
  notifyLocal,
  getLocation: () => window._daxiLastNativeGps || null,
  isOnline: () => nativeOnline,
  persist: persistNative,
};

async function probeBackend() {
  const base = getApiBase();
  if (!base) {
    const rec = { ok: false, status: 'invalid_config', message: 'Backend inaccessible' };
    if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
    apiLog('Backend inaccessible (empty DAXI_API_BASE_URL)');
    return rec;
  }
  const url = backendUrl('/api/mobile/bootstrap/');
  apiLog('GET /api/mobile/bootstrap/');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    const kind = classifyHttpStatus(res.status);
    let rec;
    if (res.ok) rec = { ok: true, status: res.status, message: 'Backend accessible', kind: kind };
    else rec = { ok: false, status: res.status, message: kind, kind: kind };
    if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
    apiLog('Response: ' + res.status);
    return rec;
  } catch (err) {
    if (timer) clearTimeout(timer);
    const kind = classifyFetchError(err);
    const rec = {
      ok: false,
      status: 0,
      kind: kind,
      message: kind === 'TIMEOUT' ? 'Timeout' : 'Backend inaccessible',
    };
    if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
    apiLog(rec.message);
    return rec;
  }
}


function hideSplashWhenPainted() {
  const hide = () => SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => {});
  if (window._daxiIntroFirstFrame) { hide(); return; }
  if (!window._daxiIntroPlaying) { hide(); return; }
  let done = false;
  const once = () => { if (!done) { done = true; hide(); } };
  document.addEventListener('daxi-intro-first-frame', once, { once: true });
  setTimeout(once, 4000);
}

async function boot() {
  if (!Capacitor.isNativePlatform()) return;
  markNative();
  const cfg = installDaxiApiGlobal();
  if (window.DaxiApi) window.DaxiApi.probe = probeBackend;
  if (!cfg.ok) toast('[DAXI API] ' + (cfg.error || 'configuration invalide'));
  if (await restoreShellRoleAndRedirect()) return;
  try { sessionStorage.setItem('daxi_shell_nav', '1'); } catch (eNav2) {}
  installNativeBridge();
  patchNetworking();
  wrapGetCsrfToken();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrapGetCsrfToken);
  } else {
    wrapGetCsrfToken();
  }
  probeBackend().catch(() => {});
  await initChrome();
  hideSplashWhenPainted();
  const startMap = () => initNativeMap();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMap);
  else startMap();
  await initNetwork();
  await initGps();
  await initPush();
  await initDeepLinks();
  hookShareUi();
  await restoreOfflineReads();
  const gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
  if (gid) persistNative('guest_id', gid);
  if (window._daxiOnNativeAppRevealed) window._daxiOnNativeAppRevealed();
  installDaxiDeepLink();
  let tries = 0;
  const flushLink = () => {
    tries += 1;
    if (window.DaxiDeepLink) window.DaxiDeepLink.ready();
    if (tries < 20) setTimeout(flushLink, 500);
  };
  setTimeout(flushLink, 400);
}

try {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (Capacitor.isNativePlatform() || /DaxiAndroid|Capacitor/i.test(ua)) {
    installNativeBridge();
  }
} catch (e) {}
boot();
