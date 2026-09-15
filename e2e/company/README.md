# Company / Enterprise role specs (Phase Enterprise)

Playwright E2E for `/entreprise/` + `/entreprise/dashboard/`.

## Credentials

`manage.py create_demo_accounts`:

| Role | Email | Password | Mode |
|------|-------|----------|------|
| Enterprise (self_order) | `demo.entreprise@daxi.ht` | `DemoDaxi2026!` | Commande directe |
| Enterprise (shared_code) | `demo.lien@daxi.ht` | `DemoDaxi2026!` | Lien partagé |

Override: `DAXI_ENTERPRISE_EMAIL` / `DAXI_ENTERPRISE_PASSWORD`.

Seed GPS + orders: `e2e/helpers/seed_enterprise_order.py ensure [--fresh]`.

## Run

```bash
# Django + FakeRedis on :8000 / :6379 (same as Phase Admin / 5 / 8)
cd e2e
DAXI_BASE_URL=http://127.0.0.1:8000 npx playwright test company/ --workers=1 --reporter=line
```

## Specs

| File | Coverage |
|------|----------|
| `dashboard.spec.js` | Login, wrong password, dashboard stats/cards, wallet modal, plans |
| `orders.spec.js` | Orders HTMX tabs, checkout accept_price / choose_payment, confirm-price |

Helpers: `e2e/helpers/enterprise.js`, `resolveEnterpriseCredentials` in `e2e/helpers/auth.js`.
