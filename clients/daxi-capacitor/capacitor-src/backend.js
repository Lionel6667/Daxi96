const DAXI_PATH_RE = /^\/(htmx|api|ws|accounts|media)(\/|$)/i;
const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie|x-csrftoken|x-api-key)$/i;

function apiDebugEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.DAXI_API_DEBUG_LOGS === false) return false;
  if (window.DAXI_API_DEBUG_LOGS === true) return true;
  return String(window.DAXI_API_ENV || 'development') !== 'production';
}

export function apiLog(msg, extra) {
  if (!apiDebugEnabled()) return;
  if (extra !== undefined) console.info('[DAXI API]', msg, extra);
  else console.info('[DAXI API]', msg);
}

export function normalizeBackendUrl(raw, opts) {
  const allowHttp = !!(opts && opts.allowHttp);
  const s = String(raw || '').trim();
  if (!s) {
    return { ok: false, url: '', error: 'DAXI_API_BASE_URL is empty' };
  }
  let url = s.replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { ok: false, url: '', error: 'DAXI_API_BASE_URL is not a valid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, url: '', error: 'DAXI_API_BASE_URL must be http(s)' };
  }
  if (parsed.protocol === 'http:' && !allowHttp) {
    return { ok: false, url: '', error: 'DAXI_API_BASE_URL must use HTTPS (set DAXI_API_ALLOW_HTTP for local http)' };
  }
  url = parsed.origin;
  return { ok: true, url: url, error: '' };
}

function sameOriginHttpBase() {
  try {
    if (typeof location === 'undefined') return '';
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return '';
    return location.origin || '';
  } catch (e) {
    return '';
  }
}

export function getApiBase() {
  const raw =
    (typeof window !== 'undefined' && (window.DAXI_API_BASE_URL || window._daxiLiveBaseUrl)) || '';
  const allowHttp = typeof window !== 'undefined' && !!window.DAXI_API_ALLOW_HTTP;
  if (!String(raw).trim()) {
    return sameOriginHttpBase();
  }
  const n = normalizeBackendUrl(raw, { allowHttp: allowHttp });
  return n.ok ? n.url : sameOriginHttpBase();
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function toWsBase(httpBase) {
  return String(httpBase).replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

export function isDaxiBackend(url) {
  const s = String(url || '');
  if (!s || /^(blob:|data:|capacitor:)/i.test(s)) return false;
  if (s.startsWith('/') && DAXI_PATH_RE.test(s)) return true;
  const base = getApiBase();
  try {
    const resolved = new URL(s, base || 'https://localhost');
    if (!DAXI_PATH_RE.test(resolved.pathname)) return false;
    if (isLocalHost(resolved.hostname)) return true;
    if (!base) return false;
    return resolved.origin === new URL(base).origin;
  } catch (e) {
    return false;
  }
}

export function backendUrl(pathOrUrl) {
  const s = String(pathOrUrl || '');
  if (!s) return s;
  if (/^(blob:|data:|capacitor:)/i.test(s)) return s;
  if (/^wss?:\/\//i.test(s)) return s;
  const base = getApiBase();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (isLocalHost(u.hostname) && DAXI_PATH_RE.test(u.pathname) && base) {
        return base + u.pathname + u.search + (u.hash || '');
      }
      return s;
    } catch (e) {
      return s;
    }
  }
  if (s.startsWith('/') && DAXI_PATH_RE.test(s) && base) {
    return base + s;
  }
  return s;
}

export function nativePageUrl(pathOrUrl) {
  const base = getApiBase();
  const s = String(pathOrUrl || '');
  if (!s || !base) return s;
  if (/^(blob:|data:|capacitor:|mailto:|tel:)/i.test(s)) return s;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (isLocalHost(u.hostname)) return base + u.pathname + u.search + (u.hash || '');
      return s;
    }
  } catch (e) {}
  if (s.startsWith('/')) return base.replace(/\/$/, '') + s;
  return s;
}

export function backendWsUrl(pathOrUrl) {
  let s = String(pathOrUrl || '');
  const base = getApiBase();
  if (!base) return s;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return toWsBase(u.origin) + u.pathname + u.search + (u.hash || '');
    }
    if (/^wss?:\/\//i.test(s)) {
      const u = new URL(s);
      if (!isLocalHost(u.hostname)) return s;
      return toWsBase(base) + u.pathname + u.search + (u.hash || '');
    }
  } catch (e) {
    return s;
  }
  if (!s.startsWith('/')) s = '/' + s.replace(/^\/+/, '');
  return toWsBase(base) + s;
}

export function classifyHttpStatus(status) {
  const n = Number(status) || 0;
  if (n === 400) return 'HTTP_400';
  if (n === 401) return 'HTTP_401';
  if (n === 403) return 'HTTP_403';
  if (n === 404) return 'HTTP_404';
  if (n === 429) return 'HTTP_429';
  if (n === 500) return 'HTTP_500';
  if (n === 502) return 'HTTP_502';
  if (n === 503) return 'HTTP_503';
  if (n >= 500) return 'HTTP_5xx';
  if (n >= 400) return 'HTTP_4xx';
  if (n >= 200 && n < 400) return 'HTTP_' + n;
  return 'HTTP_UNKNOWN';
}

export function classifyFetchError(err) {
  const name = err && err.name;
  const msg = String((err && err.message) || err || '');
  if (name === 'AbortError' || /timeout/i.test(msg)) return 'TIMEOUT';
  if (/offline/i.test(msg)) return 'NETWORK_ERROR';
  return 'NETWORK_ERROR';
}

export function logSafeHeaders(headers) {
  if (!headers || !apiDebugEnabled()) return;
  try {
    const out = {};
    headers.forEach((v, k) => {
      out[k] = SENSITIVE_HEADER.test(k) ? '[redacted]' : v;
    });
    return out;
  } catch (e) {
    return undefined;
  }
}

export function pathOnly(url) {
  try {
    const u = new URL(url, getApiBase() || 'https://localhost');
    return u.pathname + u.search;
  } catch (e) {
    return String(url || '');
  }
}

let csrfToken = '';

export function getStoredCsrf() {
  if (csrfToken) return csrfToken;
  try {
    if (typeof window !== 'undefined' && window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) {
      csrfToken = String(window.DJANGO_SESSION.csrf_token);
    }
  } catch (e) {}
  return csrfToken;
}

export function rememberCsrfToken(token) {
  const t = String(token || '').trim();
  if (!t) return;
  csrfToken = t;
  try {
    if (typeof window === 'undefined') return;
    window.DJANGO_SESSION = window.DJANGO_SESSION || {};
    window.DJANGO_SESSION.csrf_token = t;
  } catch (e) {}
}

export function rememberCsrfFromResponse(res) {
  if (!res || !res.headers) return;
  try {
    const h = res.headers.get('X-CSRFToken') || res.headers.get('x-csrftoken');
    if (h) rememberCsrfToken(h);
  } catch (e) {}
}

export function rememberCsrfFromPayload(data) {
  if (!data || typeof data !== 'object') return;
  if (data.csrf_token) rememberCsrfToken(data.csrf_token);
}

export function attachCsrfHeader(headers, method) {
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || !headers) return headers;
  const t = getStoredCsrf();
  if (!t) return headers;
  const existing = headers.get('X-CSRFToken') || headers.get('x-csrftoken') || '';
  if (!String(existing).trim()) headers.set('X-CSRFToken', t);
  return headers;
}

export function installDaxiApiGlobal() {
  let raw = typeof window !== 'undefined' ? window.DAXI_API_BASE_URL || window._daxiLiveBaseUrl : '';
  if (!String(raw).trim()) raw = sameOriginHttpBase();
  const n = normalizeBackendUrl(raw, {
    allowHttp: typeof window !== 'undefined' && !!window.DAXI_API_ALLOW_HTTP,
  });
  if (!n.ok) {
    apiLog('Invalid configuration:', n.error);
    if (typeof window !== 'undefined' && sameOriginHttpBase()) {
      window.DAXI_API_BASE_URL = sameOriginHttpBase();
      window._daxiLiveBaseUrl = window.DAXI_API_BASE_URL;
      apiLog('Base URL (same-origin): ' + window.DAXI_API_BASE_URL);
    }
  } else {
    window.DAXI_API_BASE_URL = n.url;
    window._daxiLiveBaseUrl = n.url;
    apiLog('Base URL: ' + n.url);
    apiLog('Env: ' + (window.DAXI_API_ENV || 'development'));
  }
  window.backendUrl = backendUrl;
  window.nativePageUrl = nativePageUrl;
  window.DaxiApi = {
    env: () => window.DAXI_API_ENV || 'development',
    baseUrl: getApiBase,
    backendUrl,
    nativePageUrl,
    backendWsUrl,
    normalizeBackendUrl,
    isDaxiBackend,
    classifyHttpStatus,
    lastError: null,
    lastProbe: null,
    getCsrfToken: getStoredCsrf,
  };
  return n;
}
