# DAXI E2E Phase 5–6 — Client critical + fragility specs

Prepared on the **agent box** under `/workspace/daxi-audit/e2e-phase5/`.  
Copy into the Windows Django project as `julmin_taxis_django/e2e/` (see `COPY_TO_PROJECT.md`).

These specs are **honest**: they need a running Django server + Chromium. They are **not** claimed green without that environment.

## Mapping to execution plan

| Spec | Phase | Plan item | MODIF |
|------|-------|-----------|--------|
| `client/booking.critical.spec.js` | **5** | Guest/client booking happy path; `POST /htmx/client/order/create/`; sheet « Ma course » | §§1–3 |
| `critical-flows/client-create-order.spec.js` | **5** | Slim CI smoke for create-order | §1 |
| `client/sheet-checkout-guard.spec.js` | **6** | HTMX sheet poll must not wipe phone/price/pay (`_daxiSheetSlotHasCheckoutFlow`) | §1–2 |
| `client/gps-relocate.spec.js` | **6** | Relocate thresholds 200 m / accuracy 80 m; GPS fail clears pickup | §1 |

Phases **3–4** (Playwright scaffold + auth fixtures) are assumed **before** these turn reliably green. Helpers here are self-contained stubs until Phase 4 `login_as_client` / `storageState` lands.

## Layout

```
e2e-phase5/
  client/
    booking.critical.spec.js
    sheet-checkout-guard.spec.js
    gps-relocate.spec.js
  critical-flows/
    client-create-order.spec.js
  helpers/
    auth.js          # baseUrl, requireEnvOrFail (no skip-to-hide)
    geo.js           # geolocation mock + relocate constants
    selectors.js     # tentative role/text/id candidates
  README_PHASE5.md
  COPY_TO_PROJECT.md
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `DAXI_BASE_URL` | `http://127.0.0.1:8000` | Django origin |
| `DAXI_E2E_LIVE` | unset | If `1`, annotate that destructive cleanup is allowed (tests still run when unset) |
| `DAXI_E2E_CLIENT_USER` / `DAXI_E2E_CLIENT_PASS` | — | Registered client login test (fails clearly if missing) |
| `DAXI_E2E_ORDER_WITH_MEETING_POINT` | — | Order id with `meeting_lat/lng` for live relocate modal |

**Policy:** do **not** `test.skip` to hide missing fixtures. Use `testInfo.annotations` + `requireEnvOrFail()`.

## How to run (once copied + Playwright installed)

```bash
# From project e2e/ (Node) — example; align with Phase 3 config
export DAXI_BASE_URL=http://127.0.0.1:8000
npx playwright test client/booking.critical.spec.js critical-flows/client-create-order.spec.js
npx playwright test client/sheet-checkout-guard.spec.js client/gps-relocate.spec.js
```

Python/pytest-playwright alternative (Phase 3 plan) can wrap the same URLs/selectors later; these files use `@playwright/test` (JS) as requested.

## Selectors to refine against `vubez2.html`

vubez2 has **few `data-testid`**. Specs prefer `getByRole` / `getByText` and known ids, with **TODO** comments for stable hooks.

| Concern | Current heuristic | Suggested testid |
|---------|-------------------|------------------|
| Pickup / départ | `#destinationAddress` (historical id) | `booking-pickup` |
| Dropoff | `#dropoffAddress` / placeholders | `booking-dropoff` |
| Submit create | button name Commander/Kòmande | `booking-submit` |
| Sheet tabs | Nouveau trajet / Ma course (i18n) | `sheet-tab-new-trip`, `sheet-tab-my-ride` |
| Sheet slot | `#daxi-sheet-slot` / `.daxi-sheet-slot` | `daxi-sheet-slot` |
| Order pills | `#daxi-order-pills` | `order-pills` |
| Phone / price / pay | text regex + synthetic markers | `checkout-phone-modal`, `checkout-price-modal`, `checkout-pay-modal` |
| Relocate prompt | « Écart de position » / créole | `relocate-prompt-modal` |
| GPS action | `.daxi-row-action` | `booking-gps-action` |
| Plan cards | text / `.daxi-plan-card` | `plan-card-<slug>` |

**Network contracts**

- Create: `POST /htmx/client/order/create/`
- Sheet poll: `GET /htmx/client/orders/sheet/`

**Guard under test:** `window._daxiSheetSlotHasCheckoutFlow` (name from MODIF §1). Synthetic checkout markers are used when live modals are not open so the suite remains runnable during fixture build-out.

## Relocate constants (assert / document)

From MODIFICATIONS §1 / `meeting_point_utils`:

- `RELOCATE_DRIFT_METERS` ≈ **200**
- `RELOCATE_MAX_ACCURACY_M` ≈ **80**

Inaccurate GPS alone must not open relocate; drift beyond 200 m with good accuracy (and an active meeting point) should.

## What success looks like later

1. Phase 3 config points `testDir` at `e2e/` (or these folders).
2. Phase 4 seeds guest + optional client storageState.
3. Phase 5 create-order green against disposable DB.
4. Phase 6 fragility red if `_daxiSheetSlotHasCheckoutFlow` or relocate thresholds regress.

Until then: treat failures for “server down” / “selector not found” as **environment/selector debt**, not silent skips.
