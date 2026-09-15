// @ts-check
/**
 * Phase Admin — dashboard load, navigation, enterprises, modals, no pageerror.
 */
const { test, expect } = require('@playwright/test');
const { annotatePrerequisite, DEMO_ADMIN_USER } = require('../helpers/auth');
const {
  ensureDemoAdmin,
  seedAdminTestData,
  clearAdminLoginRateLimit,
  stubGoogleMaps,
  attachPageErrorCollector,
  loginAsAdminUI,
  goAdminSection,
  baseUrl,
} = require('../helpers/admin');

const BASE = baseUrl();

test.describe('Phase Admin | dashboard + navigation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: true, verify: true });
  });

  test('login page loads (email + password)', async ({ page }, testInfo) => {
    annotatePrerequisite(testInfo, `Requires Django at ${BASE}`);
    await stubGoogleMaps(page);
    const res = await page.goto('/admin-dashboard/', { waitUntil: 'domcontentloaded' });
    expect(res && (res.ok() || res.status() === 304)).toBeTruthy();
    await expect(page.locator('#admin-login')).toBeVisible();
    await expect(page.locator('#admin-email')).toBeVisible();
    await expect(page.locator('#admin-password')).toBeVisible();
    await expect(page.locator('button.admin-login-btn')).toBeVisible();
  });

  test('wrong password shows error and stays on login', async ({ page }) => {
    await stubGoogleMaps(page);
    await page.goto('/admin-dashboard/', { waitUntil: 'domcontentloaded' });
    await page.locator('#admin-email').fill(DEMO_ADMIN_USER);
    await page.locator('#admin-password').fill('DefinitelyWrongAdminPass999!');
    const waitLogin = page.waitForResponse(
      (r) => /\/api\/auth\/login\/?/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('button.admin-login-btn').click();
    const resp = await waitLogin;
    expect(resp.status()).toBeLessThan(500);
    await page.waitForTimeout(600);
    await expect(page.locator('#admin-login')).toBeVisible();
    await expect(page.locator('#admin-main')).toBeHidden();
    const err = page.locator('#admin-login-error');
    await expect(err).toBeVisible({ timeout: 10_000 });
    const errText = (await err.innerText()).trim();
    expect(errText.length).toBeGreaterThan(0);
  });

  test('valid admin login reaches dashboard without 500', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    const serverHits = [];
    page.on('response', (r) => {
      if (r.status() >= 500) serverHits.push(`${r.status()} ${r.url()}`);
    });

    await loginAsAdminUI(page, testInfo);

    await expect(page.locator('#admin-main')).toBeVisible();
    await expect(page.locator('#admin-section-dashboard')).toBeVisible();
    await expect(page.locator('#page-title')).toContainText(/Tableau|dashboard|bord/i);

    // Stats tiles exist (may still be loading numbers)
    await expect(page.locator('#stat-active-orders')).toBeVisible();
    await expect(page.locator('#stat-total-drivers')).toBeVisible();

    // Sidebar nav present
    for (const s of ['orders', 'drivers', 'users', 'enterprises']) {
      await expect(page.locator(`.nav-link[data-section="${s}"]`)).toBeVisible();
    }

    pe.dispose();
    expect(serverHits.filter((h) => !/maps\.google|favicon/i.test(h))).toEqual([]);
    expect(pe.errors).toEqual([]);
  });

  test('critical navigations: enterprises list loads (HTMX)', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    await loginAsAdminUI(page, testInfo);

    const waitEnt = page.waitForResponse(
      (r) => /\/htmx\/admin\/enterprises\/?/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await goAdminSection(page, 'enterprises');
    const entResp = await waitEnt;
    expect(entResp.status()).toBeLessThan(500);
    expect(entResp.ok()).toBeTruthy();

    await expect(page.locator('#admin-section-enterprises')).toBeVisible();
    await expect(page.locator('#admin-enterprises-content')).toBeVisible();
    const html = await page.locator('#admin-enterprises-content').innerHTML();
    expect(html.length).toBeGreaterThan(20);
    // Seed pending enterprise OR approved demo list should render something
    expect(html).not.toMatch(/Erreur de chargement/i);

    pe.dispose();
    expect(pe.errors).toEqual([]);
  });

  test('price modal open/close from dashboard shell', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    // Global price modal exists in shell even before orders section
    await page.evaluate(() => {
      if (typeof openPriceModal === 'function') openPriceModal(99999, 'E2E Cap → Labadie');
    });
    await expect(page.locator('#price-modal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#price-modal-order-id')).toHaveText('99999');
    await page.locator('#price-modal button:has-text("Annuler")').click();
    await expect(page.locator('#price-modal')).toHaveClass(/hidden/);
  });
});
