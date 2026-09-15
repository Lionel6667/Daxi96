// @ts-check
/**
 * Phase 6 fragility — GPS relocate prompt thresholds (MODIFICATIONS §1).
 */

const { test, expect } = require('@playwright/test');
const {
  PAP,
  installGeolocationMock,
  readMockedCoordsScript,
  haversineMeters,
  RELOCATE_DRIFT_METERS,
  RELOCATE_MAX_ACCURACY_M,
} = require('../helpers/geo');
const { annotatePrerequisite, baseUrl, requireEnvOrFail } = require('../helpers/auth');
const { clickMyPositionBtn, dismissLocationPrompt } = require('../helpers/booking');
const sel = require('../helpers/selectors');

const BASE = baseUrl();

/** ~250 m north of PAP — above 200 m drift when accuracy is good. */
const DRIFTED = {
  latitude: PAP.latitude + 0.0023, // ~255 m
  longitude: PAP.longitude,
};

test.describe('fragility | gps relocate thresholds', () => {
  test('inaccurate GPS (accuracy > 80m) should not alone imply relocate', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });
    annotatePrerequisite(
      testInfo,
      `Asserts mock geolocation accuracy=${RELOCATE_MAX_ACCURACY_M + 40} > RELOCATE_MAX_ACCURACY_M (${RELOCATE_MAX_ACCURACY_M}).`,
    );

    const badAccuracy = RELOCATE_MAX_ACCURACY_M + 40; // 120
    await page.addInitScript(installGeolocationMock, {
      latitude: DRIFTED.latitude,
      longitude: DRIFTED.longitude,
      accuracy: badAccuracy,
    });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
    await page.context().setGeolocation({
      latitude: DRIFTED.latitude,
      longitude: DRIFTED.longitude,
      accuracy: badAccuracy,
    });

    await test.step('Open SPA with inaccurate drifted fix', async () => {
      const res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      expect(res && (res.ok() || res.status() === 304)).toBeTruthy();
      await dismissLocationPrompt(page);
    });

    await test.step('Navigator reports poor accuracy', async () => {
      const coords = await page.evaluate(readMockedCoordsScript());
      expect(coords.acc).toBeGreaterThan(RELOCATE_MAX_ACCURACY_M);
    });

    await test.step('Relocate modal should stay hidden while accuracy is poor (cold boot)', async () => {
      const prompt = page.getByText(sel.relocatePromptText);
      await expect(
        prompt,
        'Relocate prompt must not show on cold boot / inaccurate GPS alone',
      ).toHaveCount(0);
    });
  });

  test('good accuracy + drift beyond 200m documents threshold math', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });

    const driftM = haversineMeters(PAP.latitude, PAP.longitude, DRIFTED.latitude, DRIFTED.longitude);
    annotatePrerequisite(
      testInfo,
      `Computed drift≈${Math.round(driftM)}m vs RELOCATE_DRIFT_METERS=${RELOCATE_DRIFT_METERS}. ` +
        `Full modal assert needs seeded meeting point (DAXI_E2E_ORDER_WITH_MEETING_POINT) + tracking WS.`,
    );

    expect(driftM, 'test fixture must exceed drift threshold').toBeGreaterThan(RELOCATE_DRIFT_METERS);

    await page.addInitScript(installGeolocationMock, {
      latitude: DRIFTED.latitude,
      longitude: DRIFTED.longitude,
      accuracy: 15,
    });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });

    await test.step('Load SPA', async () => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await dismissLocationPrompt(page);
    });

    await test.step('Expose threshold constants if present on window', async () => {
      const constants = await page.evaluate(() => {
        const out = {};
        for (const k of [
          'RELOCATE_DRIFT_METERS',
          'RELOCATE_DRIFT_METUTES',
          'RELOCATE_MAX_ACCURACY_M',
        ]) {
          if (typeof window[k] !== 'undefined') out[k] = window[k];
        }
        if (window.DaxiMeetingPoint) {
          out.DaxiMeetingPoint = {
            drift: window.DaxiMeetingPoint.RELOCATE_DRIFT_METERS,
            accuracy: window.DaxiMeetingPoint.RELOCATE_MAX_ACCURACY_M,
          };
        }
        return out;
      });
      annotatePrerequisite(testInfo, `Client-exposed relocate constants: ${JSON.stringify(constants)}`);
      if (constants.RELOCATE_DRIFT_METERS != null) {
        expect(Number(constants.RELOCATE_DRIFT_METERS)).toBe(RELOCATE_DRIFT_METERS);
      }
      if (constants.RELOCATE_MAX_ACCURACY_M != null) {
        expect(Number(constants.RELOCATE_MAX_ACCURACY_M)).toBe(RELOCATE_MAX_ACCURACY_M);
      }
    });
  });

  test('live relocate modal when meeting-point order fixture provided', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });
    annotatePrerequisite(
      testInfo,
      'Requires DAXI_E2E_ORDER_WITH_MEETING_POINT (order id) and optionally DAXI_E2E_CLIENT_* session. Soft fail if unset.',
    );

    // Soft dependency — fail clear, never skip (no seed for meeting-point orders yet)
    requireEnvOrFail(testInfo, ['DAXI_E2E_ORDER_WITH_MEETING_POINT']);

    await page.addInitScript(installGeolocationMock, {
      latitude: DRIFTED.latitude,
      longitude: DRIFTED.longitude,
      accuracy: 20,
    });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });

    await test.step('Open SPA and navigate toward order sheet', async () => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const orderId = process.env.DAXI_E2E_ORDER_WITH_MEETING_POINT;
      await page
        .goto(`${BASE}/?order=${encodeURIComponent(orderId)}`, {
          waitUntil: 'domcontentloaded',
        })
        .catch(() => {});
    });

    await test.step('Expect relocate prompt under good accuracy + >200m drift', async () => {
      const prompt = page.getByText(sel.relocatePromptText).or(
        page.getByRole('dialog').filter({ hasText: sel.relocatePromptText }),
      );
      await expect(
        prompt.first(),
        `Relocate prompt not shown for order ${process.env.DAXI_E2E_ORDER_WITH_MEETING_POINT}. ` +
          `Confirm meeting_lat/lng, WS relocate_prompt, and thresholds. TODO: data-testid="relocate-prompt-modal"`,
      ).toBeVisible({ timeout: 30000 });
    });
  });

  test('GPS failure clears pickup "current position" label (MODIF §1)', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });
    annotatePrerequisite(
      testInfo,
      'After geolocation failure, pickup must not keep « Pozisyon mwen kounye a » / Ma position actuelle.',
    );

    await page.addInitScript(installGeolocationMock, { fail: true, failCode: 2 });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await dismissLocationPrompt(page);
    // Wait for sheet booking row to paint (animations make myPositionBtn "unstable")
    await page.locator(sel.pickupInput).waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(400);

    await test.step('Trigger GPS action if present', async () => {
      const clicked = await clickMyPositionBtn(page);
      if (!clicked) {
        annotatePrerequisite(
          testInfo,
          'GPS action button #myPositionBtn not found — attempted failure path via mock only.',
        );
      }
    });

    await test.step('Pickup must not retain current-position placeholder as committed value', async () => {
      const pickup = page.locator(sel.pickupInput);
      await expect(pickup, 'Pickup #destinationAddress must exist').toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(800);
      const value = await pickup.inputValue().catch(() => '');
      expect(
        /Pozisyon mwen kounye a|Ma position actuelle/i.test(value),
        `Pickup still holds current-position label after GPS fail: "${value}"`,
      ).toBeFalsy();
    });
  });
});
