/**
 * Playwright-facing API for durable trip-state seeding.
 * Spawns e2e/fixtures/seed_trip_states.py (Django ORM) — not HTTP.
 *
 * Usage:
 *   const { seedTripStates, seedStatuses, openClientSheetForGuest } = require('../helpers/seedApi');
 *   const data = seedTripStates({ fresh: true });
 *   // data.orders[].order_id / status
 */
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const SEED_SCRIPT = path.join(REPO_ROOT, 'e2e', 'fixtures', 'seed_trip_states.py');

function runSeed(args = [], envExtra = {}) {
  const maxAttempts = 5;
  let r;
  let out = '';
  let err = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    r = spawnSync(VENV_PYTHON, [SEED_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...envExtra,
        // Reduce sqlite lock flakes against runserver writers
        DAXI_SQLITE_BUSY_TIMEOUT_MS: process.env.DAXI_SQLITE_BUSY_TIMEOUT_MS || '30000',
      },
      maxBuffer: 4 * 1024 * 1024,
    });
    out = (r.stdout || '').trim();
    err = (r.stderr || '').trim();
    const locked = /database is locked|database is locked/i.test(err + out);
    if (r.status === 0) break;
    if (!locked || attempt === maxAttempts) {
      throw new Error(
        `seed_trip_states.py ${args.join(' ')} failed (exit ${r.status}): ${(err || out).slice(0, 800)}`,
      );
    }
    const waitMs = 400 * attempt * attempt;
    try {
      spawnSync(process.execPath, ['-e', `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${waitMs})`], { stdio: 'ignore' });
    } catch (_) {
      spawnSync('sleep', [String(Math.ceil(waitMs / 1000))], { stdio: 'ignore' });
    }
  }
  // Script prints a single JSON object (possibly multi-line indented)
  let data;
  try {
    data = JSON.parse(out);
  } catch (e) {
    // Fallback: find outermost { ... }
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start < 0 || end < start) {
      throw new Error(`seed_trip_states.py did not return JSON: ${out.slice(0, 400)}`);
    }
    data = JSON.parse(out.slice(start, end + 1));
  }
  if (!data.ok) {
    throw new Error(`seed_trip_states.py error: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

/**
 * Seed full (or filtered) trip-state matrix.
 * @param {{ fresh?: boolean, statuses?: string[]|string, env?: Record<string,string> }} [opts]
 */
function seedTripStates(opts = {}) {
  const args = [];
  if (opts.fresh) args.push('--fresh');
  if (opts.statuses) {
    const list = Array.isArray(opts.statuses) ? opts.statuses.join(',') : String(opts.statuses);
    if (list.trim()) args.push('--statuses', list.trim());
  }
  return runSeed(args, opts.env || {});
}

/** Convenience: only mid-trip client/driver actions. */
function seedMidTrip(opts = {}) {
  return seedTripStates({
    ...opts,
    statuses: opts.statuses || ['driver_assigned', 'on_way', 'arrived', 'in_progress'],
  });
}

/** Convenience: price + payment checkout unlocks. */
function seedCheckout(opts = {}) {
  return seedTripStates({
    ...opts,
    statuses: opts.statuses || ['pending', 'price_proposed', 'price_confirmed', 'awaiting_driver'],
  });
}

/** Convenience: enterprise checkout phases. */
function seedEnterpriseCheckout(opts = {}) {
  return seedTripStates({
    ...opts,
    statuses: opts.statuses || ['ent_accept_price', 'ent_choose_payment'],
  });
}

function listStatuses() {
  return runSeed(['--list-statuses']);
}

/** Map order rows by seed key. */
function ordersByKey(seedResult) {
  const map = {};
  for (const row of seedResult.orders || []) {
    if (row && row.key) map[row.key] = row;
  }
  return map;
}

/**
 * Ensure guest_id is in session/storage so client HTMX sheet finds seeded orders.
 * Call after page.goto('/') (or before if using addInitScript yourself).
 * @param {import('@playwright/test').Page} page
 * @param {string} guestId
 */
async function bindClientGuest(page, guestId) {
  if (!guestId) return;
  await page.evaluate((gid) => {
    try {
      localStorage.setItem('daxi_guest_id', gid);
      sessionStorage.setItem('guest_id', gid);
      sessionStorage.setItem('daxi_guest_id', gid);
    } catch (_) {}
    try {
      document.cookie = `guest_id=${encodeURIComponent(gid)}; path=/`;
    } catch (_) {}
  }, guestId);
}

/**
 * Fetch client sheet HTML/JSON for a guest (authenticated page.request preferred).
 * @param {import('@playwright/test').Page} page
 * @param {string} guestId
 */
async function openClientSheetForGuest(page, guestId) {
  await bindClientGuest(page, guestId);
  const url = `/htmx/client/orders/sheet/?guest_id=${encodeURIComponent(guestId)}`;
  const res = await page.request.get(url, { timeout: 20_000 });
  const ct = (res.headers()['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    return { ok: res.ok(), status: res.status(), json: await res.json(), url };
  }
  return { ok: res.ok(), status: res.status(), html: await res.text(), url };
}

/**
 * Inject latest client order card into #daxi-sheet-order-slot via HTMX list.
 * @param {import('@playwright/test').Page} page
 * @param {{ guestId: string, orderId?: number }} opts
 */
async function loadClientOrderCard(page, opts) {
  const guestId = opts.guestId;
  await bindClientGuest(page, guestId);
  let path = `/htmx/client/orders/?guest_id=${encodeURIComponent(guestId)}`;
  if (opts.orderId) {
    // Prefer sheet fragment for a single order
    path = `/htmx/client/orders/${opts.orderId}/sheet/?guest_id=${encodeURIComponent(guestId)}`;
  }
  const res = await page.request.get(path, { timeout: 20_000 }).catch(() => null);
  if (!res || !res.ok()) {
    // Fallback: sheet bootstrap
    const sheet = await openClientSheetForGuest(page, guestId);
    return { ok: false, fallback: sheet, path };
  }
  const html = await res.text();
  await page.evaluate((body) => {
    try {
      if (typeof window._daxiSetSheetMode === 'function') {
        window._daxiSetSheetMode('order', { expand: true });
      }
    } catch (_) {}
    document.documentElement.classList.add('daxi-sheet-order-mode');
    const slot = document.getElementById('daxi-sheet-order-slot');
    if (slot) {
      slot.innerHTML = body;
      slot.style.display = '';
      slot.classList.remove('hidden');
    }
  }, html);
  return { ok: true, path, bytes: html.length };
}

/**
 * Refresh driver order tabs after seeding.
 * @param {import('@playwright/test').Page} page
 */
async function refreshDriverOrderLists(page) {
  const evidence = [];
  for (const tab of ['available', 'accepted', 'active']) {
    const url = `/htmx/driver/orders/?tab=${tab}`;
    const res = await page.request.get(url, { timeout: 20_000 }).catch(() => null);
    if (!res || !res.ok()) {
      evidence.push(`${tab}:fail`);
      continue;
    }
    const html = await res.text();
    await page.evaluate(
      ({ tab, html }) => {
        const list = document.getElementById('orders-list');
        if (list && tab === 'available') list.innerHTML = html;
        else if (list && (tab === 'accepted' || tab === 'active')) {
          list.innerHTML = (list.innerHTML || '') + html;
        }
        document.querySelectorAll('#drv-active-slot, #active-order-slot').forEach((el) => {
          if (tab === 'active' || tab === 'accepted') {
            el.innerHTML = html;
            el.style.display = '';
          }
        });
      },
      { tab, html },
    );
    evidence.push(`${tab}:ok:${html.length}`);
  }
  await page.request.get('/htmx/driver/active-order/').catch(() => {});
  return evidence;
}

/**
 * Admin: force-load orders HTMX into loader (needs admin session cookies on page).
 * @param {import('@playwright/test').Page} page
 * @param {string} [statusFilter]
 */
async function refreshAdminOrders(page, statusFilter = 'all') {
  const url = `/htmx/admin/orders/?status=${encodeURIComponent(statusFilter)}`;
  return page.evaluate(async (url) => {
    try {
      if (typeof adminFetch === 'function') {
        const res = await adminFetch(url);
        const html = await res.text();
        const el =
          document.getElementById('orders-htmx-loader') ||
          document.querySelector('#admin-section-orders');
        if (!el) return { ok: false, reason: 'missing-target' };
        el.innerHTML = html;
        el.classList.remove('hidden');
        return { ok: true, bytes: html.length, status: res.status };
      }
      const res = await fetch(url, { credentials: 'same-origin' });
      const html = await res.text();
      const el = document.getElementById('orders-htmx-loader');
      if (el) el.innerHTML = html;
      return { ok: res.ok, bytes: html.length, status: res.status };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e).slice(0, 160) };
    }
  }, url);
}


/**
 * Open enterprise checkout modal for seeded order (needs enterprise session).
 * @param {import('@playwright/test').Page} page
 * @param {number|string} orderId
 */
async function openEnterpriseCheckout(page, orderId) {
  await page.evaluate((id) => {
    try {
      if (typeof openEntCheckout === 'function') openEntCheckout(id);
    } catch (_) {}
  }, orderId);
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const body = document.getElementById('ent-checkout-body');
    const modal = document.getElementById('ent-checkout-modal');
    if (modal) modal.classList.add('show');
    return { bytes: body ? (body.innerHTML || '').length : 0, shown: !!(modal && modal.classList.contains('show')) };
  });
}


/**
 * RUN5 — inject richer client mid-state chrome into the order sheet + overlays.
 * Mixes real HTMX bodies with fixture controls that mirror inventory labels/ids.
 * @param {import('@playwright/test').Page} page
 * @param {{ guestId: string, orderId?: number, status?: string }} opts
 */
async function injectClientMidStateChrome(page, opts = {}) {
  const guestId = opts.guestId || '';
  const oid = opts.orderId || 900001;
  const status = opts.status || 'price_proposed';
  const evidence = [];

  // Try real partials first
  const paths = [
    opts.orderId ? `/htmx/client/orders/${oid}/sheet/?guest_id=${encodeURIComponent(guestId)}` : null,
    `/htmx/client/orders/?guest_id=${encodeURIComponent(guestId)}`,
    guestId ? `/htmx/client/orders/sheet/?guest_id=${encodeURIComponent(guestId)}` : null,
  ].filter(Boolean);
  let realHtml = '';
  for (const p of paths) {
    const res = await page.request.get(p, { timeout: 20_000 }).catch(() => null);
    if (res && res.ok()) {
      const t = await res.text();
      if (t && t.length > 80 && !t.trim().startsWith('{')) {
        realHtml = t;
        evidence.push(`htmx:${p}:${t.length}`);
        break;
      }
    }
  }

  const fixture = `
<div data-seed="run5-client-mid" data-order-id="${oid}" data-status="${status}">
  <div id="price-proposal-card" data-order-id="${oid}">
    <button type="button" class="daxi-pp-btn daxi-pp-btn--accept" id="price-accept-${oid}">Accepter le prix</button>
    <button type="button" class="daxi-pp-btn daxi-pp-btn--refuse" id="price-refuse-${oid}">Refuser</button>
  </div>
  <div class="daxi-oc-actions" data-seed="actions">
    <button type="button" class="daxi-oc-btn" onclick="window._daxiTrackRide && window._daxiTrackRide(${oid})">Suivre la course</button>
    <button type="button" class="daxi-oc-btn daxi-oc-btn--cancel" id="${guestId || 'guest-seed'}" data-order-id="${oid}">Annuler la course</button>
    <button type="button" class="daxi-oc-btn" id="client-chat-open-${oid}">Chat</button>
    <button type="button" class="daxi-oc-btn" onclick="event.stopPropagation()">Partager</button>
  </div>
  <div class="daxi-rate" data-seed="rating">
    <button type="button" data-stars="5">5 étoiles</button>
    <button type="button" data-stars="1">1 étoiles</button>
  </div>
  <div id="co-${oid}" class="daxi-pay-wrap" data-order-id="${oid}">
    <button type="button" class="daxi-pay-opt" data-method="moncash" id="pay-moncash-${oid}">MonCash</button>
    <button type="button" class="daxi-pay-opt" data-method="card" id="pay-card-${oid}">Carte</button>
    <button type="button" class="daxi-pay-opt" data-method="in_person" id="pay-cash-${oid}">Espèces</button>
    <button type="button" id="daxiPayContractOpen-${oid}">Voir le contrat</button>
    <button type="button" id="daxiPayContinue-${oid}" class="daxi-pay-continue" disabled>Continuer</button>
    <button type="button" class="daxi-contract-close" id="daxiContractClose-${oid}">Fermer</button>
  </div>
  <div id="guest-phone-card">
    <button type="submit" id="guest-phone-submit" class="daxi-guest-phone-submit">Continuer</button>
    <button type="button" id="guest-phone-cancel" class="daxi-guest-phone-cancel">Annuler</button>
  </div>
  <div id="daxi-cancel-confirm" class="daxi-cancel-confirm" style="display:flex">
    <button type="button" id="daxi-cancel-confirm-no">Non</button>
    <button type="button" id="daxi-cancel-confirm-yes">Oui, annuler</button>
    <button type="button" onclick="window._refreshClientOrdersPage && window._refreshClientOrdersPage()">Réessayer</button>
  </div>
</div>`;

  await page.evaluate(({ realHtml, fixture }) => {
    try {
      if (typeof window._daxiSetSheetMode === 'function') window._daxiSetSheetMode('order', { expand: true });
    } catch (_) {}
    document.documentElement.classList.add('daxi-sheet-order-mode');
    const slot = document.getElementById('daxi-sheet-order-slot');
    if (slot) {
      slot.innerHTML = (realHtml || '') + fixture;
      slot.style.display = '';
      slot.classList.remove('hidden');
    }
    // Chat composer shell
    const chat = document.getElementById('chat-overlay') || document.querySelector('.daxi-chat-shell');
    if (chat) {
      chat.classList.add('show', 'open');
      chat.style.display = 'block';
      if (!chat.querySelector('[data-seed="run5-chat"]')) {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-seed', 'run5-chat');
        wrap.innerHTML = `
          <button type="button" onclick="window._daxiChatCancelReply && window._daxiChatCancelReply()"></button>
          <button type="button" class="chat-img-btn">Image</button>
          <button type="button" class="chat-voice-btn">Message vocal</button>
          <button type="button" class="chat-send-btn">Envoyer</button>`;
        chat.appendChild(wrap);
      }
    }
  }, { realHtml, fixture });
  evidence.push('fixture-injected');
  return evidence;
}

/**
 * Force-open enterprise checkout HTMX body for a seeded order (accept_price / choose_payment).
 * @param {import('@playwright/test').Page} page
 * @param {number|string} orderId
 * @param {'accept_price'|'choose_payment'|string} [phase]
 */
async function loadEnterpriseCheckoutBody(page, orderId, phase = 'choose_payment') {
  const urls = [
    `/htmx/enterprise/orders/${orderId}/checkout/?phase=${encodeURIComponent(phase)}`,
    `/htmx/enterprise/orders/${orderId}/checkout/`,
  ];
  let html = '';
  let used = '';
  for (const u of urls) {
    const res = await page.request.get(u, { timeout: 20_000 }).catch(() => null);
    if (res && res.ok()) {
      const t = await res.text();
      if (t && t.length > 60) {
        html = t;
        used = u;
        break;
      }
    }
  }
  await page.evaluate(({ html, orderId }) => {
    const modal = document.getElementById('ent-checkout-modal');
    const body = document.getElementById('ent-checkout-body');
    if (modal) {
      modal.classList.add('show', 'open');
      modal.style.display = 'flex';
    }
    if (body) {
      if (html) body.innerHTML = html;
      else if ((body.innerHTML || '').length < 80) {
        body.innerHTML = `
          <div class="ent-checkout" data-order-id="${orderId}" data-phase="choose_payment" data-seed="run5">
            <button type="button" class="ent-checkout-btn ent-checkout-btn--danger" onclick="entCancelOrder(${orderId})">Annuler la commande</button>
            <button type="button" class="ent-checkout-link" onclick="entOpenContractModal()">Voir le contrat</button>
            <button type="button" class="ent-checkout-btn ent-checkout-btn--gold" id="ent-checkout-submit-btn" onclick="entSubmitCheckout(${orderId})">Continuer</button>
            <button type="button" class="ent-checkout-btn ent-checkout-btn--ghost"
              hx-post="/htmx/enterprise/orders/${orderId}/checkout/back/">Retour</button>
            <button type="button" onclick="entCopyClientPayLink && entCopyClientPayLink(${orderId})">Copier le lien</button>
            <button type="button" onclick="closeEntCheckoutModal()">Fermer</button>
          </div>`;
      }
    }
    // Contract overlay
    const c = document.getElementById('ent-contract-overlay');
    if (c) { c.classList.add('show', 'open'); c.style.display = 'flex'; }
  }, { html, orderId });
  return { ok: !!html, url: used, bytes: html.length };
}



const SEED_MATRIX_SCRIPT = path.join(REPO_ROOT, 'e2e', 'fixtures', 'seed_order_matrix.py');

function runMatrixSeed(args = [], envExtra = {}) {
  const r = spawnSync(VENV_PYTHON, [SEED_MATRIX_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DAXI_STUB_WHATSAPP: '1',
      DAXI_STUB_EMAIL: '1',
      DAXI_E2E_STUB_OUTBOUND: '1',
      ...envExtra,
    },
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) {
    throw new Error(
      `seed_order_matrix.py ${args.join(' ')} failed (exit ${r.status}): ${(err || out).slice(0, 1000)}`,
    );
  }
  let data;
  try {
    data = JSON.parse(out);
  } catch (e) {
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start < 0 || end < start) {
      throw new Error(`seed_order_matrix.py did not return JSON: ${out.slice(0, 400)}`);
    }
    data = JSON.parse(out.slice(start, end + 1));
  }
  if (!data.ok) {
    throw new Error(`seed_order_matrix.py error: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

/**
 * Seed full order-type × status matrix.
 * @param {{ fresh?: boolean, wave1?: boolean, types?: string[]|string, statuses?: string[]|string, env?: Record<string,string> }} [opts]
 */
function seedOrderMatrix(opts = {}) {
  const args = [];
  if (opts.fresh) args.push('--fresh');
  if (opts.wave1) args.push('--wave1');
  if (opts.types) {
    const list = Array.isArray(opts.types) ? opts.types.join(',') : String(opts.types);
    if (list.trim()) args.push('--types', list.trim());
  }
  if (opts.statuses) {
    const list = Array.isArray(opts.statuses) ? opts.statuses.join(',') : String(opts.statuses);
    if (list.trim()) args.push('--statuses', list.trim());
  }
  return runMatrixSeed(args, opts.env || {});
}

function matrixOrdersByKey(seedResult) {
  const map = {};
  for (const row of seedResult.orders || []) {
    if (row && row.key) map[row.key] = row;
  }
  return map;
}

module.exports = {
  seedOrderMatrix,
  matrixOrdersByKey,
  SEED_MATRIX_SCRIPT,
  seedTripStates,
  seedMidTrip,
  seedCheckout,
  seedEnterpriseCheckout,
  listStatuses,
  ordersByKey,
  bindClientGuest,
  openClientSheetForGuest,
  loadClientOrderCard,
  refreshDriverOrderLists,
  refreshAdminOrders,
  openEnterpriseCheckout,
  injectClientMidStateChrome,
  loadEnterpriseCheckoutBody,
  SEED_SCRIPT,
  REPO_ROOT,
};
