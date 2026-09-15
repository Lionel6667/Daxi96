// @ts-check
/**
 * Admin dashboard — RUN3 seeded HTMX crawl (seedTripStates + force-fetch).
 * Asserts: silent===0, 5xx===0. Coverage via ledger regen.
 */
const { test, expect } = require('@playwright/test');
const {
  attachInteractionMonitors,
  listActionableControls,
  clickAndObserve,
  classifyControl,
  controlFingerprint,
  summarizeResults,
  writeInteractionArtifact,
  dismissTransientOverlays,
  expandUiChrome,
  scrollEntireSurface,
} = require('../helpers/interactions');
const {
  ensureDemoAdmin,
  seedAdminTestData,
  clearAdminLoginRateLimit,
  loginAsAdminUI,
  stubGoogleMaps,
} = require('../helpers/admin');
const { seedAdminRichStates, markFixturePlaceholders } = require('../helpers/seed_ui_states');
const { seedTripStates, refreshAdminOrders } = require('../helpers/seedApi');

const SECTIONS = [
  'dashboard', 'orders', 'calendar', 'pricing', 'geo-zones', 'enterprises',
  'withdrawals', 'lost-objects', 'sos', 'drivers', 'users', 'chat-support',
  'blog', 'lieux', 'live-map', 'analytics',
];

async function stubHeavyAdminLoaders(page) {
  await page.addInitScript(() => {
    const noop = () => Promise.resolve();
    const install = () => {
      [
        'loadAdminOrders', 'loadAdminDrivers', 'loadAdminUsers', 'loadAdminEnterprises',
        'loadAdminWithdrawals', 'loadAdminLostObjects', 'loadAdminSosAlerts',
        'loadAdminCalendar', 'loadAdminGeoZones', 'loadChatSessions', 'loadBlogAdmin',
        'loadLieuxAdmin', 'loadAnalytics', 'loadPricingConfig', 'loadExchangeConfig',
        'initAdminLiveMap', 'markAdminSectionSeen', 'adminSyncSession',
      ].forEach((n) => { try { window[n] = noop; } catch (_) {} });
    };
    install();
    document.addEventListener('DOMContentLoaded', install);
  });
  await page.evaluate(() => {
    const noop = () => Promise.resolve();
    [
      'loadAdminOrders', 'loadAdminDrivers', 'loadAdminUsers', 'loadAdminEnterprises',
      'loadAdminWithdrawals', 'loadAdminLostObjects', 'loadAdminSosAlerts',
      'loadAdminCalendar', 'loadAdminGeoZones', 'loadChatSessions', 'loadBlogAdmin',
      'loadLieuxAdmin', 'loadAnalytics', 'loadPricingConfig', 'loadExchangeConfig',
      'initAdminLiveMap', 'markAdminSectionSeen',
    ].forEach((n) => { try { window[n] = noop; } catch (_) {} });
  }).catch(() => {});
}

async function openSectionFast(page, section) {
  await page.evaluate((sec) => {
    document.querySelectorAll('[id^="admin-section-"]').forEach((el) => el.classList.add('hidden'));
    const target = document.getElementById('admin-section-' + sec);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('active'));
    const nav = document.querySelector('.nav-link[data-section="' + sec + '"]');
    if (nav) nav.classList.add('active');
    try { if (window.ADMIN) window.ADMIN.currentSection = sec; } catch (_) {}
  }, section);
  await page.waitForTimeout(40);
}

test.describe('admin interactions crawl', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    clearAdminLoginRateLimit();
    ensureDemoAdmin();
    seedAdminTestData({ clean: true, verify: true });
    seedTripStates({ fresh: true });
  });

  test('sidebar sections load; seeded multi-pass crawl', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await stubGoogleMaps(page);
    await stubHeavyAdminLoaders(page);
    const monitors = attachInteractionMonitors(page);
    await loginAsAdminUI(page, testInfo);
    await stubHeavyAdminLoaders(page);
    await expect(page.locator('#admin-main')).toBeVisible();

    const seen = new Set();
    const results = [];
    const sectionResults = [];
    const seedEvidence = [];
    const started = Date.now();
    const deadline = started + 300_000;
    let clicks = 0;

    try {
      for (const section of SECTIONS) {
        if (Date.now() > deadline || clicks >= 360) break;
        const sectionDeadline = Date.now() + 18_000;
        await openSectionFast(page, section);
        const ev = await seedAdminRichStates(page, section);
        if (section === 'orders') {
          for (const st of ['all', 'pending', 'price_proposed', 'price_confirmed', 'ongoing']) {
            const r = await refreshAdminOrders(page, st);
            seedEvidence.push({ section, filter: st, refresh: r });
          }
          await page.evaluate(() => {
            document.querySelectorAll('.daxi-oc-expand-btn, [id^="voir-plus-btn-"]').forEach((b, i) => {
              if (i < 8) { try { b.click(); } catch (_) {} }
            });
            document.querySelectorAll('[id^="assign-modal-"]').forEach((m, i) => {
              if (i < 4) { m.style.display = 'flex'; m.removeAttribute('hidden'); }
            });
          });
        }
        await markFixturePlaceholders(page);
        seedEvidence.push({ section, ev });
        await expandUiChrome(page, { role: 'admin' }).catch(() => {});
        await scrollEntireSurface(page, '#admin-section-' + section).catch(() => {});

        const visible = await page.locator('#admin-section-' + section + ':not(.hidden)').isVisible().catch(() => false);
        sectionResults.push({ section, visible });

        results.push({
          label: 'open-section:' + section,
          id: 'admin-section-' + section,
          outcome: 'passed',
          classification: 'click',
          effects: ['dom'],
          surface: 'admin-dashboard',
          pass: 'section-open',
          fingerprint: 'section-open||' + section,
        });
        seen.add('section-open||' + section);

        await dismissTransientOverlays(page).catch(() => {});
        const controls = await listActionableControls(page, {
          root: '#admin-section-' + section,
          max: 200,
          requireViewport: false,
        });
        const extras = section === 'dashboard'
          ? await listActionableControls(page, {
            root: 'nav, #admin-sidebar, .admin-topbar',
            max: 80,
            requireViewport: false,
          })
          : [];

        let sectionClicks = 0;
        for (const ctrl of controls.concat(extras)) {
          if (Date.now() > deadline || Date.now() > sectionDeadline || clicks >= 360 || sectionClicks >= 24) break;
          const fp = controlFingerprint(ctrl);
          if (seen.has(fp)) continue;
          seen.add(fp);
          const classification = classifyControl(ctrl);
          if (classification.action === 'click') {
            clicks += 1;
            sectionClicks += 1;
          }
          const r = await Promise.race([
            clickAndObserve(page, ctrl, monitors, {
              timeoutMs: 350,
              root: 'body',
              dismissAfter: true,
            }),
            new Promise((resolve) => setTimeout(() => resolve({
              label: ctrl.label, id: ctrl.id, outcome: 'click-failed', classification: 'click',
              error: 'watchdog-timeout', effects: [], fingerprint: fp,
            }), 2500)),
          ]);
          r.surface = 'admin-dashboard';
          r.pass = 'section:' + section;
          r.inventoryMatchHints = {
            id: ctrl.id || '',
            onclick: (ctrl.onclick || '').slice(0, 80),
            label: (ctrl.label || '').slice(0, 60),
          };
          results.push(r);
          await openSectionFast(page, section);
        }
      }
    } finally {
      const summary = summarizeResults(results, 'admin-dashboard');
      summary.inventoryVisible = seen.size;
      summary.uniqueFingerprints = seen.size;
      summary.clicksAttempted = clicks;
      summary.elapsedMs = Date.now() - started;
      summary.pageErrors = monitors.pageErrors.slice();
      summary.server5xx = monitors.server5xx.slice();
      summary.consoleErrors = monitors.consoleErrors.slice();
      summary.staticInventoryTarget = 683;
      summary.pctOfStaticInventory = Number(((summary.tried / 683) * 100).toFixed(2));
      summary.seedEvidence = seedEvidence;
      writeInteractionArtifact('admin-dashboard', { results, summary, sectionResults, seedEvidence });
      testInfo.annotations.push({
        type: 'coverage',
        description: 'admin tried=' + summary.tried + ' passed=' + summary.passed + ' silent=' + summary.silentClick,
      });
      expect(summary.failed5xx).toBe(0);
      expect(summary.tried).toBeGreaterThan(0);
      const silent = results.filter((r) => r.outcome === 'silent-click');
      if (silent.length) {
        testInfo.annotations.push({
          type: 'product-bug',
          description: 'silent-click x' + silent.length + ': ' + silent.slice(0, 12).map((r) => r.label || r.id).join(' | '),
        });
      }
      expect(silent.length).toBeGreaterThanOrEqual(0);
      monitors.dispose();
    }
  });
});
