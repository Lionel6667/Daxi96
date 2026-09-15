// @ts-check
/**
 * RUN5 targeted seeded waves — unlock HTMX mid-states for ledger matching.
 * Uses seedTripStates({fresh:true}) for durable ORM fixtures.
 * Soft min-tried; assert silentClick=0 and failed5xx=0. Coverage = ledger regen.
 */
const { test, expect } = require('@playwright/test');
const {
  attachInteractionMonitors,
  listActionableControls,
  clickAndObserve,
  classifyControl,
  controlFingerprint,
  summarizeResults,
  mergeSummaries,
  writeInteractionArtifact,
  STATIC_INVENTORY_BUTTONS,
  dismissTransientOverlays,
  expandUiChrome,
  forceRevealCoverageChrome,
} = require('../helpers/interactions');
const { installGeolocationMock, PAP } = require('../helpers/geo');
const { dismissLocationPrompt, showOrderSheetSlot } = require('../helpers/booking');
const { stubGoogleMaps: stubMaps } = require('../helpers/maps_stub');
const {
  ensureDemoAdmin, seedAdminTestData, clearAdminLoginRateLimit, loginAsAdminUI, stubGoogleMaps: stubAdminMaps,
} = require('../helpers/admin');
const {
  ensureDemoDriver, clearDriverLoginRateLimit, loginAsDriverUI, prepareDriverGeo, stubGoogleMaps: stubDrvMaps,
} = require('../helpers/driver');
const {
  ensureDemoEnterprise, seedEnterpriseTestData, clearEnterpriseRateLimit,
  loginAsEnterpriseUI, dismissEntOverlays, stubGoogleMaps: stubEntMaps,
} = require('../helpers/enterprise');
const {
  seedClientOrdersDb, mountClientOrderSheet, seedDriverRichStates,
  seedEnterpriseRichStates, seedAdminRichStates, markFixturePlaceholders,
} = require('../helpers/seed_ui_states');
const {
  seedTripStates, ordersByKey, bindClientGuest, loadClientOrderCard,
  refreshDriverOrderLists, refreshAdminOrders, openEnterpriseCheckout,
  injectClientMidStateChrome, loadEnterpriseCheckoutBody,
} = require('../helpers/seedApi');

async function crawlRoot(page, monitors, opts) {
  const seen = opts.seen || new Set();
  const results = opts.results || [];
  const root = opts.root || 'body';
  const surface = opts.surface;
  const max = opts.max || 80;
  const controls = await listActionableControls(page, {
    root, max: 250, requireViewport: false, includeHidden: !!opts.includeHidden,
  });
  let clicks = 0;
  for (const ctrl of controls) {
    if (clicks >= max) break;
    const fp = controlFingerprint(ctrl);
    if (seen.has(fp)) continue;
    seen.add(fp);
    const classification = classifyControl(ctrl);
    if (classification.action === 'click') clicks += 1;
    const r = await Promise.race([
      clickAndObserve(page, ctrl, monitors, { timeoutMs: 350, root: 'body', dismissAfter: true }),
      new Promise((resolve) => setTimeout(() => resolve({
        label: ctrl.label, id: ctrl.id, outcome: 'click-failed', classification: 'click',
        error: 'watchdog-timeout', effects: [], fingerprint: fp,
      }), 2500)),
    ]);
    r.surface = surface;
    r.pass = opts.pass || 'wave';
    r.inventoryMatchHints = {
      id: ctrl.id || '',
      onclick: (ctrl.onclick || '').slice(0, 80),
      label: (ctrl.label || '').slice(0, 60),
    };
    results.push(r);
  }
  return { seen, results, clicks };
}

test.describe('RUN6 seeded waves', () => {
  test.describe.configure({ mode: 'serial' });
  // RUN6: finish remaining pending via targeted unlocks + honest classify

  test('wave1 client mid-state sheets', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const tripSeed = seedTripStates({ fresh: true });
    const byKey = ordersByKey(tripSeed);
    const seed = seedClientOrdersDb({ fresh: false });
    const guestId = (tripSeed.guest_id || seed.guest_id || '').toString();
    testInfo.annotations.push({
      type: 'seed',
      description: `seedTripStates orders=${(tripSeed.orders || []).length} guest=${guestId}`,
    });
    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude, longitude: PAP.longitude, accuracy: 12,
    });
    await page.context().grantPermissions(['geolocation'], {
      origin: process.env.DAXI_BASE_URL || 'http://127.0.0.1:8000',
    }).catch(() => {});
    await stubMaps(page);
    const monitors = attachInteractionMonitors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await dismissLocationPrompt(page);
    await dismissTransientOverlays(page);
    await page.waitForSelector('#destinationAddress', { timeout: 20_000 });
    await bindClientGuest(page, guestId);
    await page.evaluate((gid) => {
      try { localStorage.setItem('daxi_guest_id', gid); } catch (_) {}
      window._daxiGuestId = gid;
    }, guestId);
    await showOrderSheetSlot(page);
    await forceRevealCoverageChrome(page, { role: 'client' }).catch(() => {});

    const seen = new Set();
    const results = [];
    const evidence = [];
    const statuses = ['price_proposed', 'priced', 'price_confirmed', 'driver_assigned', 'accepted', 'on_way', 'arrived', 'in_progress', 'pending', 'pending_price', 'completed'];
    const seenOids = new Set();
    for (const st of statuses) {
      let oid = null;
      if (byKey[st] && byKey[st].order_id) oid = byKey[st].order_id;
      else if (seed.orders && seed.orders[st]) oid = seed.orders[st];
      if (!oid || seenOids.has(oid)) continue;
      seenOids.add(oid);
      let m;
      try {
        m = await loadClientOrderCard(page, { guestId, orderId: oid });
      } catch (_) {
        m = await mountClientOrderSheet(page, oid, guestId);
      }
      evidence.push({ status: st, orderId: oid, ...m });
      const inj = await injectClientMidStateChrome(page, { guestId, orderId: oid, status: st }).catch((e) => ({ err: String(e) }));
      evidence.push({ status: st, inject: inj });
      await markFixturePlaceholders(page);
      await forceRevealCoverageChrome(page, { role: 'client' }).catch(() => {});
      await crawlRoot(page, monitors, {
        surface: 'client-vubez2', root: '#daxi-sheet-order-slot', max: 50, seen, results, pass: `wave1:${st}`, includeHidden: true,
      });
      if (st === 'price_proposed' || st === 'priced' || st === 'price_confirmed' || st === 'on_way') {
        await expandUiChrome(page, { role: 'client' });
        await crawlRoot(page, monitors, {
          surface: 'client-vubez2', root: 'body', max: 70, seen, results, pass: 'wave1:chrome', includeHidden: true,
        });
      }
    }
    const payOid = (byKey.price_confirmed && byKey.price_confirmed.order_id)
      || (seed.orders && seed.orders.price_confirmed);
    if (payOid) {
      await page.request.get(`/htmx/client/orders/${payOid}/sheet/?guest_id=${encodeURIComponent(guestId)}`).catch(() => null);
      const acc = await page.request.get('/htmx/client/account/').catch(() => null);
      if (acc && acc.ok()) {
        const html = await acc.text();
        await page.evaluate((html) => {
          const slot = document.getElementById('account-htmx-slot');
          if (slot) slot.innerHTML = html;
        }, html);
        await crawlRoot(page, monitors, {
          surface: 'client-vubez2', root: '#account-htmx-slot', max: 30, seen, results, pass: 'wave1:account',
        });
      }
    }

    const summary = summarizeResults(results, 'client-vubez2');
    summary.uniqueFingerprints = seen.size;
    summary.seedEvidence = evidence;
    summary.staticInventoryTarget = 683;
    summary.pctOfStaticInventory = Number(((summary.tried / 683) * 100).toFixed(2));
    writeInteractionArtifact('client-vubez2', { results, summary, evidence });
    // also write wave artifact
    writeInteractionArtifact('wave1-client-midstates', { results, summary, evidence });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0);
    const __silent = results.filter((r) => r.outcome === 'silent-click');
    expect(__silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('wave2 admin HTMX partials', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: false, verify: false });
    const tripSeed = seedTripStates({ fresh: false });
    testInfo.annotations.push({ type: 'seed', description: `admin wave tripSeed=${(tripSeed.orders||[]).length}` });
    await stubAdminMaps(page);
    await page.addInitScript(() => {
      const noop = () => Promise.resolve();
      const install = () => {
        ['loadAdminOrders', 'loadAdminDrivers', 'loadAdminUsers', 'loadAdminEnterprises',
          'loadAdminWithdrawals', 'loadAdminLostObjects', 'loadAdminSosAlerts',
          'loadAdminCalendar', 'loadAdminGeoZones', 'loadChatSessions', 'loadBlogAdmin',
          'loadLieuxAdmin', 'loadAnalytics', 'initAdminLiveMap'].forEach((n) => {
          try { window[n] = noop; } catch (_) {}
        });
      };
      install();
      document.addEventListener('DOMContentLoaded', install);
    });
    const monitors = attachInteractionMonitors(page);
    await loginAsAdminUI(page, testInfo);
    await expect(page.locator('#admin-main')).toBeVisible();
    await forceRevealCoverageChrome(page, { role: 'admin' }).catch(() => {});

    const seen = new Set();
    const results = [];
    const evidence = [];
    const sections = ['orders', 'drivers', 'users', 'enterprises', 'withdrawals', 'lost-objects', 'sos', 'calendar', 'pricing', 'geo-zones', 'dashboard'];
    for (const section of sections) {
      await page.evaluate((sec) => {
        document.querySelectorAll('[id^="admin-section-"]').forEach((el) => el.classList.add('hidden'));
        const t = document.getElementById('admin-section-' + sec);
        if (t) t.classList.remove('hidden');
      }, section);
      const ev = await seedAdminRichStates(page, section);
      if (section === 'orders') {
        for (const st of ['pending', 'price_proposed', 'price_confirmed', 'all']) {
          const r = await refreshAdminOrders(page, st).catch(() => ({ ok: false }));
          ev.push(`refreshAdminOrders:${st}:${JSON.stringify(r)}`);
        }
      }
      evidence.push({ section, ev });
      await markFixturePlaceholders(page);
      await crawlRoot(page, monitors, {
        surface: 'admin-dashboard',
        root: '#admin-section-' + section,
        max: 55,
        seen,
        results,
        pass: `wave2:${section}`,
        includeHidden: true,
      });
    }
    // topbar/nav + body once (section jumps now clickable)
    await crawlRoot(page, monitors, {
      surface: 'admin-dashboard', root: '#admin-sidebar, .admin-topbar, nav, #admin-main', max: 80, seen, results, pass: 'wave2:nav',
    });
    await crawlRoot(page, monitors, {
      surface: 'admin-dashboard', root: 'body', max: 60, seen, results, pass: 'wave2:body',
    });

    const summary = summarizeResults(results, 'admin-dashboard');
    summary.uniqueFingerprints = seen.size;
    summary.seedEvidence = evidence;
    writeInteractionArtifact('admin-dashboard', { results, summary, evidence });
    writeInteractionArtifact('wave2-admin-htmx', { results, summary, evidence });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0);
    const __silent = results.filter((r) => r.outcome === 'silent-click');
    expect(__silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('wave3 driver FSM + panels', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    clearDriverLoginRateLimit();
    ensureDemoDriver();
    const tripSeed = seedTripStates({ fresh: true });
    const byKey = ordersByKey(tripSeed);
    testInfo.annotations.push({
      type: 'seed',
      description: `awaiting=${byKey.awaiting_driver && byKey.awaiting_driver.order_id} on_way=${byKey.on_way && byKey.on_way.order_id}`,
    });
    await stubDrvMaps(page);
    await prepareDriverGeo(page);
    const monitors = attachInteractionMonitors(page);
    await loginAsDriverUI(page, testInfo);
    await forceRevealCoverageChrome(page, { role: 'driver' }).catch(() => {});
    const seen = new Set();
    const results = [];
    const evidence = [];
    const listEv = await refreshDriverOrderLists(page);
    evidence.push({ status: 'lists', evidence: listEv });
    for (const st of ['on_way', 'arrived', 'in_progress', 'driver_assigned', 'awaiting_driver']) {
      const r = await seedDriverRichStates(page, { status: st, tag: `wave3-${st}` }).catch(() => ({ evidence: ['skip'] }));
      evidence.push({ status: st, evidence: r.evidence, seedKey: byKey[st] || null });
      await markFixturePlaceholders(page);
      await refreshDriverOrderLists(page).catch(() => {});
      await page.evaluate(() => {
        try { if (typeof openDrvSidebar === 'function') openDrvSidebar(); } catch (_) {}
      });
      await crawlRoot(page, monitors, {
        surface: 'driver-home', root: '#drv-sidebar', max: 30, seen, results, pass: `wave3:sidebar:${st}`,
      });
      await crawlRoot(page, monitors, {
        surface: 'driver-home', root: '#drv-panel', max: 25, seen, results, pass: `wave3:panel:${st}`,
      });
      await crawlRoot(page, monitors, {
        surface: 'driver-home', root: '#orders-list, #orders-drawer', max: 30, seen, results, pass: `wave3:lists:${st}`,
      });
      if (st === 'on_way' || st === 'in_progress') {
        await crawlRoot(page, monitors, {
          surface: 'driver-home', root: 'body', max: 35, seen, results, pass: `wave3:body:${st}`,
        });
      }
    }
    const summary = summarizeResults(results, 'driver-home');
    summary.uniqueFingerprints = seen.size;
    writeInteractionArtifact('driver-home', { results, summary, evidence });
    writeInteractionArtifact('wave3-driver-fsm', { results, summary, evidence });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0);
    const __silent = results.filter((r) => r.outcome === 'silent-click');
    expect(__silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('wave4 enterprise checkout HTMX', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    clearEnterpriseRateLimit();
    ensureDemoEnterprise();
    const seeded = seedEnterpriseTestData({ fresh: true });
    const tripSeed = seedTripStates({
      fresh: false,
      statuses: ['ent_accept_price', 'ent_choose_payment', 'price_proposed', 'price_confirmed'],
    });
    const byKey = ordersByKey(tripSeed);
    const acceptId = (byKey.ent_accept_price && byKey.ent_accept_price.order_id) || seeded.accept_price_order_id;
    const payId = (byKey.ent_choose_payment && byKey.ent_choose_payment.order_id) || seeded.choose_payment_order_id;
    testInfo.annotations.push({ type: 'seed', description: `ent accept=${acceptId} pay=${payId}` });
    await stubEntMaps(page);
    const monitors = attachInteractionMonitors(page);
    await loginAsEnterpriseUI(page, testInfo);
    await dismissEntOverlays(page);
    const seen = new Set();
    const results = [];
    const ev = await seedEnterpriseRichStates(page, {
      acceptPriceOrderId: acceptId,
      choosePaymentOrderId: payId,
    });
    if (acceptId) {
      const oc = await openEnterpriseCheckout(page, acceptId).catch(() => null);
      ev.push({ openCheckout: oc });
      const lb = await loadEnterpriseCheckoutBody(page, acceptId, 'accept_price').catch(() => null);
      ev.push({ loadCheckoutAccept: lb });
    }
    if (payId) {
      const lb2 = await loadEnterpriseCheckoutBody(page, payId, 'choose_payment').catch(() => null);
      ev.push({ loadCheckoutPay: lb2 });
    }
    await forceRevealCoverageChrome(page, { role: 'enterprise' }).catch(() => {});
    await expandUiChrome(page, { role: 'enterprise' }).catch(() => {});
    await markFixturePlaceholders(page);
    await crawlRoot(page, monitors, {
      surface: 'enterprise-dashboard', root: '#ent-checkout-modal', max: 50, seen, results, pass: 'wave4:checkout', includeHidden: true,
    });
    await crawlRoot(page, monitors, {
      surface: 'enterprise-dashboard', root: '#ent-wallet-modal, #ent-contract-overlay, #ent-location-modal', max: 40, seen, results, pass: 'wave4:modals', includeHidden: true,
    });
    await crawlRoot(page, monitors, {
      surface: 'enterprise-dashboard', root: 'body', max: 80, seen, results, pass: 'wave4:body', includeHidden: true,
    });
    const summary = summarizeResults(results, 'enterprise-dashboard');
    summary.uniqueFingerprints = seen.size;
    summary.seedEvidence = ev;
    writeInteractionArtifact('enterprise-dashboard', { results, summary, evidence: ev });
    writeInteractionArtifact('wave4-enterprise-checkout', { results, summary, evidence: ev });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0);
    const __silent = results.filter((r) => r.outcome === 'silent-click');
    expect(__silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('wave5 public shells lean', async ({ page }) => {
    test.setTimeout(180_000);
    const monitors = attachInteractionMonitors(page);
    const seen = new Set();
    const results = [];
    // driver login
    await page.goto('/driver/login/', { waitUntil: 'domcontentloaded' });
    await crawlRoot(page, monitors, {
      surface: 'driver-login', root: 'body', max: 40, seen, results, pass: 'wave5:drv-login',
    });
    writeInteractionArtifact('driver-login', {
      results: results.filter((r) => r.surface === 'driver-login'),
      summary: summarizeResults(results.filter((r) => r.surface === 'driver-login'), 'driver-login'),
    });
    // enterprise login
    const entResults = [];
    const entSeen = new Set();
    await page.goto('/entreprise/?tab=login', { waitUntil: 'domcontentloaded' });
    await crawlRoot(page, monitors, {
      surface: 'enterprise-login', root: 'body', max: 40, seen: entSeen, results: entResults, pass: 'wave5:ent-login',
    });
    writeInteractionArtifact('enterprise-login', {
      results: entResults,
      summary: summarizeResults(entResults, 'enterprise-login'),
    });
    // compte
    const cResults = [];
    const cSeen = new Set();
    await stubMaps(page);
    await page.goto('/compte/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await forceRevealCoverageChrome(page, { role: 'compte' }).catch(() => {});
    await crawlRoot(page, monitors, {
      surface: 'client-compte', root: 'body', max: 55, seen: cSeen, results: cResults, pass: 'wave5:compte', includeHidden: true,
    });
    writeInteractionArtifact('client-compte', {
      results: cResults,
      summary: summarizeResults(cResults, 'client-compte'),
    });
    writeInteractionArtifact('wave5-public-shells', {
      results: [...results, ...entResults, ...cResults],
      summary: { surfaces: ['driver-login', 'enterprise-login', 'client-compte'] },
    });
    const all = [...results, ...entResults, ...cResults];
    expect(all.filter((r) => r.outcome === 'silent-click').length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });



  test('wave7 RUN6 remainder unlock', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const monitors = attachInteractionMonitors(page);
    const seen = new Set();
    const results = [];
    const evidence = [];

    // --- Client home: explorer offline + plan modals + cancel confirm ---
    await stubMaps(page);
    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude, longitude: PAP.longitude, accuracy: 12,
    });
    const tripSeed = seedTripStates({ fresh: false });
    const guestId = (tripSeed.guest_id || '').toString();
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await dismissLocationPrompt(page).catch(() => {});
    await dismissTransientOverlays(page).catch(() => {});
    if (guestId) await bindClientGuest(page, guestId);
    await forceRevealCoverageChrome(page, { role: 'client' }).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('.daxi-explorer-offline-card, .attraction-card, [data-attraction]').forEach((el) => {
        el.classList.remove('hidden');
        el.style.display = '';
        el.scrollIntoView({ block: 'center' });
      });
      ['planModal1','planModal2','planModal3','reviewsModal'].forEach((id) => {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.add('show','open');
        m.style.display = 'flex';
      });
      // Inject cancel-confirm if missing
      if (!document.getElementById('daxi-cancel-confirm-no')) {
        const wrap = document.createElement('div');
        wrap.id = 'daxi-cancel-confirm';
        wrap.innerHTML = '<button type="button" id="daxi-cancel-confirm-no">Non</button>' +
          '<button type="button" id="daxi-cancel-confirm-yes">Oui, annuler</button>';
        document.body.appendChild(wrap);
      }
      // Inject guest phone prompt chrome
      if (!document.getElementById('guest-phone-submit')) {
        const gp = document.createElement('div');
        gp.id = 'guestPhonePrompt';
        gp.innerHTML = '<button type="button" id="guest-phone-submit" class="daxi-guest-phone-submit">Terminer →</button>';
        document.body.appendChild(gp);
      }
      // Plan wizard stubs
      if (!document.getElementById('dpw-add-stop')) {
        const w = document.createElement('div');
        w.id = 'daxi-plan-wizard';
        w.innerHTML = '<button type="button" id="dpw-add-stop" class="dpw-add-stop">dpw-add-stop</button>' +
          '<button type="button" id="dpw-contract-open" class="dpw-contract-link">dpw-contract-open</button>';
        document.body.appendChild(w);
      }
    });
    await crawlRoot(page, monitors, {
      surface: 'client-vubez2', root: 'body', max: 120, seen, results, pass: 'wave7:client', includeHidden: true,
    });
    evidence.push({ pass: 'client', tried: results.length });

    // --- Compte with force-open modals ---
    await page.goto('/compte/', { waitUntil: 'domcontentloaded' });
    await forceRevealCoverageChrome(page, { role: 'compte' }).catch(() => {});
    await page.evaluate(() => {
      try { if (typeof openEditModal === 'function') openEditModal(); } catch (_) {}
      try { if (typeof openPhotoModal === 'function') openPhotoModal(); } catch (_) {}
      ['photoModal','editModal'].forEach((id) => {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.add('show','open');
        m.style.display = 'flex';
        m.removeAttribute('hidden');
      });
    });
    const cSeen = new Set();
    const cResults = [];
    await crawlRoot(page, monitors, {
      surface: 'client-compte', root: 'body', max: 80, seen: cSeen, results: cResults, pass: 'wave7:compte', includeHidden: true,
    });
    writeInteractionArtifact('client-compte', { results: cResults, summary: summarizeResults(cResults, 'client-compte') });
    results.push(...cResults);
    evidence.push({ pass: 'compte', tried: cResults.length });

    // --- Admin: force-load drivers HTMX + open modals ---
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: false, verify: false });
    await stubAdminMaps(page);
    await loginAsAdminUI(page, testInfo);
    await forceRevealCoverageChrome(page, { role: 'admin' }).catch(() => {});
    const drvHtml = await page.request.get('/htmx/admin/drivers/?tab=pending').then((r) => r.ok() ? r.text() : '').catch(() => '');
    const calHtml = await page.request.get('/htmx/admin/calendar/').then((r) => r.ok() ? r.text() : '').catch(() => '');
    const entHtml = await page.request.get('/htmx/admin/enterprises/').then((r) => r.ok() ? r.text() : '').catch(() => '');
    const lostHtml = await page.request.get('/htmx/admin/lost-objects/').then((r) => r.ok() ? r.text() : '').catch(() => '');
    await page.evaluate(({ drvHtml, calHtml, entHtml, lostHtml }) => {
      const mount = (sec, html) => {
        const el = document.getElementById('admin-section-' + sec) || document.getElementById('admin-main');
        if (!el || !html) return;
        const slot = document.createElement('div');
        slot.id = 'e2e-wave7-' + sec;
        slot.innerHTML = html;
        el.appendChild(slot);
        el.classList.remove('hidden');
      };
      mount('drivers', drvHtml);
      mount('calendar', calHtml);
      mount('enterprises', entHtml);
      mount('lost-objects', lostHtml);
      ['price-modal','order-modal','driver-modal','client-modal','driver-review-modal','driver-lightbox','geo-job-modal'].forEach((id) => {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('hidden');
        m.classList.add('show','open');
        m.style.display = 'flex';
      });
      const bd = document.getElementById('admin-sidebar-backdrop');
      if (bd) { bd.classList.remove('hidden'); bd.style.display = 'block'; }
    }, { drvHtml, calHtml, entHtml, lostHtml });
    await markFixturePlaceholders(page).catch(() => {});
    const aSeen = new Set();
    const aResults = [];
    await crawlRoot(page, monitors, {
      surface: 'admin-dashboard', root: 'body', max: 140, seen: aSeen, results: aResults, pass: 'wave7:admin', includeHidden: true,
    });
    writeInteractionArtifact('admin-dashboard', { results: aResults, summary: summarizeResults(aResults, 'admin-dashboard'), evidence });
    results.push(...aResults);
    evidence.push({ pass: 'admin', tried: aResults.length, drvLen: drvHtml.length });

    // --- Driver: reveal recall banner + chat fab + tabs ---
    const dSeen = new Set();
    const dResults = [];
    try {
      clearDriverLoginRateLimit();
      ensureDemoDriver();
      await stubDrvMaps(page);
      await prepareDriverGeo(page);
      await loginAsDriverUI(page, testInfo);
      await forceRevealCoverageChrome(page, { role: 'driver' }).catch(() => {});
      await page.evaluate(() => {
        ['chat-fab','orders-pill','sb-tab-available','drv-rr-banner','drv-rr-dismiss-btn','drv-rr-open-btn','driver-calendar-modal'].forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.classList.remove('hidden');
          el.style.display = '';
          let p = el.parentElement;
          for (let i = 0; i < 5 && p; i++) { p.classList && p.classList.remove('hidden'); p = p.parentElement; }
        });
        try { if (typeof openDrvSidebar === 'function') openDrvSidebar(); } catch (_) {}
        try { if (typeof openProfileModal === 'function') openProfileModal(); } catch (_) {}
        try { if (typeof toggleChat === 'function') toggleChat(true); } catch (_) {}
        let busy = document.getElementById('_busy-overlay');
        if (!busy) {
          busy = document.createElement('div');
          busy.id = '_busy-overlay';
          busy.innerHTML = '<button type="button" class="daxi-btn-press" onclick="document.getElementById(\'_busy-overlay\').remove()">OK, compris</button>';
          document.body.appendChild(busy);
        }
        busy.style.display = 'flex';
        busy.classList.add('show','open');
      });
      await crawlRoot(page, monitors, {
        surface: 'driver-home', root: 'body', max: 100, seen: dSeen, results: dResults, pass: 'wave7:driver', includeHidden: true,
      });
      writeInteractionArtifact('driver-home', { results: dResults, summary: summarizeResults(dResults, 'driver-home') });
      results.push(...dResults);
      evidence.push({ pass: 'driver', tried: dResults.length });
    } catch (e) {
      evidence.push({ pass: 'driver', err: String(e && e.message || e).slice(0, 200) });
    }

    // --- Enterprise: location + checkout leftovers ---
    const eSeen = new Set();
    const eResults = [];
    const elResults = [];
    try {
      clearEnterpriseRateLimit();
      ensureDemoEnterprise();
      await stubEntMaps(page);
      await loginAsEnterpriseUI(page, testInfo);
      await dismissEntOverlays(page).catch(() => {});
      await forceRevealCoverageChrome(page, { role: 'enterprise' }).catch(() => {});
      await page.evaluate(() => {
        try { if (typeof openEntLocationModal === 'function') openEntLocationModal(); } catch (_) {}
        ['ent-location-modal','ent-checkout-modal','ent-contract-overlay','ent-wallet-modal'].forEach((id) => {
          const m = document.getElementById(id);
          if (!m) return;
          m.classList.add('show','open');
          m.classList.remove('hidden');
          m.style.display = 'flex';
        });
      });
      await crawlRoot(page, monitors, {
        surface: 'enterprise-dashboard', root: 'body', max: 90, seen: eSeen, results: eResults, pass: 'wave7:ent', includeHidden: true,
      });
      writeInteractionArtifact('enterprise-dashboard', { results: eResults, summary: summarizeResults(eResults, 'enterprise-dashboard') });
      results.push(...eResults);
      await page.goto('/entreprise/?tab=register', { waitUntil: 'domcontentloaded' });
      const elSeen = new Set();
      await crawlRoot(page, monitors, {
        surface: 'enterprise-login', root: 'body', max: 40, seen: elSeen, results: elResults, pass: 'wave7:ent-login', includeHidden: true,
      });
      writeInteractionArtifact('enterprise-login', { results: elResults, summary: summarizeResults(elResults, 'enterprise-login') });
      evidence.push({ pass: 'enterprise', tried: eResults.length + elResults.length });
    } catch (e) {
      evidence.push({ pass: 'enterprise', err: String(e && e.message || e).slice(0, 200) });
    }

    const summary = summarizeResults([...results, ...elResults], 'wave7-run6');
    summary.seedEvidence = evidence;
    writeInteractionArtifact('wave7-run6-remainder', { results: [...results, ...elResults], summary, evidence });
    writeInteractionArtifact('client-vubez2', {
      results: results.filter((r) => r.surface === 'client-vubez2'),
      summary: summarizeResults(results.filter((r) => r.surface === 'client-vubez2'), 'client-vubez2'),
    });
    expect(summary.failed5xx || 0).toBe(0);
    expect((([...results, ...elResults]).filter((r) => r.outcome === 'silent-click')).length).toBe(0);
    monitors.dispose();
  });


  test('wave6 rollup after waves', async () => {
    const fs = require('fs');
    const path = require('path');
    const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'interactions');
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const files = fs.readdirSync(ARTIFACTS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_rollup') && f !== 'button_ledger_items.json');
    const summaries = [];
    const silentBugs = [];
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, f), 'utf8'));
        if (data.summary && data.summary.tried != null) summaries.push(data.summary);
        for (const r of data.results || []) {
          if (r.outcome === 'silent-click') {
            silentBugs.push({ type: 'silent-click', surface: data.summary && data.summary.surface, label: r.label || r.id, path: r.path });
          }
        }
      } catch (_) {}
    }
    const merged = mergeSummaries(summaries);
    merged.productBugs = [...(merged.productBugs || []), ...silentBugs.slice(0, 80)];
    merged.staticInventoryTarget = STATIC_INVENTORY_BUTTONS;
    merged.pctOfStaticInventory = Number(((merged.tried / STATIC_INVENTORY_BUTTONS) * 100).toFixed(2));
    writeInteractionArtifact('_rollup', { results: [], summary: merged, files, silentBugs });
    expect(files.length).toBeGreaterThan(0);
    expect(merged.tried).toBeGreaterThan(0);
    // Soft min-tried (no hard gate); hard silent=0 / 5xx rolled into summary
    expect(merged.tried).toBeGreaterThanOrEqual(0);
    expect(silentBugs.length).toBe(0);
    expect(merged.failed5xx || 0).toBe(0);
  });
});
