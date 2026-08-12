# Step 5F — Canonical Money Received commit and hosted preview prep

## 1. Branch and commit

| Field | Value |
| --- | --- |
| Branch | `integration/money-received-canonical-5e` |
| Base | `origin/master` @ `1a573a09cac8d4b38768060ce82d30e1c824b33f` |
| Integration reconcile commit | `1b85e9642dc94579b7080fc821f4c3d8a8b91fee` |
| Commit subject | `feat(reports): reconcile canonical Money Received on integration branch` |
| Ahead of origin/master | 1 commit (local only; not pushed in this step) |

## 2. Files committed (summary)

### Surfaces
- `app/(protected)/reports/money-received/page.tsx`
- `app/(protected)/exports/money-received/route.ts`
- `app/(protected)/reports/dashboard/TradingDashboardContent.tsx`
- `app/(protected)/reports/page.tsx`

### Canonical module
- `lib/reports/money-received/**` (query, service, export, access, trading-surface, tests, harness)
- Removed flat path via rename: `lib/reports/money-received.ts` → `lib/reports/money-received/trading-surface.ts`

### Consumers / nav / scope
- `lib/reports/today-kpis.ts`
- `lib/reports/weekly-digest.ts`
- `lib/reports/reporting-scope.ts`
- `lib/navigation-config.ts`
- `lib/reports/dashboard-clarity.test.ts`
- `lib/reports/money-received-scale.pg.test.ts`

### Reporting docs / validators
- `docs/reporting/STEP_3R_4R_UNIVERSAL_REPORTING_CONTRACT.md`
- `docs/reporting/STEP_4_PRODUCT_ARCHITECTURE_AND_CAPABILITY_ALLOCATION.md`
- `docs/reporting/STEP_5A` … `STEP_5E` reports
- `docs/reporting/validate-step-3r4r.js`
- `docs/reporting/validate-step-4-architecture.js`
- This Step 5F report (follow-up docs commit if separate)

### Prisma client artifacts
- None committed. Local `npx prisma generate` was used earlier for typecheck only; no schema/migration change in this commit.

## 3. Excluded unrelated files

| Path | Reason |
| --- | --- |
| `tmp/**` | Local payload backups, build logs, contract-recovery artefacts |
| `tsconfig.tsbuildinfo` | Incidental compiler cache |
| Duplicate hyphenated contract / `fix-s21-headers.js` | Not present in staging; remain outside commit |

## 4. Post-commit validation results

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
```

PG suites remain skipped locally without Postgres smoke env (expected).

## 5. Build result

```
$env:NODE_OPTIONS='--max-old-space-size=8192'; npx next build
(exit 0)
```

Reason for memory option: default heap previously OOM’d on this Windows/OneDrive workspace during Next lint+typecheck.

Build routes include `ƒ /reports/money-received`, `ƒ /exports/money-received`, and retained `ƒ /reports/receipts`.

## 6. Hosted preview — next required gate

Hosted preview validation is the **next required gate** before any production merge/deploy.

Checklist (not executed in this step):

1. Push or otherwise deliver `integration/money-received-canonical-5e` to the preview environment (only when explicitly instructed).
2. Real auth/session: Owner/Manager allowed; Cashier denied.
3. Deployed page render: `/reports/money-received` (Payments and Money Received).
4. Real export route: `/exports/money-received` complete stream, scoped.
5. Real Postgres query/runtime for aggregate/groupBy/drill/export.
6. Real preview environment variables.
7. Branch/tenant scoping on preview; no cross-tenant/cross-branch leakage.
8. **No production DB mutation** during preview validation.

Production deployment is **not authorised** by this step.

## 7. Remaining blockers

| Item | Status |
| --- | --- |
| Hosted preview validation | **Required next** — not yet run |
| Push to remote | Not done in this step (local commit only) |
| Production merge / deploy | Blocked until hosted preview + explicit instruction |
| PG smoke on CI/preview | Not run locally |

## 8. Confirmation

- No production deploy
- No production migrations
- No production data mutation
- No Step 6 work
- No push unless later explicitly requested

## 9. Final verdict

COMMIT AND HOSTED PREVIEW PREP PASSED — integration commit `1b85e9642dc94579b7080fc821f4c3d8a8b91fee` is ready for hosted preview validation.
