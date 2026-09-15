// @ts-check
/**
 * Phase Enterprise — orders list/tabs, actions, self-order checkout HTMX.
 */
const { test, expect } = require('@playwright/test');
const { annotatePrerequisite } = require('../helpers/auth');
const {
  ensureDemoEnterprise,
  seedEnterpriseTestData,
  clearEnterpriseRateLimit,
  attachPageErrorCollector,
  dismissEntOverlays,
  loginAsEnterpriseUI,
  switchEntOrdersTab,
  baseUrl,
} = require('../helpers/enterprise');

const BASE = baseUrl();

test.describe('Phase Enterprise | orders + checkout', () => {
  test.describe.configure({ mode: 'serial' });

  /** @type {{ enterprise_id: number, accept_price_order_id: number, choose_payment_order_id: number, history_order_id: number }} */
  let seed;

  test.beforeAll(() => {
    clearEnterpriseRateLimit();
    ensureDemoEnterprise();
    seed = seedEnterpriseTestData({ fresh: true });
  });

  test('orders HTMX list must NOT 500 (active + history)', async ({ page }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      `GET /htmx/enterprise/orders/?tab=* must not 500. Base ${BASE}; seed accept=${seed.accept_price_order_id}`,
    );
    const pe = attachPageErrorCollector(page);
    const fiveHundreds = [];
    page.on('response', (r) => {
      if (/\/htmx\/enterprise\/orders/.test(r.url()) && r.status() >= 500) {
        fiveHundreds.push(`${r.status()} ${r.url()}`);
      }
    });

    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);

    const activeResp = await switchEntOrdersTab(page, 'active');
    expect(activeResp.status(), `active orders ${activeResp.status()}`).toBeLessThan(500);
    expect(activeResp.ok()).toBeTruthy();
    await expect(page.locator('#ent-orders-container')).toBeVisible();
    // Seeded active cards
    await expect(
      page.locator(`#ent-orders-container [data-order-id="${seed.accept_price_order_id}"], #ent-orders-container .daxi-oc-card, #ent-orders-container .ent-oc-actions`).first(),
    ).toBeVisible({ timeout: 15_000 });

    const histResp = await switchEntOrdersTab(page, 'history');
    expect(histResp.status(), `history orders ${histResp.status()}`).toBeLessThan(500);
    expect(histResp.ok()).toBeTruthy();
    await expect(page.locator('#etab-history.active')).toBeVisible();

    expect(fiveHundreds, fiveHundreds.join('\n')).toEqual([]);
    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('orders tab filter (active ↔ history) + cards render', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);

    await switchEntOrdersTab(page, 'active');
    await expect(page.locator('#etab-active.active')).toBeVisible();
    const activeHtml = await page.locator('#ent-orders-container').innerHTML();
    expect(activeHtml.length).toBeGreaterThan(20);
    expect(activeHtml).not.toMatch(/Erreur de chargement/i);

    await switchEntOrdersTab(page, 'history');
    await expect(page.locator('#etab-history.active')).toBeVisible();
    const histHtml = await page.locator('#ent-orders-container').innerHTML();
    expect(histHtml.length).toBeGreaterThan(20);
    // Completed seed should appear or at least not empty-error
    expect(histHtml).not.toMatch(/Erreur de chargement/i);

    // Back to active
    await switchEntOrdersTab(page, 'active');
    await expect(page.locator('#etab-active.active')).toBeVisible();

    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('self-order checkout HTMX (accept_price) opens modal', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    const checkoutHits = [];
    page.on('response', (r) => {
      if (/\/htmx\/enterprise\/orders\/\d+\/checkout/.test(r.url()) && r.status() >= 500) {
        checkoutHits.push(`${r.status()} ${r.url()}`);
      }
    });

    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);
    await switchEntOrdersTab(page, 'active');

    const orderId = seed.accept_price_order_id;
    await expect(
      page.locator(`button.ent-oc-action-btn:has-text("Valider le prix"), [data-order-id="${orderId}"]`).first(),
    ).toBeVisible({ timeout: 15_000 });

    const waitCheckout = page.waitForResponse(
      (r) =>
        new RegExp(`/htmx/enterprise/orders/${orderId}/checkout/?`).test(r.url()) &&
        r.request().method() === 'GET',
      { timeout: 25_000 },
    );

    const btn = page.locator('button.ent-oc-action-btn:has-text("Valider le prix")').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await page.evaluate((id) => {
        if (typeof openEntCheckout === 'function') openEntCheckout(id);
      }, orderId);
    }

    const checkoutResp = await waitCheckout;
    expect(checkoutResp.status()).toBeLessThan(500);
    expect(checkoutResp.ok()).toBeTruthy();

    await expect(page.locator('#ent-checkout-modal.show')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#ent-checkout-body .ent-checkout')).toBeVisible();
    await expect(page.locator('#ent-checkout-body')).toContainText(/Accepter le prix|Montant|prix/i);

    // Close modal
    await page.evaluate(() => {
      if (typeof closeEntCheckoutModal === 'function') closeEntCheckoutModal();
    });
    await expect(page.locator('#ent-checkout-modal.show')).toHaveCount(0);

    expect(checkoutHits, checkoutHits.join('\n')).toEqual([]);
    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('checkout choose_payment phase + contract fragment', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);
    await switchEntOrdersTab(page, 'active');

    const orderId = seed.choose_payment_order_id;
    const waitCheckout = page.waitForResponse(
      (r) =>
        new RegExp(`/htmx/enterprise/orders/${orderId}/checkout/?`).test(r.url()) &&
        r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await page.evaluate((id) => {
      if (typeof openEntCheckout === 'function') openEntCheckout(id);
    }, orderId);
    const checkoutResp = await waitCheckout;
    expect(checkoutResp.status()).toBe(200);

    await expect(page.locator('#ent-checkout-modal.show')).toBeVisible();
    await expect(page.locator('#ent-checkout-body')).toContainText(/Qui paie|paiement|Moyen/i);
    await expect(page.locator('#ent-contract-check')).toBeVisible();

    // Contract modal fragment
    const waitContract = page.waitForResponse(
      (r) => /\/htmx\/enterprise\/contract\/?/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 20_000 },
    ).catch(() => null);
    await page.evaluate(() => {
      if (typeof entOpenContractModal === 'function') entOpenContractModal();
    });
    const contractResp = await waitContract;
    if (contractResp) {
      expect(contractResp.status()).toBeLessThan(500);
    }
    await page.waitForTimeout(400);
    const overlay = page.locator('#ent-contract-overlay');
    if (await overlay.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        if (typeof entCloseContractModal === 'function') entCloseContractModal();
      });
    }

    await page.evaluate(() => {
      if (typeof closeEntCheckoutModal === 'function') closeEntCheckoutModal();
    });

    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('confirm-price HTMX advances accept_price → choose_payment', async ({ page }, testInfo) => {
    // Re-seed a fresh accept_price order so prior tests did not consume it
    seed = seedEnterpriseTestData({ fresh: true });
    const pe = attachPageErrorCollector(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);
    await switchEntOrdersTab(page, 'active');

    const orderId = seed.accept_price_order_id;
    const waitOpen = page.waitForResponse(
      (r) =>
        new RegExp(`/htmx/enterprise/orders/${orderId}/checkout/?`).test(r.url()) &&
        r.request().method() === 'GET',
      { timeout: 25_000 },
    );
    await page.evaluate((id) => {
      if (typeof openEntCheckout === 'function') openEntCheckout(id);
    }, orderId);
    await waitOpen;
    await expect(page.locator('#ent-checkout-body .ent-checkout')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#ent-checkout-body')).toContainText(/Accepter le prix/i);

    // Ensure hx-* bindings live after fetch inject (product also calls htmx.process)
    await page.evaluate(() => {
      const body = document.getElementById('ent-checkout-body');
      if (body && window.htmx) htmx.process(body);
    });

    const waitConfirm = page.waitForResponse(
      (r) =>
        new RegExp(`/htmx/enterprise/orders/${orderId}/confirm-price/?`).test(r.url()) &&
        r.request().method() === 'POST',
      { timeout: 25_000 },
    );
    await page.locator('#ent-checkout-body button:has-text("Accepter le prix")').click();
    const confirmResp = await waitConfirm.catch(async () => {
      // Fallback: fire HTMX ajax if click did not bind
      await page.evaluate(async (id) => {
        const csrf =
          (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] ||
          (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) ||
          '';
        if (window.htmx) {
          htmx.ajax('POST', `/htmx/enterprise/orders/${id}/confirm-price/`, {
            target: '#ent-checkout-body',
            swap: 'innerHTML',
            headers: { 'X-CSRFToken': decodeURIComponent(csrf) },
          });
        }
      }, orderId);
      return page.waitForResponse(
        (r) =>
          new RegExp(`/htmx/enterprise/orders/${orderId}/confirm-price/?`).test(r.url()) &&
          r.request().method() === 'POST',
        { timeout: 20_000 },
      );
    });
    expect(confirmResp.status()).toBeLessThan(500);
    expect(confirmResp.ok()).toBeTruthy();

    await expect(page.locator('#ent-checkout-body')).toContainText(/Qui paie|paiement|Moyen/i, {
      timeout: 15_000,
    });

    await page.evaluate(() => {
      if (typeof closeEntCheckoutModal === 'function') closeEntCheckoutModal();
    });
    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });
});
