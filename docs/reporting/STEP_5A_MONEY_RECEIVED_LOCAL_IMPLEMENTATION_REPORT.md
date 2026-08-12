# Step 5A — Canonical Money Received local implementation report

## 1. Baseline and branch

| Field | Value |
| --- | --- |
| Local branch | `reporting-phase1-money-received` |
| Baseline SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| Review | Step 5A-R independent repair against the same baseline |

## 2. Frozen scope

Unchanged Phase 1 vertical: eight Money Received Metric IDs; tests `CT01`, `CT07`, `CT19`, `CT27`, `CT02G`, `CT11G`; surface Payments and Money Received only.

## 3. Repository findings

Unchanged authoritative models (`SalesPayment`, `SalesReturn`). Schema `SalesPayment.status` is non-null `String` (default `CONFIRMED`); null cannot normally be persisted. Unverified legacy therefore uses **unclassified** statuses (`status notIn` CONFIRMED/FAILED/CANCELLED/VOID/PENDING) per contract “once classified” language — not invented empty-string conventions. Pure fixtures still cover null for CT07.

## 4. Files changed (post 5A-R)

Canonical module under `lib/reports/money-received/` (including `access.ts`), surface/export routes, consumer migrations (`weekly-digest.ts`, `today-kpis.ts`, `TradingDashboardContent.tsx`), nav/hub links, focused tests, this report.

## 5. Canonical components implemented

Registry, scope clock, DB aggregation computation, quality, reconciliation, **DB-paginated** drill-down, streaming export, access resolver, Money Movement query service.

## 6. Metric implementation register

Unchanged formulas. Headlines now computed via Prisma `aggregate` / `groupBy`. Drill-down uses DB `skip`/`take`. Unverified = unclassified status set.

## 7. Conformance test implementation register

| Test ID | Outcome |
| --- | --- |
| CT01 | PASS |
| CT07 | PASS |
| CT19 | PASS |
| CT27 | PASS |
| CT02G | PASS (gate-only) |
| CT11G | PASS (gate-only) |

## 8. Economic-rule evidence

- Confirmed + unusual method → `money_received_other` (not unverified).
- Null/unclassified status → `unverified_legacy_receipts`.
- FAILED/PENDING/CANCELLED/VOID excluded.
- RETURNED parent preserves CONFIRMED receipt.
- Refund separate from receipt (CT01).
- Payment-reversal gated UNAVAILABLE (CT02G).

## 9. Scope and timezone evidence

Trusted `businessId` from auth actor; branch from authorised store list; CT27 Accra day bounds.

## 10. Quality-state evidence

UNVERIFIED when unclassified rows exist; QUERY_FAILED yields null values (not zero); empty success yields 0 COMPLETE.

## 11. Reconciliation evidence

Multi-page pure reconciliation; method breakdown equals headline; export stream reconciles to headline for 5000 and 5001 mocked rows; CT19 SCOPE_MISMATCH refuses claim.

## 12. Drill-down evidence

**True DB pagination** via `fetchDrillPage`: predicates in `where`, `orderBy: [{ receivedAt|createdAt: 'desc' }, { id: 'desc' }]`, `skip`/`take` only for the requested page. Headline totals from independent aggregates. Limitation: large offsets remain DB-engine offset scans (documented).

## 13. Product-surface evidence

`/reports/money-received` uses `computeMoneyReceivedBundle` (DB aggregates) + `drillDownForMetric(prisma, …)` (one page). Access via `resolveMoneyReceivedAccess`.

## 14. Export evidence

**Design A — complete stream:** `iterMoneyReceivedExportCsvChunks` iterates bounded DB pages (500) until exhausted; route returns `ReadableStream`; meta `exportCompleteness=COMPLETE_STREAM`; never emits `PARTIAL_EXPORT_CAP`. No silent omission.

## 15. Access-control evidence

Behavioural tests: Owner/Manager allowed; Cashier denied at export `requireExportUser`; foreign `businessId` query param → 403 TENANT_MISMATCH; unassigned branch → 403; export always scopes to `user.businessId`.

## 16. Performance evidence

| Proof | Result |
| --- | --- |
| Headline | `salesPayment.aggregate` |
| Methods | `salesPayment.groupBy` |
| Drill-down | single page `findMany` with skip/take (mocked call shape asserted) |
| Export | multipage bounded take≤500; 5001 rows complete |
| Loops | no per-receipt Prisma loop |
| Parent filter | absent on Money Received receipt queries |
| Not claimed | In-memory 5k fixture as DB scalability proof (removed) |

## 17. Migration and backfill impact

NONE.

## 18. Commands executed and unedited outputs

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED

npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts
 Test Files  4 passed (4)
      Tests  59 passed (59)

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received lib/reports/weekly-digest.ts lib/reports/today-kpis.ts app/(protected)/reports/dashboard/TradingDashboardContent.tsx --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)

npx next build
(exit 0)
```

## 19. Diff-scope audit

Phase 1 exclusions not implemented. Consumers of Money Received payment splits now call `aggregateMoneyReceivedByMethod` / `aggregateConfirmedReceiptsThroughAsOf` rather than duplicate filters. Sales invoice RETURNED/VOID filters for sales totals unchanged.

## 20. Known limitations and reserved gates

- DEP-PAY-3 / DEP-SALE-1 remain gated.
- Schema cannot store null status; unclassified-status detection is the DB control set; CT07 null proven in fixtures.
- Offset pagination: deep pages may be expensive in the DB engine.
- Liquid-asset path uses shared CONFIRMED-asOf helper (same inclusion rules), not a period `money_received` window — intentional for balance estimate.
- No preview/production deploy.

## 21. Local implementation verdict

LOCAL IMPLEMENTATION PASSED — ready for independent review before preview validation.
