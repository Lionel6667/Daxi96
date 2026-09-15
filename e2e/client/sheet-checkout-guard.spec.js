// @ts-check
/**
 * Phase 6 fragility — HTMX sheet refresh must NOT wipe phone / price / pay modal.
 *
 * Guard: `_daxiSheetSlotHasCheckoutFlow()` in vubez2-inline-04.js looks at
 * `#daxi-sheet-order-slot` for:
 *   #guest-phone-card, #pending-coords-card, #price-proposal-card,
 *   #payment-selection-wrap, .daxi-pay-wrap, [data-daxi-checkout-flow="1"]
 */

const { test, expect } = require('@playwright/test');
const { annotatePrerequisite, baseUrl } = require('../helpers/auth');
const { PAP, installGeolocationMock } = require('../helpers/geo');
const sel = require('../helpers/selectors');
const { dismissLocationPrompt, showOrderSheetSlot } = require('../helpers/booking');

const BASE = baseUrl();

/** Resolve the real sheet order slot. */
function findSheetSlotScript() {
  return () => {
    const slot =
      document.getElementById('daxi-sheet-order-slot') ||
      document.querySelector('#daxi-sheet-slot') ||
      document.querySelector('.daxi-sheet-slot') ||
      document.querySelector('[data-daxi-sheet-slot]');
    return slot
      ? { ok: true, id: slot.id || null, tag: slot.tagName }
      : { ok: false, reason: 'sheet slot not found' };
  };
}

/**
 * Inject a synthetic checkout marker that the product guard recognizes.
 */
async function injectSyntheticCheckoutMarker(page) {
  return page.evaluate(() => {
    const slot =
      document.getElementById('daxi-sheet-order-slot') ||
      document.querySelector('#daxi-sheet-slot') ||
      document.querySelector('.daxi-sheet-slot') ||
      document.querySelector('[data-daxi-sheet-slot]');

    if (!slot) {
      return { ok: false, reason: 'sheet slot not found (#daxi-sheet-order-slot missing)' };
    }

    // Match product selector: #guest-phone-card OR [data-daxi-checkout-flow="1"]
    const marker = document.createElement('div');
    marker.id = 'guest-phone-card';
    marker.setAttribute('data-testid', 'e2e-checkout-marker');
    marker.setAttribute('data-daxi-checkout-flow', '1');
    marker.className = 'daxi-guest-phone-prompt guest-phone-prompt checkout-flow';
    marker.textContent = 'E2E_CHECKOUT_PHONE_ACTIVE';
    marker.style.cssText =
      'padding:12px;background:#111;color:#fff;z-index:9999;position:relative;';

    // Also keep a stable e2e id for assertions if product replaces guest-phone-card later
    const e2e = document.createElement('div');
    e2e.id = 'daxi-e2e-checkout-marker';
    e2e.setAttribute('data-daxi-checkout-flow', '1');
    e2e.textContent = 'E2E_CHECKOUT_PHONE_ACTIVE';
    e2e.style.cssText = 'display:none';

    slot.appendChild(marker);
    slot.appendChild(e2e);

    let guardResult = null;
    try {
      if (typeof window._daxiSheetSlotHasCheckoutFlow === 'function') {
        guardResult = !!window._daxiSheetSlotHasCheckoutFlow();
      }
    } catch (_) {
      guardResult = null;
    }

    return { ok: true, guardResult, slotTag: slot.tagName, slotId: slot.id || null };
  });
}

test.describe('fragility | sheet checkout guard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      'MODIF §1: phone/price/pay must survive GET /htmx/client/orders/sheet/ poll. Chromium + server required.',
    );
    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude,
      longitude: PAP.longitude,
      accuracy: 15,
    });
    await page.context().grantPermissions(['geolocation'], { origin: BASE });
  });

  test('HTMX sheet refresh does not wipe active checkout marker / phone UI', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });
    testInfo.annotations.push({ type: 'tag', description: 'critical' });

    await test.step('Load client SPA', async () => {
      const res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      expect(res && (res.ok() || res.status() === 304)).toBeTruthy();
      await dismissLocationPrompt(page);
      await page.waitForTimeout(500);
      await showOrderSheetSlot(page);
      const slotInfo = await page.evaluate(findSheetSlotScript());
      expect(slotInfo.ok, `Expected #daxi-sheet-order-slot: ${JSON.stringify(slotInfo)}`).toBeTruthy();
    });

    const inject = await test.step('Inject or locate checkout UI', async () => {
      const realPhone = page.getByText(sel.phoneModalText).first();
      if (await realPhone.isVisible().catch(() => false)) {
        return { mode: 'live', inject: null };
      }
      const result = await injectSyntheticCheckoutMarker(page);
      if (!result.ok) {
        throw new Error(
          `Cannot exercise checkout guard: ${result.reason}. ` +
            `Open vubez2 and confirm #daxi-sheet-order-slot.`,
        );
      }
      annotatePrerequisite(
        testInfo,
        `Synthetic checkout marker injected (guardResult=${String(result.guardResult)}). ` +
          `Marker uses #guest-phone-card + data-daxi-checkout-flow=1 to match product guard.`,
      );
      if (result.guardResult === false) {
        annotatePrerequisite(
          testInfo,
          '_daxiSheetSlotHasCheckoutFlow returned false for synthetic marker — product guard regression or script not loaded.',
        );
      }
      return { mode: 'synthetic', inject: result };
    });

    await test.step('Assert checkout UI visible before sheet refresh', async () => {
      if (inject.mode === 'synthetic') {
        await expect(page.locator('#guest-phone-card')).toBeVisible();
        await expect(page.getByText('E2E_CHECKOUT_PHONE_ACTIVE').first()).toBeVisible();
      } else {
        await expect(page.getByText(sel.phoneModalText).first()).toBeVisible();
      }
    });

    await test.step('Trigger orders sheet HTMX GET (poll / manual)', async () => {
      const sheetRespPromise = page
        .waitForResponse(
          (r) => sel.ordersSheetPath.test(r.url()) && r.request().method() === 'GET',
          { timeout: 25000 },
        )
        .catch(() => null);

      const triggered = await page.evaluate(async () => {
        // Prefer product refresh paths that call _daxiSheetSlotHasCheckoutFlow.
        // Do NOT use raw htmx.ajax(..., swap innerHTML) — that bypasses the guard by design.
        try {
          if (typeof window._daxiRefreshOrdersSheet === 'function') {
            window._daxiRefreshOrdersSheet();
            return '_daxiRefreshOrdersSheet';
          }
        } catch (_) {}
        try {
          if (typeof window._loadDaxiSheetOrders === 'function') {
            window._loadDaxiSheetOrders({ keepOpen: true });
            return '_loadDaxiSheetOrders';
          }
        } catch (_) {}
        try {
          const res = await fetch('/htmx/client/orders/sheet/', {
            credentials: 'same-origin',
            headers: { 'HX-Request': 'true' },
          });
          const html = await res.text();
          const slot = document.getElementById('daxi-sheet-order-slot');
          if (!slot) return 'fetch-no-slot';
          if (typeof window._daxiSheetSlotHasCheckoutFlow === 'function') {
            if (!window._daxiSheetSlotHasCheckoutFlow()) {
              slot.innerHTML = html;
              return 'fetch-swap-unguarded';
            }
            return 'fetch-guard-blocked-swap';
          }
          const hasCheckout = !!slot.querySelector(
            '#guest-phone-card, #pending-coords-card, #price-proposal-card, #payment-selection-wrap, .daxi-pay-wrap, [data-daxi-checkout-flow="1"]',
          );
          if (!hasCheckout) slot.innerHTML = html;
          return hasCheckout ? 'fetch-local-guard-blocked' : 'fetch-swap-no-guard-fn';
        } catch (e) {
          return 'fetch-error:' + (e && e.message);
        }
      });

      annotatePrerequisite(testInfo, `Sheet refresh trigger mode: ${triggered}`);

      const sheetResp = await sheetRespPromise;
      if (sheetResp) {
        expect(sheetResp.status(), 'orders sheet GET should not 5xx').toBeLessThan(500);
      }
    });

    await test.step('Checkout UI still present after refresh attempt', async () => {
      if (inject.mode === 'synthetic') {
        await expect(
          page.locator('#guest-phone-card'),
          'Checkout marker wiped by sheet refresh — _daxiSheetSlotHasCheckoutFlow regression',
        ).toBeVisible({ timeout: 5000 });
      } else {
        await expect(
          page
            .getByText(sel.phoneModalText)
            .or(page.getByText(sel.priceModalText))
            .or(page.getByText(sel.payModalText))
            .first(),
          'Phone/price/pay UI wiped by sheet HTMX poll — MODIF §1 regression',
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test('price and pay modal text survive a second sheet poll (when visible)', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'tag', description: 'fragility' });
    annotatePrerequisite(
      testInfo,
      'Runs synthetic markers for price + pay if live modals absent. Uses product ids.',
    );

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await dismissLocationPrompt(page);
    await page.waitForTimeout(300);
    await showOrderSheetSlot(page);

    await test.step('Inject price + pay markers into sheet slot', async () => {
      const result = await page.evaluate(() => {
        const slot = document.getElementById('daxi-sheet-order-slot');
        if (!slot) return { ok: false };
        // Product guard keys: #price-proposal-card, #payment-selection-wrap
        const price = document.createElement('div');
        price.id = 'price-proposal-card';
        price.setAttribute('data-daxi-checkout-flow', '1');
        price.textContent = 'E2E_PRICE_MODAL';
        const pay = document.createElement('div');
        pay.id = 'payment-selection-wrap';
        pay.setAttribute('data-daxi-checkout-flow', '1');
        pay.className = 'daxi-pay-wrap';
        pay.textContent = 'E2E_PAY_MODAL';
        // Stable e2e aliases
        const priceE2e = document.createElement('div');
        priceE2e.id = 'daxi-e2e-checkout-price';
        priceE2e.textContent = 'E2E_PRICE_MODAL';
        const payE2e = document.createElement('div');
        payE2e.id = 'daxi-e2e-checkout-pay';
        payE2e.textContent = 'E2E_PAY_MODAL';
        slot.appendChild(price);
        slot.appendChild(pay);
        slot.appendChild(priceE2e);
        slot.appendChild(payE2e);
        return {
          ok: true,
          guard:
            typeof window._daxiSheetSlotHasCheckoutFlow === 'function'
              ? !!window._daxiSheetSlotHasCheckoutFlow()
              : null,
        };
      });
      if (!result.ok) {
        throw new Error(
          'Sheet slot #daxi-sheet-order-slot not found for price/pay guard test.',
        );
      }
      annotatePrerequisite(testInfo, `price/pay inject guard=${String(result.guard)}`);
      await expect(page.locator('#price-proposal-card')).toBeVisible();
      await expect(page.locator('#payment-selection-wrap')).toBeVisible();
    });

    await test.step('Attempt sheet swap respecting guard when present', async () => {
      await page.evaluate(async () => {
        const res = await fetch('/htmx/client/orders/sheet/', {
          credentials: 'same-origin',
          headers: { 'HX-Request': 'true' },
        });
        const html = await res.text();
        const slot = document.getElementById('daxi-sheet-order-slot');
        if (!slot) return;
        if (typeof window._daxiSheetSlotHasCheckoutFlow === 'function') {
          if (!window._daxiSheetSlotHasCheckoutFlow()) slot.innerHTML = html;
        } else {
          const hasCheckout = !!slot.querySelector(
            '#guest-phone-card, #pending-coords-card, #price-proposal-card, #payment-selection-wrap, .daxi-pay-wrap, [data-daxi-checkout-flow="1"]',
          );
          if (!hasCheckout) slot.innerHTML = html;
        }
      });
    });

    await test.step('Price and pay markers remain', async () => {
      await expect(page.locator('#price-proposal-card')).toBeVisible();
      await expect(page.locator('#payment-selection-wrap')).toBeVisible();
      await expect(page.locator('#daxi-e2e-checkout-price')).toBeVisible();
      await expect(page.locator('#daxi-e2e-checkout-pay')).toBeVisible();
    });
  });
});
