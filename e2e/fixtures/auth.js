/**
 * Auth helpers for DAXI Playwright.
 *
 * Preferred approach: storageState JSON under e2e/artifacts/auth/ (gitignored).
 * Generate once after manual or API login, then reuse:
 *   test.use({ storageState: 'artifacts/auth/client.json' })
 *
 * API login (client JWT) hits POST /api/auth/login/ with { email, password }.
 * Driver / enterprise / admin use session cookies on HTML shells:
 *   /driver/login/, /entreprise/, /admin-dashboard/
 *
 * OTP / WhatsApp / payments: see README "Stub notes" and .env.e2e.example.
 * Never enable production bypasses via defaults — only opt-in env flags when
 * Django already exposes them (DEBUG-local only).
 */

const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'artifacts', 'auth');

function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function authStatePath(role) {
  return path.join(AUTH_DIR, `${role}.json`);
}

/**
 * Client login via JWT API, then inject token into localStorage and save storageState.
 * Env: DAXI_CLIENT_EMAIL, DAXI_CLIENT_PASSWORD
 */
async function login_as_client(page, options = {}) {
  const email = options.email || process.env.DAXI_CLIENT_EMAIL;
  const password = options.password || process.env.DAXI_CLIENT_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'login_as_client requires DAXI_CLIENT_EMAIL / DAXI_CLIENT_PASSWORD (or options)'
    );
  }
  const baseURL = process.env.DAXI_BASE_URL || 'http://127.0.0.1:8000';
  const res = await page.request.post(`${baseURL}/api/auth/login/`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`client login failed HTTP ${res.status()}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const access = data.access || data.token || (data.tokens && data.tokens.access);
  const refresh = data.refresh || (data.tokens && data.tokens.refresh);
  await page.goto('/');
  await page.evaluate(
    ({ access, refresh }) => {
      if (access) {
        localStorage.setItem('access_token', access);
        localStorage.setItem('daxi_access_token', access);
      }
      if (refresh) {
        localStorage.setItem('refresh_token', refresh);
        localStorage.setItem('daxi_refresh_token', refresh);
      }
    },
    { access, refresh }
  );
  ensureAuthDir();
  await page.context().storageState({ path: authStatePath('client') });
  return { access, refresh, storageState: authStatePath('client') };
}

/**
 * Driver: fill /driver/login/ form or set session via UI.
 * Env: DAXI_DRIVER_EMAIL (or phone), DAXI_DRIVER_PASSWORD
 * Selectors are best-effort; update pages/driver.js when UI stabilizes.
 */
async function login_as_driver(page, options = {}) {
  let email = options.email || process.env.DAXI_DRIVER_EMAIL || process.env.DAXI_E2E_DRIVER_USER;
  let password = options.password || process.env.DAXI_DRIVER_PASSWORD || process.env.DAXI_E2E_DRIVER_PASS;
  // Demo seed fallback (create_demo_accounts)
  if (!email || !password) {
    email = email || 'demo.driver@daxi.ht';
    password = password || 'DemoDaxi2026!';
  }
  await page.goto('/driver/login/', { waitUntil: 'domcontentloaded' });
  await page.locator('#drv-login-email').fill(email);
  await page.locator('#driver-login-form input[name="password"]').fill(password);
  await page.evaluate((em) => {
    const hid = document.getElementById('drv-login-identifier');
    if (hid) hid.value = em;
  }, email);
  await Promise.all([
    page.waitForURL(/\/driver\/?$/, { timeout: 30_000 }),
    page.locator('#driver-login-submit-btn').click(),
  ]);
  ensureAuthDir();
  await page.context().storageState({ path: authStatePath('driver') });
  return { storageState: authStatePath('driver'), email };
}

/**
 * Admin dashboard session via JWT AuthAPI (email + password, is_staff).
 * Env: DAXI_ADMIN_USER / DAXI_ADMIN_PASSWORD
 * Demo: admin@daxi.com / DemoDaxi2026! (create_demo_accounts)
 * Route: /admin-dashboard/
 */
async function login_as_admin(page, options = {}) {
  let email = options.email || options.user || process.env.DAXI_ADMIN_USER || process.env.DAXI_E2E_ADMIN_USER;
  let password = options.password || process.env.DAXI_ADMIN_PASSWORD || process.env.DAXI_E2E_ADMIN_PASS;
  if (!email || !password) {
    email = email || 'admin@daxi.com';
    password = password || 'DemoDaxi2026!';
  }
  await page.goto('/admin-dashboard/', { waitUntil: 'domcontentloaded' });
  const mainVisible = await page.locator('#admin-main:not(.hidden)').isVisible().catch(() => false);
  if (!mainVisible) {
    await page.locator('#admin-email').fill(email);
    await page.locator('#admin-password').fill(password);
    await Promise.all([
      page.waitForSelector('#admin-main:not(.hidden)', { timeout: 30_000 }),
      page.locator('button.admin-login-btn, button:has-text("Connexion")').first().click(),
    ]);
  }
  await page.waitForTimeout(800);
  ensureAuthDir();
  await page.context().storageState({ path: authStatePath('admin') });
  return { storageState: authStatePath('admin'), email };
}

/**
 * Enterprise (company) login at /entreprise/
 * Env: DAXI_ENTERPRISE_EMAIL, DAXI_ENTERPRISE_PASSWORD
 */
async function login_as_enterprise(page, options = {}) {
  const email = options.email || process.env.DAXI_ENTERPRISE_EMAIL;
  const password = options.password || process.env.DAXI_ENTERPRISE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'login_as_enterprise requires DAXI_ENTERPRISE_EMAIL / DAXI_ENTERPRISE_PASSWORD'
    );
  }
  await page.goto('/entreprise/');
  await page.locator('input[type="email"], input[name="email"], #email').first().fill(email);
  await page.locator('input[type="password"], input[name="password"], #password').first().fill(password);
  await page.locator('button[type="submit"], button:has-text("Connexion")').first().click();
  await page.waitForURL(/entreprise\/dashboard/, { timeout: 30_000 }).catch(() => {});
  ensureAuthDir();
  await page.context().storageState({ path: authStatePath('enterprise') });
  return { storageState: authStatePath('enterprise') };
}

module.exports = {
  login_as_client,
  login_as_driver,
  login_as_admin,
  login_as_enterprise,
  authStatePath,
  AUTH_DIR,
};
