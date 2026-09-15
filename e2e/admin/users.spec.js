// @ts-check
/**
 * Phase Admin — users list: search/filter + row actions (block).
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

test.describe('Phase Admin | users', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: true, verify: false });
  });

  test('users section loads clients table', async ({ page }, testInfo) => {
    annotatePrerequisite(testInfo, `Admin users via AdminAPI.getClients at ${BASE}`);
    const pe = attachPageErrorCollector(page);
    await loginAsAdminUI(page, testInfo);

    const waitClients = page.waitForResponse(
      (r) => /\/api\/admin-panel\/clients\/?/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await goAdminSection(page, 'users');
    const clientsResp = await waitClients;
    expect(clientsResp.status()).toBeLessThan(500);
    expect(clientsResp.ok()).toBeTruthy();

    await expect(page.locator('#admin-section-users')).toBeVisible();
    await expect(page.locator('#users-search')).toBeVisible();
    await expect(page.locator('#admin-users-tbody')).toBeVisible();

    // Seed creates client.test*@test-seed.daxi.ht
    const rows = page.locator('#admin-users-tbody tr.order-row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    pe.dispose();
    expect(pe.errors).toEqual([]);
  });

  test('users search filters rows', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'users');
    await page.waitForSelector('#admin-users-tbody tr.order-row, #admin-users-tbody td', {
      timeout: 20_000,
    });

    const before = await page.locator('#admin-users-tbody tr.order-row').count();
    expect(before).toBeGreaterThan(0);

    await page.locator('#users-search').fill('test-seed.daxi.ht');
    await page.waitForTimeout(300);
    const afterSeed = await page.locator('#admin-users-tbody tr.order-row').count();
    expect(afterSeed).toBeGreaterThan(0);
    expect(afterSeed).toBeLessThanOrEqual(before);

    await page.locator('#users-search').fill('zzz-no-such-user-e2e-999');
    await page.waitForTimeout(300);
    const emptyText = await page.locator('#admin-users-tbody').innerText();
    expect(emptyText).toMatch(/Aucun client|Aucun/i);
  });

  test('row action block/unblock button is present and clickable shell', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'users');
    await page.waitForSelector('#admin-users-tbody tr.order-row', { timeout: 20_000 });

    const actionBtn = page.locator('#admin-users-tbody button.admin-btn-icon').first();
    await expect(actionBtn).toBeVisible();
    const label = (await actionBtn.innerText()).trim();
    expect(label).toMatch(/Bloquer|Débloquer/i);

    // Open client modal (row click) then close — proves row action surface
    await page.locator('#admin-users-tbody tr.order-row').first().click();
    await page.waitForSelector('#client-modal:not(.hidden)', { timeout: 15_000 });
    await expect(page.locator('#client-modal')).not.toHaveClass(/hidden/);
    await page.evaluate(() => closeModal('client-modal'));
    await expect(page.locator('#client-modal')).toHaveClass(/hidden/);
  });
});
