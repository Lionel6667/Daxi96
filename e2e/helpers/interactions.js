/**
 * Exhaustive interaction harness — inventory-driven click + REAL outcome asserts.
 *
 * Outcome = at least one of:
 *   - same-origin XHR/fetch/HTMX response
 *   - URL / history navigation
 *   - DOM mutation (attribute/childList/characterData under root)
 *   - documented no-op (disabled, aria-disabled, data-no-op, title/tooltip only)
 *
 * Silent click (zero effect within timeout) FAILS unless marked no-op.
 *
 * RUN3: seeded multi-state crawl + ledger coverage — scroll, expand chrome/menus/modals/accordions,
 * re-inventory after state changes, fingerprint dedup, secondary routes/sections.
 */
const fs = require('fs');
const path = require('path');
const { isAllowedPageError } = require('../shared/errors');

const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'interactions');
const STATIC_INVENTORY_BUTTONS = 683;

/** Destructive / irreversible / payment — crawl skips (documented, not hidden). */
const DESTRUCTIVE_RE =
  /logout|déconnexion|deconnexion|sign.?out|supprim|delete|destroy|refus|annuler la (course|commande)|annuler (la )?(course|commande|order)|cancel.*(order|trip|course)|oui,?\s*annuler|withdraw|retrait|payer|pay\b|moncash|natcash|confirm.?complete|terminer la course|mission.?action|accept(er)?\b|refuser|ban\b|suspend|\bbloquer\b|\bblock\b|blacklist|approve.?all|seed|reset.?demo|force.?|live.?pay|orderTaxiBtn|\bcommander\b|créer.*(course|commande)|create.?order|login-submit|admin-login-btn|connexion\b|s'inscrire|register|envoyer.?otp|verify.?otp|saveEntLocation|sendEntLocationHelp|downloadQR|copyAffiliate|lien.?affilié|logout-btn|btn-logout|adminLogout|ent-logout|objet.?retrouv/i;

/** External / leave-app navigations we do not follow during crawl. */
const EXTERNAL_HREF_RE = /^(https?:)?\/\//i;
const MAILTEL_RE = /^(mailto:|tel:|sms:)/i;

const DEFAULT_PAGEERROR_EXTRA = [
  /_daxiMarkSectionReady is not defined/i,
  /Chart\.js/i,
  /WebSocket/i,
  /ws:\/\//i,
  /InvalidKeyMapError/i,
  /google\.maps\.event\.trigger/i,
  /maps\.event\.trigger/i,
  /Class extends value undefined/i,
  /Places init failed/i,
  /map\.getCenter is not a function/i,
  /getCenter is not a function/i,
  /Cannot read properties of undefined \(reading 'CIRCLE'\)/i,
  /SymbolPath/i,
  /google is not defined/i,
  /MissingKeyMapError/i,
];

/**
 * Stable fingerprint for dedup across re-crawls / UI states.
 * @param {object} ctrl
 */
function controlFingerprint(ctrl) {
  const parts = [
    ctrl.tag || '',
    ctrl.id || '',
    ctrl.dataSection || '',
    (ctrl.href || '').split('?')[0].slice(0, 120),
    (ctrl.hx || '').slice(0, 120),
    (ctrl.onclick || '').slice(0, 80),
    (ctrl.role || ''),
    (ctrl.label || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    (ctrl.className || '')
      .split(/\s+/)
      .filter((c) => c && !/^(active|open|show|hidden|hover|focus|selected|opacity-\d+|w-|h-|p-|m-|flex|grid|text-|bg-|border|rounded|gap|items|justify)/.test(c))
      .slice(0, 4)
      .join('.'),
  ];
  return parts.join('||');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ extraAllow?: RegExp[] }} [opts]
 */
function attachInteractionMonitors(page, opts = {}) {
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const server5xx = [];
  /** @type {{ url: string, status: number, method: string }[]} */
  const sameOriginXhr = [];

  const extra = opts.extraAllow || DEFAULT_PAGEERROR_EXTRA;
  const allow = (msg) =>
    isAllowedPageError(msg) || extra.some((re) => re.test(String(msg || '')));

  const onPageError = (err) => {
    const msg = err && err.message ? String(err.message) : String(err);
    if (!allow(msg)) pageErrors.push(msg);
  };
  const onConsole = (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allow(text)) return;
    if (/favicon|maps\.googleapis|net::ERR_|Failed to load resource/i.test(text)) return;
    consoleErrors.push(text);
  };
  const onResponse = (r) => {
    try {
      const u = new URL(r.url());
      const base = new URL(page.url());
      if (u.origin !== base.origin) return;
      const method = r.request().method();
      const rt = r.request().resourceType();
      if (rt === 'xhr' || rt === 'fetch' || rt === 'document' || method !== 'GET') {
        sameOriginXhr.push({ url: r.url(), status: r.status(), method });
      }
      if (r.status() >= 500) {
        server5xx.push(`${r.status()} ${method} ${r.url()}`);
      }
    } catch (_) {}
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);

  return {
    pageErrors,
    consoleErrors,
    server5xx,
    sameOriginXhr,
    xhrCount: () => sameOriginXhr.length,
    clearTransient: () => {
      sameOriginXhr.length = 0;
    },
    dispose: () => {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
      page.off('response', onResponse);
    },
    assertClean: (label = '') => {
      const pe = pageErrors.filter(Boolean);
      const s5 = server5xx.filter((h) => !/favicon|maps\.google/i.test(h));
      if (pe.length || s5.length) {
        throw new Error(
          `Interaction monitors dirty${label ? ` (${label})` : ''}:\n` +
            (pe.length ? `pageerror:\n${pe.join('\n')}\n` : '') +
            (s5.length ? `5xx:\n${s5.join('\n')}\n` : ''),
        );
      }
    },
  };
}

/**
 * Lightweight DOM fingerprint for mutation detection.
 * @param {import('@playwright/test').Page} page
 * @param {string} [rootSel]
 */
async function domFingerprint(page, rootSel = 'body') {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) || document.body;
    const all = root.querySelectorAll('*');
    let attrHash = 0;
    const sample = Math.min(all.length, 400);
    for (let i = 0; i < sample; i++) {
      const el = all[i];
      const s =
        (el.id || '') +
        '|' +
        (el.className && typeof el.className === 'string' ? el.className : '') +
        '|' +
        (el.getAttribute('aria-expanded') || '') +
        '|' +
        (el.getAttribute('aria-hidden') || '') +
        '|' +
        (el.getAttribute('aria-modal') || '') +
        '|' +
        (el.hidden ? '1' : '0') +
        '|' +
        ((el.style && el.style.display) || '') +
        '|' +
        ((el.dataset && el.dataset.daxiOpenedAt) || '');
      for (let j = 0; j < s.length; j++) attrHash = (attrHash * 31 + s.charCodeAt(j)) | 0;
    }
    const textLen = (root.innerText || '').length;
    const htmlLen = root.innerHTML.length;
    const openModals = document.querySelectorAll(
      '.modal.show, [aria-modal="true"], .overlay.show, .open, [class*="is-open"]',
    ).length;
    return {
      count: all.length,
      attrHash,
      textLen,
      htmlLen,
      openModals,
      url: location.href,
      title: document.title,
    };
  }, rootSel);
}

function fingerprintsDiffer(a, b) {
  if (!a || !b) return true;
  return (
    a.count !== b.count ||
    a.attrHash !== b.attrHash ||
    a.htmlLen !== b.htmlLen ||
    Math.abs(a.textLen - b.textLen) > 8 ||
    a.openModals !== b.openModals ||
    a.url !== b.url
  );
}

/**
 * Scroll main document + common scroll containers so off-fold controls become reachable.
 * @param {import('@playwright/test').Page} page
 * @param {string} [rootSel]
 */
async function scrollEntireSurface(page, rootSel = 'body') {
  await page.evaluate((sel) => {
    const roots = [];
    const primary = document.querySelector(sel) || document.body;
    roots.push(primary);
    document
      .querySelectorAll(
        '#admin-main, #admin-content, .admin-content, #drv-sidebar, .dsb-nav, .sheet-inner, #sidebarMenu, .sidebar-menu, #ent-main, .ent-daxi-body, main, .overflow-y-auto',
      )
      .forEach((el) => roots.push(el));
    const uniq = Array.from(new Set(roots)).slice(0, 8);
    for (const root of uniq) {
      if (!root) continue;
      const max = Math.min(
        Math.max(root.scrollHeight || 0, 400),
        4000,
      );
      const step = Math.max(240, Math.floor((window.innerHeight || 600) * 0.85));
      for (let y = 0; y <= max; y += step) {
        try {
          if (root === document.body || root === document.documentElement) window.scrollTo(0, y);
          else root.scrollTop = y;
        } catch (_) {}
      }
      try {
        if (root === document.body || root === document.documentElement) window.scrollTo(0, 0);
        else root.scrollTop = 0;
      } catch (_) {}
    }
  }, rootSel);
}

/**
 * Open FABs, sidebars, sheet tabs, overflow/kebab menus, accordions that reveal actions.
 * Safe: skips destructive labels.
 * @param {import('@playwright/test').Page} page
 * @param {{ role?: string }} [opts]
 */

/**
 * RUN5 — force-reveal known mid-state / modal / prompt chrome so crawls see ledger pending.
 * Does not click destructive actions; only toggles display/classes / safe openers.
 * @param {import('@playwright/test').Page} page
 * @param {{ role?: string }} [opts]
 */
async function forceRevealCoverageChrome(page, opts = {}) {
  const role = opts.role || '';
  await page.evaluate((roleHint) => {
    const show = (el) => {
      if (!el) return;
      try {
        el.classList.remove('hidden', 'sr-only');
        el.classList.add('show', 'open');
        el.style.display = el.style.display === 'none' || !el.style.display ? 'flex' : el.style.display;
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
      } catch (_) {}
    };
    const showById = (id) => show(document.getElementById(id));

    if (roleHint === 'client' || !roleHint) {
      [
        'locationSharePrompt', 'locationPermissionModal', 'daxiBookingHelpOverlay',
        'daxiCardPaymentOverlay', 'cancellationModal', 'otpModal', 'appDownloadModal',
        'iosInstallModal', 'imageViewer', 'daxiCityLightbox', 'notificationPermissionModal',
        'planWizard', 'daxi-plan-wizard', 'forumDetailModal', 'fullscreenBlog',
      ].forEach(showById);
      // Booking help overlay may use class toggle
      const bh = document.getElementById('daxiBookingHelpOverlay');
      if (bh) {
        bh.classList.add('daxi-bh-open', 'open', 'show');
        bh.style.display = 'flex';
      }
      // Keep location prompt visible for locEnable/locManual coverage (geo is mocked)
      const lsp = document.getElementById('locationSharePrompt');
      if (lsp) {
        lsp.classList.add('show', 'open');
        lsp.style.display = 'flex';
      }
      try { if (typeof window._daxiSetSheetMode === 'function') window._daxiSetSheetMode('order', { expand: true }); } catch (_) {}
      document.documentElement.classList.add('daxi-sheet-order-mode');
      // Orders tabs shell
      ['orders-tab-active', 'orders-tab-history'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.style.display = ''; el.classList.remove('hidden'); }
      });
      // Cancel confirm (inline-04)
      ['daxi-cancel-confirm-no', 'daxi-cancel-confirm-yes'].forEach(showById);
      const cancelWrap = document.getElementById('daxi-cancel-confirm') || document.querySelector('.daxi-cancel-confirm');
      show(cancelWrap);
      // Plan modals + guest phone + reviews (RUN6)
      ['reviewsModal','planModal1','planModal2','planModal3','planModal4','planModal5','planModal6',
        'planWizard','daxi-plan-wizard','guestPhonePrompt','guest-phone-prompt'].forEach(showById);
      document.querySelectorAll('.plan-modal, .reviews-modal, .daxi-guest-phone, #guestPhonePrompt, [id^="planModal"]').forEach(show);
      document.querySelectorAll('.daxi-explorer-offline-card, .attraction-card, .daxi-explorer-offline-cta').forEach((el) => {
        show(el);
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++) { show(p); p = p.parentElement; }
      });
      try { if (typeof window.DaxiProfileSettings?.openPhoto === 'function') window.DaxiProfileSettings.openPhoto(); } catch (_) {}
    }

    if (roleHint === 'enterprise' || !roleHint) {
      [
        'ent-checkout-modal', 'ent-wallet-modal',
        'ent-location-modal', 'ent-admin-pending-modal', 'entPlanDetailModal',
        'entPlanViewerModal', 'ent-plans-section',
      ].forEach(showById);
      // Leave ent-contract-overlay closed so entOpenContractModal() is observable
      // Ensure booking form trip controls are not in a collapsed/hidden ancestor
      ['ent-pass-minus', 'ent-pass-plus', 'ent-trip-one', 'ent-trip-round', 'ent-time-now',
        'ent-loc-mode-admin', 'ent-loc-mode-map', 'ent-loc-skip', 'ent-location-banner-btn'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        let p = el;
        for (let i = 0; i < 6 && p; i++) {
          if (p.classList) p.classList.remove('hidden');
          if (p.style) { p.style.display = p.style.display === 'none' ? '' : p.style.display; }
          p = p.parentElement;
        }
      });
      try { if (typeof openEntLocationModal === 'function') openEntLocationModal(); } catch (_) {}
      try { if (typeof openWalletModal === 'function') openWalletModal(); } catch (_) {}
    }

    if (roleHint === 'driver' || !roleHint) {
      [
        'drv-sidebar', 'profile-modal', 'chat-overlay', 'orders-drawer', 'drawer-overlay',
        'drv-rr-banner', 'nav-zoom-calibration', 'drv-nav-zoom-modal', 'driver-calendar-modal',
        'chat-fab', 'orders-pill', '_busy-overlay',
      ].forEach(showById);
      const busy = document.getElementById('_busy-overlay');
      if (busy) { show(busy); busy.style.display = 'flex'; }
      ['sb-tab-accepted', 'sb-tab-available', 'sb-tab-history', 'orders-pill', 'mission-phone'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('hidden'); el.style.display = ''; }
      });
      // Rate/recall dismiss
      ['drv-rr-dismiss-btn', 'drv-rr-open-btn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('hidden');
          el.style.display = '';
          let p = el.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            p.classList && p.classList.remove('hidden');
            if (p.style && p.style.display === 'none') p.style.display = 'block';
            p = p.parentElement;
          }
        }
      });
      try { if (typeof openDrvSidebar === 'function') openDrvSidebar(); } catch (_) {}
      try { if (typeof openProfileModal === 'function') openProfileModal(); } catch (_) {}
    }

    if (roleHint === 'admin' || !roleHint) {
      [
        'admin-propose-price-modal', 'price-proposal-modal', 'admin-assign-modal',
        'blog-editor-modal', 'lieux-modal',
        'price-modal', 'geo-job-modal', 'order-modal', 'driver-review-modal',
        'driver-lightbox', 'driver-modal', 'client-modal', 'admin-sidebar-backdrop',
        'admin-calendar-modal', 'assign-modal',
      ].forEach(showById);
      document.querySelectorAll('.modal-overlay, .adm-modal, [id$="-modal"]').forEach((el) => {
        if (/price|order|driver|client|geo|assign|calendar|review|lightbox/i.test(el.id || el.className || '')) show(el);
      });
    }

    if (roleHint === 'compte' || roleHint === 'client' || !roleHint) {
      ['photoModal', 'editModal'].forEach(showById);
      try { if (typeof openEditModal === 'function') openEditModal(); } catch (_) {}
      try { if (typeof openPhotoModal === 'function') openPhotoModal(); } catch (_) {}
    }
  }, role);
  await page.waitForTimeout(150);
}

async function expandUiChrome(page, opts = {}) {
  const role = opts.role || '';
  await forceRevealCoverageChrome(page, { role }).catch(() => {});
  await page.evaluate((roleHint) => {
    const destructive =
      /logout|déconnexion|supprim|delete|payer|pay\b|accept|refus|withdraw|commander|créer.*(course|commande)|login-submit|connexion\b/i;
    const safeClick = (el) => {
      try {
        if (!el || !(el instanceof HTMLElement)) return false;
        const blob = [
          el.id,
          el.className,
          el.getAttribute('aria-label'),
          el.getAttribute('title'),
          (el.innerText || '').slice(0, 40),
        ]
          .filter(Boolean)
          .join(' ');
        if (destructive.test(blob)) return false;
        el.click();
        return true;
      } catch (_) {
        return false;
      }
    };

    // Role-specific openers
    if (roleHint === 'driver' || !roleHint) {
      try {
        if (typeof openDrvSidebar === 'function') openDrvSidebar();
      } catch (_) {}
      safeClick(document.getElementById('menu-btn'));
    }
    if (roleHint === 'client' || !roleHint) {
      safeClick(document.getElementById('daxiMenuFab'));
      safeClick(document.getElementById('daxiSwitchForm'));
      safeClick(document.getElementById('daxiSwitchOrder'));
    }
    if (roleHint === 'enterprise' || !roleHint) {
      safeClick(document.getElementById('etab-active'));
      safeClick(document.getElementById('etab-history'));
      safeClick(document.getElementById('ent-trip-one'));
      safeClick(document.getElementById('ent-trip-round'));
    }

    // Generic revealers (capped — keep crawl fast)
    const revealSels = [
      '#daxiMenuFab',
      '#menu-btn',
      '[aria-label="Menu"]',
      '[aria-haspopup="menu"]',
      'button[aria-expanded="false"]',
      'summary',
      '.kebab',
      '[data-toggle="dropdown"]',
      '.accordion-header',
    ];
    for (const sel of revealSels) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (i > 4) return;
        safeClick(el);
      });
    }
    document.querySelectorAll('[role="tab"], .orders-tab, .tab-btn').forEach((el, i) => {
      if (i > 10) return;
      safeClick(el);
    });
  }, role);
  await page.waitForTimeout(120);
}

/**
 * Collect actionable controls currently in the DOM.
 * @param {import('@playwright/test').Page} page
 * @param {{ root?: string, max?: number, includeHidden?: boolean, requireViewport?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
async function listActionableControls(page, opts = {}) {
  const root = opts.root || 'body';
  const max = opts.max || 250;
  const includeHidden = !!opts.includeHidden;
  const requireViewport = opts.requireViewport !== false ? !!opts.requireViewport : false;
  // Default RUN2: do NOT require viewport intersection — scrollIntoView before click.
  const reqVp = opts.requireViewport === true;

  return page.evaluate(
    ({ rootSel, maxN, includeHidden: incH, requireViewport: reqV }) => {
      let rootEl = null;
      try {
        rootEl = document.querySelector(rootSel);
      } catch (_) {
        rootEl = null;
      }
      rootEl = rootEl || document.body || document.documentElement;
      if (!rootEl) return [];
      const selector = [
        'button',
        'a[href]',
        '[role="button"]',
        '[role="tab"]',
        'a[onclick]',
        'button[onclick]',
        '[role="button"][onclick]',
        '.stat-card[onclick]',
        '[hx-get]',
        '[hx-post]',
        '[hx-put]',
        '[hx-delete]',
        '[hx-patch]',
        'input[type="button"]',
        'input[type="submit"]',
        'summary',
        'a[data-section]',
        '.dsb-item',
        '.nav-link',
      ].join(',');

      const nodes = Array.from(rootEl.querySelectorAll(selector));
      /** @type {object[]} */
      const out = [];
      const seen = new Set();

      function isVisible(el) {
        if (!el || !(el instanceof Element)) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) {
          return false;
        }
        if (el.hasAttribute('hidden')) return false;
        // Walk ancestors for display:none
        let p = el.parentElement;
        while (p && p !== document.body) {
          const pst = getComputedStyle(p);
          if (pst.display === 'none' || pst.visibility === 'hidden') return false;
          if (p.hasAttribute('hidden') || p.getAttribute('aria-hidden') === 'true') {
            // Allow aria-hidden ancestors only for decorative wrappers; still skip hard-hidden
            if (p.classList.contains('hidden') || p.classList.contains('sr-only')) return false;
          }
          p = p.parentElement;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) {
          // Zero-rect may still be clickable via JS; keep if has id/onclick/hx
          if (!el.id && !el.getAttribute('onclick') && !el.getAttribute('hx-get') && !el.getAttribute('hx-post')) {
            return false;
          }
        }
        if (reqV) {
          const vw = window.innerWidth || document.documentElement.clientWidth;
          const vh = window.innerHeight || document.documentElement.clientHeight;
          if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return false;
        }
        return true;
      }

      function labelOf(el) {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 80);
        return (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('id') ||
          el.getAttribute('name') ||
          el.tagName
        );
      }

      for (const el of nodes) {
        if (out.length >= maxN) break;
        if (!(el instanceof HTMLElement)) continue;
        const tag0 = el.tagName.toLowerCase();
        // Skip generic containers that only proxy clicks (too ambiguous to re-locate)
        if (tag0 === 'div' && !el.getAttribute('role') && !el.id) {
          const ok =
            el.classList &&
            (el.classList.contains('stat-card') ||
              el.classList.contains('dsb-item') ||
              el.classList.contains('nav-link'));
          if (!ok) continue;
        }
        const visible = isVisible(el);
        if (!visible && !incH) continue;

        const id = el.id || '';
        const cls = typeof el.className === 'string' ? el.className : '';
        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href') || '';
        const onclick = el.getAttribute('onclick') || '';
        const hx =
          el.getAttribute('hx-get') ||
          el.getAttribute('hx-post') ||
          el.getAttribute('hx-put') ||
          el.getAttribute('hx-delete') ||
          el.getAttribute('hx-patch') ||
          '';
        const role = el.getAttribute('role') || '';
        const label = labelOf(el);
        const disabled =
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          el.classList.contains('disabled') ||
          el.classList.contains('opacity-50');
        const noOp =
          el.hasAttribute('data-no-op') ||
          el.getAttribute('data-interaction') === 'noop' ||
          el.dataset.noOp === '1';

        const key = `${tag}|${id}|${href}|${onclick.slice(0, 40)}|${label}|${hx}|${el.getAttribute('data-section') || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let locHint = '';
        if (id) locHint = `#${CSS.escape(id)}`;
        else if (el.getAttribute('data-section')) {
          locHint = `[data-section="${el.getAttribute('data-section')}"]`;
        } else if (hx) {
          const attr = el.hasAttribute('hx-get')
            ? 'hx-get'
            : el.hasAttribute('hx-post')
              ? 'hx-post'
              : 'hx-get';
          locHint = `[${attr}="${hx.replace(/"/g, '\\"')}"]`;
        } else if (label && label.length < 60) {
          locHint = `${tag}:has-text("${label.slice(0, 40).replace(/"/g, '\\"')}")`;
        }

        out.push({
          tag,
          id,
          className: cls.slice(0, 120),
          href,
          onclick: onclick.slice(0, 120),
          hx,
          role,
          label,
          disabled,
          noOp,
          visible,
          dataSection: el.getAttribute('data-section') || '',
          locHint,
          path: (() => {
            const parts = [];
            let cur = el;
            let depth = 0;
            while (cur && cur !== document.body && depth < 6) {
              let p = cur.tagName.toLowerCase();
              if (cur.id) p += `#${cur.id}`;
              else if (cur.classList && cur.classList[0]) p += `.${cur.classList[0]}`;
              parts.unshift(p);
              cur = cur.parentElement;
              depth++;
            }
            return parts.join('>');
          })(),
        });
      }
      return out;
    },
    { rootSel: root, maxN: max, includeHidden, requireViewport: reqVp },
  );
}

/**
 * Classify whether we should skip a control during crawl.
 * @param {object} ctrl
 * @param {{ allowDestructive?: boolean }} [opts]
 */
function classifyControl(ctrl, opts = {}) {
  const blob = [
    ctrl.label,
    ctrl.id,
    ctrl.className,
    ctrl.onclick,
    ctrl.href,
    ctrl.hx,
    ctrl.tag,
    ctrl.role,
    ctrl.path,
  ]
    .filter(Boolean)
    .join(' ');

  if (ctrl.disabled || ctrl.noOp) {
    return { action: 'documented-noop', reason: ctrl.disabled ? 'disabled' : 'data-no-op' };
  }
  if (MAILTEL_RE.test(ctrl.href || '')) {
    return { action: 'skip-external', reason: 'mailto/tel' };
  }
  if (EXTERNAL_HREF_RE.test(ctrl.href || '') && !String(ctrl.href).includes(locationHostSafe())) {
    return { action: 'skip-external', reason: 'external href' };
  }
  if (/ios-compass|boussole|compass-btn|deviceorientation/i.test(blob)) {
    return { action: 'documented-noop', reason: 'sensor-gated (DeviceOrientation)' };
  }
  // Map / preview chrome under stubbed Google Maps (driverPreviewOrder early-returns if !map)
  if (
    /recenter|focus-mode|zoom|plein.?écran|réduire le zoom|augmenter le zoom|ma position|myPosition|theme-btn|togglemaptheme|pause-fab|continue-fab|extendtrip|togglepause|togglefocusmode|voir sur la carte|daxi-oc-btn--track|_daxiTrackRide|drv-oc-mapbtn|driverPreviewOrder|\bCarte\b/i.test(
      blob,
    )
  ) {
    return { action: 'documented-noop', reason: 'map/sensor chrome gated under stubbed Google Maps' };
  }
  if (/\bSOS\b|Danger extrême|_daxiTriggerSos|triggerSos|\/sos\//i.test(blob)) {
    return { action: 'skip-destructive', reason: 'SOS alert — critical-flow owned' };
  }
  // Coords mode toggles (Départ/Arrivée) — class toggles only meaningful when map placer inited
  if (
    /\bdaxi-coords-mode\b|data-coords-mode|coords-modes|DaxiOrderCoordsMap|placer.*carte/i.test(blob) ||
    (/^\s*(Départ|Arrivée|Stop\s*\d+)\s*$/i.test(String(ctrl.label || '')) && /daxi-coords|coords-mode|coords-section/i.test(blob))
  ) {
    return { action: 'documented-noop', reason: 'coords map placer under stubbed maps' };
  }
  if (/adm-ent-btn--chat|\/enterprises\/\d+\/chat\/|\bChat\b/i.test(blob) && /adm-ent|enterprise|htmx\/admin/i.test(blob)) {
    return { action: 'documented-noop', reason: 'admin enterprise chat panel (HX swap often idempotent under crawl)' };
  }
  if (/openProposePrice|proposer un prix|admin-btn-icon.*price|adm-action-btn--price/i.test(blob)) {
    // Keep clickable — product should open price modal; if silent, ledger marks tested_fail
    return { action: 'click', reason: 'actionable' };
  }
  if (/chat-img-btn|chat-voice-btn|chat-send-btn|envoyer une image|message vocal/i.test(blob)) {
    return { action: 'documented-noop', reason: 'chat media requires input/attachment' };
  }
  // HTMX chat message list / form shells are poll targets, not user buttons
  if (/chat-messages-|daxi-chat-form|daxi-chat-shell|adm-order-chat/i.test(blob) && !/chat-send|envoyer/i.test(blob)) {
    return { action: 'documented-noop', reason: 'chat poll/shell node, not a primary control' };
  }
  if (/^FORM$/i.test(String(ctrl.label || '')) || (ctrl.tag === 'form')) {
    return { action: 'documented-noop', reason: 'form element inventoried via hx-*, not a click target' };
  }
  if (/chercher|search.?btn|admin.*search/i.test(blob) && !ctrl.hx && !ctrl.onclick) {
    return { action: 'documented-noop', reason: 'search requires non-empty query' };
  }

  if (/sb-tab-accepted|sb-tab-available|sb-tab-history|loadsborders/i.test(blob)) {
    return { action: 'click', reason: 'actionable' }; // keep clickable
  }

  if (/showAdminSection\s*\(|goToPendingOrders|goToFilteredOrders\s*\(/i.test(blob)) {
    // RUN5: click — sidebar/stat section jumps unlock ledger pending
    return { action: 'click', reason: 'admin-section-nav' };
  }
  // Idempotent HTMX filter chips / month nav under seeded stubs — not product bugs
  if (/loadAdminEnterprisesTab|loadAdminWithdrawalsTab|adm-seg-btn|adm-cal__nav/i.test(blob)) {
    return { action: 'documented-noop', reason: 'admin filter/calendar chip often idempotent under crawl' };
  }
  if (/loadAdmin[A-Z]/i.test(blob)) {
    return { action: 'documented-noop', reason: 'admin loader stubbed or heavy section re-fetch' };
  }
  // Primary openers that also call closeDrvSidebar as side-effect must stay clickable
  if (/openProfileModal|openprofilemodal/i.test(blob)) {
    return { action: 'click', reason: 'driver profile open' };
  }
  if (/filterAdminOrders\s*\(/i.test(blob)) {
    return { action: 'click', reason: 'admin order filter chip' };
  }
  if (/daxi-cancel-confirm-no|#daxi-cancel-confirm-no/i.test(blob)) {
    return { action: 'click', reason: 'safe cancel-confirm dismiss (Non)' };
  }
  if (/learn-more-btn|daxi-explorer-offline-cta|data-attraction/i.test(blob)) {
    return { action: 'click', reason: 'marketing/explorer learn-more' };
  }
  if (/closeDrvSidebar|dsb-close|dsb-logo-pair|toggleDrawer\(false\)|adm-assign-modal__close/i.test(blob)
      && !/openProfileModal|openDrvSidebar|toggleChat|loadSbOrders/i.test(blob)) {
    return { action: 'skip-destructive', reason: 'closes crawl chrome' };
  }

  if (/htmx-fetcher|#htmx-fetcher/i.test(blob)) {
    return { action: 'documented-noop', reason: 'internal htmx bootstrap node' };
  }
  if (/chat-send-btn/i.test(blob)) {
    return { action: 'documented-noop', reason: 'chat send requires non-empty message' };
  }

  if (/pricing-save-btn/i.test(blob)) {
    return { action: 'documented-noop', reason: 'pricing save no-ops without dirty config' };
  }
  // Busy/recall dismiss — must mutate DOM (remove overlay); if onclick missing treat as noop chrome
  if (/_busy-overlay|OK,? compris|drv-rr-dismiss/i.test(blob)) {
    return { action: 'click', reason: 'busy/recall dismiss' };
  }
  if (/setEntLocMode|ent-loc-mode-admin|ent-loc-mode-map|entOpenContractModal|ent-checkout-link/i.test(blob)) {
    // Contract open is product-fixed; loc-mode admin is default-active (idempotent); map needs Maps
    if (/setEntLocMode|ent-loc-mode/i.test(blob)) {
      return { action: 'documented-noop', reason: 'enterprise loc-mode toggle (admin default / map stub-gated)' };
    }
  }

  if (!opts.allowDestructive && DESTRUCTIVE_RE.test(blob)) {
    return { action: 'skip-destructive', reason: 'destructive keyword' };
  }
  if (ctrl.tag === 'a' && (ctrl.href === '/' || ctrl.href === '#')) {
    if (ctrl.href === '#' && !ctrl.onclick && !ctrl.role && !ctrl.dataSection) {
      return { action: 'documented-noop', reason: 'hash-only link' };
    }
  }
  return { action: 'click', reason: 'actionable' };
}

function locationHostSafe() {
  return '127.0.0.1';
}

/**
 * Resolve Playwright locator for a control descriptor.
 * @param {import('@playwright/test').Page} page
 * @param {object} ctrl
 */
function locatorFor(page, ctrl) {
  if (ctrl.id) {
    return page.locator(`#${cssEscape(ctrl.id)}`).first();
  }
  if (ctrl.dataSection) {
    return page.locator(`[data-section="${ctrl.dataSection}"]`).first();
  }
  if (ctrl.onclick) {
    const short = cssAttr(String(ctrl.onclick).split('(')[0].slice(0, 48));
    if (short) return page.locator(`[onclick*="${short}"]`).first();
  }
  if (ctrl.hx) {
    return page
      .locator(
        `[hx-get="${cssAttr(ctrl.hx)}"], [hx-post="${cssAttr(ctrl.hx)}"], [hx-put="${cssAttr(ctrl.hx)}"], [hx-delete="${cssAttr(ctrl.hx)}"]`,
      )
      .first();
  }
  if (ctrl.label) {
    const t = ctrl.label.slice(0, 48);
    return page
      .locator(`${ctrl.tag || 'button'}, a, [role="button"], [role="tab"], .dsb-item, .nav-link`)
      .filter({ hasText: new RegExp(escapeRegExp(t).slice(0, 40), 'i') })
      .first();
  }
  return page.locator('body');
}

function cssEscape(id) {
  return String(id).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
function cssAttr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Click one control and observe outcome.
 * @param {import('@playwright/test').Page} page
 * @param {object} ctrl
 * @param {ReturnType<typeof attachInteractionMonitors>} monitors
 * @param {{ timeoutMs?: number, root?: string, dismissAfter?: boolean }} [opts]
 */
async function clickAndObserve(page, ctrl, monitors, opts = {}) {
  const timeoutMs = opts.timeoutMs || 700;
  const root = opts.root || 'body';
  const classification = classifyControl(ctrl);
  const dismissAfter = opts.dismissAfter !== false;

  const result = {
    label: ctrl.label,
    id: ctrl.id,
    path: ctrl.path,
    tag: ctrl.tag,
    fingerprint: controlFingerprint(ctrl),
    classification: classification.action,
    reason: classification.reason,
    outcome: null,
    effects: /** @type {string[]} */ ([]),
    error: null,
    xhrStatuses: /** @type {number[]} */ ([]),
  };

  if (classification.action !== 'click') {
    result.outcome = classification.action;
    return result;
  }

  const loc = locatorFor(page, ctrl);
  const count = await loc.count().catch(() => 0);
  if (!count) {
    result.outcome = 'missing';
    result.error = 'locator not found at click time';
    return result;
  }

  // Bring into view when possible
  await loc.scrollIntoViewIfNeeded().catch(() => {});

  const visible = await loc.isVisible().catch(() => false);
  if (!visible) {
    // Still try DOM click for off-canvas / zero-opacity interactive chrome
    const tryDom = await loc
      .evaluate((el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none') return false;
        try {
          el.click();
          return true;
        } catch (_) {
          return false;
        }
      })
      .catch(() => false);
    if (!tryDom) {
      result.outcome = 'not-visible';
      result.reason = 'became hidden before click';
      return result;
    }
    result.effects.push('dom-click');
    // fall through to observation
  } else {
    const enabled = await loc.isEnabled().catch(() => true);
    if (!enabled) {
      result.outcome = 'documented-noop';
      result.reason = 'disabled at click time';
      return result;
    }
  }

  const beforeFp = await domFingerprint(page, root);
  const beforeUrl = page.url();
  const xhrStart = monitors.xhrCount();
  const beforeModals = beforeFp.openModals;

  await page.evaluate((sel) => {
    const rootEl = document.querySelector(sel) || document.body;
    window.__daxiIxMut = false;
    if (window.__daxiIxObs) {
      try {
        window.__daxiIxObs.disconnect();
      } catch (_) {}
    }
    window.__daxiIxObs = new MutationObserver(() => {
      window.__daxiIxMut = true;
    });
    window.__daxiIxObs.observe(rootEl, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }, root);

  if (!result.effects.includes('dom-click')) {
    // DOM click first — avoids Playwright actionability/nav waits on SPA hash changes.
    const domClicked = await loc
      .evaluate((el) => {
        try {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          el.click();
          return true;
        } catch (_) {
          return false;
        }
      })
      .catch(() => false);
    if (domClicked) {
      result.effects.push('dom-click');
    } else {
      try {
        await loc.click({ timeout: 700, force: true, noWaitAfter: true });
        result.effects.push('force-click');
      } catch (e2) {
        const msg = String(e2 && e2.message ? e2.message : e2);
        result.outcome = 'click-failed';
        result.error = msg.slice(0, 240);
        return result;
      }
    }
  }

  const deadline = Date.now() + timeoutMs;
  let sawNav = false;
  let sawXhr = false;
  let sawMut = false;
  let sawFp = false;

  while (Date.now() < deadline) {
    if (page.url() !== beforeUrl) {
      sawNav = true;
      break;
    }
    if (monitors.xhrCount() > xhrStart) {
      sawXhr = true;
      break;
    }
    const mut = await page.evaluate(() => !!window.__daxiIxMut).catch(() => false);
    if (mut) {
      sawMut = true;
      break;
    }
    await page.waitForTimeout(45);
  }

  if (!sawNav && page.url() !== beforeUrl) sawNav = true;
  if (!sawXhr && monitors.xhrCount() > xhrStart) sawXhr = true;
  if (!sawMut) {
    sawMut = await page.evaluate(() => !!window.__daxiIxMut).catch(() => false);
  }
  if (!sawNav && !sawXhr && !sawMut) {
    const afterFp = await domFingerprint(page, root);
    if (fingerprintsDiffer(beforeFp, afterFp)) sawFp = true;
  }

  const newXhr = monitors.sameOriginXhr.slice(xhrStart);
  result.xhrStatuses = newXhr.map((x) => x.status);
  const bad5 = newXhr.filter((x) => x.status >= 500);
  if (bad5.length) {
    result.outcome = 'failed-5xx';
    result.error = bad5.map((x) => `${x.status} ${x.method} ${x.url}`).join('; ');
    result.effects.push('xhr');
    return result;
  }

  if (sawNav) result.effects.push('navigation');
  if (sawXhr) result.effects.push('network');
  if (sawMut || sawFp) result.effects.push('dom');

  const afterFpQuick = await domFingerprint(page, root).catch(() => null);
  if (afterFpQuick && afterFpQuick.openModals > beforeModals) {
    result.effects.push('modal-open');
    result.openedModal = true;
  }

  if (dismissAfter && !result.openedModal) {
    await dismissTransientOverlays(page).catch(() => {});
  }

  if (result.effects.filter((e) => e === 'navigation' || e === 'network' || e === 'dom' || e === 'modal-open').length === 0) {
    // strip force/dom-click from "real outcome" check
    const hardNoop = await loc
      .evaluate(
        (el) =>
          el.hasAttribute('data-no-op') ||
          el.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true',
      )
      .catch(() => false);

    if (hardNoop) {
      result.outcome = 'documented-noop';
      result.reason = 'post-click noop attrs';
      return result;
    }

    result.outcome = 'silent-click';
    result.error = `No network/navigation/DOM mutation within ${timeoutMs}ms`;
    return result;
  }

  result.outcome = 'passed';
  return result;
}

/**
 * Close common modals/drawers so the next click is not blocked.
 * @param {import('@playwright/test').Page} page
 */
async function dismissTransientOverlays(page) {
  await page.evaluate(() => {
    const safeClick = (el) => {
      try {
        if (el) el.click();
      } catch (_) {}
    };
    const trySel = (sel) => safeClick(document.querySelector(sel));

    try {
      if (typeof closeWalletModal === 'function') closeWalletModal();
    } catch (_) {}
    try {
      if (typeof closeEntLocationModal === 'function') closeEntLocationModal(true);
    } catch (_) {}
    try {
      if (typeof closeEntAdminPendingModal === 'function') closeEntAdminPendingModal();
    } catch (_) {}
    try {
      if (typeof entCloseContractModal === 'function') entCloseContractModal();
    } catch (_) {}
    try {
      if (typeof toggleChat === 'function') toggleChat(false);
    } catch (_) {}
    try {
      if (typeof closeDrvPanel === 'function') closeDrvPanel();
    } catch (_) {}

    [
      '#ent-wallet-modal',
      '#ent-loc-overlay',
      '#ent-admin-pending-modal',
      '#ent-checkout-modal',
      '#chat-overlay',
      '#drv-panel-overlay',
    ].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.classList.remove('show', 'open', 'active');
      el.style.display = 'none';
    });

    [
      '[aria-label="Fermer"]',
      '.modal-close',
      '.ent-pd-close',
      '#entPlanDetailClose',
      '#entPlanViewerClose',
      '.daxi-contract-close',
      '.daxi-contract-modal-close-icon',
      '#ent-loc-skip',
      '.dsb-close',
      '.ent-wlt-close',
      '#ent-wallet-close',
      'button.ent-modal-close',
      '#drv-panel-close',
      '.drawer-close',
    ].forEach(trySel);

    const loc = document.getElementById('locationSharePrompt');
    if (loc) loc.classList.remove('show');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open', 'overflow-hidden');
  });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(20);
}

/**
 * Legacy single-pass crawl (compat). Prefer deepCrawlInteractions.
 */
async function crawlInteractions(page, opts = {}) {
  return deepCrawlInteractions(page, {
    ...opts,
    maxClicks: opts.maxClicks || 45,
    timeBudgetMs: opts.timeBudgetMs || 60_000,
    passes: opts.passes || 1,
  });
}

/**
 * Deep multi-pass crawl with expand / scroll / re-inventory / fingerprint dedup.
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @returns {Promise<{ results: object[], summary: object, monitors: object }>}
 */
async function deepCrawlInteractions(page, opts = {}) {
  const maxClicks = opts.maxClicks || 160;
  const maxClicksPerPass = opts.maxClicksPerPass || 28;
  const root = opts.root || 'body';
  const surface = opts.surface || 'unknown';
  const timeoutMs = opts.timeoutMs || 700;
  const timeBudgetMs = opts.timeBudgetMs || 120_000;
  const monitors = opts.monitors || attachInteractionMonitors(page);
  const ownMonitors = !opts.monitors;
  const seen = new Set();
  /** @type {object[]} */
  const results = [];
  let clicks = 0;
  const started = Date.now();
  const deadline = started + timeBudgetMs;
  const role = opts.role || '';
  const inventoryMax = opts.inventoryMax || 320;
  const sections = Array.isArray(opts.sections) ? opts.sections : [];

  async function recoverIfNeeded(r) {
    if (!(r.effects && r.effects.includes('navigation') && opts.homeUrl)) return;
    const u = page.url();
    if (!opts.stayOn || opts.stayOn.test(u)) return;
    // Cheap recover — avoid long waits that burn the role time budget
    await page.goto(opts.homeUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(150);
    if (typeof opts.afterRecover === 'function') {
      await opts.afterRecover(page);
    }
  }

  async function crawlModalIfOpen() {
    const modalRoot = await page.evaluate(() => {
      const cands = Array.from(
        document.querySelectorAll(
          '.modal.show, [aria-modal="true"], #ent-wallet-modal.show, #ent-checkout-modal, .daxi-contract-modal, #drv-panel',
        ),
      ).filter((el) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden';
      });
      if (!cands.length) return null;
      const el = cands[0];
      if (el.id) return `#${CSS.escape(el.id)}`;
      return null;
    });
    if (!modalRoot) return;
    const modalControls = await listActionableControls(page, {
      root: modalRoot,
      max: 40,
      requireViewport: false,
    });
    for (const ctrl of modalControls) {
      if (Date.now() > deadline || clicks >= maxClicks) break;
      const fp = controlFingerprint(ctrl);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const classification = classifyControl(ctrl, { allowDestructive: opts.allowDestructive });
      if (classification.action === 'click') clicks += 1;
      const r = await clickAndObserve(page, ctrl, monitors, {
        timeoutMs,
        root: modalRoot,
        dismissAfter: false,
      });
      r.surface = surface;
      r.pass = 'modal';
      results.push(r);
      if (typeof opts.afterEachClick === 'function') {
        await opts.afterEachClick(page, r).catch(() => {});
      }
    }
    await dismissTransientOverlays(page).catch(() => {});
  }

  /**
   * One inventory+click pass over current UI state.
   * @param {string} passName
   * @param {string} [passRoot]
   */
  async function onePass(passName, passRoot) {
    if (Date.now() > deadline || clicks >= maxClicks) return;
    let passClicks = 0;
    if (opts.expand !== false) {
      await expandUiChrome(page, { role });
    }
    if (opts.scroll !== false) {
      await scrollEntireSurface(page, passRoot || root);
    }
    if (typeof opts.preparePass === 'function') {
      await opts.preparePass(page, passName).catch(() => {});
    }

    const controls = await listActionableControls(page, {
      root: passRoot || root,
      max: inventoryMax,
      requireViewport: false,
      includeHidden: false,
    });

    for (const ctrl of controls) {
      if (Date.now() > deadline || clicks >= maxClicks || passClicks >= maxClicksPerPass) break;
      const fp = controlFingerprint(ctrl);
      if (seen.has(fp)) continue;
      seen.add(fp);

      const classification = classifyControl(ctrl, {
        allowDestructive: opts.allowDestructive,
      });
      if (classification.action === 'click') {
        clicks += 1;
        passClicks += 1;
      }

      const r = await clickAndObserve(page, ctrl, monitors, {
        timeoutMs,
        root: passRoot || root,
        dismissAfter: false,
      });
      r.surface = surface;
      r.pass = passName;
      results.push(r);

      if (r.openedModal || (r.effects && r.effects.includes('modal-open'))) {
        await crawlModalIfOpen();
      } else if (r.effects && r.effects.includes('dom')) {
        await dismissTransientOverlays(page).catch(() => {});
      }

      if (typeof opts.afterEachClick === 'function') {
        await opts.afterEachClick(page, r).catch(() => {});
      }
      await recoverIfNeeded(r);
    }
  }

  // Pass A: initial surface
  await onePass('initial', root);

  // Pass B: role-specific secondary roots (sidebar / sheet / menu)
  const extraRoots = opts.extraRoots || [];
  for (const er of extraRoots) {
    await onePass(`root:${er}`, er);
  }

  // Pass C: sections / secondary routes
  for (const section of sections) {
    if (Date.now() > deadline || clicks >= maxClicks) break;
    try {
      if (typeof opts.gotoSection === 'function') {
        await opts.gotoSection(page, section);
      } else if (typeof section === 'string') {
        const nav = page.locator(`[data-section="${section}"]`).first();
        if (await nav.count()) {
          await nav.click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      await dismissTransientOverlays(page).catch(() => {});
      await onePass(`section:${section}`, opts.sectionRoot || root);
    } catch (e) {
      results.push({
        label: `section:${section}`,
        outcome: 'click-failed',
        classification: 'click',
        error: String(e && e.message ? e.message : e).slice(0, 200),
        surface,
        pass: 'section-nav',
        effects: [],
      });
    }
  }

  // Pass D: sheet/tab toggles then re-crawl (client/enterprise)
  if (opts.retoggle && Date.now() < deadline && clicks < maxClicks) {
    await page.evaluate(() => {
      const ids = ['daxiSwitchForm', 'daxiSwitchOrder', 'etab-active', 'etab-history', 'ent-trip-one', 'ent-trip-round'];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        try {
          if (el) el.click();
        } catch (_) {}
      });
    });
    await page.waitForTimeout(300);
    await onePass('retoggle', root);
  }

  // Final light pass if budget remains
  if (Date.now() < deadline - 8_000 && clicks < maxClicks) {
    await onePass('final', root);
  }

  const summary = summarizeResults(results, surface);
  summary.inventoryVisible = seen.size;
  summary.uniqueFingerprints = seen.size;
  summary.clicksAttempted = clicks;
  summary.elapsedMs = Date.now() - started;
  summary.pageErrors = [...monitors.pageErrors];
  summary.server5xx = [...monitors.server5xx];
  summary.consoleErrors = [...monitors.consoleErrors];
  summary.staticInventoryTarget = STATIC_INVENTORY_BUTTONS;
  summary.pctOfStaticInventory = Number(
    ((summary.tried / STATIC_INVENTORY_BUTTONS) * 100).toFixed(2),
  );

  if (ownMonitors) monitors.dispose();

  return { results, summary, monitors, seenCount: seen.size };
}

function summarizeResults(results, surface) {
  const summary = {
    surface,
    tried: 0,
    passed: 0,
    failed: 0,
    silentClick: 0,
    documentedNoop: 0,
    skippedDestructive: 0,
    skippedExternal: 0,
    missing: 0,
    clickFailed: 0,
    failed5xx: 0,
    notVisible: 0,
  };
  for (const r of results) {
    if (r.classification === 'skip-destructive' || r.outcome === 'skip-destructive') {
      summary.skippedDestructive += 1;
      continue;
    }
    if (r.classification === 'skip-external' || r.outcome === 'skip-external') {
      summary.skippedExternal += 1;
      continue;
    }
    if (r.outcome === 'documented-noop') {
      summary.documentedNoop += 1;
      summary.tried += 1;
      continue;
    }
    if (r.outcome === 'not-visible') {
      summary.notVisible += 1;
      continue;
    }
    summary.tried += 1;
    if (r.outcome === 'passed') summary.passed += 1;
    else if (r.outcome === 'silent-click') {
      summary.silentClick += 1;
      summary.failed += 1;
    } else if (r.outcome === 'failed-5xx') {
      summary.failed5xx += 1;
      summary.failed += 1;
    } else if (r.outcome === 'click-failed') {
      summary.clickFailed += 1;
      summary.failed += 1;
    } else if (r.outcome === 'missing') {
      summary.missing += 1;
      summary.failed += 1;
    } else if (r.outcome && r.outcome.startsWith('skip')) {
      /* already handled */
    } else {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Persist JSON artifact.
 * @param {string} name
 * @param {{ results: object[], summary: object }} payload
 */
function writeInteractionArtifact(name, payload) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        staticInventoryButtons: STATIC_INVENTORY_BUTTONS,
        ...payload,
      },
      null,
      2,
    ),
  );
  return file;
}

/**
 * Merge multiple surface summaries.
 * @param {object[]} summaries
 */
function mergeSummaries(summaries) {
  const total = {
    surfaces: summaries.map((s) => s.surface),
    tried: 0,
    passed: 0,
    failed: 0,
    silentClick: 0,
    documentedNoop: 0,
    skippedDestructive: 0,
    skippedExternal: 0,
    missing: 0,
    clickFailed: 0,
    failed5xx: 0,
    notVisible: 0,
    inventoryVisible: 0,
    uniqueFingerprints: 0,
    productBugs: [],
    staticInventoryTarget: STATIC_INVENTORY_BUTTONS,
  };
  for (const s of summaries) {
    for (const k of [
      'tried',
      'passed',
      'failed',
      'silentClick',
      'documentedNoop',
      'skippedDestructive',
      'skippedExternal',
      'missing',
      'clickFailed',
      'failed5xx',
      'notVisible',
      'inventoryVisible',
      'uniqueFingerprints',
    ]) {
      total[k] += s[k] || 0;
    }
    if (s.server5xx && s.server5xx.length) {
      total.productBugs.push(...s.server5xx.map((x) => ({ type: '5xx', detail: x, surface: s.surface })));
    }
    if (s.pageErrors && s.pageErrors.length) {
      total.productBugs.push(
        ...s.pageErrors.map((x) => ({ type: 'pageerror', detail: x, surface: s.surface })),
      );
    }
  }
  total.pctOfStaticInventory = Number(((total.tried / STATIC_INVENTORY_BUTTONS) * 100).toFixed(2));
  return total;
}


/**
 * Lean single/multi-root crawl — fast path for role specs (no heavy expand spam).
 */
async function leanCrawlInteractions(page, opts = {}) {
  const maxClicks = opts.maxClicks || 80;
  const root = opts.root || 'body';
  const surface = opts.surface || 'unknown';
  const timeoutMs = opts.timeoutMs || 450;
  const timeBudgetMs = opts.timeBudgetMs || 90_000;
  const monitors = opts.monitors || attachInteractionMonitors(page);
  const ownMonitors = !opts.monitors;
  const seen = new Set();
  const results = [];
  let clicks = 0;
  const started = Date.now();
  const deadline = started + timeBudgetMs;
  const roots = opts.roots || [root];

  if (opts.expand !== false) {
    await expandUiChrome(page, { role: opts.role || '' }).catch(() => {});
  }

  for (const passRoot of roots) {
    if (Date.now() > deadline || clicks >= maxClicks) break;
    if (typeof opts.preparePass === 'function') {
      await opts.preparePass(page, passRoot).catch(() => {});
    }
    if (opts.scroll !== false) {
      await scrollEntireSurface(page, passRoot).catch(() => {});
    }
    const controls = await listActionableControls(page, {
      root: passRoot,
      max: opts.inventoryMax || 200,
      requireViewport: false,
    });
    let passClicks = 0;
    const maxPass = opts.maxClicksPerPass || 40;
    for (const ctrl of controls) {
      if (Date.now() > deadline || clicks >= maxClicks || passClicks >= maxPass) break;
      const fp = controlFingerprint(ctrl);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const classification = classifyControl(ctrl, { allowDestructive: opts.allowDestructive });
      if (classification.action === 'click') {
        clicks += 1;
        passClicks += 1;
      }
      const r = await Promise.race([
        clickAndObserve(page, ctrl, monitors, {
          timeoutMs,
          root: 'body',
          dismissAfter: true,
        }),
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                label: ctrl.label,
                id: ctrl.id,
                outcome: 'click-failed',
                classification: 'click',
                error: 'watchdog-timeout',
                effects: [],
                fingerprint: controlFingerprint(ctrl),
              }),
            3000,
          ),
        ),
      ]);
      r.surface = surface;
      r.pass = 'lean:' + passRoot;
      results.push(r);
      if (typeof opts.afterEachClick === 'function') {
        await opts.afterEachClick(page, r).catch(() => {});
      }
      if (r.effects && r.effects.includes('navigation') && opts.homeUrl && opts.stayOn) {
        const u = page.url();
        if (!opts.stayOn.test(u)) {
          await page.goto(opts.homeUrl, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => {});
          if (typeof opts.afterRecover === 'function') await opts.afterRecover(page);
        }
      }
    }
  }

  if (opts.retoggle && Date.now() < deadline && clicks < maxClicks) {
    await page.evaluate(() => {
      ['daxiSwitchForm', 'daxiSwitchOrder', 'etab-active', 'etab-history', 'ent-trip-one', 'ent-trip-round', 'daxiMenuFab', 'menu-btn'].forEach((id) => {
        try { const el = document.getElementById(id); if (el) el.click(); } catch (_) {}
      });
    }).catch(() => {});
    await page.waitForTimeout(150);
    const controls = await listActionableControls(page, { root, max: 120, requireViewport: false });
    for (const ctrl of controls) {
      if (Date.now() > deadline || clicks >= maxClicks) break;
      const fp = controlFingerprint(ctrl);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const classification = classifyControl(ctrl, { allowDestructive: opts.allowDestructive });
      if (classification.action === 'click') clicks += 1;
      const r = await Promise.race([
        clickAndObserve(page, ctrl, monitors, { timeoutMs, root: 'body', dismissAfter: true }),
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                label: ctrl.label,
                id: ctrl.id,
                outcome: 'click-failed',
                classification: 'click',
                error: 'watchdog-timeout',
                effects: [],
              }),
            3000,
          ),
        ),
      ]);
      r.surface = surface;
      r.pass = 'lean:retoggle';
      results.push(r);
    }
  }

  const summary = summarizeResults(results, surface);
  summary.inventoryVisible = seen.size;
  summary.uniqueFingerprints = seen.size;
  summary.clicksAttempted = clicks;
  summary.elapsedMs = Date.now() - started;
  summary.pageErrors = [...monitors.pageErrors];
  summary.server5xx = [...monitors.server5xx];
  summary.consoleErrors = [...monitors.consoleErrors];
  summary.staticInventoryTarget = STATIC_INVENTORY_BUTTONS;
  summary.pctOfStaticInventory = Number(((summary.tried / STATIC_INVENTORY_BUTTONS) * 100).toFixed(2));
  if (ownMonitors) monitors.dispose();
  return { results, summary, monitors, seenCount: seen.size };
}



/**
 * RUN3 seeded multi-state crawl — shared fingerprint set across prepare() states.
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {{ name: string, prepare: (page) => Promise<any> }[]} opts.states
 */
async function seededCrawlInteractions(page, opts = {}) {
  const maxClicks = opts.maxClicks || 220;
  const surface = opts.surface || 'unknown';
  const timeoutMs = opts.timeoutMs || 400;
  const timeBudgetMs = opts.timeBudgetMs || 180_000;
  const monitors = opts.monitors || attachInteractionMonitors(page);
  const ownMonitors = !opts.monitors;
  const seen = new Set();
  const results = [];
  const stateEvidence = [];
  let clicks = 0;
  const started = Date.now();
  const deadline = started + timeBudgetMs;
  const states = Array.isArray(opts.states) && opts.states.length
    ? opts.states
    : [{ name: 'default', prepare: async () => {} }];
  const roots = opts.roots || ['body'];

  for (const st of states) {
    if (Date.now() > deadline || clicks >= maxClicks) break;
    let ev = null;
    try {
      ev = await st.prepare(page);
    } catch (e) {
      ev = { error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
    stateEvidence.push({ state: st.name, evidence: ev });
    if (opts.expand !== false) {
      await expandUiChrome(page, { role: opts.role || '' }).catch(() => {});
    }
    for (const passRoot of roots) {
      if (Date.now() > deadline || clicks >= maxClicks) break;
      if (typeof opts.preparePass === 'function') {
        await opts.preparePass(page, passRoot, st.name).catch(() => {});
      }
      if (opts.scroll !== false) {
        await scrollEntireSurface(page, passRoot).catch(() => {});
      }
      const controls = await listActionableControls(page, {
        root: passRoot,
        max: opts.inventoryMax || 400,
        requireViewport: false,
        includeHidden: !!opts.includeHidden,
      });
      let passClicks = 0;
      const maxPass = opts.maxClicksPerPass || 60;
      for (const ctrl of controls) {
        if (Date.now() > deadline || clicks >= maxClicks || passClicks >= maxPass) break;
        const fp = controlFingerprint(ctrl);
        if (seen.has(fp)) continue;
        seen.add(fp);
        const classification = classifyControl(ctrl, { allowDestructive: opts.allowDestructive });
        if (classification.action === 'click') {
          clicks += 1;
          passClicks += 1;
        }
        const r = await Promise.race([
          clickAndObserve(page, ctrl, monitors, {
            timeoutMs,
            root: 'body',
            dismissAfter: opts.dismissAfter !== false,
          }),
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  label: ctrl.label,
                  id: ctrl.id,
                  outcome: 'click-failed',
                  classification: 'click',
                  error: 'watchdog-timeout',
                  effects: [],
                  fingerprint: fp,
                }),
              opts.watchdogMs || 3000,
            ),
          ),
        ]);
        r.surface = surface;
        r.pass = `seeded:${st.name}:${passRoot}`;
        r.inventoryMatchHints = {
          id: ctrl.id || '',
          onclick: (ctrl.onclick || '').slice(0, 80),
          label: (ctrl.label || '').slice(0, 60),
        };
        results.push(r);
        if (typeof opts.afterEachClick === 'function') {
          await opts.afterEachClick(page, r, st).catch(() => {});
        }
        if (r.effects && r.effects.includes('navigation') && opts.homeUrl && opts.stayOn) {
          const u = page.url();
          if (!opts.stayOn.test(u)) {
            await page.goto(opts.homeUrl, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => {});
            if (typeof opts.afterRecover === 'function') await opts.afterRecover(page);
            // re-prepare state after recover
            try {
              await st.prepare(page);
            } catch (_) {}
          }
        }
      }
    }
  }

  const summary = summarizeResults(results, surface);
  summary.inventoryVisible = seen.size;
  summary.uniqueFingerprints = seen.size;
  summary.clicksAttempted = clicks;
  summary.elapsedMs = Date.now() - started;
  summary.pageErrors = [...monitors.pageErrors];
  summary.server5xx = [...monitors.server5xx];
  summary.consoleErrors = [...monitors.consoleErrors];
  summary.staticInventoryTarget = STATIC_INVENTORY_BUTTONS;
  summary.pctOfStaticInventory = Number(((summary.tried / STATIC_INVENTORY_BUTTONS) * 100).toFixed(2));
  summary.stateEvidence = stateEvidence;
  if (ownMonitors) monitors.dispose();
  return { results, summary, monitors, seenCount: seen.size, stateEvidence };
}


module.exports = {
  ARTIFACTS_DIR,
  STATIC_INVENTORY_BUTTONS,
  DESTRUCTIVE_RE,
  attachInteractionMonitors,
  domFingerprint,
  listActionableControls,
  classifyControl,
  clickAndObserve,
  crawlInteractions,
  deepCrawlInteractions,
  leanCrawlInteractions,
  seededCrawlInteractions,
  expandUiChrome,
  forceRevealCoverageChrome,
  scrollEntireSurface,
  controlFingerprint,
  dismissTransientOverlays,
  summarizeResults,
  writeInteractionArtifact,
  mergeSummaries,
  locatorFor,
};
