// @ts-check
/**
 * Phase 5 — End-to-end create-order smoke (critical-flows).
 *
 * Slimmer than client/booking.critical.spec.js: one path, network + sheet smoke.
 * Selectors aligned to vubez2.html: #destinationAddress / #destinationAddressArrival /
 * #orderTaxiBtn → POST /htmx/client/order/create/ → #daxi-sheet-order-slot.
 */

const { test, expect } = require('@playwright/test');
const { PAP, installGeolocationMock } = require('../helpers/geo');
const { annotatePrerequisite, baseUrl, isLiveDestructiveAllowed } = require('../helpers/auth');
const { fillGuestBookingFields, clickOrderTaxi, dismissLocationPrompt } = require('../helpers/booking');
const sel = require('../helpers/selectors');

const BASE = baseUrl();

test.describe('critical-flows | client create order smoke', () => {
  test('smoke: guest create order posts and sheet reacts', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'critical' });
    annotatePrerequisite(
      testInfo,
      'Requires live Django at DAXI_BASE_URL and Chromium. Guest create-order HTMX path.',
    );
    if (isLiveDestructiveAllowed()) {
      annotatePrerequisite(testInfo, 'DAXI_E2E_LIVE=1 — order may persist; cleanup is operator-owned.');
    } else {
      annotatePrerequisite(
        testInfo,
        'DAXI_E2E_LIVE!=1 — still runs create-order (honest). Prefer disposable test DB.',
      );
    }

    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 10,
    });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
    await page.context().setGeolocation({
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 10,
    });

    // Stub Google Maps JS — InvalidKeyMapError overlays block HTMX/DOM clicks locally
    await page.route('**/maps.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.google=window.google||{};window.google.maps=window.google.maps||{Map:function(){},LatLng:function(a,b){this.lat=function(){return a};this.lng=function(){return b}},Marker:function(){},event:{addListener:function(){return{remove:function(){}}}},places:{Autocomplete:function(){}},MapTypeId:{ROADMAP:"roadmap"}};',
      });
    }).catch(() => {});

    await test.step('Goto /', async () => {
      const res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!res) {
        throw new Error(`No response from ${BASE}/ — is runserver up?`);
      }
      if (!res.ok() && res.status() !== 304) {
        throw new Error(`GET ${BASE}/ returned ${res.status()} — fix server before E2E.`);
      }
      await dismissLocationPrompt(page);
      // Prefer Nouveau trajet tab
      const newTrip = page.locator(sel.sheetTabNewTripId);
      if (await newTrip.isVisible().catch(() => false)) {
        await newTrip.click({ force: true }).catch(() => {});
      }
    });

    await test.step('Fill minimal booking fields', async () => {
      await fillGuestBookingFields(page, {
        pickupLabel: 'Champ de Mars, Port-au-Prince',
        dropoffLabel: 'Pétion-Ville, Place Boyer',
      });
    });

    await test.step('POST create + assert', async () => {
      const waitCreate = page.waitForResponse(
        (r) => sel.createOrderPath.test(r.url()) && r.request().method() === 'POST',
        { timeout: 45000 },
      );

      await clickOrderTaxi(page);

      const resp = await waitCreate;
      const status = resp.status();
      expect(status, `create-order HTTP ${status}`).toBeLessThan(500);

      const body = await resp.text();
      expect(body.length, 'create-order response body empty').toBeGreaterThan(0);

      // Soft product signal: HTMX error partials often include error class/text
      if (/htmx-error|_htmx_error|Identifiant invité|requis/i.test(body) && status >= 400) {
        throw new Error(`create-order returned error partial (HTTP ${status}): ${body.slice(0, 240)}`);
      }
    });

    await test.step('UI smoke: Ma course or order slot signal', async () => {
      const myRide = page.locator(sel.sheetTabMyRideId);
      if (await myRide.isVisible().catch(() => false)) {
        await myRide.click({ force: true }).catch(() => {});
      }
      const signal = page
        .locator('#daxi-sheet-order-slot')
        .or(page.locator(sel.orderPills))
        .or(page.getByText(sel.sheetTabMyRide))
        .or(page.getByText(/commande|lòd|order|guest-phone|price-proposal|pending/i));
      await expect(signal.first()).toBeVisible({ timeout: 20000 });
    });
  });
});
