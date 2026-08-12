# Step 5C — Canonical Money Received merge-readiness review

## 1. Branch, baseline and HEAD

| Field | Value |
| --- | --- |
| Branch | `reporting-phase1-money-received` |
| Baseline SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| HEAD SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| Working tree | Uncommitted Money Received vertical + Step 5A/5B/5C reports (no merge/push) |

Frozen validators both printed `VALIDATION PASSED` for Step 3R/4R contract and Step 4 architecture.

## 2. Review scope

Independent merge-readiness review of Phase 1 Canonical Money Received only.

Accepted Metric IDs: `money_received`, `money_received_cash`, `money_received_momo`, `money_received_card`, `money_received_transfer`, `money_received_other`, `unverified_legacy_receipts`, `refund_outflows`.

Accepted Test IDs: `CT01`, `CT07`, `CT19`, `CT27`, `CT02G`, `CT11G`.

Accepted surface: Payments and Money Received.

Prior: Step 5A-R PASSED; Step 5B PASSED as **local preview-equivalent** (not hosted preview).

## 3. Files reviewed

- `lib/reports/money-received/*` (module, access, preview-equivalent harness, tests)
- `app/(protected)/reports/money-received/page.tsx`
- `app/(protected)/exports/money-received/route.ts`
- `lib/reports/weekly-digest.ts`
- `lib/reports/today-kpis.ts`
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`
- `lib/navigation-config.ts`
- `app/(protected)/reports/page.tsx`
- `lib/reports/dashboard-clarity.test.ts`
- `docs/reporting/STEP_5A_MONEY_RECEIVED_LOCAL_IMPLEMENTATION_REPORT.md`
- `docs/reporting/STEP_5B_MONEY_RECEIVED_PREVIEW_VALIDATION_REPORT.md`
- Diff vs baseline for the above; confirmed no Prisma schema/migration changes for this vertical
- Out-of-scope noise present but not reviewed as product delivery: `tmp/**`, `tsconfig.tsbuildinfo`, unrelated contract-recovery artefacts under `docs/reporting/` / `tmp/`

## 4. Diff summary

Adds a new canonical Money Received vertical (DB aggregate/groupBy headlines, DB-paginated drill-down, streaming complete export, access resolver, registry/quality/reconcile), a dedicated report page and export route, minimal nav/hub links, and migrates weekly-digest / today-kpis / Trading Dashboard payment-receipt consumers onto the canonical boundary. No production migration. No unrelated reporting products implemented.

## 5. Defects found

1. **Drill query failure looked like empty success** — `fetchDrillPage` catch returned empty rows; export iteration could stop as if end-of-data.
2. **Consumer silent empty/zero on method aggregation failure** — weekly-digest, Trading Dashboard, and today-kpis payment splits could treat `queryFailed` as an empty method list.
3. **Liquid-assets operational path** — Money Received as-of aggregation failure could fall through as zero receipts.
4. **Weak tenant defense on drill row projection** — payment drill select omitted `salesInvoice.businessId` post-filter (where already scoped; defense-in-depth missing).
5. **UI drill-only failure messaging** — empty table messaging keyed only off headline `QUERY_FAILED`, not drill-page failure.
6. **Report honesty** — Step 5B stated no product defects; it had not exhaustively proven consumer query-failure ≠ zero (corrected for honesty).

## 6. Repairs made

- `query.ts`: `DrillPageResult.queryFailed`; `iterateDrillPages` throws on failure; `requireMoneyReceivedMethodRows`; drill payment rows filter `salesInvoice.businessId === scope.businessId`.
- `service.ts`: `drillDownForMetric` returns `reconcile.reason: 'QUERY_FAILED'` on page failure.
- `weekly-digest.ts`, `TradingDashboardContent.tsx`, `today-kpis.ts`: use `requireMoneyReceivedMethodRows`; liquid assets return `null` on receipt query failure instead of inventing zero.
- `page.tsx`: empty-state message includes drill `queryFailed` / `QUERY_FAILED`.
- `money-received.test.ts`: regression tests for drill failure, export iteration throw, and `requireMoneyReceivedMethodRows`.
- `preview-equivalent-db.ts`: include `businessId` on payment drill select mapping.
- `STEP_5B_…_REPORT.md`: honesty note pointing to Step 5C consumer silent-failure repairs.

## 7. Contract correctness review

| Rule | Result |
| --- | --- |
| Confirmed receipt increases `money_received` | PASS |
| Method split reconciles to headline | PASS |
| CONFIRMED unknown/other → `money_received_other` | PASS |
| Unclassified legacy → `unverified_legacy_receipts` | PASS |
| FAILED/PENDING/CANCELLED/VOID excluded | PASS |
| Parent RETURNED does not erase CONFIRMED receipt | PASS |
| Parent VOID sale does not erase CONFIRMED receipt | PASS |
| Refunds separate in `refund_outflows` | PASS |
| Receipts and refunds not netted | PASS |
| CT02G / CT11G gate-only | PASS |
| Empty success → accepted zero COMPLETE | PASS |
| Query failure → degraded/null, not zero | PASS (after repair) |
| No mutable current state rewriting historical receipt meaning | PASS |

## 8. Query-shape and performance review

| Check | Result |
| --- | --- |
| Headline DB `aggregate` | PASS |
| Methods DB `groupBy` | PASS |
| Drill one bounded page (`skip`/`take`) | PASS |
| Drill does not load all rows to paginate | PASS |
| Export streams bounded pages to completion | PASS (`COMPLETE_STREAM`) |
| Export does not silently truncate / claim partial as reconciled | PASS |
| Business / branch / period / status predicates before aggregation | PASS |
| No per-receipt query loop | PASS |
| No parent SalesInvoice RETURNED/VOID on receipt inclusion | PASS |
| Indexes | Existing `[status, receivedAt]`, `[receivedAt]`, `[salesInvoiceId, receivedAt]`; business/branch via invoice relation — deep offset cost and relation-filter plans remain limitations |
| Schema migration for cosmetics | NONE |

Mock query-shape tests assert Prisma call args (`aggregate`/`groupBy`/`skip`/`take`/`where`); preview-equivalent suite exercises the same service paths on a disposable Prisma-shaped store. Not a hosted Postgres EXPLAIN plan.

## 9. Access-control review

Behavioural coverage (resolver + export route mocks):

- Owner / Manager allowed; Cashier denied (page `requireBusiness`, export `requireExportUser`, resolver `ROLE_DENIED`).
- Foreign `businessId` query param → `TENANT_MISMATCH` 403; export `completeExport: false`.
- Unassigned branch → `BRANCH_NOT_AUTHORISED` 403.
- Export scopes to authenticated `user.businessId`.
- Drill tenant helper `assertDrillRowTenant`; drill rows post-filter on invoice `businessId`.

Scope is derived from trusted auth actor, not caller-controlled businessId.

Limitation: `storeId=ALL` uses `branchIds: null` (all stores for authenticated business), consistent with `getBusinessStores` business-wide store list — not a per-manager assigned-branch matrix beyond unassigned-id rejection.

## 10. Consumer-canonicalisation review

- `weekly-digest.ts`, `today-kpis.ts`, `TradingDashboardContent.tsx` call `aggregateMoneyReceivedByMethod` / `aggregateConfirmedReceiptsThroughAsOf`.
- No remaining independent Money Received `salesPayment.groupBy` receipt formulas in those consumers.
- Remaining RETURNED/VOID filters on sales invoice aggregates are sales metrics, not receipt inclusion.
- Consumer parity tests PASS; consumers now refuse silent empty method splits via `requireMoneyReceivedMethodRows`.

## 11. Product-surface review

- Page titled **Payments and Money Received**; copy states confirmed money in, separate from sales and refunds.
- Refund and unverified cards separate; role restrictions and branch/period filters visible.
- Export link scoped through access + authenticated business.
- Nav/hub additions minimal and necessary.
- No unrelated reporting cards on the Money Received page.
- UI does not claim hosted-preview or production readiness.

## 12. Report-honesty review

- Step 5A: local implementation; no preview/production deploy — accurate.
- Step 5B: explicitly local preview-equivalent; not hosted preview; not production — accurate after honesty note about consumer silent-failure coverage deferred to 5C.
- This Step 5C report: no merge, push, deploy, or production mutation performed.

## 13. Scope-exclusion audit

No delivery of Owner Home, Manager Home, Command Center, Sales reporting, Gross Profit, paid-at-sale, `receipts_credit_collections`, expenses, purchases/AP, inventory, cash drawer, customer collections, operational-risk centre, exports hub, or later-phase dependency-gated metrics beyond gate-only CT02G/CT11G.

Consumer/dashboard edits are limited to Money Received canonicalisation. Pre-existing Command Center nav entry unchanged aside from adjacent Money Received link insert.

Untracked `tmp/` and contract-recovery docs are not part of the Money Received product surface.

## 14. Commands executed and unedited outputs

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED

npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts
 Test Files  5 passed (5)
      Tests  72 passed (72)

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)

npx next build
(with NODE_OPTIONS=--max-old-space-size=8192 after local .next cache EINVAL / OOM on default heap)
 ✓ Compiled successfully
 … Lint warnings only in unrelated PosClient / PurchaseFormClient …
 ✓ Generating static pages (120/120)
 … includes ƒ /reports/money-received and ƒ /exports/money-received …
(exit 0)
```

## 15. Remaining limitations

- Hosted preview validation still not run; Step 5B was local preview-equivalent only.
- No production validation; no production/shared-preview mutation.
- Query-shape proofs are mock + disposable-store based, not hosted Postgres planner evidence.
- Schema cannot persist null payment status; unclassified-status set is the DB control; CT07 null remains fixture-proven.
- Offset pagination: deep pages remain DB-engine offset scans.
- Existing indexes are suitable for status/time; business/branch filters go through `salesInvoice` relation — composite covering indexes not added (no cosmetic migration).
- Default `next build` heap may OOM on this Windows/OneDrive workspace; raised heap succeeded.
- DEP-PAY-3 / DEP-SALE-1 remain gated UNAVAILABLE.
- Work remains uncommitted on baseline HEAD; merge planning is next, not merge itself.

## 16. Merge-readiness verdict

MERGE READINESS PASSED — ready for merge planning; hosted preview validation remains recommended before production.
