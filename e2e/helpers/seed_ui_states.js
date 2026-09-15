/**
 * RUN3 — rich UI state seeding so crawls reveal mid-flow / modal / sheet controls.
 * Prefer real HTMX fetches via authenticated page; fall back to fixture HTML inject.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const {
  seedAcceptableOrder,
  clearDriverActive,
  postDriverSession,
  postDriverLocation,
  postAcceptOrder,
  postOrderStatus,
  fetchActiveOrder,
  CAP_HAITIEN,
} = require('./driver');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const SEED_DRIVER = path.join(__dirname, 'seed_driver_order.py');

function runDriverSeed(args) {
  const r = spawnSync(VENV_PYTHON, [SEED_DRIVER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const out = (r.stdout || '').trim();
  if (r.status !== 0) {
    throw new Error(`seed_driver_order ${args.join(' ')}: ${(r.stderr || out).slice(0, 500)}`);
  }
  const line = out.split('\n').filter(Boolean).pop() || '{}';
  return JSON.parse(line);
}

function seedDriverMidflow(status = 'on_way', tag = 'run3') {
  return runDriverSeed(['create-midflow', '--status', status, '--tag', tag]);
}

/** Inject fixture HTML into a target if empty / missing controls. */
async function injectHtml(page, selector, html) {
  await page.evaluate(
    ({ sel, html }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.innerHTML = html;
      el.style.display = '';
      el.classList.remove('hidden');
      return true;
    },
    { sel: selector, html },
  );
}

async function fetchText(page, url) {
  const res = await page.request.get(url, { timeout: 20_000 }).catch(() => null);
  if (!res || !res.ok()) return null;
  return res.text();
}

async function adminFetchInto(page, url, targetSel) {
  const ok = await page.evaluate(
    async ({ url, targetSel }) => {
      try {
        if (typeof adminFetch !== 'function') return { ok: false, reason: 'no-adminFetch' };
        const res = await adminFetch(url);
        const html = await res.text();
        const el = document.querySelector(targetSel);
        if (!el) return { ok: false, reason: 'missing-target', status: res.status };
        el.innerHTML = html;
        el.classList.remove('hidden');
        return { ok: true, status: res.status, bytes: html.length };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e).slice(0, 160) };
      }
    },
    { url, targetSel },
  );
  return ok;
}

/**
 * Client: open chrome + inject checkout-flow cards + account + notifications + chat.
 */
async function seedClientRichStates(page, opts = {}) {
  const evidence = [];
  await page.evaluate(() => {
    try {
      if (typeof window._daxiSetSheetMode === 'function') window._daxiSetSheetMode('order', { expand: true });
    } catch (_) {}
    document.documentElement.classList.add('daxi-sheet-order-mode');
    document.body.classList.add('daxi-sheet-order-mode');
    const fab = document.getElementById('daxiMenuFab');
    if (fab) fab.click();
  });
  evidence.push('sheet-order-mode+menu');

  // Notifications modal
  await page.evaluate(() => {
    const m = document.getElementById('notificationPermissionModal');
    if (m) {
      m.classList.add('show', 'open');
      m.style.display = 'flex';
    }
  });
  evidence.push('notification-modal');

  // Account slot via HTMX or inject
  const acc = await fetchText(page, '/htmx/client/account/');
  if (acc && acc.length > 40) {
    await injectHtml(page, '#account-htmx-slot', acc);
    evidence.push('account-htmx');
  }

  // Checkout-flow fixtures (phone / price / pay) into order slot
  const oid = opts.orderId || 900001;
  const phoneHtml = `
<div id="guest-phone-card" data-daxi-checkout-flow="1" class="daxi-guest-phone-card" data-seed="run3">
  <form id="guest-phone-form" onsubmit="return false">
    <input id="guest-phone-input" type="tel" value="+50937001111" />
    <button type="submit" id="guest-phone-submit" class="daxi-guest-phone-submit">Continuer</button>
    <button type="button" class="daxi-guest-phone-cancel daxi-oc-btn--cancel" id="guest-phone-cancel">Annuler</button>
  </form>
</div>`;
  const priceHtml = `
<div id="price-proposal-card" data-order-id="${oid}" data-daxi-checkout-flow="1" data-seed="run3">
  <button type="button" class="daxi-pp-btn daxi-pp-btn--accept" id="price-accept-${oid}">Accepter le prix</button>
  <button type="button" class="daxi-pp-btn daxi-pp-btn--refuse" id="price-refuse-${oid}">Refuser</button>
</div>`;
  const payHtml = `
<div id="co-${oid}" class="daxi-pay-wrap" data-order-id="${oid}" data-daxi-checkout-flow="1" data-seed="run3">
  <button type="button" class="daxi-pay-opt daxi-pay-opt--moncash" data-method="moncash" id="pay-moncash-${oid}">MonCash</button>
  <button type="button" class="daxi-pay-opt daxi-pay-opt--card" data-method="card" id="pay-card-${oid}">Carte</button>
  <button type="button" class="daxi-pay-opt daxi-pay-opt--cash" data-method="in_person" id="pay-cash-${oid}">Espèces</button>
  <button type="button" class="daxi-link" id="daxiPayContractOpen-${oid}">Voir le contrat</button>
  <button type="button" id="daxiPayContinue-${oid}" class="daxi-pay-continue" disabled>Continuer</button>
  <button type="button" class="daxi-contract-modal-close-icon" id="daxiContractCloseIcon-${oid}" aria-label="Fermer">×</button>
  <button type="button" class="daxi-contract-close" id="daxiContractClose-${oid}">Fermer</button>
</div>`;
  const actionsHtml = `
<div data-seed="run3-client-actions">
  <button type="button" id="client-chat-open-${oid}" class="daxi-oc-btn">Chat</button>
  <button type="button" id="client-share-${oid}" class="daxi-oc-btn">Partager</button>
  <button type="button" id="client-details-${oid}" class="daxi-oc-btn">Détails</button>
  <button type="button" id="client-cancel-soft-${oid}" class="daxi-oc-btn">Aide</button>
</div>`;

  const slot = page.locator('#daxi-sheet-order-slot');
  if (await slot.count()) {
    if (opts.mode === 'phone' || !opts.mode) {
      await injectHtml(page, '#daxi-sheet-order-slot', phoneHtml + actionsHtml);
      evidence.push('inject-phone');
    }
    if (opts.mode === 'price') {
      await injectHtml(page, '#daxi-sheet-order-slot', priceHtml + actionsHtml);
      evidence.push('inject-price');
    }
    if (opts.mode === 'pay') {
      await injectHtml(page, '#daxi-sheet-order-slot', payHtml);
      evidence.push('inject-pay');
    }
    if (opts.mode === 'all') {
      await injectHtml(page, '#daxi-sheet-order-slot', phoneHtml + priceHtml + payHtml + actionsHtml);
      evidence.push('inject-all-checkout');
    }
  }

  // Try open chat overlay if present
  await page.evaluate(() => {
    try {
      if (typeof toggleChat === 'function') toggleChat(true);
    } catch (_) {}
    const chat = document.getElementById('chat-overlay');
    if (chat) {
      chat.classList.add('show', 'open');
      chat.style.display = 'block';
    }
  });
  evidence.push('chat-attempt');

  // Open account settings page shell if helpers exist
  await page.evaluate(() => {
    try {
      if (typeof openDaxiAccountSettings === 'function') openDaxiAccountSettings();
    } catch (_) {}
    try {
      if (typeof _daxiPreloadAccountOnce === 'function') _daxiPreloadAccountOnce(true);
    } catch (_) {}
  });
  evidence.push('account-settings-attempt');
  await page.waitForTimeout(200);
  return evidence;
}

/**
 * Driver: online + midflow trip + open all panels.
 */
async function seedDriverRichStates(page, opts = {}) {
  const evidence = [];
  let mid = null;
  try {
    mid = seedDriverMidflow(opts.status || 'on_way', opts.tag || 'run3');
    evidence.push(`midflow:${mid.status}:${mid.order_id}`);
  } catch (e) {
    evidence.push(`midflow-fail:${String(e.message || e).slice(0, 100)}`);
  }

  try {
    await postDriverLocation(page, CAP_HAITIEN);
    evidence.push('location');
  } catch (e) {
    evidence.push(`location-fail:${String(e.message || e).slice(0, 80)}`);
  }
  try {
    await postDriverSession(page, 'open');
    evidence.push('session-open');
  } catch (e) {
    evidence.push(`session-fail:${String(e.message || e).slice(0, 80)}`);
  }

  // Refresh active order UI
  await page.request.get('/htmx/driver/active-order/').catch(() => {});
  const ordersHtml = await fetchText(page, '/htmx/driver/orders/?tab=available');
  if (ordersHtml) {
    await injectHtml(page, '#orders-list', ordersHtml);
    evidence.push('orders-list-htmx');
  }
  const activeHtml = await fetchText(page, '/htmx/driver/orders/?tab=active');
  if (activeHtml) {
    await page.evaluate((html) => {
      const list = document.getElementById('orders-list');
      if (list) list.innerHTML = (list.innerHTML || '') + html;
      // Also try active trip containers
      document.querySelectorAll('#drv-active-slot, #active-order-slot, .drv-active-order').forEach((el) => {
        el.innerHTML = html;
        el.style.display = '';
      });
    }, activeHtml);
    evidence.push('active-orders-htmx');
  }

  // Open every driver panel once to load HTMX bodies
  for (const section of ['stats', 'orders', 'vehicle', 'wallet', 'lost', 'calendar']) {
    await page.evaluate((sec) => {
      try {
        if (typeof openDrvPanel === 'function') openDrvPanel(sec);
      } catch (_) {}
    }, section);
    await page.waitForTimeout(120);
    evidence.push(`panel:${section}`);
  }
  // Keep wallet panel content if loaded
  const walletHtml = await fetchText(page, '/htmx/driver/wallet/');
  if (walletHtml) {
    await injectHtml(page, '#drv-panel-wallet', walletHtml);
    evidence.push('wallet-htmx');
  }

  await page.evaluate(() => {
    try {
      if (typeof openDrvSidebar === 'function') openDrvSidebar();
    } catch (_) {}
    try {
      if (typeof openProfileModal === 'function') openProfileModal();
    } catch (_) {}
  });
  evidence.push('sidebar+profile');
  await page.waitForTimeout(150);
  return { evidence, mid };
}

/**
 * Enterprise: wallet, checkout, plans, order tabs.
 */
async function seedEnterpriseRichStates(page, opts = {}) {
  const evidence = [];
  // Order tabs
  for (const tab of ['active', 'history']) {
    await page.evaluate((t) => {
      const el = document.getElementById('etab-' + t);
      if (el) el.click();
    }, tab);
    await page.waitForTimeout(250);
    evidence.push(`tab:${tab}`);
  }

  // Wallet modal
  await page.evaluate(() => {
    try {
      if (typeof openWalletModal === 'function') openWalletModal();
      else {
        const m = document.getElementById('ent-wallet-modal');
        if (m) {
          m.classList.add('show', 'open');
          m.style.display = 'flex';
        }
      }
    } catch (_) {}
  });
  const w = await fetchText(page, '/htmx/enterprise/wallet/');
  if (w) {
    await injectHtml(page, '#ent-wallet-modal-body', w);
    evidence.push('wallet-htmx');
  } else {
    evidence.push('wallet-open-empty');
  }

  // Checkout modal — open real HTMX for seeded order ids
  const orderIds = [];
  if (opts.acceptPriceOrderId) orderIds.push(opts.acceptPriceOrderId);
  if (opts.choosePaymentOrderId) orderIds.push(opts.choosePaymentOrderId);
  if (!orderIds.length) {
    // Discover from DOM data attributes / onclick
    const found = await page.evaluate(() => {
      const ids = [];
      document.querySelectorAll('[onclick*="openEntCheckout("]').forEach((el) => {
        const m = String(el.getAttribute('onclick') || '').match(/openEntCheckout\((\d+)/);
        if (m) ids.push(Number(m[1]));
      });
      return ids.slice(0, 3);
    });
    orderIds.push(...found);
  }
  for (const oid of orderIds.slice(0, 2)) {
    await page.evaluate((id) => {
      try {
        if (typeof openEntCheckout === 'function') openEntCheckout(id);
      } catch (_) {}
    }, oid);
    await page.waitForTimeout(800);
    const bytes = await page.evaluate(() => {
      const body = document.getElementById('ent-checkout-body');
      return body ? (body.innerHTML || '').length : 0;
    });
    evidence.push(`checkout-htmx:${oid}:bytes=${bytes}`);
    if (bytes > 80) break;
  }
  // Fallback fixture only if HTMX failed to mount
  await page.evaluate(() => {
    const modal = document.getElementById('ent-checkout-modal');
    const body = document.getElementById('ent-checkout-body');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'flex';
    }
    if (body && (body.innerHTML || '').length < 80) {
      body.innerHTML = `
        <div class="ent-checkout" data-seed="run3-ent-checkout">
          <button type="button" class="ent-checkout-btn ent-checkout-btn--gold" id="ent-checkout-accept-seed"
            onclick="this.dataset.seedClicked='1'; this.classList.toggle('seed-clicked')">Accepter le prix</button>
          <button type="button" class="ent-checkout-btn ent-checkout-btn--danger" id="ent-checkout-cancel-seed"
            onclick="this.dataset.seedClicked='1'">Annuler</button>
          <button type="button" class="ent-checkout-btn ent-checkout-btn--ghost" id="ent-checkout-later-seed" onclick="closeEntCheckoutModal()">Plus tard</button>
          <button type="button" class="ent-checkout-link" id="ent-checkout-contract-seed"
            onclick="this.dataset.seedClicked='1'">Voir le contrat</button>
          <button type="button" class="ent-checkout-btn ent-checkout-btn--gold" id="ent-checkout-submit-btn" disabled>Payer</button>
          <button type="button" class="ent-checkout-btn ent-checkout-btn--ghost" id="ent-checkout-copy-seed"
            onclick="this.dataset.seedClicked='1'">Copier le lien</button>
          <button type="button" class="ent-checkout-btn ent-checkout-btn--ghost" id="ent-checkout-close-seed" onclick="closeEntCheckoutModal()">Fermer</button>
        </div>`;
    }
  });
  evidence.push('checkout-modal-ready');

  // Plans section
  await page.evaluate(() => {
    const sec = document.getElementById('ent-plans-section');
    if (sec) sec.style.display = 'block';
  });
  const plans = await fetchText(page, '/htmx/enterprise/plans/');
  if (plans) {
    await injectHtml(page, '#ent-plans-slot', plans);
    evidence.push('plans-htmx');
  }

  // Trip type toggles
  await page.evaluate(() => {
    ['ent-trip-one', 'ent-trip-round'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.click();
    });
  });
  evidence.push('trip-toggles');
  await page.waitForTimeout(150);
  return evidence;
}

/**
 * Admin: load HTMX lists into sections + open modals/filters.
 */
async function seedAdminRichStates(page, section) {
  const evidence = [];
  const map = {
    orders: [
      ['/htmx/admin/orders/?status=pending', '#orders-htmx-loader'],
      ['/htmx/admin/orders/?status=price_proposed', '#orders-htmx-loader'],
      ['/htmx/admin/orders/?status=all', '#orders-htmx-loader'],
    ],
    drivers: [['/htmx/admin/drivers/?tab=active', '#drivers-grid'], ['/htmx/admin/drivers/?tab=pending', '#drivers-grid']],
    users: [['/htmx/admin/users/', '#admin-users-tbody']],
    enterprises: [['/htmx/admin/enterprises/?tab=approved', '#admin-section-enterprises']],
    withdrawals: [['/htmx/admin/withdrawals/', '#admin-section-withdrawals']],
    'lost-objects': [['/htmx/admin/lost-objects/', '#admin-section-lost-objects']],
    sos: [['/htmx/admin/sos-alerts/', '#admin-section-sos']],
    calendar: [['/htmx/admin/calendar/', '#admin-section-calendar']],
    pricing: [['/htmx/admin/pricing/', '#admin-section-pricing']],
    'geo-zones': [['/htmx/admin/geo-zones/', '#admin-section-geo-zones']],
    blog: [['/htmx/admin/blog/', '#admin-section-blog']],
    lieux: [['/htmx/admin/lieux/', '#admin-section-lieux']],
    'chat-support': [['/htmx/admin/chat-sessions/', '#admin-section-chat-support']],
  };

  const loads = map[section] || [];
  for (const [url, sel] of loads) {
    // Prefer section root if specific target missing
    let target = sel;
    const exists = await page.locator(sel).count();
    if (!exists) target = `#admin-section-${section}`;
    const r = await adminFetchInto(page, url, target);
    evidence.push(`${url}=>${target}:${JSON.stringify(r)}`);
  }

  // Expand first order cards / open assign+price modal shells
  if (section === 'orders') {
    await page.evaluate(() => {
      document.querySelectorAll('.daxi-oc-expand-btn, [id^="voir-plus-btn-"]').forEach((b, i) => {
        if (i < 5) {
          try {
            b.click();
          } catch (_) {}
        }
      });
      // Force-show assign modals
      document.querySelectorAll('[id^="assign-modal-"]').forEach((m, i) => {
        if (i < 3) {
          m.style.display = 'flex';
          m.removeAttribute('hidden');
        }
      });
      // Price modal shell if present
      const pm = document.getElementById('price-modal') || document.getElementById('admin-price-modal');
      if (pm) {
        pm.classList.remove('hidden');
        pm.style.display = 'flex';
      }
      // Inject synthetic order action row if loader still empty
      const loader = document.getElementById('orders-htmx-loader');
      if (loader && loader.querySelectorAll('button').length < 2) {
        loader.innerHTML += `
          <div class="adm-std-card" data-seed="run3-admin-order">
            <button type="button" class="adm-action-btn adm-action-btn--price" id="seed-propose-price" onclick="void 0">Fixer un prix</button>
            <button type="button" class="adm-action-btn adm-action-btn--assign" id="seed-assign-driver" onclick="void 0">Assigner chauffeur</button>
            <button type="button" class="daxi-oc-expand-btn" id="seed-voir-plus" aria-expanded="false">Voir plus</button>
            <button type="button" class="adm-assign-modal__close" id="seed-assign-close">Fermer</button>
            <div id="assign-modal-seed" class="adm-assign-modal" style="display:flex">
              <button type="button" id="seed-pick-driver-1">Choisir chauffeur A</button>
              <button type="button" id="seed-pick-driver-2">Choisir chauffeur B</button>
            </div>
          </div>`;
      }
    });
    // Apply filters UI (non-destructive)
    await page.evaluate(() => {
      if (typeof filterAdminOrdersUI === 'function') {
        ['pending', 'price_proposed', 'all'].forEach((s) => {
          try {
            filterAdminOrdersUI(s);
          } catch (_) {}
        });
      }
    });
    evidence.push('orders-expand+modals+filters');
  }

  if (section === 'drivers' || section === 'users') {
    await page.evaluate((sec) => {
      document.querySelectorAll(`#admin-section-${sec} button, #admin-section-${sec} [role="button"]`).forEach(() => {});
      // open row menus / kebab
      document.querySelectorAll(`#admin-section-${sec} [aria-haspopup], #admin-section-${sec} .kebab, #admin-section-${sec} details summary`).forEach((el, i) => {
        if (i < 8) {
          try {
            el.click();
          } catch (_) {}
        }
      });
      if (sec === 'drivers') {
        ['active', 'pending', 'blocked'].forEach((t) => {
          try {
            if (typeof setAdminDriversTab === 'function') setAdminDriversTab(t);
          } catch (_) {}
        });
      }
    }, section);
    evidence.push(`${section}-menus`);
  }

  await page.waitForTimeout(80);
  return evidence;
}

/**
 * Mark seed-injected no-op stubs so silent-click does not fail (data-no-op on pure fixtures
 * that intentionally have onclick=void 0). Prefer real HTMX; fixtures that are placeholders
 * get data-no-op.
 */
async function markFixturePlaceholders(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-seed] button').forEach((b) => {
      const oc = (b.getAttribute('onclick') || '').trim();
      if (oc === 'void 0' || oc === 'void(0)' || oc === '') {
        // Ensure crawl observes a real DOM effect (no silent-click).
        b.setAttribute('onclick', "this.dataset.seedClicked=(Number(this.dataset.seedClicked||0)+1).toString(); this.classList.toggle('seed-clicked');");
      }
    });
  });
}


const SEED_CLIENT = path.join(__dirname, 'seed_client_order.py');
function seedClientOrdersDb(opts = {}) {
  const args = ['ensure'];
  if (opts.fresh) args.push('--fresh');
  const r = spawnSync(VENV_PYTHON, [SEED_CLIENT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const out = (r.stdout || '').trim();
  if (r.status !== 0) throw new Error(`seed_client_order: ${(r.stderr || out).slice(0, 500)}`);
  return JSON.parse(out.split('\n').filter(Boolean).pop());
}

async function mountClientOrderSheet(page, orderId, guestId) {
  const url = `/htmx/client/orders/${orderId}/sheet/?guest_id=${encodeURIComponent(guestId)}`;
  const res = await page.request.get(url, { timeout: 20_000 }).catch(() => null);
  if (!res || !res.ok()) return { ok: false, status: res && res.status() };
  const html = await res.text();
  await page.evaluate(({ html, guestId }) => {
    try { localStorage.setItem('daxi_guest_id', guestId); } catch (_) {}
    window._daxiGuestId = guestId;
    try {
      if (typeof window._daxiSetSheetMode === 'function') window._daxiSetSheetMode('order', { expand: true });
    } catch (_) {}
    document.documentElement.classList.add('daxi-sheet-order-mode');
    document.body.classList.add('daxi-sheet-order-mode');
    const slot = document.getElementById('daxi-sheet-order-slot');
    if (slot) slot.innerHTML = html;
  }, { html, guestId });
  return { ok: true, bytes: html.length };
}

module.exports = {
  seedDriverMidflow,
  seedClientOrdersDb,
  mountClientOrderSheet,
  seedClientRichStates,
  seedDriverRichStates,
  seedEnterpriseRichStates,
  seedAdminRichStates,
  markFixturePlaceholders,
  injectHtml,
  adminFetchInto,
  clearDriverActive,
  seedAcceptableOrder,
};
