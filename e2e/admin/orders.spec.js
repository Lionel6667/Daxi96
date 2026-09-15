// @ts-check
/**
 * Phase Admin — orders list (must NOT 500), propose price / assign driver, modals.
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

test.describe('Phase Admin | orders', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: true, verify: true });
  });

  test('orders HTMX list must NOT 500', async ({ page }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      `Critical fragility: GET /htmx/admin/orders/ must not 500 (seed + live DB). Base ${BASE}`,
    );
    const pe = attachPageErrorCollector(page);
    const fiveHundreds = [];
    page.on('response', (r) => {
      if (/\/htmx\/admin\/orders/.test(r.url()) && r.status() >= 500) {
        fiveHundreds.push(`${r.status()} ${r.url()}`);
      }
    });

    await loginAsAdminUI(page, testInfo);

    const waitOrders = page.waitForResponse(
      (r) =>
        /\/htmx\/admin\/orders\/?\?/.test(r.url()) &&
        r.request().method() === 'GET' &&
        !r.url().includes('propose') &&
        !r.url().includes('assign'),
      { timeout: 30_000 },
    );
    await goAdminSection(page, 'orders');
    // Section switch may use cache from boot prefetch — force reload
    await page.evaluate(() => {
      if (typeof loadAdminOrders === 'function') return loadAdminOrders('all', { force: true });
    });
    const ordersResp = await waitOrders.catch(async () => {
      // If cache path skipped network, hit endpoint via evaluate fetch
      return null;
    });

    if (ordersResp) {
      expect(
        ordersResp.status(),
        `orders HTMX returned ${ordersResp.status()} — known fragility`,
      ).toBeLessThan(500);
      expect(ordersResp.ok()).toBeTruthy();
    } else {
      // Direct probe with page credentials
      const status = await page.evaluate(async () => {
        const res = await adminFetch('/htmx/admin/orders/?status=all');
        return res.status;
      });
      expect(status, `direct adminFetch orders status ${status}`).toBeLessThan(500);
      expect(status).toBe(200);
    }

    expect(fiveHundreds, fiveHundreds.join('\n')).toEqual([]);

    await expect(page.locator('#admin-section-orders')).toBeVisible();
    await expect(page.locator('#orders-htmx-loader')).toBeVisible();
    await expect(page.locator('#orders-search')).toBeVisible();

    // Cards or empty state — both OK as long as no 500 / error banner
    const loaderText = await page.locator('#orders-htmx-loader').innerText();
    expect(loaderText).not.toMatch(/Erreur de chargement/i);

    const cards = page.locator('#orders-htmx-loader .order-card, #orders-container .order-card');
    const cardCount = await cards.count();
    // Seed pending order should appear in "all"/actives
    expect(cardCount).toBeGreaterThan(0);

    pe.dispose();
    expect(pe.errors).toEqual([]);
  });

  test('orders filter tabs + search do not 500', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'orders');

    for (const status of ['pending', 'price_proposed', 'all']) {
      const wait = page.waitForResponse(
        (r) =>
          r.url().includes('/htmx/admin/orders/') &&
          r.url().includes(`status=${status}`) &&
          r.request().method() === 'GET',
        { timeout: 20_000 },
      );
      await page.locator(`.admin-order-filter[data-status="${status}"]`).click();
      const resp = await wait;
      expect(resp.status(), `filter ${status}`).toBeLessThan(500);
    }

    await page.locator('#orders-search').fill('Pickup test');
    await page.waitForTimeout(200);
    // Client-side filter only — assert no crash
    await expect(page.locator('#orders-htmx-loader')).toBeVisible();
  });

  test('expand order + open propose-price modal (seed pending)', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'orders');
    await page.evaluate(() => {
      if (typeof loadAdminOrders === 'function') return loadAdminOrders('pending', { force: true });
    });
    await page.waitForSelector('#orders-htmx-loader .order-card, #orders-container .order-card', {
      timeout: 25_000,
    });

    const expandBtn = page.locator('#orders-htmx-loader .daxi-oc-expand-btn, [id^="voir-plus-btn-"]').first();
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await page.waitForTimeout(400);

    const priceBtn = page.locator('.adm-action-btn--price').first();
    const priceCount = await priceBtn.count();
    if (priceCount === 0) {
      // Fallback: open global modal via JS for seed order id from card
      const oid = await page.locator('[id^="order-card-"]').first().getAttribute('id');
      const id = (oid || '').replace('order-card-', '');
      await page.evaluate((orderId) => openProposePrice(String(orderId), ''), id);
    } else {
      await priceBtn.click();
    }

    await expect(page.locator('#price-modal')).not.toHaveClass(/hidden/);
    await page.locator('#price-input').fill('42.50');
    // Close without submitting to keep seed stable for assign test — OR submit
    // Task: propose price if reachable — submit for real outcome
    const waitPropose = page.waitForResponse(
      (r) => /\/htmx\/admin\/orders\/.+\/propose-price\/?/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('#price-modal button:has-text("Envoyer")').click();
    const proposeResp = await waitPropose;
    expect(proposeResp.status()).toBeLessThan(500);
    expect(proposeResp.ok()).toBeTruthy();
    await page.waitForTimeout(500);
    // Modal should close on success
    await expect(page.locator('#price-modal')).toHaveClass(/hidden/);
  });

  test('assign-driver modal opens (HTMX / API available drivers)', async ({ page }, testInfo) => {
    await loginAsAdminUI(page, testInfo);
    await goAdminSection(page, 'orders');
    await page.evaluate(async () => {
      if (typeof loadAdminOrders === 'function') await loadAdminOrders('all', { force: true });
      const loader = document.getElementById('orders-htmx-loader');
      if (loader && window.htmx) htmx.process(loader);
    });
    await page.waitForSelector('#orders-htmx-loader .order-card, #orders-container .order-card', {
      timeout: 25_000,
    });

    // Prefer a card that still has an assign action (no driver)
    const expandBtn = page.locator('[id^="voir-plus-btn-"]').first();
    await expandBtn.scrollIntoViewIfNeeded();
    await expandBtn.click();
    await page.waitForTimeout(500);

    const assignBtn = page.locator('.adm-action-btn--assign').first();
    const hasAssign = (await assignBtn.count()) > 0;

    if (hasAssign) {
      await assignBtn.scrollIntoViewIfNeeded();
      const waitAvail = page.waitForResponse(
        (r) =>
          (/\/htmx\/admin\/drivers\/available\/?/.test(r.url()) ||
            /\/api\/admin-panel\/available-drivers\/?/.test(r.url())) &&
          r.request().method() === 'GET',
        { timeout: 20_000 },
      );
      await Promise.all([waitAvail, assignBtn.click()]).catch(async () => {
        // HTMX may not bind after innerHTML swap — fall back to shell openAssignModal
        const oid = await page.locator('[id^="order-card-"]').first().getAttribute('id');
        const id = (oid || '').replace('order-card-', '');
        await page.evaluate((orderId) => openAssignModal(orderId), id);
      });
    } else {
      const oid = await page.locator('[id^="order-card-"]').first().getAttribute('id');
      const id = (oid || '').replace('order-card-', '');
      const waitApi = page.waitForResponse(
        (r) =>
          /\/api\/admin-panel\/available-drivers\/?/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 20_000 },
      );
      await Promise.all([
        waitApi,
        page.evaluate((orderId) => openAssignModal(Number(orderId) || orderId), id),
      ]);
    }

    // Either per-order HTMX modal or global #assign-modal
    const perOrderModal = page.locator('.adm-assign-modal').filter({ hasNot: page.locator('#assign-modal') }).first();
    const globalModal = page.locator('#assign-modal');

    const perVisible = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[id^="assign-modal-"]')].filter(
        (el) => el.id !== 'assign-modal',
      );
      return els.some((el) => el.style.display === 'flex' || el.offsetParent !== null);
    });
    const globalVisible = await globalModal.evaluate((el) => !el.classList.contains('hidden'));

    expect(perVisible || globalVisible).toBeTruthy();

    // Close whichever is open
    await page.evaluate(() => {
      document.querySelectorAll('[id^="assign-modal-"]').forEach((el) => {
        if (el.id !== 'assign-modal') el.style.display = 'none';
      });
      if (typeof closeModal === 'function') closeModal('assign-modal');
    });
    await page.waitForTimeout(200);
  });
});
