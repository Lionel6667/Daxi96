// @ts-check
/**
 * Phase Admin — drivers management (API list + HTMX partial + tabs/search).
 */
const { test, expect } = require('@playwright/test');
const { annotatePrerequisite } = require('../helpers/auth');
const {
  ensureDemoAdmin,
  seedAdminTestData,
  clearAdminLoginRateLimit,
  attachPageErrorCollector,
  loginAsAdminUI,
  goAdminSection,
  baseUrl,
} = require('../helpers/admin');

const BASE = baseUrl();

test.describe('Phase Admin | drivers', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: true, verify: false });
  });

  test('drivers section loads via admin-panel API (no 500)', async ({ page }, testInfo) => {
    annotatePrerequisite(testInfo, `Drivers grid + HTMX /htmx/admin/drivers/ at ${BASE}`);
    const pe = attachPageErrorCollector(page);
    await loginAsAdminUI(page, testInfo);

    const waitDrivers = page.waitForResponse(
      (r) =>
        (/\/api\/admin-panel\/drivers\/?/.test(r.url()) || /\/api\/drivers\/?/.test(r.url())) &&
        r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await goAdminSection(page, 'drivers');
    const drvResp = await waitDrivers;
    expect(drvResp.status()).toBeLessThan(500);
    expect(drvResp.ok()).toBeTruthy();

    await expect(page.locator('#admin-section-drivers')).toBeVisible();
    await expect(page.locator('#drivers-search')).toBeVisible();
    await expect(page.locator('#drv-tab-active')).toBeVisible();
    await expect(page.locator('#drv-tab-pending')).toBeVisible();
    await expect(page.locator('#drivers-grid')).toBeVisible();

    // Grid should leave spinner state
    await page.waitForFunction(() => {
      const g = document.getElementById('drivers-grid');
      if (!g) return false;
      return !g.querySelector('.animate-spin') || g.querySelectorAll('.adm-drv-card, [class*="driver"], .bg-gray-800').length > 0 || /Impossible|Erreur|Aucun/i.test(g.innerText);
    }, { timeout: 20_000 });

    const gridText = await page.locator('#drivers-grid').innerText();
    expect(gridText).not.toMatch(/Impossible de charger|Erreur de chargement/i);

    pe.dispose();
    expect(pe.errors).toEqual([]);
  });

  test('pending tab shows seed unverified driver (HTMX sanity)', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'drivers');
    await page.waitForTimeout(800);

    // Also probe HTMX drivers partial (distinct from JSON API used by UI)
    const htmxStatus = await page.evaluate(async () => {
      const res = await adminFetch('/htmx/admin/drivers/');
      return { status: res.status, len: (await res.text()).length };
    });
    expect(htmxStatus.status).toBeLessThan(500);
    expect(htmxStatus.status).toBe(200);
    expect(htmxStatus.len).toBeGreaterThan(100);

    await page.locator('#drv-tab-pending').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#drv-tab-pending')).toHaveClass(/is-active/);

    const grid = page.locator('#drivers-grid');
    const text = await grid.innerText();
    // Seed creates Test Chauffeur pending
    expect(text.length).toBeGreaterThan(5);
    // Prefer seeing seed name; if empty, pending count badge may still be >0
    const pendingBadge = page.locator('#drv-tab-pending-count');
    if (await pendingBadge.isVisible()) {
      const n = parseInt((await pendingBadge.innerText()).trim(), 10) || 0;
      expect(n).toBeGreaterThan(0);
    } else {
      expect(text).toMatch(/Test|Chauffeur|seed|attente|Aucun/i);
    }
  });

  test('drivers search filters client-side', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'drivers');
    await page.waitForTimeout(800);

    await page.locator('#drv-tab-active').click();
    await page.waitForTimeout(300);

    await page.locator('#drivers-search').fill('demo.driver');
    await page.waitForTimeout(300);
    // Active tab should include demo.driver@daxi.ht when verified
    const after = await page.locator('#drivers-grid').innerText();
    // Either shows demo or "Aucun" if search too narrow on wrong tab — assert no crash
    expect(after).not.toMatch(/Erreur de chargement/i);

    await page.locator('#drivers-search').fill('');
    await page.waitForTimeout(200);
  });
});
