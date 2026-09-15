// @ts-check
/**
 * ORDERS MATRIX AUDIT — Wave 2 (enterprise / affiliate / scheduled / cancelled)
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const {
  seedOrderMatrix, bindClientGuest,
} = require('../helpers/seedApi');
const {
  ensureDemoAdmin, clearAdminLoginRateLimit, loginAsAdminUI, stubGoogleMaps: stubAdminMaps,
} = require('../helpers/admin');
const {
  ensureDemoEnterprise, clearEnterpriseRateLimit, loginAsEnterpriseUI, stubGoogleMaps: stubEntMaps,
} = require('../helpers/enterprise');
const {
  ensureDemoDriver, clearDriverLoginRateLimit, loginAsDriverUI, stubGoogleMaps: stubDrvMaps,
} = require('../helpers/driver');
const { stubGoogleMaps } = require('../helpers/maps_stub');

const ARTIFACT_DIR = '/workspace/daxi-audit/orders-matrix';
const FINDINGS_PATH = `${ARTIFACT_DIR}/wave2-findings.json`;

test.describe('Orders matrix Wave2 enterprise/affiliate/scheduled', () => {
  test.describe.configure({ mode: 'serial' });
  let seed;
  const findings = [];
  const coverage = {};

  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    seed = seedOrderMatrix({
      fresh: false,
      types: ['enterprise', 'affiliate', 'scheduled', 'cancelled_snapshot'],
    });
    expect(seed.ok).toBeTruthy();
    expect(seed.stub?.DAXI_STUB_WHATSAPP).toBeTruthy();
  });

  test.afterAll(() => {
    fs.writeFileSync(FINDINGS_PATH, JSON.stringify({
      generated_at: new Date().toISOString(),
      wave: 2,
      seed_summary: { seeded_count: seed?.seeded_count, types: seed?.types_seeded, stub: seed?.stub },
      coverage,
      findings,
      findings_by_severity: {
        blocker: findings.filter((f) => f.severity === 'blocker').length,
        major: findings.filter((f) => f.severity === 'major').length,
        minor: findings.filter((f) => f.severity === 'minor').length,
      },
    }, null, 2));
  });

  test('enterprise dashboard + checkout HTMX', async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    ensureDemoEnterprise(testInfo);
    clearEnterpriseRateLimit();
    await stubEntMaps(page);
    await loginAsEnterpriseUI(page, testInfo);

    const rows = (seed.orders || []).filter((o) => o.ok && !o.na && o.otype === 'enterprise');
    // Load enterprise orders list
    const listUrls = [
      '/htmx/enterprise/orders/',
      '/htmx/entreprise/orders/',
      '/entreprise/dashboard/',
    ];
    let listHtml = '';
    let listOk = false;
    for (const u of listUrls) {
      const res = await page.request.get(u, { timeout: 25_000 });
      if (res.ok()) {
        listHtml = await res.text();
        listOk = true;
        coverage.enterprise_list = { url: u, http: res.status(), bytes: listHtml.length };
        break;
      }
    }
    if (!listOk) {
      findings.push({
        severity: 'major', role: 'enterprise', title: 'Enterprise orders HTMX not found',
        detail: `Tried ${listUrls.join(', ')}`,
        suggested_fix: 'Confirm enterprise orders URL',
      });
    }

    let tested = 0;
    for (const order of rows) {
      const oid = order.order_id;
      const present = listHtml.includes(String(oid)) || listHtml.includes(`order-card-${oid}`);
      // Checkout fragment
      const checkoutUrls = [
        `/htmx/enterprise/orders/${oid}/checkout/`,
        `/htmx/enterprise/order/${oid}/checkout/`,
        `/htmx/entreprise/orders/${oid}/checkout/`,
      ];
      let checkoutOk = false;
      let checkoutBody = '';
      for (const u of checkoutUrls) {
        const res = await page.request.get(u, { timeout: 20_000 });
        if (res.ok()) {
          checkoutOk = true;
          checkoutBody = await res.text();
          break;
        }
      }
      // Also try openEntCheckout via page if on dashboard
      if (!checkoutOk) {
        await page.goto('/entreprise/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
        await page.evaluate((id) => {
          try { if (typeof openEntCheckout === 'function') openEntCheckout(id); } catch (_) {}
        }, oid).catch(() => {});
        await page.waitForTimeout(800);
        checkoutBody = await page.evaluate(() => {
          const b = document.getElementById('ent-checkout-body');
          return b ? b.innerHTML : '';
        });
        checkoutOk = checkoutBody.length > 40;
      }

      if (['pending', 'price_confirmed'].includes(order.real_status || order.status) && !checkoutOk) {
        findings.push({
          severity: 'major',
          otype: order.otype,
          status: order.status,
          role: 'enterprise',
          order_id: oid,
          title: 'Enterprise checkout UI missing for priced/pending order',
          detail: `status=${order.real_status} price=${order.price}`,
          repro: `openEntCheckout(${oid})`,
          suggested_fix: 'Wire enterprise_order_checkout HTMX route',
        });
      }
      if (listOk && !present && order.enterprise_id) {
        findings.push({
          severity: 'major',
          otype: order.otype,
          status: order.status,
          role: 'enterprise',
          order_id: oid,
          title: `Enterprise list missing order #${oid}`,
          detail: `status=${order.real_status}`,
          repro: 'Load enterprise orders HTMX',
          suggested_fix: 'Check enterprise order queryset filters',
        });
      }
      coverage[`${order.key}__enterprise`] = { tested: true, present, checkoutOk };
      tested += 1;
    }
    expect(tested).toBeGreaterThan(3);
  });

  test('affiliate + scheduled visible on admin + client', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    ensureDemoAdmin(testInfo);
    clearAdminLoginRateLimit();
    await stubAdminMaps(page);
    await loginAsAdminUI(page, testInfo);

    const rows = (seed.orders || []).filter((o) => o.ok && !o.na && ['affiliate', 'scheduled', 'cancelled_snapshot'].includes(o.otype));
    const adminAll = await page.request.get('/htmx/admin/orders/?status=all');
    const adminHtml = adminAll.ok() ? await adminAll.text() : '';
    for (const order of rows) {
      const present = adminHtml.includes(String(order.order_id));
      if (!present) {
        findings.push({
          severity: 'major',
          otype: order.otype,
          status: order.status,
          role: 'admin',
          order_id: order.order_id,
          title: `Admin list missing ${order.otype} #${order.order_id}`,
          detail: `status=${order.real_status} is_later=${order.is_later}`,
          repro: 'GET /htmx/admin/orders/?status=all',
          suggested_fix: 'Ensure affiliate/scheduled/cancelled included in admin queryset',
        });
      }
      coverage[`${order.key}__admin`] = { tested: true, present };
    }

    // Client guest bind for affiliate guest ids
    await stubGoogleMaps(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    for (const order of rows.filter((o) => o.otype === 'affiliate' || o.otype === 'scheduled')) {
      const gid = order.guest_id || seed.guest_id;
      await bindClientGuest(page, gid);
      const r = await page.request.get(`/htmx/client/orders/?guest_id=${encodeURIComponent(gid)}`);
      const html = r.ok() ? await r.text() : '';
      const present = html.includes(String(order.order_id));
      coverage[`${order.key}__client`] = { tested: true, present, http: r.status() };
    }
  });

  test('driver sees affiliate/enterprise midflow', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    ensureDemoDriver(testInfo);
    clearDriverLoginRateLimit();
    await stubDrvMaps(page);
    await loginAsDriverUI(page, testInfo);
    const mid = (seed.orders || []).filter((o) => o.ok && !o.na && o.driver_id && ['enterprise', 'affiliate'].includes(o.otype));
    const accepted = await page.request.get('/htmx/driver/orders/?tab=accepted');
    const html = accepted.ok() ? await accepted.text() : '';
    for (const order of mid) {
      const present = html.includes(String(order.order_id));
      if (!present && ['driver_assigned', 'on_way', 'arrived', 'in_progress'].includes(order.real_status || order.status)) {
        findings.push({
          severity: 'major',
          otype: order.otype,
          status: order.status,
          role: 'driver',
          order_id: order.order_id,
          title: `Driver accepted tab missing ${order.otype} midflow #${order.order_id}`,
          detail: `status=${order.real_status}`,
          repro: 'GET /htmx/driver/orders/?tab=accepted',
          suggested_fix: 'Driver queryset should include enterprise-linked assigned orders',
        });
      }
      coverage[`${order.key}__driver`] = { tested: true, present };
    }
  });
});
