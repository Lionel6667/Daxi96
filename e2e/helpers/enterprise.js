/**
 * Phase Enterprise — helpers for /entreprise/ + /entreprise/dashboard/
 * Demo: demo.entreprise@daxi.ht / DemoDaxi2026! (manage.py create_demo_accounts)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { stubGoogleMaps: stubGoogleMapsShared } = require('./maps_stub');
const { resolveEnterpriseCredentials, baseUrl } = require('./auth');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const SEED_SCRIPT = path.join(__dirname, 'seed_enterprise_order.py');

function runManage(args) {
  const r = spawnSync(VENV_PYTHON, ['manage.py', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (r.status !== 0) {
    throw new Error(
      `manage.py ${args.join(' ')} failed (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 800)}`,
    );
  }
  return (r.stdout || '').trim();
}

function runSeed(args) {
  const r = spawnSync(VENV_PYTHON, [SEED_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (r.status !== 0) {
    throw new Error(
      `seed_enterprise_order.py ${args.join(' ')} failed (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 1000)}`,
    );
  }
  const out = (r.stdout || '').trim();
  try {
    return JSON.parse(out.split('\n').filter(Boolean).pop());
  } catch {
    return { raw: out };
  }
}

function ensureDemoEnterprise() {
  return runManage(['create_demo_accounts']);
}

/**
 * Ensure approved self_order enterprise + GPS + sample orders for checkout / tabs.
 * @returns {{ enterprise_id: number, accept_price_order_id?: number, choose_payment_order_id?: number }}
 */
function seedEnterpriseTestData(opts = {}) {
  const args = ['ensure'];
  if (opts.fresh) args.push('--fresh');
  return runSeed(args);
}

function clearEnterpriseRateLimit() {
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
    if 'enterprise' in ks or 'daxi_rl' in ks or 'auth_login' in ks:
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

/**
 * Stub Google Maps JS (InvalidKey overlays / console noise locally).
 * @param {import('@playwright/test').Page} page
 */
async function stubGoogleMaps(page) {
  return stubGoogleMapsShared(page);
}

/**
 * Collect pageerror messages; ignore known third-party / maps noise.
 * @param {import('@playwright/test').Page} page
 * @returns {{ errors: string[], dispose: () => void }}
 */
function attachPageErrorCollector(page) {
  /** @type {string[]} */
  const errors = [];
  const ignore =
    /Loading the Google Maps|InvalidKeyMapError|google\.maps|ResizeObserver loop|Chart\.js|favicon|net::ERR_|Failed to load resource|WebSocket|ws:\/\//i;
  const onError = (err) => {
    const msg = err && err.message ? String(err.message) : String(err);
    if (ignore.test(msg)) return;
    errors.push(msg);
  };
  page.on('pageerror', onError);
  return {
    errors,
    dispose: () => page.off('pageerror', onError),
  };
}

/**
 * Dismiss location / admin-pending overlays if they block the shell.
 * @param {import('@playwright/test').Page} page
 */
async function dismissEntOverlays(page) {
  await page.evaluate(() => {
    const loc = document.getElementById('ent-loc-overlay');
    if (loc && getComputedStyle(loc).display !== 'none') {
      if (typeof closeEntLocationModal === 'function') closeEntLocationModal(true);
      else loc.style.display = 'none';
    }
    const adminPending = document.getElementById('ent-admin-pending-modal');
    if (adminPending && typeof closeEntAdminPendingModal === 'function') {
      closeEntAdminPendingModal();
    }
    document.body.style.overflow = '';
  }).catch(() => {});
}

/**
 * UI login at /entreprise/?tab=login via POST /htmx/enterprise/login/
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @param {{ email?: string, password?: string }} [options]
 */
async function loginAsEnterpriseUI(page, testInfo, options = {}) {
  const { email, pass, source } = resolveEnterpriseCredentials(testInfo);
  clearEnterpriseRateLimit();
  const user = options.email || email;
  const password = options.password || pass;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description: `Enterprise credentials source=${source} user=${user}`,
    });
  }

  await stubGoogleMaps(page);
  const res = await page.goto('/entreprise/?tab=login', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  if (!res || (!res.ok() && res.status() !== 304)) {
    throw new Error(`GET /entreprise/ failed: ${res && res.status()}`);
  }

  // Already redirected to dashboard?
  if (/\/entreprise\/dashboard\/?/.test(page.url())) {
    await waitForEnterpriseDashboard(page);
    return { email: user, password, source };
  }

  await page.locator('#tab-login-btn').click().catch(() => {});
  await expectLoginForm(page);

  await page.locator('#ent-login-form input[name="email"]').fill(user);
  await page.locator('#ent-login-form input[name="password"]').fill(password);

  const waitLogin = page.waitForResponse(
    (r) => /\/htmx\/enterprise\/login\/?/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.locator('#login-submit-btn').click();
  const loginResp = await waitLogin;
  if (!loginResp.ok()) {
    const body = await loginResp.text();
    throw new Error(`enterprise login HTTP ${loginResp.status()}: ${body.slice(0, 400)}`);
  }
  const data = await loginResp.json().catch(() => ({}));
  if (data.error) {
    throw new Error(`enterprise login rejected: ${data.error}`);
  }
  if (data.status && data.status !== 'approved') {
    throw new Error(`enterprise status=${data.status} (need approved for dashboard)`);
  }

  await page.waitForURL(/\/entreprise\/dashboard\/?/, { timeout: 30_000 });
  await waitForEnterpriseDashboard(page);
  return { email: user, password, source };
}

async function expectLoginForm(page) {
  await page.locator('#auth-login-form').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#ent-login-form input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('#ent-login-form input[name="password"]').waitFor({ state: 'visible' });
  await page.locator('#login-submit-btn').waitFor({ state: 'visible' });
}

/**
 * Wait for dashboard shell + HTMX dashboard/orders load.
 * @param {import('@playwright/test').Page} page
 */
async function waitForEnterpriseDashboard(page) {
  await page.waitForSelector('#ent-company-name', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const name = document.getElementById('ent-company-name');
    if (!name) return false;
    const t = (name.textContent || '').trim();
    return t && t !== 'Chargement...';
  }, { timeout: 45_000 }).catch(() => {});
  await dismissEntOverlays(page);
  // Let orders HTMX settle
  await page.waitForTimeout(700);
  await dismissEntOverlays(page);
}

/**
 * Switch orders tab (active | history) and wait for HTMX list.
 * @param {import('@playwright/test').Page} page
 * @param {'active'|'history'} tab
 */
async function switchEntOrdersTab(page, tab) {
  const wait = page.waitForResponse(
    (r) =>
      /\/htmx\/enterprise\/orders\/?/.test(r.url()) &&
      r.url().includes(`tab=${tab}`) &&
      r.request().method() === 'GET',
    { timeout: 25_000 },
  );
  await page.locator(`#etab-${tab}`).click();
  const resp = await wait;
  return resp;
}

module.exports = {
  ensureDemoEnterprise,
  seedEnterpriseTestData,
  clearEnterpriseRateLimit,
  stubGoogleMaps,
  attachPageErrorCollector,
  dismissEntOverlays,
  loginAsEnterpriseUI,
  expectLoginForm,
  waitForEnterpriseDashboard,
  switchEntOrdersTab,
  baseUrl,
};
