# TillFlow CI governance

This note is the Agent F contract for reliability CI. It does not change Vercel production.

## Required gates

Displayed check names on `CI` stay literal:

- `CI / lint`
- `CI / unit`
- `CI / typecheck`
- `CI / build`
- `CI / pos-safety`

`Postgres Smoke` is an additional required financial/schema gate when its path filters match. Authenticated production QA is a manual `workflow_dispatch` job and is not a merge gate.

## Why coverage is not a required gate

`npm run test:coverage` exists for optional local or ad-hoc runs. Thresholds remain in `vitest.config.ts` (`statements`/`lines` 60, `branches`/`functions` 55).

Coverage is **not** a required gate. Adding it to the unit job would be slow and flaky: the unit suite already uses `pool: 'forks'`, `fileParallelism: false`, and `maxWorkers: 1` to avoid Prisma N-API teardown crashes, and the job already budgets 20 minutes. V8 coverage on that serial suite would inflate runtime without proving POS money safety.

The financial gate is risk-based:

1. `CI / pos-safety` — focused checkout/shift/drawer/payment/return unit tests plus smoke/deep/phase-3A E2E
2. `Postgres Smoke` — migrate/deploy plus checkout/shift/concurrency tests against a real Postgres service when those files are present
3. Authenticated E2E (local `pos-safety` and optional Preview reliability journey)

Coverage percentages are a local signal, not a substitute for those financial assertions.

## Timezone

All jobs in `ci.yml`, `postgres-smoke.yml`, and `authenticated-qa.yml` pin `TZ: Africa/Accra`. Reporting and shift-day bounds are business-local; CI must not drift with the runner timezone.

## Database engines

- **CI production build** (`CI / build`) uses SQLite: `db:prepare:ci` then `npm run build` with `DATABASE_URL=file:./ci-build.db`. This is the existing GitHub Actions contract. Do not switch it to Postgres.
- **Preview / Vercel build** uses Postgres via `npm run build:vercel` (`prisma generate` + `prisma migrate deploy` on `prisma/schema.postgres.prisma`, then `next build`). `vercel.json` already sets `buildCommand` to `build:vercel`.
- Do **not** change Vercel production configuration in this programme.

## Postgres smoke path filters

`postgres-smoke.yml` must include, in addition to existing migration/reporting paths:

- `lib/services/sales.ts`
- `lib/services/shifts.ts`
- `lib/services/cash-drawer.ts`
- `lib/services/returns.ts`
- `lib/services/payments.ts`
- `lib/services/expensePayments.ts`
- `lib/services/purchases.ts`
- `app/api/offline/**`
- `prisma/**`

When present, the workflow runs:

`npx vitest run lib/services/checkout-shift-cashdrawer-rtx.test.ts lib/services/payments-concurrency.test.ts lib/services/sales.test.ts`

with `DATABASE_URL` pointing at the workflow Postgres service. SQLite-mocked suites in that set must still pass. `payments-concurrency.test.ts` executes real overlapping transactions only when the URL is Postgres.

## Reliability Playwright journey

Write-capable reliability Playwright projects (`reliability-journey`, `reliability-provisioning`, `reliability-catalogue`, `reliability-onboarding-manual`) are quarantined. They skip unless:

- `RELIABILITY_ALLOW_WRITE_GATES=1`, and
- `RELIABILITY_E2E=1`, or a Preview `PLAYWRIGHT_BASE_URL` plus owner credentials exist

The evidence-only `reliability-till3-accounting` project does not require the write-gate flag. It never sells.

All reliability projects never target Production (`tillflow.app` / `www.tillflow.app`). Completing sales on Preview still requires `PLAYWRIGHT_ALLOW_QA_SALE=true` and `PLAYWRIGHT_QA_TENANT_CONFIRMED=true`.

Authenticated production QA must keep `PLAYWRIGHT_ALLOW_QA_SALE: 'false'`.
