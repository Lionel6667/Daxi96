// @ts-check
/**
 * Phase 8 — Multi-context: client sheet reflects driver accept.
 * Seeds a payable Cap-Haïtien order with guest_id; driver accepts; client sheet shows chauffeur.
 */
const { test, expect } = require('@playwright/test');
const { annotatePrerequisite, baseUrl } = require('../helpers/auth');
const { installGeolocationMock, CAP_HAITIEN } = require('../helpers/geo');
const { showOrderSheetSlot, dismissLocationPrompt } = require('../helpers/booking');
const sel = require('../helpers/selectors');
const {
  ensureDemoDriver,
  clearDriverLoginRateLimit,
  seedAcceptableOrder,
  readOrderStatus,
  loginAsDriverUI,
  postDriverSession,
  postDriverLocation,
  postAcceptOrder,
  stubGoogleMaps,
} = require('../helpers/driver');

const BASE = baseUrl();

test.describe('Phase 8 | critical client-to-driver', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearDriverLoginRateLimit();
    ensureDemoDriver();
  });

  test('driver accept appears on client sheet (multi-page)', async ({ browser }, testInfo) => {
    annotatePrerequisite(
      testInfo,
      'Two browser contexts: guest client sheet + driver accept. Seed = price_confirmed/in_person.',
    );

    const guestId = `e2e-c2d-${Date.now()}`;
    const seeded = seedAcceptableOrder({ guestId, tag: 'c2d' });
    expect(seeded.order_id).toBeTruthy();

    const clientCtx = await browser.newContext({
      locale: 'fr-HT',
      timezoneId: 'America/Port-au-Prince',
      geolocation: {
        latitude: CAP_HAITIEN.latitude,
        longitude: CAP_HAITIEN.longitude,
        accuracy: 12,
      },
      permissions: ['geolocation'],
    });
    const driverCtx = await browser.newContext({
      locale: 'fr-HT',
      timezoneId: 'America/Port-au-Prince',
      geolocation: {
        latitude: CAP_HAITIEN.latitude,
        longitude: CAP_HAITIEN.longitude,
        accuracy: 12,
      },
      permissions: ['geolocation'],
    });

    const client = await clientCtx.newPage();
    const driver = await driverCtx.newPage();

    try {
      await stubGoogleMaps(client);
      await client.addInitScript(installGeolocationMock, {
        latitude: CAP_HAITIEN.latitude,
        longitude: CAP_HAITIEN.longitude,
        accuracy: 12,
      });
      await client.addInitScript((gid) => {
        try {
          localStorage.setItem('daxi_guest_id', gid);
        } catch (_) {}
        window._daxiGuestId = gid;
      }, guestId);

      await client.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissLocationPrompt(client);
      await showOrderSheetSlot(client);

      // Prime sheet with guest orders
      await client.evaluate(async (gid) => {
        const el = document.getElementById('guestIdHidden');
        if (el) el.value = gid;
        try {
          localStorage.setItem('daxi_guest_id', gid);
        } catch (_) {}
        if (typeof window._loadDaxiSheetOrders === 'function') {
          await window._loadDaxiSheetOrders();
        } else if (window.htmx) {
          window.htmx.ajax('GET', '/htmx/client/orders/sheet/?guest_id=' + encodeURIComponent(gid), {
            target: '#daxi-sheet-order-slot',
            swap: 'innerHTML',
          });
        }
      }, guestId);
      await client.waitForTimeout(800);

      // Driver path
      await loginAsDriverUI(driver, testInfo);
      await postDriverSession(driver, 'open');
      await postDriverLocation(driver, CAP_HAITIEN);
      const acceptBody = await postAcceptOrder(driver, seeded.order_id);
      expect(acceptBody).toMatch(/Commande acceptée/i);

      const st = readOrderStatus(seeded.order_id);
      expect(st.status).toBe('driver_assigned');
      expect(st.driver_name || st.driver_id).toBeTruthy();

      // Client sheet refresh
      await client.evaluate(async (gid) => {
        if (typeof window._loadDaxiSheetOrders === 'function') {
          await window._loadDaxiSheetOrders();
        } else if (window.htmx) {
          window.htmx.ajax('GET', '/htmx/client/orders/sheet/?guest_id=' + encodeURIComponent(gid), {
            target: '#daxi-sheet-order-slot',
            swap: 'innerHTML',
          });
        }
      }, guestId);

      const sheet = client.locator(sel.sheetSlot);
      await expect(sheet).toBeVisible({ timeout: 15_000 });

      // Poll until driver block / status badge appears
      await expect
        .poll(
          async () => {
            await client.evaluate(async (gid) => {
              if (typeof window._loadDaxiSheetOrders === 'function') {
                await window._loadDaxiSheetOrders();
              }
            }, guestId);
            const html = await sheet.innerHTML();
            return html;
          },
          { timeout: 25_000, intervals: [500, 1000, 2000] },
        )
        .toMatch(/Chauffeur assigné|driver_assigned|data-driver-name|Marc Chauffeur|driver-name/i);

      const sheetHtml = await sheet.innerHTML();
      expect(sheetHtml).toMatch(/Chauffeur assigné|Marc Chauffeur|data-driver-name/i);

      // Direct sheet endpoint (same guest_id) — belt + suspenders
      const sheetRes = await client.request.get(
        `/htmx/client/orders/sheet/?guest_id=${encodeURIComponent(guestId)}`,
      );
      expect(sheetRes.ok()).toBeTruthy();
      const sheetApiHtml = await sheetRes.text();
      expect(sheetApiHtml).toMatch(/Chauffeur assigné|Marc Chauffeur|data-driver-name|driver_assigned/i);
    } finally {
      await clientCtx.close();
      await driverCtx.close();
    }
  });
});
