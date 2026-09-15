# Admin role specs (Phase Admin)

Playwright E2E for `/admin-dashboard/`.

## Credentials

`manage.py create_demo_accounts`:

| Role  | Email           | Password        |
|-------|-----------------|-----------------|
| Admin | `admin@daxi.com`| `DemoDaxi2026!` |

Override: `DAXI_ADMIN_USER` / `DAXI_ADMIN_PASSWORD`.

Seed UI data: `manage.py seed_admin_test_data --clean --verify`.

## Run

```bash
# Django + FakeRedis on :8000 / :6379 (see Phase 5/8)
cd e2e
DAXI_BASE_URL=http://127.0.0.1:8000 npx playwright test admin/ --workers=1 --reporter=line
```

## Specs

| File | Coverage |
|------|----------|
| `dashboard.spec.js` | Login, shell, enterprises HTMX, price modal |
| `users.spec.js` | Clients table, search, row actions |
| `orders.spec.js` | Orders HTMX must not 500; propose price; assign modal |
| `drivers.spec.js` | Drivers API + HTMX partial; pending tab; search |

Helpers: `e2e/helpers/admin.js`, `resolveAdminCredentials` in `e2e/helpers/auth.js`.
