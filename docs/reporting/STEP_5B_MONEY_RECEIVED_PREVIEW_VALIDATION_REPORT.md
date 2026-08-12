# Step 5B — Canonical Money Received preview validation report

## 1. Branch and baseline

| Field | Value |
| --- | --- |
| Branch | `reporting-phase1-money-received` |
| Baseline SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| Prior local verdict | Step 5A-R PASS |

## 2. Frozen scope

Phase 1 Money Received only: eight Metric IDs; tests `CT01`, `CT07`, `CT19`, `CT27`, `CT02G`, `CT11G`; surface Payments and Money Received. Frozen Step 3R and Step 4 validators both printed `VALIDATION PASSED`.

## 3. Preview or preview-equivalent environment

**Local preview-equivalent** (option C).

Shared preview tenant write access was not used. A disposable in-memory Prisma-shaped store (`preview-equivalent-db.ts`) exercises the real Money Received query, service, drill-down, export, access, and reconciliation code paths without mutating production or shared preview data. `DATABASE_URL` exists in the workspace but was not used for Step 5B mutations.

Limitation vs hosted preview: no live browser session against a deployed preview URL; route/UI copy and access boundaries were validated via page source plus behavioural export/access tests.

## 4. Dataset description

Deterministic disposable dataset (`buildStep5BDataset`):

| Element | Content |
| --- | --- |
| Businesses | `biz-preview-a`, `biz-preview-b` |
| Branches | A1, A2 for business A; B1 for business B |
| Roles | Owner A, Manager A, Cashier A, Owner B |
| Methods | CASH, MOBILE_MONEY, CARD, TRANSFER, CHEQUE (other) |
| Excluded statuses | FAILED, PENDING, CANCELLED, VOID payment rows |
| Unverified | `LEGACY_RAW` unclassified status |
| Parent RETURNED | CONFIRMED receipt retained |
| Parent VOID sale | CONFIRMED receipt retained |
| Refund | February refund for January receipt |
| Empty period | mid-2025 window |
| Timezone | 00:30 Accra on 2026-01-16 |
| Bulk | 5,100 March CONFIRMED receipts for multi-page + export |
| Total payments | > 5,100 rows |

## 5. Files reviewed

- `lib/reports/money-received/*`
- `app/(protected)/reports/money-received/page.tsx`
- `app/(protected)/exports/money-received/route.ts`
- `lib/reports/weekly-digest.ts`
- `lib/reports/today-kpis.ts`
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`
- `docs/reporting/STEP_5A_MONEY_RECEIVED_LOCAL_IMPLEMENTATION_REPORT.md`
- focused test suites including new preview-equivalent validation

## 6. Defects found

None blocking for the Step 5B local preview-equivalent suite.

Honesty note (post Step 5C): Step 5B did not exhaustively prove that every Money Received consumer refuses silent error-to-zero. Independent Step 5C later found and repaired drill/export/consumer paths that could treat query failure as empty success or zero receipts. Those repairs are outside this Step 5B verdict window and are documented in `STEP_5C_MONEY_RECEIVED_MERGE_READINESS_REVIEW.md`.

Harness-only adjustments during Step 5B:

- CT27 assertion refined to check `pay-tz-boundary` membership on Accra day D+1 (Jan 15 also contains an unrelated RETURNED-parent receipt).
- Multi-page sum used page sizes 50/100 with extended timeout instead of page size 10 over 5,100 rows (timeout risk in the disposable store).

## 7. Repairs made, if any

No application-code repairs required during Step 5B itself. Added:

- `lib/reports/money-received/preview-equivalent-db.ts`
- `lib/reports/money-received/money-received-preview-validation.test.ts`

Consumer/drill silent-failure repairs landed in Step 5C, not Step 5B.

## 8. Metric validation register

| Metric ID | Result |
| --- | --- |
| `money_received` | PASS — Jan A1 = 103777 pence including RETURNED/VOID parents |
| `money_received_cash` | PASS |
| `money_received_momo` | PASS |
| `money_received_card` | PASS |
| `money_received_transfer` | PASS |
| `money_received_other` | PASS — CHEQUE 5000 |
| `unverified_legacy_receipts` | PASS — 4500 UNVERIFIED |
| `refund_outflows` | PASS — Feb 20000; Jan 0 |

## 9. Test validation register

| Test ID | Result |
| --- | --- |
| CT01 | PASS (Jan receipt 200; Feb refund 200; reversal gated) |
| CT07 | PASS (unverified excluded from money_received) |
| CT19 | PASS (scope mismatch refuses reconcile) |
| CT27 | PASS (00:30 Accra on D+1 only) |
| CT02G | PASS gate-only |
| CT11G | PASS gate-only |

## 10. Economic validation evidence

Confirmed inclusions; excluded FAILED/PENDING/CANCELLED/VOID; CONFIRMED other method → other; unclassified status → unverified; RETURNED/VOID parents retain CONFIRMED receipts; Feb refund separate; method breakdown reconciles; empty period COMPLETE zero; gates expose null values only.

## 11. Access-control evidence

Owner/Manager allowed; Cashier denied; foreign businessId → TENANT_MISMATCH; unassigned branch → BRANCH_NOT_AUTHORISED; export route behavioural suite (Manager OK; Cashier denied; cross-tenant 403; branch 403).

## 12. Product-surface evidence

Page title Payments and Money Received; copy “not a sales total”; separate refund and unverified cards; uses `resolveMoneyReceivedAccess` + DB drill-down; no Gross Profit / Owner Home / Command Center / inventory cards on this page.

## 13. Drill-down evidence

Single-page `findMany` with skip/take; `whereHasParentReturnedVoid=false`; multi-page sums (page sizes 50 and 100) equal headline 5100; refund drill source type `SalesReturnRefund`.

## 14. Export evidence

Streamed complete export for 5100 rows: `COMPLETE_STREAM`, `drillRowCountExported,5100`, `drillReconcilesToHeadline,YES`; no `PARTIAL_EXPORT_CAP`; findMany take ≤ 500 across ≥ 11 pages. Unit suite also covers 5000 and 5001.

## 15. Reconciliation evidence

Method = headline; all pages = headline; refund drill = refund_outflows; export = headline; CT19 mismatch refused; business/branch isolation proven.

## 16. Performance and query-shape evidence

| Item | Result |
| --- | --- |
| Environment | Local Windows; Vitest; disposable in-memory Prisma-shaped store |
| Dataset size | > 5,100 payments + refunds + multi-business fixtures |
| Headline | `salesPayment.aggregate` |
| Methods | `salesPayment.groupBy` |
| Drill | one bounded `findMany` per page |
| Export | multipage bounded take |
| Predicates | business, branch, period (gte/lt), status present; no parent RETURNED/VOID on receipt queries |
| Indexes (schema) | `[status, receivedAt]`, `[receivedAt]`, `[salesInvoiceId, receivedAt]` |
| Runtime | focused money-received + clarity suite ≈ 6–7s wall; 5100-row export chunk ≈ 0.4s in disposable store |
| Limitation | Not a hosted preview Postgres plan; memory/query planner differs from production |

## 17. Consumer-parity evidence

`weekly-digest.ts`, `today-kpis.ts`, and `TradingDashboardContent.tsx` call `aggregateMoneyReceivedByMethod` (and liquid assets uses `aggregateConfirmedReceiptsThroughAsOf`). No remaining `salesPayment.groupBy` Money Received duplicates. Parity tests PASS.

## 18. Scope-exclusion audit

No Owner Home, Manager Home, Command Center, Sales, expenses, AP, inventory, cash drawer, GP, paid-at-sale, or `receipts_credit_collections` delivery in this vertical. Sales invoice RETURNED/VOID filters remain only on sales aggregates, not Money Received receipt inclusion.

## 19. Commands executed and unedited outputs

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED

npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts
 Test Files  5 passed (5)
      Tests  69 passed (69)

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)

npx next build
(exit 0)
```

## 20. Limitations

- Validation used local preview-equivalent data, not a live shared preview tenant browser session.
- Disposable store approximates Prisma `where`/`orderBy`/`skip`/`take` semantics for Money Received predicates; production Postgres planner behaviour may differ.
- Schema cannot store null payment status; unclassified-status detection remains the DB control set; CT07 null remains covered in pure fixtures.
- DEP-PAY-3 / DEP-SALE-1 remain gated.

## 21. Preview validation verdict

PREVIEW VALIDATION PASSED — ready for independent review before merge planning.
