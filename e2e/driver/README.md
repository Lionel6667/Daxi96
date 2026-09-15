# Driver role specs (Phase 8)

| Spec | Asserts |
|------|---------|
| `login.spec.js` | `/driver/login/` form, wrong password error, demo login → `/driver/` + status session |
| `orders.spec.js` | Seeded Cap-Haïtien payable order in available list; accept → `driver_assigned` |
| `trip-flow.spec.js` | `on_way` → `arrived` → `in_progress` → `completed` via HTMX + proximity location |

Credentials: `demo.driver@daxi.ht` / `DemoDaxi2026!` (`manage.py create_demo_accounts`).  
Seed helper: `e2e/helpers/seed_driver_order.py`.
