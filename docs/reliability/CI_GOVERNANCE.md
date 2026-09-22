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

1. `CI / pos-safety` — focused checkout/shift/drawer/payment/return unit tests plus smoke/deep/phase-3A E2E, then read-only UI shell geometry (`test:e2e:ui-programme`, retries 0, seed owner, no sales; runs last so it cannot disturb cashier till-open)
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

with `DATABASE_URL` pointing at the workflow Postgres service. SQLite-mocked suites in that set must still pass. `payments-concurrency.test.ts` executes real overlapping transactions only when the URL is Postgres. `expense-payments-concurrency.test.ts` (overpayment race, foreign-store till rejected atomically, same-store cash payment once) is in the same step.

### Database-target guard (mandatory for every test, seed, fixture and harness)

**Incident, 22 Sep 2026.** The generated Prisma client is built from `prisma/schema.postgres.prisma`, whose datasource is `url = env("POSTGRES_PRISMA_URL")` / `directUrl = env("POSTGRES_URL_NON_POOLING")`. `DATABASE_URL` is never read by that client. A bare `new PrismaClient()` therefore resolves, in order: an explicit `datasources.db.url`; `process.env.POSTGRES_PRISMA_URL`; then `POSTGRES_PRISMA_URL` loaded by the Prisma runtime from the repo `.env` (which carries the Production Neon URLs). Running `expense-payments-concurrency.test.ts` locally with only `DATABASE_URL` set to Preview therefore pointed the suite's skip-gate at Preview while both its `new PrismaClient()` and the services' `@/lib/prisma` singleton connected to Production. Two runs created two `EP Conc ep-conc-*` businesses (4 stores, 4 tills; users/accounts were removed by teardown, the rest were left by a swallowed FK failure) before a missing-column error exposed it. The 10 rows were verified read-only and removed in one asserted transaction the same day; no tenant data was touched.

**Controls now in force**

- `lib/database-target-guard.ts` (no Prisma import) decides whether a URL may receive test writes. Deny rules win: database `neondb`, host fragment `fancy-darkness`, `VERCEL_ENV=production`, anything in `TILLFLOW_PRODUCTION_DB_HOSTS`. Allow: local hosts, database names matching `tillflow_(ci|preview|test|walkthrough|qa)*`, or `TILLFLOW_TEST_DB_ALLOWLIST` (`host/db,…`). Everything else is refused. Missing URLs are refused. Contradictory URLs (e.g. `DATABASE_URL` = Preview while `POSTGRES_PRISMA_URL` = Production) are refused unless `TILLFLOW_TEST_DATABASE_URL` names the target explicitly.
- `vitest.global-setup.ts` (main process) and `vitest.setup.ts` (every worker, before each file) both run `prepareVitestDatabaseEnv`: guard, then pin **all** of `DATABASE_URL, DIRECT_URL, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL_NO_SSL, PRISMA_DATABASE_URL` and the legacy per-suite `*_DATABASE_URL` keys to the one guarded target, and print the sanitised identity. In the SQLite unit run the Postgres keys are overwritten with the SQLite URL so an unmocked Postgres client fails to connect instead of reaching `.env`.
- `lib/prisma.ts` passes an explicit, guarded datasource whenever `VITEST` is set (no-op outside tests).
- `lib/test/test-prisma.ts` is the **only** way a test obtains a client: `openTestPrismaClient()` guards, pins, resets the app singleton, constructs with an explicit datasource, connects and proves `current_database()` before returning. `runTestTeardown()` runs every cleanup step, disconnects, then throws an aggregate — teardown can no longer swallow a failed delete. `lib/test/isolated-postgres.ts` is a thin wrapper (`openBoundPrismaClient`); its old `POSTGRES_URL_NON_POOLING`-first precedence and synchronous `createBoundPrismaClient` are gone.
- `lib/reliability/database-test-safety.test.ts` (unit job, `npm run guard:db`) fails the build if any test file constructs `new PrismaClient(`, imports `PrismaClient` as a value, or assigns Prisma URL variables, and freezes the list of pre-existing bare-client scripts under `scripts/` and `prisma/` — new scripts must use `scripts/lib/guarded-prisma.cjs` (same rules; Production is openable only with `{ readOnly: true }` + `TILLFLOW_ALLOW_PRODUCTION_READ=1`, and the session is forced `READ ONLY`).
- `lib/test/database-target-guard-live.pg.test.ts` runs first in `postgres-smoke.yml` and proves, against the isolated service database, that the factory client and `@/lib/prisma` both resolve to the guarded database.

**Running Postgres suites locally**

```
TILLFLOW_TEST_DATABASE_URL=postgresql://…/tillflow_preview  TILLFLOW_INCLUDE_PG_TESTS=1  npx vitest run lib/services/<suite>.test.ts
```

Only `TILLFLOW_TEST_DATABASE_URL` needs to be set; the guard pins everything else and prints `[database-target-guard] OK target=postgres://<host>/<db> …` before any file loads. If it prints `REFUSED`, nothing ran. Never work around a refusal by editing `.env`.

## pos-safety flake log

### 2026-09-22 — `ui-programme-shell.spec.ts` › "error, empty and loading evidence stay inside the shell"

Symptom: `page.goto: Navigation to "/customers" is interrupted by another navigation to "/settings"`. CI run 35727075123 failed on attempts 1 and 2 with this exact line and passed on attempt 3; the `ui-programme-chromium` project has `retries: 0`, so every attempt was a whole-job rerun.

Root cause (deterministic cause, timing-dependent manifestation): the Phase 3A QA step that runs earlier in the same job adds a second store to the seed business in the shared CI SQLite file. The `seed-owner.json` storage state is login-only, so each test context starts with no operational-branch cookie. `/products/ui-programme-missing-product` goes through `requireBusinessStore()`, which `redirect('/settings')`s when several stores exist and none is selected. With route loading boundaries the redirect is streamed and applied client-side after `domcontentloaded`, so it fired during the test's next `goto('/customers')`. Whether it landed before or during that navigation depended on runner speed.

Fix: the test now pins the authorised branch first (`expectPosSearchReady`, the same helper the other shell tests use), asserts the missing-product route stays on its own URL and renders "Product not found." inside the shell, and only then visits `/customers`. No application change; the `/settings` redirect for "no branch selected" is intended behaviour.

## Reliability Playwright journey

Write-capable reliability Playwright projects (`reliability-journey`, `reliability-provisioning`, `reliability-catalogue`, `reliability-onboarding-manual`) are quarantined. They skip unless:

- `RELIABILITY_ALLOW_WRITE_GATES=1`, and
- `RELIABILITY_E2E=1`, or a Preview `PLAYWRIGHT_BASE_URL` plus owner credentials exist

The evidence-only `reliability-till3-accounting` project does not require the write-gate flag. It never sells.

All reliability projects never target Production (`tillflow.app` / `www.tillflow.app`). Completing sales on Preview still requires `PLAYWRIGHT_ALLOW_QA_SALE=true` and `PLAYWRIGHT_QA_TENANT_CONFIRMED=true`.

Authenticated production QA must keep `PLAYWRIGHT_ALLOW_QA_SALE: 'false'`.
