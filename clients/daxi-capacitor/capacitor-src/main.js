import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Geolocation } from '@capacitor/geolocation';

const DaxiGps = registerPlugin('DaxiGps');
if (typeof window !== 'undefined') window.DaxiGps = DaxiGps;
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
const BACKEND_FETCH_TIMEOUT_MS = 8000;

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

let nativeOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
let networkToastsReady = false;
let offlineGraceTimer = null;
const OFFLINE_GRACE_MS = 400;

function waitForOnline(maxMs) {
  const limit = maxMs == null ? 1200 : maxMs;
  if (!nativeOnline && navigator.onLine === false) return Promise.resolve(false);
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
  try {
    if (window.DaxiOffline) {
      if (DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi('active');
      if (DaxiOffline.ensureOfflineMap) DaxiOffline.ensureOfflineMap();
    }
  } catch (eOff) {}
  try {
    if (window.DaxiNetworkBanner && DaxiNetworkBanner.show) DaxiNetworkBanner.show();
  } catch (eBan) {}
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
    const on = !!(status && status.connected);
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

function notifyOfflineBlocked(action) {
  try {
    if (document.getElementById('daxi-map-need-online')) return;
    if (document.querySelector('#daxi-offline-required-modal.show')) return;
    if (document.querySelector('.daxi-offline-modal.show')) return;
    if (window.DaxiNetworkState && DaxiNetworkState.notifyAction) {
      DaxiNetworkState.notifyAction(action);
      return;
    }
    if (window._daxiShowOfflineModal) {
      window._daxiShowOfflineModal(action);
      return;
    }
  } catch (e) {}
}

function blockIfOffline(method, url) {
  if (nativeOnline) return false;
  if (!isWrite(method, url)) return false;
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

function maybePatchJsonFetchResponse(res, text, url, method) {
  if (!res || !res.ok || method !== 'GET') return res;
  const ct = (res.headers && res.headers.get('content-type')) || '';
  if (ct.indexOf('json') < 0) return res;
  try {
    const data = JSON.parse(text);
    const patched = rewriteJsonMediaDeep(data);
    if (url.indexOf('/api/mobile/bootstrap/') >= 0 && window.DaxiSessionStore) {
      rememberCsrfFromPayload(data);
      window.DaxiSessionStore.saveFromBootstrap(data, true);
    }
    const headers = new Headers(res.headers);
    return new Response(JSON.stringify(patched), {
      status: res.status,
      statusText: res.statusText,
      headers: headers,
    });
  } catch (e) {
    return res;
  }
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
      if (backend && !nativeOnline) {
        if (blockIfOffline(method, url)) {
          rememberApiError('NETWORK_ERROR', url, { reason: 'offline' });
          return Promise.reject(new Error('offline_write_blocked'));
        }
        if (method === 'GET') {
          return cacheGet(cacheKey(url)).then((cached) => {
            if (cached != null) {
              const ct = /\/api\//i.test(url) ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
              return new Response(cached, {
                status: 200,
                headers: { 'Content-Type': ct },
              });
            }
            rememberApiError('NETWORK_ERROR', url, { reason: 'offline' });
            return Promise.reject(new Error('offline'));
          });
        }
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
              if (res.ok && method === 'GET' && backend) {
                try {
                  const clone = res.clone();
                  const text = await clone.text();
                  captureCsrfFromBody(text);
                  if (API_RE.test(url)) cachePut(cacheKey(url), text);
                  return maybePatchJsonFetchResponse(res, text, url, method);
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
              if (method === 'GET' && nativeOnline) {
                const back = await waitForOnline(1200);
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
                    const ct = /\/api\//i.test(url) ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
                    return new Response(cached, {
                      status: 200,
                      headers: { 'Content-Type': ct },
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
        if (backend && res.ok && method === 'GET') {
          try {
            const clone = res.clone();
            const text = await clone.text();
            captureCsrfFromBody(text);
            if (API_RE.test(url)) cachePut(cacheKey(url), text);
            return maybePatchJsonFetchResponse(res, text, url, method);
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
        notifyOfflineBlocked('Action');
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
        notifyOfflineBlocked('Action');
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
        notifyOfflineBlocked('Action');
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
        if (!nativeOnline && dest.pathname !== (location.pathname || '/')) {
          evt.preventDefault();
          evt.stopPropagation();
          if (dest.pathname.indexOf('/compte') === 0) location.hash = '#/compte';
          else if (dest.pathname.indexOf('/assistance') === 0) location.hash = '#/assistance';
          else notifyOfflineBlocked('Cette page');
        }
        return;
      }
      const sameDaxiHost = /daxipro\.com$/i.test(host) && /daxipro\.com$/i.test(window.location.hostname || '');
      if (sameDaxiHost && (dest.pathname.indexOf('/driver') === 0 || dest.pathname.indexOf('/entreprise') === 0 || dest.pathname.indexOf('/admin-dashboard') === 0)) {
        const localNext = dest.pathname + dest.search + dest.hash;
        if (localNext !== location.pathname + location.search + location.hash) {
          evt.preventDefault();
          evt.stopPropagation();
          window.location.assign(localNext);
        }
        return;
      }
      if (!local && !/ngrok|daxipro\.com$/i.test(host) && dest.origin !== window.location.origin) return;
      if (!nativeOnline) {
        evt.preventDefault();
        evt.stopPropagation();
        notifyOfflineBlocked('Cette page');
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

// Diagnostic instrumentation (audit phase 0). Queues until daxi-gps-diag.js loads,
// because this bundle runs from <head> well before the deferred asset chain.
function gpsDiag(method, ...args) {
  try {
    const diag = window.DaxiGpsDiag;
    if (diag && typeof diag[method] === 'function') {
      diag[method](...args);
      return;
    }
    window._daxiGpsDiagQueue = window._daxiGpsDiagQueue || [];
    if (window._daxiGpsDiagQueue.length < 200) {
      window._daxiGpsDiagQueue.push([method, ...args]);
    }
  } catch (e) {}
}

// Single writer helper so every mutation of _daxiLastNativeGps is observable.
function setLastNativeGps(next, origin) {
  gpsDiag('bridgeWrite', origin, next, window._daxiLastNativeGps);
  window._daxiLastNativeGps = next;
  return next;
}

async function readNativeGps() {
  if (!window._daxiGpsPerm) {
    throw new Error('permission');
  }
  const last = window._daxiLastNativeGps;
  // Live watch already has a fix: return it. Never treat a JS wall-clock cache
  // as a reason to call getLastLocation() (maximumAge > 0 on the stock plugin).
  if (last && last.lat != null && gpsWatchId != null) {
    gpsDiag('bridgeCacheHit', last.ageMs != null ? last.ageMs : (last.ts ? Date.now() - last.ts : 0));
    return last;
  }
  if (usesDaxiGpsPlugin()) {
    gpsDiag('bridgeNote', 'DaxiGps.getFreshPosition (no getLastLocation)', { timeout: 15000 });
    const pos = await DaxiGps.getFreshPosition({ timeout: 15000 });
    return normalizeFix(pos);
  }
  gpsDiag('bridgeNote', 'getCurrentPosition maximumAge=0 (fresh only)', {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  });
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  });
  return normalizeFix(pos);
}

function usesDaxiGpsPlugin() {
  return Capacitor.getPlatform() === 'android';
}

function classifyLocationPerm(perm) {
  if (!perm) return 'denied';
  if (perm.kind === 'fine' || perm.precise === true || perm.location === 'granted') return 'fine';
  if (perm.kind === 'coarse' || perm.coarseLocation === 'granted') return 'coarse';
  return 'denied';
}

function applyLocationPerm(perm, source) {
  const kind = classifyLocationPerm(perm);
  window._daxiGpsPermKind = kind;
  window._daxiGpsPrecise = kind === 'fine';
  window._daxiGpsPerm = kind === 'fine';
  gpsDiag('permission', {
    source,
    perm: kind,
    precise: kind === 'fine',
    location: perm && perm.location,
    coarseLocation: perm && perm.coarseLocation,
    warn: kind === 'coarse',
  });
  return kind;
}

function notifyLocationKind(kind) {
  if (kind === 'fine') {
    if (window._daxiOnNativeLocationGranted) {
      window._daxiOnNativeLocationGranted(undefined, undefined, undefined);
    }
    return;
  }
  if (kind === 'coarse') {
    if (window._daxiOnNativeLocationApproximate) window._daxiOnNativeLocationApproximate();
    else if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
    return;
  }
  if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
}

async function requestFineLocationPerm() {
  if (usesDaxiGpsPlugin()) {
    await DaxiGps.requestPermissions();
    return DaxiGps.permissionKind();
  }
  return Geolocation.requestPermissions();
}

async function checkFineLocationPerm() {
  if (usesDaxiGpsPlugin()) {
    return DaxiGps.permissionKind();
  }
  return Geolocation.checkPermissions();
}

function normalizeFix(raw) {
  if (!raw) return null;
  const coords = raw.coords;
  const ageMs = raw.ageMs != null ? +raw.ageMs : null;
  const nativeTs = raw.timestamp || null;
  // Wall clock of the fix, derived from elapsedRealtime age when we have it.
  // Date.now() as `ts` was erasing that age (audit section 4).
  const ts = ageMs != null && isFinite(ageMs) ? Date.now() - ageMs : (nativeTs || Date.now());
  if (coords) {
    return {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      speed: coords.speed,
      heading: coords.heading,
      ts,
      nativeTs,
      ageMs,
    };
  }
  return {
    lat: raw.lat,
    lng: raw.lng,
    accuracy: raw.accuracy,
    altitude: raw.altitude,
    speed: raw.speed,
    heading: raw.heading,
    ts,
    time: ts,
    nativeTs,
    ageMs,
    elapsedRealtimeNanos: raw.elapsedRealtimeNanos || null,
    provider: raw.provider || null,
    precise: raw.precise,
  };
}

function applyNativeFix(raw, origin) {
  const next = normalizeFix(raw);
  if (!next) return null;
  setLastNativeGps(next, origin);
  try {
    if (typeof window._daxiOnNativeGpsFix === 'function') {
      window._daxiOnNativeGpsFix(window._daxiLastNativeGps);
    }
  } catch (eFix) {}
  return next;
}

function startGpsWatch() {
  if (gpsWatchId != null) return;
  if (usesDaxiGpsPlugin()) {
    gpsDiag('request', {
      api: 'DaxiGps.watch',
      priority: 'HIGH_ACCURACY',
      interval: 1000,
      minInterval: 500,
      maxDelay: 0,
      waitForAccurateLocation: true,
    });
    DaxiGps.watch({}, (pos, err) => {
      if (err || !pos || pos.lat == null) {
        gpsDiag('bridgeNote', 'DaxiGps.watch callback without coords', { error: err && err.message });
        return;
      }
      applyNativeFix(pos, 'watch');
    }).then((id) => {
      gpsWatchId = id;
      gpsDiag('bridgeNote', 'watch registered', { id: String(id).slice(0, 12), plugin: 'DaxiGps' });
    }).catch((e) => {
      gpsDiag('bridgeNote', 'DaxiGps.watch failed', { error: e && e.message, warn: true });
    });
    return;
  }
  gpsDiag('request', {
    api: 'fused/watchPosition',
    priority: 'HIGH_ACCURACY (only if ACCESS_FINE_LOCATION granted)',
    interval: 10000,
    minInterval: 5000,
    maxDelay: 30000,
  });
  Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 30000 }, (pos, err) => {
    if (err || !pos || !pos.coords) {
      gpsDiag('bridgeNote', 'watchPosition callback without coords', { error: err && err.message });
      return;
    }
    applyNativeFix(pos, 'watch');
  }).then((id) => {
    gpsWatchId = id;
    gpsDiag('bridgeNote', 'watch registered', { id: String(id).slice(0, 12) });
  }).catch((e) => {
    gpsDiag('bridgeNote', 'watchPosition failed', { error: e && e.message, warn: true });
  });
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

function toHttpsDaxiUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  try {
    if (/^daxi:/i.test(s)) s = s.replace(/^daxi:\/\//i, 'https://daxipro.com/');
    const u = new URL(s, 'https://daxipro.com');
    const host = String(u.hostname || '').replace(/^www\./i, '').toLowerCase();
    if (host && host !== 'daxipro.com') return '';
    return u.origin + u.pathname + u.search + u.hash;
  } catch (e) {
    return '';
  }
}

function isOffHomeDeepLink(raw) {
  if (window.DaxiDeepLinkRouter && typeof window.DaxiDeepLinkRouter.isOffHome === 'function') {
    return window.DaxiDeepLinkRouter.isOffHome(raw);
  }
  const dest = toHttpsDaxiUrl(raw);
  if (!dest) return false;
  try {
    const u = new URL(dest);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return path !== '/';
  } catch (e2) {
    return false;
  }
}

function installDaxiDeepLink() {
  if (window.DaxiDeepLink && window.DaxiDeepLink._daxiNative) return window.DaxiDeepLink;
  const api = {
    _daxiNative: true,
    _pending: null,
    handle(raw) {
      const url = String(raw || '').trim();
      if (!url) return;
      pushLog('Deep link received', { url: url.slice(0, 180) });
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
      const url = String(raw || '').trim();
      if (!url) return true;
      if (window.DaxiDeepLinkRouter) {
        const parsed = window.DaxiDeepLinkRouter.parse(url);
        pushLog('Deep link executed', { type: parsed && parsed.type, path: parsed && parsed.path });
        window.DaxiDeepLinkRouter.apply(parsed);
        return true;
      }
      const dest = toHttpsDaxiUrl(url);
      if (!dest) return false;
      try {
        const here = location.origin + location.pathname + location.search + location.hash;
        if (here !== dest) location.assign(dest);
        return true;
      } catch (e) {
        return false;
      }
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
      // Reached only while the watch id is still pending: this is the race window
      // where several in-flight reads can overwrite each other (audit section 9).
      gpsDiag('bridgeNote', 'refreshLocation while watch id pending', { warn: true });
      readNativeGps()
        .then((p) => {
          setLastNativeGps(p, 'refreshLocation');
        })
        .catch(() => {});
    },
    getFcmToken: () => window._daxiFcmToken || '',
    notifyMapReady: () => {},
    openLocationSettings: () => {
      if (usesDaxiGpsPlugin()) DaxiGps.openAppSettings().catch(() => {});
    },
    requestLocationPermission: () => {
      requestFineLocationPerm()
        .then(async (perm) => {
          const kind = applyLocationPerm(perm, 'requestPermissions');
          notifyLocationKind(kind);
          if (kind !== 'fine') return;
          startGpsWatch();
          readNativeGps()
            .then((p) => {
              setLastNativeGps(p, 'requestLocationPermission');
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
  // Never prompt OS permission on boot — driver/client UI shows a modal first,
  // then calls DaxiAndroid.requestLocationPermission().
  gpsDiag('startup', {
    platform: Capacitor.getPlatform(),
    plugin: usesDaxiGpsPlugin() ? 'DaxiGps (1Hz, no batch)' : '@capacitor/geolocation 6.1.1',
  });
  try {
    const perm = await checkFineLocationPerm();
    const kind = applyLocationPerm(perm, 'checkPermissions');
    if (kind !== 'fine') {
      if (kind === 'coarse') notifyLocationKind('coarse');
      return;
    }
    startGpsWatch();
    notifyLocationKind('fine');
    readNativeGps()
      .then((p) => {
        setLastNativeGps(p, 'initGps');
        if (window._daxiOnNativeGpsFix) window._daxiOnNativeGpsFix(p);
      })
      .catch(() => {});
  } catch (e) {
    window._daxiGpsPerm = false;
    gpsDiag('permission', { source: 'checkPermissions', perm: 'error', error: String(e), warn: true });
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

async function restoreShellRoleAndRedirect(launchUrl) {
  if (launchUrl && isOffHomeDeepLink(launchUrl)) return false;
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
  if (role === 'driver') {
    if (path.indexOf('/driver') >= 0) return false;
    location.replace('/driver/');
    return true;
  }
  if (role === 'admin') {
    if (path.indexOf('/admin') >= 0) return false;
    location.replace('/admin-dashboard/');
    return true;
  }
  if (path.indexOf('/entreprise/dashboard') >= 0) return false;
  location.replace('/entreprise/dashboard/');
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
      const apiHost = base ? new URL(base).hostname : '';
      if (apiHost && u.hostname === apiHost && u.pathname) {
        return u.toString();
      }
      return s;
    }
    const origin = base || (typeof location !== 'undefined' ? location.origin : '');
    if (!origin) return s;
    if (s.startsWith('/')) return origin + s;
    if (/^(media|static|assets|uploads|villes)\//i.test(s)) return origin + '/' + s;
  } catch (e) {}
  return s;
}

function isRemoteMediaUrl(url) {
  const s = String(url || '');
  if (!s || /^(blob:|data:)/i.test(s)) return false;
  if (/cloudinary\.com/i.test(s)) return true;
  const base = getApiBase();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const apiHost = base ? new URL(base).hostname : '';
      if (apiHost && u.hostname === apiHost) {
        return /\/(media|assets|villes)\//i.test(u.pathname);
      }
      return true;
    } catch (e) {
      return true;
    }
  }
  return /^(media|assets|villes)\//i.test(s) || /^\/(media|assets|villes)\//i.test(s);
}

function rewriteJsonMediaDeep(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (
      /^(media|static|assets|uploads|villes)\//i.test(t) ||
      /^\/(media|static|assets|uploads|villes)\//i.test(t) ||
      (/^https?:\/\//i.test(t) && /\/(media|assets|villes)\//i.test(t))
    ) {
      return rewriteMediaUrl(t);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(rewriteJsonMediaDeep);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      out[k] = rewriteJsonMediaDeep(value[k]);
    });
    return out;
  }
  return value;
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
      const src = el.getAttribute('src') || '';
      if (isRemoteMediaUrl(src)) {
        if (!el.getAttribute('loading')) el.setAttribute('loading', 'lazy');
        el.setAttribute('decoding', 'async');
      } else if (!el.getAttribute('loading')) {
        el.setAttribute('loading', 'eager');
      }
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
      waitForOnline(1200).then(() => {
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
  const start = () => {
    if (!nativeOnline && navigator.onLine === false) {
      mapLog('Maps deferred — offline');
      try {
        if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
          DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
        }
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
      } catch (e) {}
      return;
    }
    mapLog('Starting Google Maps');
    if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
  };
  const later = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 1200 });
    else setTimeout(start, 400);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later);
  else later();
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
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
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


function bootMark(n) {
  try {
    if (typeof window._daxiBootMark === 'function') window._daxiBootMark(n);
  } catch (e) {}
}

function waitIntroComplete() {
  if (window._daxiIntroDone || !window._daxiIntroPlaying) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    window.addEventListener('daxi:intro-complete', done, { once: true });
    document.addEventListener('daxi:intro-complete', done, { once: true });
    setTimeout(resolve, 2800);
  });
}

function hideSplashWhenPainted() {
  if (window._daxiSplashHidden) return;
  window._daxiSplashHidden = true;
  bootMark('splash-hide');
  SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => {});
}

function bindIntroSplashHandoff() {
  if (window._daxiIntroSplashBound) return;
  window._daxiIntroSplashBound = true;
  const onVisible = () => hideSplashWhenPainted();
  window.addEventListener('daxi:intro-visible', onVisible, { once: true });
  document.addEventListener('daxi:intro-visible', onVisible, { once: true });
  window.addEventListener(
    'daxi:intro-complete',
    () => {
      if (!window._daxiSplashHidden) hideSplashWhenPainted();
    },
    { once: true },
  );
}

async function readLaunchUrl() {
  let url = '';
  try {
    const launch = await App.getLaunchUrl();
    if (launch && launch.url) url = String(launch.url);
  } catch (e) {}
  if (!url) {
    try { url = sessionStorage.getItem('daxi_pending_deeplink') || ''; } catch (e2) {}
  }
  return url;
}

async function boot() {
  if (!Capacitor.isNativePlatform()) return;
  bootMark('cap-js');
  markNative();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    nativeOnline = false;
    window._daxiNativeOnline = false;
  }
  bindIntroSplashHandoff();
  bootMark('shell-ready');
  const cfg = installDaxiApiGlobal();
  if (window.DaxiApi) window.DaxiApi.probe = probeBackend;
  if (!cfg.ok) toast('[DAXI API] ' + (cfg.error || 'configuration invalide'));
  installDaxiDeepLink();
  installNativeBridge();
  patchNetworking();
  try {
    if (window.DaxiIntro && typeof window.DaxiIntro.play === 'function' && !window._daxiIntroPromise) {
      window.DaxiIntro.play();
    }
  } catch (eIntro) {}
  wrapGetCsrfToken();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrapGetCsrfToken);
  } else {
    wrapGetCsrfToken();
  }
  hookShareUi();
  initChrome().catch(() => {});
  initNetwork()
    .then(() => restoreOfflineReads())
    .catch(() => {});
  readLaunchUrl()
    .then((launchUrl) => {
      if (launchUrl) handleDeepLink(launchUrl);
      restoreShellRoleAndRedirect(launchUrl).then((redirected) => {
        if (redirected) return;
        try { sessionStorage.setItem('daxi_shell_nav', '1'); } catch (eNav2) {}
      });
    })
    .catch(() => {});
  setTimeout(() => initNativeMap(), 0);
  bootMark('gps-start');
  initGps().catch(() => {});
  bootMark('push-start');
  initPush().catch(() => {});
  initDeepLinks().catch(() => {});
  probeBackend().catch(() => {});
  const gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
  if (gid) persistNative('guest_id', gid);
  setTimeout(() => {
    if (window._daxiOnNativeAppRevealed) window._daxiOnNativeAppRevealed();
  }, 0);
  let tries = 0;
  const flushLink = () => {
    tries += 1;
    if (window.DaxiDeepLink) window.DaxiDeepLink.ready();
    if (tries < 8) setTimeout(flushLink, 400);
  };
  setTimeout(flushLink, 200);
}

try {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (Capacitor.isNativePlatform() || /DaxiAndroid|Capacitor/i.test(ua)) {
    installNativeBridge();
  }
} catch (e) {}
boot();
