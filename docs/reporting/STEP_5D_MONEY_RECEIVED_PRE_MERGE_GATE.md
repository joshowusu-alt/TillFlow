# Step 5D — Canonical Money Received pre-merge gate

## 1. Branch, baseline, HEAD

| Field | Value |
| --- | --- |
| Branch | `reporting-phase1-money-received` |
| Baseline SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| HEAD SHA | `e14cf8cde0144e5715d51550d1524c3f622025b8` |
| Note | All Phase 1 Money Received product work is **uncommitted** on top of baseline HEAD |

## 2. Working tree status

- Modified (tracked): `TradingDashboardContent.tsx`, `reports/page.tsx`, `navigation-config.ts`, `dashboard-clarity.test.ts`, `today-kpis.ts`, `weekly-digest.ts`, `tsconfig.tsbuildinfo`
- Untracked (in-scope product): `lib/reports/money-received/**`, `app/(protected)/reports/money-received/`, `app/(protected)/exports/money-received/`
- Untracked (reporting docs/validators): `docs/reporting/STEP_3R_4R_…`, `STEP_4_…`, `STEP_5A/B/C/D…`, `validate-step-3r4r.js`, `validate-step-4-architecture.js`
- Unrelated / out-of-merge-plan (preserved, not deleted): `tmp/**` (contract-recovery artefacts, build logs), `docs/reporting/STEP-3R4R-UNIVERSAL-REPORTING-CONTRACT.md` (duplicate filename), `docs/reporting/fix-s21-headers.js`, `tsconfig.tsbuildinfo`
- Migrations / package.json / lockfile: **none** in this vertical’s diff
- Step 5C repairs: present in working tree, **not committed**

## 3. Merge target assessment

| Check | Finding |
| --- | --- |
| Intended eventual target | `origin/master` (remote HEAD `1a573a09…`; local `master` at `27d8f7ba…` is **stale**) |
| Baseline relation | `e14cf8cd…` is an **ancestor** of `origin/master` (branch tip sits behind remote master) |
| Conflicting reporting work on target | **Yes** — PR #84 `fix/reporting-revenue-receipts-drilldown` already merged to `origin/master`, adding `lib/reports/money-received.ts`, classify helpers, PG suites, and consumer edits |
| Migrations on target | Yes (migration framework slices on `origin/master`); **this** Money Received vertical introduces **no** schema migration |
| Money Received migrations required | **No** |
| Expected conflicts | **Yes** — path clash (`money-received.ts` file vs `money-received/` directory), plus `TradingDashboardContent.tsx`, `today-kpis.ts`, `weekly-digest.ts`, `navigation-config.ts` |
| Contract risk in target code | `origin/master` Money Received applies `REPORTING_EXCLUDED_SALE_STATUSES` (parent sale `paymentStatus` exclusion). Phase 1 Step 3R forbids parent RETURNED/VOID erasure of confirmed receipts — integration must prefer this branch’s canonical rules |
| Production-facing paths if merged | New `/reports/money-received` + `/exports/money-received`, plus consumer migrations — would become production-facing once deployed |
| Safer than direct master? | **Yes** — integration branch required |

**Merge recommendation:** READY FOR INTEGRATION-BRANCH MERGE PLANNING

Do **not** merge directly to `master`/`origin/master` until: (1) in-scope commit(s), (2) rebase/merge onto current `origin/master` on an integration branch, (3) reconcile/replace conflicting Money Received implementation under Step 3R, (4) hosted preview validation, (5) explicit merge instruction.

## 4. Diff-scope classification

### Core Money Received implementation
- `lib/reports/money-received/access.ts`
- `lib/reports/money-received/compute.ts`
- `lib/reports/money-received/drill-down.ts`
- `lib/reports/money-received/export.ts`
- `lib/reports/money-received/index.ts`
- `lib/reports/money-received/quality.ts`
- `lib/reports/money-received/query.ts`
- `lib/reports/money-received/reconcile.ts`
- `lib/reports/money-received/registry.ts`
- `lib/reports/money-received/scope-clock.ts`
- `lib/reports/money-received/service.ts`
- `lib/reports/money-received/types.ts`
- `lib/reports/money-received/preview-equivalent-db.ts` (local harness; keep with tests)

### Money Received page/surface
- `app/(protected)/reports/money-received/page.tsx`

### Money Received export
- `app/(protected)/exports/money-received/route.ts`

### Canonical consumer migration
- `lib/reports/weekly-digest.ts`
- `lib/reports/today-kpis.ts`
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`

### Focused tests
- `lib/reports/money-received/money-received.test.ts`
- `lib/reports/money-received/money-received-access.test.ts`
- `lib/reports/money-received/money-received-consumer-parity.test.ts`
- `lib/reports/money-received/money-received-preview-validation.test.ts`
- `lib/reports/dashboard-clarity.test.ts`

### Reporting documentation
- `docs/reporting/STEP_3R_4R_UNIVERSAL_REPORTING_CONTRACT.md`
- `docs/reporting/STEP_4_PRODUCT_ARCHITECTURE_AND_CAPABILITY_ALLOCATION.md`
- `docs/reporting/STEP_5A_MONEY_RECEIVED_LOCAL_IMPLEMENTATION_REPORT.md`
- `docs/reporting/STEP_5B_MONEY_RECEIVED_PREVIEW_VALIDATION_REPORT.md`
- `docs/reporting/STEP_5C_MONEY_RECEIVED_MERGE_READINESS_REVIEW.md`
- `docs/reporting/STEP_5D_MONEY_RECEIVED_PRE_MERGE_GATE.md`
- `docs/reporting/validate-step-3r4r.js`
- `docs/reporting/validate-step-4-architecture.js`

### Navigation/hub exposure
- `lib/navigation-config.ts`
- `app/(protected)/reports/page.tsx`

### Tooling/config
- None intentional. Exclude `tsconfig.tsbuildinfo` from merge plan.

### Migration/schema
- **NONE**

### Out of scope (isolate; do not merge; do not delete user work)
- `tmp/**` (contract-recovery, build logs)
- `docs/reporting/STEP-3R4R-UNIVERSAL-REPORTING-CONTRACT.md` (duplicate hyphenated filename)
- `docs/reporting/fix-s21-headers.js`

## 5. Defects found

None new in the Money Received working tree beyond items already repaired in Step 5C.

Merge-planning risks (not product defects on this branch tip):

1. Uncommitted in-scope work — commit required before any merge action.
2. `origin/master` already contains a conflicting Money Received implementation with parent-sale status exclusion.
3. Hosted preview validation not yet run.

## 6. Repairs made

NONE in Step 5D (no new in-scope defects requiring code repair).

## 7. Validator results

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED
```

## 8. Test results

```
npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts
 Test Files  5 passed (5)
      Tests  72 passed (72)
```

## 9. TypeScript result

```
npx tsc --noEmit -p tsconfig.json
(exit 0)
```

## 10. ESLint result

```
npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)
```

## 11. Build result

```
$env:NODE_OPTIONS='--max-old-space-size=8192'; npx next build
```

Reason for memory option: default heap previously OOM’d / crashed during Next lint+typecheck on this Windows/OneDrive workspace (documented in Step 5C). With raised heap:

```
 ✓ Compiled successfully
 … unrelated PosClient / PurchaseFormClient hook warnings …
 ✓ Generating static pages (120/120)
 … ƒ /reports/money-received · ƒ /exports/money-received …
(exit 0)
```

## 12. Contract sweep result

PASS — confirmed receipts, method reconcile, other/unverified rules, status exclusions, parent RETURNED/VOID non-erasure, separate refunds, gate-only CT02G/CT11G, empty→0 vs failure→null/degraded.

## 13. Query-shape sweep result

PASS — DB `aggregate`/`groupBy` headlines; drill `skip`/`take` bounded; export multipage stream; predicates before aggregation; no parent RETURNED/VOID on receipt inclusion; no unbounded full-history drill load.

## 14. Access-control sweep result

PASS — Owner/Manager allowed; Cashier denied; foreign `businessId` denied; unassigned branch denied; export uses authenticated businessId; drill tenant defense present.

## 15. Consumer-canonicalisation sweep result

PASS — weekly-digest / today-kpis / Trading Dashboard use canonical Money Received helpers; `requireMoneyReceivedMethodRows` blocks silent empty splits; remaining RETURNED/VOID filters are sales aggregates only.

## 16. Export sweep result

PASS — `COMPLETE_STREAM`; no silent truncation; failure throws rather than presenting empty success; tenant/branch via access resolver.

## 17. Report-honesty sweep result

PASS — Step 5A/5B/5C correctly state local / local-preview-equivalent / no hosted preview / no production validation / no merge-deploy claims that authorise production.

## 18. Scope-exclusion audit

PASS — no Owner Home / Manager Home / Command Center / Sales / GP / paid-at-sale / credit-collections / expenses / AP / inventory / cash drawer / risk centre / exports hub delivery. Out-of-scope `tmp/` and duplicate docs isolated from merge plan.

## 19. Hosted preview requirement

Because Step 5B was **local preview-equivalent only**:

- Hosted preview validation **remains required before production**.
- Production deployment is **not authorised** by this step.
- Production data mutation is **not authorised** by this step.

Required hosted preview checks before production:

1. Real auth/session route access (Owner/Manager allowed; Cashier denied).
2. Real deployed page render for Payments and Money Received.
3. Real export route response (complete stream; scoped).
4. Real Postgres query/runtime behaviour (aggregates, groupBy, paginated drill, multipage export).
5. Real environment variables on the preview deployment.
6. Branch/tenant scoping in the deployed environment (no cross-tenant/cross-branch leakage).
7. No production DB mutation during preview validation.

## 20. Merge recommendation

READY FOR INTEGRATION-BRANCH MERGE PLANNING

Suggested controlled sequence (not executed here):

1. Commit **only** in-scope classified files on `reporting-phase1-money-received` (exclude `tmp/`, `tsconfig.tsbuildinfo`, duplicate/hyphenated contract copy, `fix-s21-headers.js`).
2. Create integration branch from current `origin/master`.
3. Bring Money Received commits onto that branch; resolve conflicts by retaining Step 3R canonical semantics (no parent RETURNED/VOID receipt erasure).
4. Re-run validators + focused tests + build on the integration tip.
5. Deploy to **hosted preview** and complete the preview checklist above.
6. Only then seek an explicit instruction to merge to the agreed production target.

## 21. Remaining limitations

- Work uncommitted; local `master` stale vs `origin/master`.
- Hosted preview not run; production validation not run.
- Query-shape evidence remains mock + disposable-store based until hosted Postgres preview.
- Deep offset pagination cost; relation-filter index coverage not migrated.
- Schema cannot persist null payment status; unclassified-status detection remains the control set.
- DEP-PAY-3 / DEP-SALE-1 remain gated.
- Integration with PR #84 Money Received on `origin/master` not yet performed.

## 22. Remaining blockers

NONE that block **controlled merge planning**.

Hard gates still ahead of production (not Step 5D failures): commit in-scope work; reconcile with `origin/master` Money Received on an integration branch; hosted preview validation; explicit merge instruction. No automatic merge.

## 23. Final pre-merge verdict

PRE-MERGE GATE PASSED — ready for controlled merge planning; hosted preview validation required before production.
