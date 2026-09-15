// @ts-check
/**
 * Phase 8 — Driver login (real session / HX-Redirect to /driver/).
 */
const { test, expect } = require('@playwright/test');
const {
  resolveDriverCredentials,
  annotatePrerequisite,
  baseUrl,
  DEMO_DRIVER_USER,
} = require('../helpers/auth');
const {
  ensureDemoDriver,
  clearDriverLoginRateLimit,
  stubGoogleMaps,
  prepareDriverGeo,
  loginAsDriverUI,
  postDriverSession,
} = require('../helpers/driver');

const BASE = baseUrl();

test.describe('Phase 8 | driver login', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearDriverLoginRateLimit();
    ensureDemoDriver();
  });

  test('login page loads with email/password form', async ({ page }, testInfo) => {
    annotatePrerequisite(testInfo, `Requires Django at ${BASE}`);
    await stubGoogleMaps(page);
    const res = await page.goto('/driver/login/', { waitUntil: 'domcontentloaded' });
    expect(res && (res.ok() || res.status() === 304)).toBeTruthy();
    await expect(page.locator('#driver-login-form')).toBeVisible();
    await expect(page.locator('#drv-login-email')).toBeVisible();
    await expect(page.locator('#driver-login-form input[name="password"]')).toBeVisible();
    await expect(page.locator('#driver-login-submit-btn')).toBeVisible();
  });

  test('wrong password stays on login and shows error', async ({ page }, testInfo) => {
    const { email } = resolveDriverCredentials(testInfo);
    await stubGoogleMaps(page);
    await page.goto('/driver/login/', { waitUntil: 'domcontentloaded' });
    await page.locator('#drv-login-email').fill(email);
    await page.locator('#driver-login-form input[name="password"]').fill('DefinitelyWrongPass999!');
    await page.evaluate((em) => {
      const hid = document.getElementById('drv-login-identifier');
      if (hid) hid.value = em;
    }, email);

    const waitLogin = page.waitForResponse(
      (r) => /\/htmx\/driver\/login\/?/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.locator('#driver-login-submit-btn').click();
    const resp = await waitLogin;
    expect(resp.status()).toBeLessThan(500);

    // Must NOT land on driver home
    await page.waitForTimeout(800);
    expect(page.url()).toMatch(/\/driver\/login\/?/);
    const errBox = page.locator('#driver-login-errors');
    await expect(errBox).toBeVisible({ timeout: 10_000 });
    const errText = (await errBox.innerText()).trim();
    expect(errText.length).toBeGreaterThan(0);
    expect(errText).toMatch(/mot de passe|incorrect|introuvable|erreur/i);
  });

  test('valid demo driver login reaches /driver/ with session', async ({ page }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      `Demo driver ${DEMO_DRIVER_USER} from create_demo_accounts / seed_driver_order ensure-demo`,
    );
    await loginAsDriverUI(page, testInfo);

    expect(page.url()).toMatch(/\/driver\/?$/);
    await expect(page.locator('#drv-status-label')).toBeVisible();
    // Session must authorize HTMX status endpoint
    const status = await postDriverSession(page, 'open');
    expect(status).toBeTruthy();
    expect(['available', 'busy', 'offline']).toContain(status.status);
    // UI reflects online/available when no active mission
    const label = (await page.locator('#drv-status-label').innerText()).trim();
    expect(label.length).toBeGreaterThan(0);
  });
});
