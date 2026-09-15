// @ts-check
/**
 * Phase Enterprise — login, dashboard shell, nav, stats/cards, modals, no pageerror.
 */
const { test, expect } = require('@playwright/test');
const { annotatePrerequisite, DEMO_ENTERPRISE_USER } = require('../helpers/auth');
const {
  ensureDemoEnterprise,
  seedEnterpriseTestData,
  clearEnterpriseRateLimit,
  stubGoogleMaps,
  attachPageErrorCollector,
  dismissEntOverlays,
  loginAsEnterpriseUI,
  expectLoginForm,
  waitForEnterpriseDashboard,
  baseUrl,
} = require('../helpers/enterprise');

const BASE = baseUrl();

test.describe('Phase Enterprise | login + dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  /** @type {{ enterprise_id: number }} */
  let seed;

  test.beforeAll(() => {
    clearEnterpriseRateLimit();
    ensureDemoEnterprise();
    seed = seedEnterpriseTestData({ fresh: true });
  });

  test('login page loads (email + password)', async ({ page }, testInfo) => {
    annotatePrerequisite(testInfo, `Requires Django at ${BASE}; seed enterprise_id=${seed.enterprise_id}`);
    await stubGoogleMaps(page);
    const res = await page.goto('/entreprise/?tab=login', { waitUntil: 'domcontentloaded' });
    expect(res && (res.ok() || res.status() === 304)).toBeTruthy();
    await expect(page.locator('#enterprise-auth-section')).toBeVisible();
    await expectLoginForm(page);
    await expect(page.locator('#tab-login-btn')).toBeVisible();
    await expect(page.locator('#tab-register-btn')).toBeVisible();
  });

  test('wrong password shows error and stays on login', async ({ page }) => {
    await stubGoogleMaps(page);
    await page.goto('/entreprise/?tab=login', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-login-btn').click().catch(() => {});
    await expectLoginForm(page);
    await page.locator('#ent-login-form input[name="email"]').fill(DEMO_ENTERPRISE_USER);
    await page.locator('#ent-login-form input[name="password"]').fill('DefinitelyWrongEntPass999!');
    const waitLogin = page.waitForResponse(
      (r) => /\/htmx\/enterprise\/login\/?/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('#login-submit-btn').click();
    const resp = await waitLogin;
    expect(resp.status()).toBeLessThan(500);
    const data = await resp.json();
    expect(data.error || '').toMatch(/mot de passe|incorrect|Aucun|requis/i);
    await expect(page).toHaveURL(/\/entreprise\/?/);
    await expect(page.locator('#login-response .ent-alert-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#auth-login-form')).toBeVisible();
  });

  test('valid enterprise login reaches dashboard without 500 / pageerror', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    const serverHits = [];
    page.on('response', (r) => {
      if (r.status() >= 500 && /\/(entreprise|htmx\/enterprise)/.test(r.url())) {
        serverHits.push(`${r.status()} ${r.url()}`);
      }
    });

    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);

    await expect(page).toHaveURL(/\/entreprise\/dashboard\/?/);
    await expect(page.locator('#ent-company-name')).toBeVisible();
    const name = (await page.locator('#ent-company-name').innerText()).trim();
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toBe('Chargement...');

    // Stats cards
    await expect(page.locator('#stat-total')).toBeVisible();
    await expect(page.locator('#stat-earnings')).toBeVisible();
    await expect(page.locator('#stat-commission')).toBeVisible();

    // Self-order booking section visible
    await expect(page.locator('#ent-booking-section')).toBeVisible();
    await expect(page.locator('#ent-orders-container')).toBeVisible();
    await expect(page.locator('#etab-active')).toBeVisible();
    await expect(page.locator('#etab-history')).toBeVisible();

    expect(serverHits, serverHits.join('\n')).toEqual([]);
    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('dashboard HTMX + wallet modal open/close', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);

    // Dashboard data already loaded; probe HTMX dashboard endpoint
    const dashStatus = await page.evaluate(async () => {
      const csrf =
        (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] ||
        (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) ||
        '';
      const res = await fetch('/htmx/enterprise/dashboard/', {
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': decodeURIComponent(csrf) },
      });
      return res.status;
    });
    expect(dashStatus).toBe(200);

    // Wallet modal
    const waitWallet = page.waitForResponse(
      (r) =>
        /\/htmx\/enterprise\/dashboard\/?\?wallet=1/.test(r.url()) &&
        r.request().method() === 'GET',
      { timeout: 20_000 },
    );
    await page.evaluate(() => {
      if (typeof openWalletModal === 'function') openWalletModal();
    });
    const walletResp = await waitWallet;
    expect(walletResp.status()).toBeLessThan(500);
    expect(walletResp.ok()).toBeTruthy();
    await expect(page.locator('#ent-wallet-modal.show')).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => {
      if (typeof closeWalletModal === 'function') closeWalletModal();
    });
    await expect(page.locator('#ent-wallet-modal.show')).toHaveCount(0);

    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });

  test('plans section + plan detail modal shell', async ({ page }, testInfo) => {
    const pe = attachPageErrorCollector(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);

    await expect(page.locator('#ent-plans-section')).toBeVisible();
    // Plans HTMX (may already be loaded)
    const plansStatus = await page.evaluate(async () => {
      const csrf =
        (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] ||
        (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) ||
        '';
      const res = await fetch('/htmx/enterprise/plans/', {
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': decodeURIComponent(csrf) },
      });
      return res.status;
    });
    expect(plansStatus).toBeLessThan(500);

    // Plan detail modal exists in DOM (open via shell if cards present)
    await expect(page.locator('#ent-plan-detail-modal')).toBeAttached();
    const hasPlanCard = await page.locator('#ent-plans-slot .ent-plan-card, #ent-plans-slot [data-plan], #ent-plans-slot button, #ent-plans-slot .plan-card').count();
    if (hasPlanCard > 0) {
      await page.locator('#ent-plans-slot .ent-plan-card, #ent-plans-slot [data-plan], #ent-plans-slot button, #ent-plans-slot .plan-card').first().click();
      await page.waitForTimeout(400);
      // Close if opened
      const close = page.locator('#entPlanDetailClose');
      if (await close.isVisible().catch(() => false)) {
        await close.click();
      }
    }

    expect(pe.errors, pe.errors.join('\n')).toEqual([]);
    pe.dispose();
  });
});
