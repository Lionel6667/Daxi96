/**
 * Phase Admin — helpers for /admin-dashboard/ (JWT staff + session sync).
 * Demo: admin@daxi.com / DemoDaxi2026! (manage.py create_demo_accounts)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { stubGoogleMaps: stubGoogleMapsShared } = require('./maps_stub');
const { resolveAdminCredentials, baseUrl } = require('./auth');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');

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

function ensureDemoAdmin() {
  return runManage(['create_demo_accounts']);
}

function seedAdminTestData(opts = { clean: true, verify: true }) {
  const args = ['seed_admin_test_data'];
  if (opts.clean) args.push('--clean');
  if (opts.verify) args.push('--verify');
  return runManage(args);
}

function clearAdminLoginRateLimit() {
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
    if 'admin_login' in ks or 'daxi_rl' in ks or 'auth_login' in ks:
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
    /Loading the Google Maps|InvalidKeyMapError|google\.maps|ResizeObserver loop|Chart\.js|favicon|net::ERR_|Failed to load resource/i;
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
 * UI login at /admin-dashboard/ via AuthAPI (email + password, staff JWT).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @param {{ email?: string, password?: string }} [options]
 */
async function loginAsAdminUI(page, testInfo, options = {}) {
  const { email, pass, source } = resolveAdminCredentials(testInfo);
  clearAdminLoginRateLimit();
  const user = options.email || email;
  const password = options.password || pass;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description: `Admin credentials source=${source} user=${user}`,
    });
  }

  await stubGoogleMaps(page);
  const res = await page.goto('/admin-dashboard/', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  if (!res || (!res.ok() && res.status() !== 304)) {
    throw new Error(`GET /admin-dashboard/ failed: ${res && res.status()}`);
  }

  // Already logged in from storage?
  const mainVisible = await page.locator('#admin-main:not(.hidden)').isVisible().catch(() => false);
  if (mainVisible) {
    await waitForAdminReady(page);
    return { email: user, password, source };
  }

  await page.locator('#admin-email').fill(user);
  await page.locator('#admin-password').fill(password);

  const waitLogin = page.waitForResponse(
    (r) => /\/api\/auth\/login\/?/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.locator('button.admin-login-btn, button:has-text("Connexion")').first().click();
  const loginResp = await waitLogin;
  if (!loginResp.ok()) {
    const body = await loginResp.text();
    throw new Error(`admin login HTTP ${loginResp.status()}: ${body.slice(0, 400)}`);
  }

  await page.waitForSelector('#admin-main:not(.hidden)', { timeout: 30_000 });
  await page.waitForSelector('#admin-login.hidden, #admin-login[class*="hidden"]', {
    timeout: 15_000,
  }).catch(() => {});
  await waitForAdminReady(page);
  return { email: user, password, source };
}

/**
 * Wait for boot overlay done + dashboard shell.
 * @param {import('@playwright/test').Page} page
 */
async function waitForAdminReady(page) {
  await page.waitForFunction(() => {
    const main = document.getElementById('admin-main');
    if (!main || main.classList.contains('hidden')) return false;
    const overlay = document.getElementById('admin-boot-overlay');
    if (overlay && !overlay.classList.contains('is-done') && overlay.offsetParent !== null) {
      // overlay may still be fading; allow if stats started loading
      const stat = document.getElementById('stat-active-orders');
      if (stat && stat.textContent && stat.textContent.trim() !== '-' && stat.textContent.trim() !== '') {
        return true;
      }
      return overlay.classList.contains('is-done');
    }
    return true;
  }, { timeout: 45_000 });
  // Let prefetch settle (SQLite)
  await page.waitForTimeout(600);
}

/**
 * Navigate sidebar section and wait for section visible.
 * @param {import('@playwright/test').Page} page
 * @param {string} section  e.g. 'orders' | 'users' | 'drivers' | 'enterprises'
 * @param {{ waitUrl?: RegExp }} [opts]
 */
async function goAdminSection(page, section, opts = {}) {
  const nav = page.locator(`.nav-link[data-section="${section}"]`).first();
  await nav.click();
  await page.waitForSelector(`#admin-section-${section}:not(.hidden)`, { timeout: 20_000 });
  if (opts.waitUrl) {
    await page.waitForResponse(
      (r) => opts.waitUrl.test(r.url()) && r.request().method() === 'GET',
      { timeout: 25_000 },
    ).catch(() => {});
  }
  await page.waitForTimeout(400);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} pathRe
 */
async function expectNoServerErrorOn(page, pathRe) {
  const hits = [];
  const onResp = (r) => {
    if (pathRe.test(r.url()) && r.status() >= 500) {
      hits.push(`${r.status()} ${r.url()}`);
    }
  };
  page.on('response', onResp);
  return {
    hits,
    dispose: () => page.off('response', onResp),
    assertClean: () => {
      if (hits.length) {
        throw new Error(`Server 5xx on critical path:\n${hits.join('\n')}`);
      }
    },
  };
}

module.exports = {
  ensureDemoAdmin,
  seedAdminTestData,
  clearAdminLoginRateLimit,
  stubGoogleMaps,
  attachPageErrorCollector,
  loginAsAdminUI,
  waitForAdminReady,
  goAdminSection,
  expectNoServerErrorOn,
  baseUrl,
};
