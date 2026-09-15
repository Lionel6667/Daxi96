/**
 * Booking fill helpers aligned to vubez2.html + _syncBookingHiddenFields.
 */
const { PAP, PETION_VILLE } = require('./geo');
const sel = require('./selectors');

/**
 * Dismiss #locationSharePrompt ("Pourquoi activer votre position") via manual address.
 * @param {import('@playwright/test').Page} page
 */
async function dismissLocationPrompt(page) {
  const prompt = page.locator('#locationSharePrompt');
  const manual = page.locator('#locManualBtn');
  // Prompt uses .show to become visible
  const shown = await prompt.evaluate((el) => el.classList.contains('show')).catch(() => false);
  if (shown || (await prompt.isVisible().catch(() => false))) {
    if (await manual.isVisible().catch(() => false)) {
      await manual.click({ force: true });
    } else {
      await page.evaluate(() => {
        const p = document.getElementById('locationSharePrompt');
        if (p) p.classList.remove('show');
        const btn = document.getElementById('locManualBtn');
        if (btn) btn.click();
      });
    }
    await page.waitForTimeout(200);
  }
  // Ensure consent flags for gated geolocation
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('daxi_geo_blocked');
    } catch (_) {}
    try {
      Object.defineProperty(window, '_daxiGpsUserConsent', {
        configurable: true,
        get() {
          return true;
        },
        set() {},
      });
    } catch (_) {
      window._daxiGpsUserConsent = true;
    }
    window._daxiGpsPerm = true;
    window._daxiGeoBrowserBlocked = false;
  });
}

/**
 * Switch sheet to order mode so #daxi-sheet-order-slot is display:block.
 * @param {import('@playwright/test').Page} page
 */
async function showOrderSheetSlot(page) {
  await page.evaluate(() => {
    try {
      if (typeof window._daxiSetSheetMode === 'function') {
        window._daxiSetSheetMode('order', { expand: true });
      }
    } catch (_) {}
    document.documentElement.classList.add('daxi-sheet-order-mode');
    document.body.classList.add('daxi-sheet-order-mode');
    const tab = document.getElementById('daxiSwitchOrder');
    if (tab) tab.classList.add('active');
    const formTab = document.getElementById('daxiSwitchForm');
    if (formTab) formTab.classList.remove('active');
  });
  await page.waitForTimeout(100);
}

async function ensureGuestId(page) {
  return page.evaluate(() => {
    let gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    if (!gid) {
      gid = 'e2e-guest-' + Math.random().toString(36).slice(2, 12);
      try {
        localStorage.setItem('daxi_guest_id', gid);
      } catch (_) {}
      window._daxiGuestId = gid;
    }
    const el = document.getElementById('guestIdHidden');
    if (el) el.value = gid;
    return gid;
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ pickupLabel?: string, dropoffLabel?: string, pickup?: {latitude:number,longitude:number}, dropoff?: {latitude:number,longitude:number} }} [opts]
 */
async function fillGuestBookingFields(page, opts = {}) {
  const pickupLabel = opts.pickupLabel || 'Champ de Mars, Port-au-Prince';
  const dropoffLabel = opts.dropoffLabel || 'Pétion-Ville, Place Boyer';
  // Default: omit lat/lng so server covered-zone check is skipped (coords optional).
  // Pass withCoords:true + pickup/dropoff when coverage seed is known.
  const withCoords = opts.withCoords === true;
  const pickup = opts.pickup || PAP;
  const dropoff = opts.dropoff || PETION_VILLE;

  await dismissLocationPrompt(page);

  const pickupLoc = page.locator(sel.pickupInput);
  const dropoffLoc = page.locator(sel.dropoffInput);

  await pickupLoc.waitFor({ state: 'visible', timeout: 20000 });
  await dropoffLoc.waitFor({ state: 'visible', timeout: 20000 });

  await pickupLoc.fill(pickupLabel);
  await dropoffLoc.fill(dropoffLabel);

  await ensureGuestId(page);

  await page.evaluate(
    ({ pickupLabel: pl, dropoffLabel: dl, pickup: p, dropoff: d, withCoords }) => {
      const pin = document.getElementById('destinationAddress');
      const din = document.getElementById('destinationAddressArrival');
      if (pin) {
        pin.value = pl;
        pin.dataset.placeSelected = '1';
        pin.dataset.daxiUncovered = '0';
        delete pin.dataset.daxiGpsUncovered;
      }
      if (din) {
        din.value = dl;
        din.dataset.placeSelected = '1';
        din.dataset.daxiUncovered = '0';
      }
      const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v == null ? '' : String(v);
      };
      set('pickupHidden', pl);
      set('destinationHidden', dl);
      if (withCoords) {
        set('pickupLatHidden', p.latitude);
        set('pickupLngHidden', p.longitude);
        set('destLatHidden', d.latitude);
        set('destLngHidden', d.longitude);
      } else {
        set('pickupLatHidden', '');
        set('pickupLngHidden', '');
        set('destLatHidden', '');
        set('destLngHidden', '');
      }
      if (typeof window._syncBookingHiddenFields === 'function') {
        window._syncBookingHiddenFields();
      }
    },
    { pickupLabel, dropoffLabel, pickup, dropoff, withCoords },
  );
}

async function dismissBlockingOverlays(page) {
  await dismissLocationPrompt(page);
  await page.evaluate(() => {
    // Google Maps "Petit problème..." / InvalidKey overlays that steal hits
    document.querySelectorAll('.dismissButton, .gm-err-container button, [class*="gm-style-cc"]').forEach((b) => {
      try { b.click(); } catch (_) {}
    });
    document.querySelectorAll('.gm-err-container, .gm-err-message').forEach((el) => {
      try { el.style.display = 'none'; el.remove(); } catch (_) {}
    });
    const prompt = document.getElementById('locationSharePrompt');
    if (prompt) prompt.classList.remove('show');
  });
}

async function clickOrderTaxi(page) {
  await dismissBlockingOverlays(page);
  const btn = page.locator(sel.orderTaxiBtn);
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  // Ensure validation path sees synced fields; clear in-flight locks
  await page.evaluate(() => {
    if (typeof window._syncBookingHiddenFields === 'function') {
      window._syncBookingHiddenFields();
    }
    window._daxiOrderCreateInFlight = false;
    window._daxiOrderCreatePostOwner = null;
    window._daxiOrderCreateCooldownUntil = 0;
    const b = document.getElementById('orderTaxiBtn');
    if (b) {
      b.disabled = false;
      b.classList.remove('daxi-btn-busy', 'daxi-btn-loading');
    }
  });
  // DOM click — Playwright force-click often misses under Maps error overlays
  await page.evaluate(() => {
    const b = document.getElementById('orderTaxiBtn');
    if (!b) throw new Error('#orderTaxiBtn missing');
    b.click();
  });
}

async function clickMyPositionBtn(page) {
  await dismissLocationPrompt(page);
  const btn = page.locator(sel.myPositionBtn);
  if (!(await btn.isVisible().catch(() => false))) {
    return false;
  }
  try {
    await btn.click({ force: true, timeout: 5000 });
  } catch (_) {
    await page.evaluate(() => {
      const el = document.getElementById('myPositionBtn');
      if (el) el.click();
    });
  }
  return true;
}

module.exports = {
  dismissLocationPrompt,
  dismissBlockingOverlays,
  showOrderSheetSlot,
  ensureGuestId,
  fillGuestBookingFields,
  clickOrderTaxi,
  clickMyPositionBtn,
};
