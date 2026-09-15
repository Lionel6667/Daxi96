/**
 * Phase 8 — Driver lifecycle helpers (login, seed, online, accept, status).
 * Cap-Haïtien / Nord coords. Uses manage.py seed script for payable orders.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { CAP_HAITIEN, LABADEE, installGeolocationMock } = require('./geo');
const { stubGoogleMaps: stubGoogleMapsShared } = require('./maps_stub');
const { resolveDriverCredentials, baseUrl } = require('./auth');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const SEED_SCRIPT = path.join(__dirname, 'seed_driver_order.py');

function runSeed(args) {
  const r = spawnSync(VENV_PYTHON, [SEED_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) {
    throw new Error(
      `seed_driver_order.py ${args.join(' ')} failed (exit ${r.status}): ${err || out || 'no output'}`,
    );
  }
  const line = out.split('\n').filter(Boolean).pop() || '';
  let data;
  try {
    data = JSON.parse(line);
  } catch (e) {
    throw new Error(`seed_driver_order.py did not return JSON: ${line.slice(0, 400)}`);
  }
  if (!data.ok) {
    throw new Error(`seed_driver_order.py error: ${JSON.stringify(data)}`);
  }
  return data;
}

function ensureDemoDriver() {
  return runSeed(['ensure-demo']);
}

function clearDriverLoginRateLimit() {
  const py = [
    'import os,django',
    "os.environ.setdefault('DJANGO_SETTINGS_MODULE','julmin_taxis.settings')",
    'django.setup()',
    'from django.conf import settings',
    'import redis',
    'r=redis.from_url(settings.REDIS_URL)',
    'n=0',
    "for k in r.keys('*'):",
    '  ks=k.decode() if isinstance(k,bytes) else k',
    "  if 'driver_login' in ks or 'daxi_rl' in ks:",
    '    r.delete(k); n+=1',
    'print(n)',
  ].join('; ');
  // Use newlines via exec for the for-loop
  const script = `
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'julmin_taxis.settings')
django.setup()
from django.conf import settings
import redis
r = redis.from_url(settings.REDIS_URL)
n = 0
for k in r.keys('*'):
    ks = k.decode() if isinstance(k, bytes) else k
    if 'driver_login' in ks or 'daxi_rl' in ks:
        r.delete(k)
        n += 1
print(n)
`.trim();
  const r = spawnSync(VENV_PYTHON, ['-c', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return (r.stdout || '').trim();
}


function clearDriverActive() {
  return runSeed(['clear-driver-active']);
}

/**
 * Create price_confirmed + in_person order in Cap-Haïtien (acceptible by demo driver).
 * @param {{ guestId?: string, tag?: string }} [opts]
 */
function seedAcceptableOrder(opts = {}) {
  const args = ['create', '--tag', opts.tag || 'phase8'];
  if (opts.guestId) args.push('--guest-id', opts.guestId);
  return runSeed(args);
}

function readOrderStatus(orderId) {
  return runSeed(['status', String(orderId)]);
}

/**
 * Stub Google Maps JS (InvalidKey overlays block clicks locally).
 * @param {import('@playwright/test').Page} page
 */
async function stubGoogleMaps(page) {
  return stubGoogleMapsShared(page);
}

/**
 * Install Cap-Haïtien geo mock + permission for driver shell.
 * @param {import('@playwright/test').Page} page
 * @param {{ latitude?: number, longitude?: number }} [coords]
 */
async function prepareDriverGeo(page, coords = CAP_HAITIEN) {
  const lat = coords.latitude ?? CAP_HAITIEN.latitude;
  const lng = coords.longitude ?? CAP_HAITIEN.longitude;
  await page.addInitScript(installGeolocationMock, {
    latitude: lat,
    longitude: lng,
    accuracy: 12,
  });
  const origin = baseUrl();
  await page.context().grantPermissions(['geolocation'], { origin }).catch(() => {});
  await page.context().setGeolocation({ latitude: lat, longitude: lng, accuracy: 12 }).catch(() => {});
}

/**
 * UI login at /driver/login/ — asserts HX redirect to /driver/.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @param {{ email?: string, password?: string }} [options]
 */
async function loginAsDriverUI(page, testInfo, options = {}) {
  const { email, pass, source } = resolveDriverCredentials(testInfo);
  clearDriverLoginRateLimit();
  const user = options.email || email;
  const password = options.password || pass;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description: `Driver credentials source=${source} user=${user}`,
    });
  }

  await stubGoogleMaps(page);
  await prepareDriverGeo(page);

  const res = await page.goto('/driver/login/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!res || (!res.ok() && res.status() !== 304)) {
    throw new Error(`GET /driver/login/ failed: ${res && res.status()}`);
  }

  await page.locator('#drv-login-email').fill(user);
  await page.locator('#driver-login-form input[name="password"]').fill(password);
  // Sync hidden identifier (product JS does this on submit; set explicitly for HTMX)
  await page.evaluate((em) => {
    const hid = document.getElementById('drv-login-identifier');
    if (hid) hid.value = em;
  }, user);

  await Promise.all([
    page.waitForURL(/\/driver\/?$/, { timeout: 30_000 }),
    page.locator('#driver-login-submit-btn').click(),
  ]);

  await page.waitForSelector('#drv-status-pill, #drv-status-label', { timeout: 20_000 });
  // Let boot fetches settle (SQLite + FakeRedis are sensitive to stampede)
  await page.waitForTimeout(800);
  await page.request.get('/htmx/driver/active-order/').catch(() => {});
  return { email: user, password, source };
}

/**
 * Read csrftoken from page cookies.
 * @param {import('@playwright/test').Page} page
 */
async function getCsrf(page) {
  const cookies = await page.context().cookies();
  const c = cookies.find((x) => x.name === 'csrftoken');
  if (!c || !c.value) {
    throw new Error('Missing csrftoken cookie — open /driver/login/ or /driver/ first');
  }
  return c.value;
}

/**
 * POST /htmx/driver/status/ session=open|sync|close
 * @param {import('@playwright/test').Page} page
 * @param {'open'|'sync'|'close'} session
 */
async function postDriverSession(page, session = 'open') {
  const csrf = await getCsrf(page);
  const res = await page.request.post('/htmx/driver/status/', {
    form: { session, format: 'json' },
    headers: {
      'X-CSRFToken': csrf,
      Accept: 'application/json',
      Referer: baseUrl() + '/driver/',
    },
  });
  const text = await res.text();
  if (!res.ok()) {
    throw new Error(`driver status ${session} HTTP ${res.status()}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

/**
 * POST driver location (Cap-Haïtien by default) for proximity gate.
 * @param {import('@playwright/test').Page} page
 * @param {{ latitude?: number, longitude?: number }} [coords]
 */
async function postDriverLocation(page, coords = CAP_HAITIEN) {
  const csrf = await getCsrf(page);
  const lat = coords.latitude ?? CAP_HAITIEN.latitude;
  const lng = coords.longitude ?? CAP_HAITIEN.longitude;
  const res = await page.request.post('/htmx/driver/location/', {
    form: { lat: String(lat), lng: String(lng) },
    headers: {
      'X-CSRFToken': csrf,
      Referer: baseUrl() + '/driver/',
    },
  });
  if (!res.ok()) {
    const t = await res.text();
    throw new Error(`driver location HTTP ${res.status()}: ${t.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Fetch available orders HTML.
 * @param {import('@playwright/test').Page} page
 */
async function fetchAvailableOrdersHtml(page) {
  const res = await page.request.get('/htmx/driver/orders/?tab=available');
  if (!res.ok()) {
    throw new Error(`available orders HTTP ${res.status()}`);
  }
  return res.text();
}

/**
 * POST accept order.
 * @param {import('@playwright/test').Page} page
 * @param {number|string} orderId
 */
async function postAcceptOrder(page, orderId, opts = {}) {
  const attempts = opts.attempts || 4;
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    const csrf = await getCsrf(page);
    const res = await page.request.post(`/htmx/driver/orders/${orderId}/accept/`, {
      headers: {
        'X-CSRFToken': csrf,
        Referer: baseUrl() + '/driver/',
      },
    });
    const text = await res.text();
    if (!res.ok()) {
      lastErr = new Error(`accept ${orderId} HTTP ${res.status()}: ${text.slice(0, 400)}`);
    } else if (/Impossible d|Acceptation impossible|Transition invalide|déjà été/i.test(text)) {
      // Definite business rejection — do not retry
      throw new Error(`accept ${orderId} rejected: ${text.slice(0, 400)}`);
    } else if (/Erreur lors de l'acceptation/i.test(text)) {
      lastErr = new Error(`accept ${orderId} body error: ${text.slice(0, 400)}`);
    } else if (/Commande acceptée/i.test(text)) {
      return text;
    } else if (/daxi-htmx-error|erreur|Erreur/i.test(text)) {
      lastErr = new Error(`accept ${orderId} body error: ${text.slice(0, 400)}`);
    } else {
      return text;
    }
    await page.waitForTimeout(400 * i);
  }
  throw lastErr || new Error(`accept ${orderId} failed after retries`);
}

/**
 * POST status transition.
 * @param {import('@playwright/test').Page} page
 * @param {number|string} orderId
 * @param {string} status
 */
async function postOrderStatus(page, orderId, status) {
  const csrf = await getCsrf(page);
  const res = await page.request.post(`/htmx/driver/orders/${orderId}/status/`, {
    form: { status },
    headers: {
      'X-CSRFToken': csrf,
      Referer: baseUrl() + '/driver/',
    },
  });
  const text = await res.text();
  if (!res.ok()) {
    throw new Error(`status ${status} HTTP ${res.status()}: ${text.slice(0, 400)}`);
  }
  if (/daxi-htmx-error|Transition invalide|Statut invalide|devez être/i.test(text) && !/Statut mis à jour/i.test(text)) {
    throw new Error(`status ${status} rejected: ${text.slice(0, 400)}`);
  }
  return text;
}

/**
 * GET /htmx/driver/active-order/ JSON
 * @param {import('@playwright/test').Page} page
 */
async function fetchActiveOrder(page) {
  const res = await page.request.get('/htmx/driver/active-order/');
  if (!res.ok()) {
    throw new Error(`active-order HTTP ${res.status()}`);
  }
  return res.json();
}


function seedDriverMidflow(status, tag) {
  const args = ['create-midflow', '--status', status || 'on_way', '--tag', tag || 'run3'];
  return runSeed(args);
}

module.exports = {
  CAP_HAITIEN,
  LABADEE,
  ensureDemoDriver,
  clearDriverLoginRateLimit,
  clearDriverActive,
  seedAcceptableOrder,
  seedDriverMidflow,
  readOrderStatus,
  stubGoogleMaps,
  prepareDriverGeo,
  loginAsDriverUI,
  getCsrf,
  postDriverSession,
  postDriverLocation,
  fetchAvailableOrdersHtml,
  postAcceptOrder,
  postOrderStatus,
  fetchActiveOrder,
  REPO_ROOT,
};
