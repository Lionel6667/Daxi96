// @ts-check
/**
 * Phase 5 — Client booking happy path (critical).
 * Selectors aligned to vubez2.html (pickup #destinationAddress, dropoff #destinationAddressArrival).
 */

const { test, expect } = require('@playwright/test');
const {
  PAP,
  installGeolocationMock,
  readMockedCoordsScript,
} = require('../helpers/geo');
const {
  annotatePrerequisite,
  baseUrl,
  isLiveDestructiveAllowed,
  resolveClientCredentials,
} = require('../helpers/auth');
const { fillGuestBookingFields, clickOrderTaxi, dismissLocationPrompt } = require('../helpers/booking');
const sel = require('../helpers/selectors');

const BASE = baseUrl();

test.describe('critical | client booking happy path', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      'Server must serve vubez2 at /. Mocked geolocation installed; real Maps key optional if places mocked.',
    );

    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 12,
    });

    const context = page.context();
    await context.grantPermissions(['geolocation'], { origin: BASE });
    await context.setGeolocation({
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 12,
    });
  });

  test('guest: pickup/dropoff → create order POST → sheet shows Ma course', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'critical' });
    annotatePrerequisite(
      testInfo,
      'Guest booking uses guest_id cookie/session (daxi-guest-id.js). No login credentials required.',
    );

    
    // Stub Google Maps JS — InvalidKeyMapError overlays block HTMX/DOM clicks locally
    await page.route('**/maps.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.google=window.google||{};window.google.maps=window.google.maps||{Map:function(){},LatLng:function(a,b){this.lat=function(){return a};this.lng=function(){return b}},Marker:function(){},event:{addListener:function(){return{remove:function(){}}}},places:{Autocomplete:function(){}},MapTypeId:{ROADMAP:"roadmap"}};',
      });
    }).catch(() => {});

    await test.step('Open client SPA (vubez2)', async () => {
      const res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      expect(res, 'GET / must return a response').toBeTruthy();
      expect(
        res.ok() || res.status() === 304,
        `Expected 2xx/304 from ${BASE}/, got ${res && res.status()}`,
      ).toBeTruthy();
      await expect(page.locator('body')).toBeVisible();
      await dismissLocationPrompt(page);
    });

    await test.step('Mock geolocation already active; assert navigator reports PAP', async () => {
      const coords = await page.evaluate(readMockedCoordsScript());
      expect(coords.lat).toBeCloseTo(PAP.latitude, 3);
      expect(coords.lng).toBeCloseTo(PAP.longitude, 3);
      expect(coords.acc).toBeLessThanOrEqual(50);
    });

    await test.step('Ensure Nouveau trajet sheet surface is available', async () => {
      const newTrip = page.locator(sel.sheetTabNewTripId).or(
        page.getByRole('button', { name: sel.sheetTabNewTrip }),
      );
      if (await newTrip.first().isVisible().catch(() => false)) {
        await newTrip.first().click({ force: true });
      }
    });

    await test.step('Fill pickup / dropoff (real vubez2 ids + hidden POST fields)', async () => {
      await fillGuestBookingFields(page, {
        pickupLabel: 'Place Boyer, Pétion-Ville',
        dropoffLabel: 'Aéroport Toussaint Louverture (PAP)',
      });
    });

    await test.step('Select a plan card if the UI requires it', async () => {
      const plan = page
        .getByRole('button', { name: /Ville|Demi|Journée|Élégance|Aéroport|plan|forfait/i })
        .or(page.locator('[data-plan-id], .daxi-plan-card, .plan-card').first());
      if (await plan.first().isVisible().catch(() => false)) {
        await plan.first().click({ force: true });
      }
    });

    /** @type {import('@playwright/test').Response | null} */
    let createResponse = null;

    await test.step('Submit create order and assert network POST', async () => {
      const createWait = page.waitForResponse(
        (r) => sel.createOrderPath.test(r.url()) && r.request().method() === 'POST',
        { timeout: 30000 },
      );

      await clickOrderTaxi(page);

      createResponse = await createWait;
      expect(createResponse.status(), 'POST /htmx/client/order/create/ should not be 5xx').toBeLessThan(
        500,
      );
      expect(
        [200, 201, 204, 302, 303].includes(createResponse.status()) || createResponse.ok(),
        `Unexpected create-order status ${createResponse.status()} — inspect HTMX error body`,
      ).toBeTruthy();
    });

    await test.step('Sheet updates toward Ma course / order slot', async () => {
      const myRide = page.locator(sel.sheetTabMyRideId).or(
        page.getByRole('button', { name: sel.sheetTabMyRide }),
      );
      if (await myRide.first().isVisible().catch(() => false)) {
        await myRide.first().click({ force: true });
      }

      const sheetOrPills = page
        .locator('#daxi-sheet-order-slot')
        .or(page.locator(sel.orderPills))
        .or(page.getByText(/Ma course|Kou mwen|commande|lòd|guest-phone|price|pending/i));
      await expect(
        sheetOrPills.first(),
        'After create, sheet should show Ma course / order UI',
      ).toBeVisible({ timeout: 20000 });
    });

    if (isLiveDestructiveAllowed()) {
      await test.step('Optional LIVE teardown annotation only', async () => {
        annotatePrerequisite(
          testInfo,
          'DAXI_E2E_LIVE=1: cancel/cleanup of created order is team responsibility (not auto-deleted here).',
        );
      });
    }
  });

  test('registered client: login helper credentials required (soft fail, no skip)', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'critical' });
    annotatePrerequisite(
      testInfo,
      'Uses DAXI_E2E_CLIENT_* or create_demo_accounts demo.client@daxi.ht (DemoDaxi2026!).',
    );

    const creds = resolveClientCredentials(testInfo);
    expect(creds.user).toBeTruthy();
    expect(creds.pass).toBeTruthy();

    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 10,
    });

    await test.step('Open home then attempt client login surface', async () => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await dismissLocationPrompt(page);
      const loginBtn = page
        .getByRole('button', { name: /Koneksyon|Connexion|Login|Se connecter/i })
        .or(page.getByText(/Koneksyon|Connexion/i));
      await expect(
        loginBtn.first(),
        'Login control not found — wire Phase 4 storageState or refine selector',
      ).toBeVisible({ timeout: 15000 });
      await loginBtn.first().click({ force: true });

      // Prefer filling login form when present (demo credentials)
      const email = page
        .locator('#loginEmail, input[name="email"], input[type="email"]')
        .first();
      const password = page
        .locator('#loginPassword, input[name="password"], input[type="password"]')
        .first();
      if (await email.isVisible().catch(() => false)) {
        await email.fill(creds.user);
        if (await password.isVisible().catch(() => false)) {
          await password.fill(creds.pass);
        }
        annotatePrerequisite(
          testInfo,
          `Filled login fields with ${creds.source} credentials (${creds.user}). ` +
            `Full POST login assert is Phase 4 helper territory.`,
        );
      }
      expect(process.env.DAXI_E2E_CLIENT_USER).toBeTruthy();
    });
  });
});
