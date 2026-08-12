# Step 5E — Canonical Money Received integration reconcile

## 1. Branch, baseline and HEAD

| Field | Value |
| --- | --- |
| Integration branch | `integration/money-received-canonical-5e` |
| Created from | `origin/master` @ `1a573a09cac8d4b38768060ce82d30e1c824b33f` |
| Prior feature branch | `reporting-phase1-money-received` @ baseline `e14cf8cde0144e5715d51550d1524c3f622025b8` (uncommitted vertical) |
| Reconcile status | Applied onto integration branch; **uncommitted** pending explicit commit instruction |

## 2. Objective result

Canonical Step 3R / Step 5 Money Received contract wins on the integration branch.

Parent `SalesInvoice` RETURNED/VOID status **does not** exclude confirmed historical receipts.

## 3. PR #84 conflicts found

| Conflict | Detail |
| --- | --- |
| Path clash | `lib/reports/money-received.ts` (flat) vs canonical `lib/reports/money-received/` directory |
| Semantic | PR #84 applied `paymentStatus: { notIn: REPORTING_EXCLUDED_SALE_STATUSES }` (`RETURNED`/`VOID`) on receipt inclusion SQL and Prisma `where` |
| Status predicate | PR #84 used `status notIn FAILED/CANCELLED/VOID` (could include PENDING); canonical uses **CONFIRMED-only** |
| Consumers | Trading Dashboard imported `getMoneyReceivedSummary` and still had a parallel `salesPayment.groupBy` with parent RETURNED/VOID |
| today-kpis / weekly-digest | Independent `salesPayment` aggregates/groupBys with parent RETURNED/VOID on receipt paths |
| Nav / deep link | `/reports/receipts` labelled Money Received; `moneyReceivedHref` pointed at receipts |
| Tests | `dashboard-clarity` and PG scale tests read `lib/reports/money-received.ts` |

## 4. Reconciliation actions

1. Created `integration/money-received-canonical-5e` from latest `origin/master`.
2. Removed flat `lib/reports/money-received.ts`.
3. Restored canonical module under `lib/reports/money-received/` (query/service/export/access/tests/page/export route + Step 3R/4/5 docs/validators).
4. Added `lib/reports/money-received/trading-surface.ts` — PR #84 trading/receipts APIs (`getMoneyReceivedSummary`, `listMoneyReceivedPayments`, method buckets) **without** parent-sale exclusion; **CONFIRMED-only**.
5. Re-exported trading-surface from `lib/reports/money-received/index.ts` so `@/lib/reports/money-received` resolves to the canonical package.
6. Trading Dashboard: removed duplicate receipt `groupBy` with parent RETURNED/VOID; keeps `getMoneyReceivedSummary`.
7. `today-kpis.ts` / `weekly-digest.ts`: migrated receipt splits to `aggregateMoneyReceivedByMethod` / `aggregateConfirmedReceiptsThroughAsOf`.
8. Nav + hub: primary **Payments & Money Received** → `/reports/money-received`; receipts retained as **Receipt transactions**.
9. `moneyReceivedHref` → `/reports/money-received`.
10. Updated clarity / consumer-parity / PG scale source-path assertions.
11. Regenerated Prisma client (schema already included `receiptOrigin` from PR #85).

## 5. Parent-sale status exclusion

**Removed / neutralised** in Money Received receipt inclusion:

- `trading-surface.ts` SQL and Prisma `where` have **no** `si.paymentStatus NOT IN (RETURNED, VOID)`.
- Canonical `query.ts` confirmed payment where has **no** parent `paymentStatus` filter.
- Remaining RETURNED/VOID filters in dashboard/today-kpis/weekly-digest are **sales** aggregates only.

## 6. Files reconciled (primary)

### Canonical module
- `lib/reports/money-received/**` (including new `trading-surface.ts`)

### Surfaces
- `app/(protected)/reports/money-received/page.tsx`
- `app/(protected)/exports/money-received/route.ts`
- `app/(protected)/reports/receipts/page.tsx` (unchanged import path; now hits canonical package)

### Consumers / nav
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`
- `lib/reports/today-kpis.ts`
- `lib/reports/weekly-digest.ts`
- `lib/navigation-config.ts`
- `lib/reports/reporting-scope.ts`
- `app/(protected)/reports/page.tsx`

### Tests / docs
- `lib/reports/dashboard-clarity.test.ts`
- `lib/reports/money-received-scale.pg.test.ts`
- `lib/reports/money-received/money-received-consumer-parity.test.ts`
- `docs/reporting/STEP_3R_4R_…`, `STEP_4_…`, `STEP_5A–5D`, validators, this Step 5E report

### Removed
- `lib/reports/money-received.ts` (flat PR #84 module)

## 7. Validator results

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED
```

## 8. Focused test results

```
npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts lib/reports/money-received-method.test.ts
 Test Files  6 passed | 4 skipped (10)
      Tests  76 passed | 18 skipped (94)
```

(PG suites skipped locally without Postgres smoke env — expected.)

## 9. TypeScript / ESLint / build

```
npx prisma generate
(exit 0)

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)

$env:NODE_OPTIONS='--max-old-space-size=8192'; npx next build
(exit 0)
```

Build includes `ƒ /reports/money-received` and `ƒ /exports/money-received` (and retained `ƒ /reports/receipts`).

## 10. Hosted preview readiness

**Ready for hosted preview validation** on this integration branch, after an explicit commit of in-scope files (work is currently uncommitted).

Still required before production:

- Real auth/session access
- Deployed page + export routes
- Real Postgres behaviour
- Tenant/branch scoping on preview
- No production DB mutation

## 11. Remaining limitations / blockers

| Item | Status |
| --- | --- |
| Uncommitted reconcile on integration branch | Process gate — commit when instructed |
| Hosted preview not yet run | Required before production |
| PG smoke suites skipped locally | Run in CI/preview Postgres |
| Origin-split display on Trading/receipts | Informational via `receiptOrigin`; Phase 1 metrics remain CONFIRMED Money Received |
| No push / deploy / production migration | Confirmed not performed |

## 12. Final verdict

INTEGRATION RECONCILE PASSED — ready for hosted preview validation after committing in-scope files on `integration/money-received-canonical-5e`.
