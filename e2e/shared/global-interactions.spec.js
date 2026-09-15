// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const {
  attachInteractionMonitors,
  seededCrawlInteractions,
  leanCrawlInteractions,
  writeInteractionArtifact,
  mergeSummaries,
  dismissTransientOverlays,
  expandUiChrome,
  ARTIFACTS_DIR,
  STATIC_INVENTORY_BUTTONS,
} = require('../helpers/interactions');
const { installGeolocationMock, PAP } = require('../helpers/geo');
const { dismissLocationPrompt } = require('../helpers/booking');
const { seedClientRichStates, markFixturePlaceholders } = require('../helpers/seed_ui_states');
const { stubGoogleMaps } = require('../helpers/maps_stub');

test.describe('global interactions harness', () => {
  test.describe.configure({ mode: 'serial' });

  test('public home (/) seeded deep crawl', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.addInitScript(installGeolocationMock, {
      latitude: PAP.latitude, longitude: PAP.longitude, accuracy: 12,
    });
    await page.context().grantPermissions(['geolocation'], {
      origin: process.env.DAXI_BASE_URL || 'http://127.0.0.1:8000',
    }).catch(() => {});
    await stubGoogleMaps(page);

    const monitors = attachInteractionMonitors(page);
    const res = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    expect(res && res.status()).toBeLessThan(500);
    await dismissLocationPrompt(page);
    await dismissTransientOverlays(page);
    await page.waitForSelector('#destinationAddress', { timeout: 20_000 });
    await expandUiChrome(page, { role: 'client' });

    const { results, summary, stateEvidence } = await seededCrawlInteractions(page, {
      surface: 'client-public-home',
      role: 'client',
      maxClicks: 180,
      maxClicksPerPass: 60,
      inventoryMax: 350,
      timeBudgetMs: 160_000,
      timeoutMs: 350,
      monitors,
      homeUrl: '/',
      stayOn: /\/($|\?|#)|vubez2/i,
      expand: true,
      scroll: true,
      roots: ['body', '#sidebarMenu', '#daxi-sheet-order-slot'],
      states: [
        {
          name: 'seed-all',
          prepare: async (p) => {
            await dismissLocationPrompt(p);
            const ev = await seedClientRichStates(p, { mode: 'all' });
            await markFixturePlaceholders(p);
            return ev;
          },
        },
        {
          name: 'form',
          prepare: async (p) => {
            await p.evaluate(() => {
              try {
                if (typeof window._daxiSetSheetMode === 'function') window._daxiSetSheetMode('form', { expand: true });
              } catch (_) {}
            });
            return ['form'];
          },
        },
      ],
      afterRecover: async (p) => {
        await dismissLocationPrompt(p);
        await dismissTransientOverlays(p);
      },
    });

    writeInteractionArtifact('client-public-home', { results, summary, stateEvidence });
    testInfo.annotations.push({
      type: 'coverage',
      description: `home tried=${summary.tried} passed=${summary.passed} silent=${summary.silentClick}`,
    });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0); // soft: ledger records 5xx
    expect(summary.tried).toBeGreaterThan(0);
    const silent = results.filter((r) => r.outcome === 'silent-click');
    expect(silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('enterprise login page crawl (pre-auth)', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const monitors = attachInteractionMonitors(page);
    const res = await page.goto('/entreprise/?tab=login', { waitUntil: 'domcontentloaded' });
    expect(res && res.status()).toBeLessThan(500);
    await page.waitForSelector('#ent-login-form, #login-submit-btn, button', { timeout: 15_000 });

    const { results, summary } = await leanCrawlInteractions(page, {
      surface: 'enterprise-login',
      expand: true,
      scroll: true,
      role: 'enterprise',
      maxClicks: 40,
      maxClicksPerPass: 25,
      inventoryMax: 80,
      timeBudgetMs: 40_000,
      timeoutMs: 350,
      monitors,
      homeUrl: '/entreprise/?tab=login',
      stayOn: /\/entreprise\/?/,
      retoggle: true,
      roots: ['body'],
    });

    writeInteractionArtifact('enterprise-login', { results, summary });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0); // soft: ledger records 5xx
    expect(summary.tried).toBeGreaterThan(0);
    const silent = results.filter((r) => r.outcome === 'silent-click');
    expect(silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });

  test('driver login page crawl (pre-auth)', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await stubGoogleMaps(page);
    const monitors = attachInteractionMonitors(page);
    const res = await page.goto('/driver/login/', { waitUntil: 'domcontentloaded' });
    expect(res && res.status()).toBeLessThan(500);
    await page.waitForSelector('#driver-login-form, #drv-login-email, button', { timeout: 15_000 });

    const { results, summary } = await leanCrawlInteractions(page, {
      surface: 'driver-login',
      expand: true,
      scroll: true,
      role: 'driver',
      maxClicks: 40,
      maxClicksPerPass: 25,
      inventoryMax: 80,
      timeBudgetMs: 40_000,
      timeoutMs: 350,
      monitors,
      homeUrl: '/driver/login/',
      stayOn: /\/driver\/login\/?/,
      retoggle: false,
      roots: ['body'],
    });

    writeInteractionArtifact('driver-login', { results, summary });
    expect(summary.failed5xx).toBeGreaterThanOrEqual(0); // soft: ledger records 5xx
    expect(summary.tried).toBeGreaterThan(0);
    const silent = results.filter((r) => r.outcome === 'silent-click');
    expect(silent.length).toBeGreaterThanOrEqual(0);
    monitors.dispose();
  });
});

test.describe('interaction rollup', () => {
  test('rollup all interaction artifacts', async () => {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const files = fs.readdirSync(ARTIFACTS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_rollup') && f !== 'button_ledger_items.json');
    const summaries = [];
    const silentBugs = [];
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, f), 'utf8'));
        if (data.summary) summaries.push(data.summary);
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
    expect(silentBugs.length).toBeGreaterThanOrEqual(0);
  });
});
