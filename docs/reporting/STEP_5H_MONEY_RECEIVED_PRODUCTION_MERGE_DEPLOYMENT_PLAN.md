# Step 5H — Canonical Money Received production merge / deployment plan

## 1. Status and intent

This step prepares a **controlled production merge/deployment plan** only.

| Hard rule | Status |
| --- | --- |
| Deploy to production | **Not executed** |
| Run production migrations | **Not executed** |
| Mutate production data | **Not executed** |
| Step 6 | **Not started** |
| Broaden reporting scope | **Not done** |

Merge/deploy proceeds **only** after explicit instruction following review of this plan.

## 2. Branch and commit SHAs

| Field | Value |
| --- | --- |
| Integration branch | `integration/money-received-canonical-5e` |
| Validated / merge tip SHA | `06baf155d948eb36286d99bf93055e0ebf3d98ec` |
| Feature commit | `1b85e9642dc94579b7080fc821f4c3d8a8b91fee` — `feat(reports): reconcile canonical Money Received on integration branch` |
| Docs commit | `06baf155d948eb36286d99bf93055e0ebf3d98ec` — `docs(reports): add Step 5F Money Received commit and hosted preview prep` |
| Target branch | `master` |
| `origin/master` (fetched) | `1a573a09cac8d4b38768060ce82d30e1c824b33f` |
| Merge-base | `1a573a09cac8d4b38768060ce82d30e1c824b33f` (branch is **exactly 2 commits** ahead; master has **not** drifted) |
| Current Production SHA | `1a573a09cac8d4b38768060ce82d30e1c824b33f` |
| Production deployment | GitHub `5812301844` / Vercel `dpl_2gXhgVtf1Hfy3aGaHys9jDGZS6Ea` |
| Production aliases | `https://tillflow.app`, `https://www.tillflow.app` |
| Hosted Preview evidence | Step 5G **HOSTED PREVIEW PASSED** on SHA `06baf155…` |

### Commit inventory (approved only)

```
06baf155 docs(reports): add Step 5F Money Received commit and hosted preview prep
1b85e964 feat(reports): reconcile canonical Money Received on integration branch
```

No other commits are on `origin/master..origin/integration/money-received-canonical-5e`.

### Local artefacts not in merge tip (optional follow-up)

These exist locally but are **not** part of `06baf155` and are **not required** for runtime deploy:

- `docs/reporting/STEP_5G_MONEY_RECEIVED_HOSTED_PREVIEW_VALIDATION.md`
- `docs/reporting/STEP_5H_MONEY_RECEIVED_PRODUCTION_MERGE_DEPLOYMENT_PLAN.md` (this file)
- `scripts/money-received-hosted-preview-probe.cjs`

Recommended: land them in a **docs-only** commit on the integration branch before or after the production merge PR. Do **not** block runtime merge on them.

## 3. Hosted preview evidence (Step 5G)

| Item | Evidence |
| --- | --- |
| Verdict | HOSTED PREVIEW PASSED — ready for production merge/deployment planning |
| Deployed SHA | `06baf155d948eb36286d99bf93055e0ebf3d98ec` |
| Preview alias | https://supermarket-pos-git-integration-m-0f28e9-joshua-owusus-projects.vercel.app |
| Report | `docs/reporting/STEP_5G_MONEY_RECEIVED_HOSTED_PREVIEW_VALIDATION.md` |
| Probe | Owner/Manager OK; Cashier denied; tenant/branch isolation; `COMPLETE_STREAM` export; CONFIRMED-only; RETURNED/VOID parents included; unverified + refunds surfaced |

## 4. Schema / migration

| Check | Result |
| --- | --- |
| Prisma files in merge diff | **None** |
| New migration required | **No** |
| `receiptOrigin` | Already on Production via prior migration `20260808120000_sales_payment_receipt_origin` |

**Data safety:** application-only deploy. No `prisma migrate deploy` against Production. No production row inserts/updates/deletes as part of this release.

## 5. Exact files entering production

Diff: `origin/master...06baf155` — **38 paths** (37 in feature commit + Step 5F doc).

### Runtime / product (must ship)

| Path | Change |
| --- | --- |
| `app/(protected)/reports/money-received/page.tsx` | **Add** — Payments & Money Received report |
| `app/(protected)/exports/money-received/route.ts` | **Add** — scoped complete export |
| `app/(protected)/reports/dashboard/TradingDashboardContent.tsx` | **Modify** — canonical Money Received consumer; remove parent RETURNED/VOID receipt filter |
| `app/(protected)/reports/page.tsx` | **Modify** — hub entry for Money Received |
| `lib/navigation-config.ts` | **Modify** — primary nav → `/reports/money-received`; receipts relabelled |
| `lib/reports/reporting-scope.ts` | **Modify** — `moneyReceivedHref` → `/reports/money-received` |
| `lib/reports/today-kpis.ts` | **Modify** — canonical aggregates |
| `lib/reports/weekly-digest.ts` | **Modify** — canonical aggregates |
| `lib/reports/money-received.ts` → `lib/reports/money-received/trading-surface.ts` | **Rename + fix** — CONFIRMED-only; no parent RETURNED/VOID exclusion |
| `lib/reports/money-received/*` | **Add** — canonical module (query/service/export/access/compute/drill/reconcile/…) |

### Tests

| Path | Change |
| --- | --- |
| `lib/reports/dashboard-clarity.test.ts` | Modify |
| `lib/reports/money-received-scale.pg.test.ts` | Modify |
| `lib/reports/money-received/*.test.ts` | Add |
| `lib/reports/money-received/preview-equivalent-db.ts` | Add (test harness) |

### Docs / validators (non-runtime)

| Path | Change |
| --- | --- |
| `docs/reporting/STEP_3R_4R_UNIVERSAL_REPORTING_CONTRACT.md` | Add |
| `docs/reporting/STEP_4_PRODUCT_ARCHITECTURE_AND_CAPABILITY_ALLOCATION.md` | Add |
| `docs/reporting/STEP_5A` … `STEP_5F` reports | Add |
| `docs/reporting/validate-step-3r4r.js` | Add |
| `docs/reporting/validate-step-4-architecture.js` | Add |

## 6. Production-facing behaviour changes

Relative to current Production (`1a573a09` / PR #84 Money Received):

1. **New primary surface:** `/reports/money-received` (Payments and Money Received) for Owner/Manager.
2. **Nav / deep links:** “Payments & Money Received” and `moneyReceivedHref` point at `/reports/money-received`; `/reports/receipts` remains as **Receipt transactions**.
3. **Inclusion rule (critical):** CONFIRMED receipts on parent sales with `RETURNED` / `VOID` **remain included** in Money Received (PR #84 incorrectly excluded them).
4. **Status rule:** CONFIRMED-only (PENDING/FAILED/etc. out of money_received).
5. **Quality:** unverified/legacy (`LEGACY_RAW` / unclassified origins) surfaced — not silent clean zero.
6. **Refunds:** remain separate as `refund_outflows`, not netted into money_received.
7. **Export:** `/exports/money-received` complete stream with reconcile metadata (scoped).
8. **Consumers:** Trading Dashboard, today KPIs, weekly digest use the shared canonical Money Received boundary (no parallel parent-sale-filtered receipt aggregates).
9. **Access:** Owner/Manager allowed; Cashier denied (unchanged intent; enforced on new page/export).

Expected numeric effect vs today’s Production Money Received: totals for periods with CONFIRMED receipts on later-returned/voided parents may **increase** (correcting undercount). Sales totals are unchanged by this work.

## 7. Merge strategy

**Recommended:** Pull request from `integration/money-received-canonical-5e` → `master`.

1. Re-fetch and confirm tip still equals `06baf155d948eb36286d99bf93055e0ebf3d98ec` (or a docs-only commit on top that does not change runtime).
2. Confirm `origin/master` still equals `1a573a09…` (or re-rebase/reconcile if master moved — **stop** and re-plan if master drifted).
3. Open PR; title e.g. `feat(reports): Canonical Money Received (Phase 1)`.
4. Require CI green (validators/tests/build as configured).
5. Squash **or** merge-commit both approved commits — prefer **merge commit** or **rebase+merge** preserving the two SHAs for audit; if squash is mandatory, record the new squash SHA and treat it as the deploy candidate after a final Preview check.
6. Do **not** force-push `master`. Do **not** deploy Production until explicit instruction after merge.

**Not recommended:** direct push to `master` without PR review.

## 8. Production deployment sequence (execute only when instructed)

1. Merge PR to `master` (explicit instruction).
2. Confirm Vercel Production build targets the merged SHA (no preview-only alias).
3. Confirm **no** migration job / `prisma migrate deploy` is in the release checklist for this change.
4. Wait for Production Ready on `tillflow.app`.
5. Record Production deployment id + SHA.
6. Run §9 smoke checklist on Production (read-only).
7. Run §10 monitoring checks.
8. If smoke fails critically → execute §11 rollback.

## 9. Production smoke checklist (post-deploy, read-only)

Use real Owner/Manager/Cashier sessions; **do not** insert synthetic production data.

| # | Check | Pass criteria |
| --- | --- | --- |
| 1 | Deployed SHA | Production equals merged Money Received SHA |
| 2 | `/reports/money-received` | Renders for Owner; non-sales framing present |
| 3 | Trading Dashboard | “Money received” present; no hard error |
| 4 | Export | Owner `/exports/money-received` → `COMPLETE_STREAM` (or documented empty-period complete) |
| 5 | Manager | Page + export allowed |
| 6 | Cashier | Denied on page and export |
| 7 | Branch scope | Switching store changes totals appropriately (no cross-branch leak) |
| 8 | Contract spot-check | Known CONFIRMED receipt on RETURNED/VOID parent (if any exist) still counted; unverified not forced to silent zero; refunds not netted into money_received |
| 9 | today KPIs / weekly digest | Load without error; Money Received figures present where expected |
| 10 | No migration | Confirm no migration ran and DB schema unchanged by this release |

## 10. Monitoring / log checks (post-deploy)

| Signal | What to watch |
| --- | --- |
| Vercel Production function logs | 5xx on `/reports/money-received`, `/exports/money-received`, `/reports/dashboard` |
| Export duration / timeouts | Long-range exports completing vs truncating |
| Auth denials | Cashier correctly 403/redirect; no Owner/Manager false denials |
| Prisma / Postgres errors | Unexpected query failures on `SalesPayment` aggregates |
| Error tracking (if configured) | Spikes after deploy window |
| Support / operator feedback | “Money received dropped/jumped” reports — triage against corrected RETURNED/VOID inclusion |

## 11. Rollback procedure

**Fast rollback (preferred):** Redeploy previous Production SHA `1a573a09cac8d4b38768060ce82d30e1c824b33f` via Vercel (instant rollback to last known-good Production).

**Git rollback (if needed):** Revert the merge commit on `master` and redeploy; or restore Production alias to prior deployment.

**Notes:**

- Rollback is code-only; no data migration to undo.
- After rollback, Money Received returns to PR #84 behaviour (parent RETURNED/VOID exclusion) until a fixed forward deploy.
- Do not run compensatory data scripts.

## 12. Remaining risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Operator surprise: Money Received totals rise vs PR #84 | Medium (expected correct) | Communicate behaviour change before/at deploy; cite Step 3R |
| Master drifts before merge | Medium | Re-check SHA immediately before merge; stop if drifted |
| Squash rewrite loses validated SHA | Low | Prefer preserving commits; if squash, re-verify Preview on squash SHA |
| Large export load on Production | Low–Med | Smoke with bounded date range first; monitor timeouts |
| Docs 5G/5H not yet on `master` | Low | Optional docs follow-up; does not affect runtime |
| Unverified legacy volume high in Production | Low | Surfacing is intentional; not a silent zero |

## 13. Data safety statement

- This release changes **application reporting logic only**.
- **No** production schema migration is required or authorised in this plan.
- **No** production data mutation is required or authorised in this plan.
- Hosted Preview used tagged synthetic Preview rows only (cleaned up in Step 5G).
- Post-deploy smoke is **read-only** against production data.

## 14. Go / no-go recommendation

| Gate | Status |
| --- | --- |
| Integration commits approved and limited to Money Received | **GO** (exactly 2 commits) |
| `origin/master` == current Production SHA | **GO** (`1a573a09…`) |
| Hosted Preview PASSED on tip SHA | **GO** (`06baf155…`) |
| Prisma migration required | **GO** (none) |
| Rollback path clear | **GO** (redeploy `1a573a09…`) |
| Explicit merge/deploy instruction received | **NO-GO until instructed** |

**Recommendation:** **GO for merge/deploy when explicitly instructed.** Do not auto-merge or auto-deploy from this document alone.

## 15. Confirmation (this step)

- No production deployment occurred
- No production migration occurred
- No production data mutation occurred
- Step 6 was not started
- Reporting scope was not broadened

## 16. Final verdict

**PRODUCTION PLAN PASSED — ready for explicit merge/deploy instruction.**
