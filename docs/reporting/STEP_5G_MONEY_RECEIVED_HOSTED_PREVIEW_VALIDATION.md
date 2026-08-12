# Step 5G — Canonical Money Received hosted preview validation

## 1. Branch, deploy, environment

| Field | Value |
| --- | --- |
| Branch | `integration/money-received-canonical-5e` |
| Integration reconcile commit | `1b85e9642dc94579b7080fc821f4c3d8a8b91fee` |
| Docs/prep commit (deployed HEAD) | `06baf155d948eb36286d99bf93055e0ebf3d98ec` |
| Deployed commit SHA | `06baf155d948eb36286d99bf93055e0ebf3d98ec` |
| GitHub deployment id | `5865871349` |
| Vercel deployment | `dpl_EKcJsQTQHLocchNtfaHmjctS4wKM` |
| Target | **Preview** (not Production) |
| Status | Ready |
| Preview URL | https://supermarket-q2izlvzww-joshua-owusus-projects.vercel.app |
| Stable preview alias | https://supermarket-pos-git-integration-m-0f28e9-joshua-owusus-projects.vercel.app |
| Preview DB | Neon host `ep-late-cell-za9kodq1.c-2.eu-west-2.aws.neon.tech` (preview env pull; not production) |
| Schema migration required? | **No** — `receiptOrigin` already present (`20260808120000_sales_payment_receipt_origin`); integration commits contain no Prisma migration |

Production deployment id on the same project remains older (`1a573a0` on Production) and was **not** updated by this step.

## 2. Objective result

Canonical Money Received was delivered to hosted Preview and validated against real Preview Postgres + real Preview auth sessions.

Synthetic tagged Preview-only rows (`MR_HOSTED_5G_*`) were inserted for contract checks and cleaned up by the probe. No production deploy, no production migration, no production data mutation.

## 3. Validation method

Probe: `scripts/money-received-hosted-preview-probe.cjs`  
Log: `tmp/step5g-hosted-preview-probe.log` (local, not committed)

Synthetic Preview fixtures included:

- CONFIRMED receipts on PAID / RETURNED / VOID parent sales (expected `money_received` = 180.00 on store A)
- FAILED + PENDING payments (must not enter headline)
- LEGACY_RAW unverified receipt (45.00 surfaced)
- Separate `SalesReturn` refund outflow (20.00)
- Second branch (70.00) and foreign-tenant payment (must not leak)

## 4. Required checks — results

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Branch + commit on hosted preview | **PASS** | GitHub Preview deployment `5865871349` sha `06baf155…`; Vercel Ready Preview for branch alias |
| 2 | Preview env, not production | **PASS** | `target: preview`; Preview Neon host from `vercel env pull`; Production deploy unchanged |
| 3 | No schema migration required | **PASS** | No migration in `1b85e964..06baf155`; `receiptOrigin` already migrated earlier |
| 4 | `/reports/money-received` renders | **PASS** | Owner Playwright: title “Payments and Money Received”, non-sales framing, totals |
| 5 | `/exports/money-received` scoped complete | **PASS** | Owner + Manager: HTTP 200, `COMPLETE_STREAM`, reconcile YES, no `PARTIAL_EXPORT_CAP`, no foreign payment id |
| 6 | Owner access | **PASS** | Page + export OK |
| 7 | Manager access | **PASS** | Page + export OK |
| 8 | Cashier denial | **PASS** | Page denied; export denied |
| 9 | Tenant isolation | **PASS** | Foreign store denied; cross-tenant export denied; foreign payment id absent from export |
| 10 | Branch isolation | **PASS** | Store B shows 70.00 and not Store A 180.00 |
| 11 | Real Postgres aggregate/groupBy/drill/export | **PASS** | Direct Preview SQL aggregate = 18000 pence store A; UI/export against live Preview app |
| 12 | Parent RETURNED/VOID does not exclude confirmed receipts | **PASS** | UI 180.00 includes RETURNED+VOID parents; export includes RETURNED-parent receipt; parent-filtered SQL sanity = 0 for those ids |
| 13 | CONFIRMED-only inclusion | **PASS** | FAILED/PENDING amounts absent from headline; SQL uses `status = 'CONFIRMED'` |
| 14 | Refunds separate as `refund_outflows` | **PASS** | Owner UI surfaces refund 20.00 separately from money received |
| 15 | Unverified/legacy surfaced | **PASS** | Owner UI surfaces unverified 45.00 (not silent clean zero) |
| 16 | Trading Dashboard / today KPIs / weekly digest | **PASS** | Live Preview Trading Dashboard shows Money received; `today-kpis.ts` + `weekly-digest.ts` consume `aggregateMoneyReceivedByMethod` / `requireMoneyReceivedMethodRows` (canonical trading-surface path from Step 5E) |
| 17 | Validators / tests / tsc / eslint / build | **PASS** | See §5 |
| 18 | This report | **PASS** | This file |

Probe summary (exit 0):

```
PASS owner /reports/money-received
PASS owner export COMPLETE_STREAM
PASS branch isolation
PASS foreign store denied
PASS trading dashboard shows Money received
PASS manager access
PASS cashier denied
PASS cross-tenant export denied
HOSTED PREVIEW PROBE PASSED
```

Checks recorded: `preview_db_confirmed`, `postgres_aggregate_confirmed_no_parent_filter`, `parent_filter_would_erase_confirmed_but_canonical_does_not`, `owner_money_received_page`, `owner_export_complete_stream`, `branch_isolation_store_b`, `foreign_store_denied`, `trading_dashboard_money_received_label`, `manager_access_ok`, `manager_export_ok`, `cashier_denied`, `cashier_export_denied`, `cross_tenant_export_denied`.

## 5. Local revalidation (post-preview)

```
node docs/reporting/validate-step-3r4r.js
VALIDATION PASSED

node docs/reporting/validate-step-4-architecture.js
VALIDATION PASSED

npx vitest run --reporter=dot lib/reports/money-received lib/reports/dashboard-clarity.test.ts lib/reports/money-received-method.test.ts
 Test Files  6 passed | 4 skipped (10)
      Tests  76 passed | 18 skipped (94)

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/exports/money-received --ext .ts,.tsx --no-error-on-unmatched-pattern
(exit 0)

$env:NODE_OPTIONS='--max-old-space-size=8192'; npx next build
(exit 0 after cleaning corrupted local .next; routes include /reports/money-received and /exports/money-received)
```

PG unit suites remain skipped locally without dedicated smoke env (expected). Hosted Preview probe covered real Postgres.

## 6. Defects found

None that block hosted preview acceptance.

Notes (non-blocking):

- First local `next build` attempt hit OneDrive `.next` `readlink EINVAL`; cleaned `.next` and rebuild succeeded. Preview Vercel build was already Ready.
- Export validation must use an authenticated Playwright request context; raw `fetch` after login lost session cookies and returned login HTML with status 200 (probe fixed accordingly).

## 7. Files repaired / added

| Path | Change |
| --- | --- |
| `scripts/money-received-hosted-preview-probe.cjs` | Hosted Preview probe (Preview-only synthetic data + Playwright UI/export/access checks) |
| `docs/reporting/STEP_5G_MONEY_RECEIVED_HOSTED_PREVIEW_VALIDATION.md` | This report |

No product-code repairs were required on the integration commits during hosted validation.

Do **not** commit `tmp/reporting-preview.local.env` or other secrets.

## 8. Remaining blockers

| Item | Status |
| --- | --- |
| Production merge / deploy planning | Allowed as **next planning gate only** — not executed here |
| Step 6 | **Not started** (explicitly out of scope) |
| Production migrations / production data | **Not run / not mutated** |

## 9. Confirmation

- No production deploy
- No production migrations
- No production data mutation
- Preview/staging data only (synthetic rows cleaned up)
- No Step 6 work
- Reporting scope not broadened beyond Canonical Money Received

## 10. Final verdict

**HOSTED PREVIEW PASSED — ready for production merge/deployment planning.**
