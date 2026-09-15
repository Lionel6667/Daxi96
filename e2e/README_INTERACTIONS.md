# DAXI interaction crawl harness (RUN3 — ledger coverage)

Inventory-driven Playwright crawl with **real outcome** asserts
(network / navigation / DOM mutation). Silent clicks fail unless `disabled` /
`data-no-op` / classified noop.

## RUN3 goals

1. Seed rich UI states (checkout sheets, midflow trips, wallet/checkout modals, admin HTMX tables)
2. Multi-pass seeded crawl with fingerprint dedup
3. Account for **100%** of static `<button` inventory (683) in `COVERAGE_LEDGER.md`
4. Status per item: `tested_ok | tested_fail | unreachable_seeded_exhausted | duplicate_of | dead_code | excluded_vendor`

## Run

```bash
cd e2e
# refresh static button ledger
../.venv/bin/python ../tools/daxi_button_ledger_extract.py

DAXI_BASE_URL=http://127.0.0.1:8000 npx playwright test \
  admin/interactions.spec.js \
  client/interactions.spec.js \
  driver/interactions.spec.js \
  company/interactions.spec.js \
  shared/global-interactions.spec.js \
  --workers=1 --reporter=line

# merge ledger
../.venv/bin/python ../tools/daxi_coverage_ledger.py
```

Artifacts: `artifacts/interactions/*.json`, `_rollup.json`, `_coverage_ledger.json`  
Audit: `/workspace/daxi-audit/PHASE_FULL_INTERACTIONS_RUN3.md`, `COVERAGE_LEDGER.md`
