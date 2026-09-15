# DAXI E2E (Playwright) — Phases 2–4

Self-contained under `e2e/`. Base URL: `DAXI_BASE_URL` (default `http://127.0.0.1:8000`).

## Prerequisites

- Node.js 18+ (Windows OK)
- Python 3.x for the inventory script
- Django project runnable locally

## Start Django

From the project root (path has parentheses — use `-LiteralPath`):

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\Coding project\Julmin Taxis (vrai)\julmin_taxis_django'
.\venv\Scripts\Activate.ps1
python manage.py runserver 127.0.0.1:8000
```

Or use `run.bat` if that is your usual entrypoint.

Seed admin/dashboard test rows (optional, for later admin specs):

```powershell
python manage.py seed_admin_test_data
# optional: python manage.py seed_admin_test_data --clean --verify
```

## Install Playwright (once)

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\Coding project\Julmin Taxis (vrai)\julmin_taxis_django\e2e'
npm install
npx playwright install chromium
```

## Run interaction inventory (Phase 2)

From project root:

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\Coding project\Julmin Taxis (vrai)\julmin_taxis_django'
python tools\daxi_interaction_inventory.py
```

Or from `e2e/`: `npm run inventory`

Outputs land in `e2e/artifacts/inventory/`. Commit `INVENTORY_SUMMARY.md` + `README.md`; large JSON dumps are gitignored.

## Run smoke (Phase 3)

With Django already serving on `:8000`:

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\Coding project\Julmin Taxis (vrai)\julmin_taxis_django\e2e'
$env:DAXI_BASE_URL = 'http://127.0.0.1:8000'
npm run test:smoke
```

Full suite: `npm test`

## Fixtures / login helpers (Phase 4)

See `fixtures/auth.js`:

| Helper | Role | Notes |
|--------|------|--------|
| `login_as_client` | Client | `POST /api/auth/login/` → localStorage JWT → `storageState` |
| `login_as_driver` | Driver | UI `/driver/login/` |
| `login_as_admin` | Admin | UI `/admin-dashboard/` |
| `login_as_enterprise` | Company | UI `/entreprise/` |

Copy `.env.e2e.example` → `.env.e2e` (gitignored via root `.env.*`) and fill placeholders. Saved states go to `e2e/artifacts/auth/*.json` (gitignored).

Geolocation stub: `shared/geolocation.js` (`mockGeolocation`, `CAP_HAITIEN`).

## Stub notes — OTP / WhatsApp / payments

- **OTP / WhatsApp**: Registration and some flows call WhatsApp/email OTP (`/api/auth/verify-otp/`, `send-otp/`, etc.). For e2e, use **pre-verified seed users** (or accounts created with OTP already satisfied). Do **not** ship production defaults that skip OTP. If Django later adds an explicit `DAXI_E2E_OTP_BYPASS=1` (DEBUG-only), document it here; until then, prefer seeded credentials.
- **WhatsApp Cloud API**: Leave `WHATSAPP_ACCESS_TOKEN` empty locally so outbound sends no-op / fail soft; tests must not depend on live Meta delivery.
- **Payments** (MonCash / HatexCard / Transak): Keep keys empty in `.env.e2e`. Prefer stubbing network in Playwright (`page.route`) for payment endpoints in future critical-flow specs. `TRANSAK_ENVIRONMENT=STAGING` is already the safer default when keys exist.
- **Maps / Firebase**: Missing keys may produce console noise; smoke allows a small pageerror allowlist in `client/home.smoke.spec.js` / `shared/errors.js`.

## Layout

```
e2e/
  package.json
  playwright.config.js
  client/          # client role specs
  driver/
  company/
  admin/
  shared/          # errors, geolocation
  critical-flows/
  fixtures/        # auth helpers
  pages/           # page objects
  artifacts/       # inventory, auth states, test-results (mostly gitignored)
  README.md
  .env.e2e.example
```

## Constraints

- Minimal product HTML changes; add `data-testid` only when a smoke/assertion truly needs it.
- Do not use `test.skip` to hide failures.
- Path-safe on Windows: always `Set-Location -LiteralPath` for this repo.
