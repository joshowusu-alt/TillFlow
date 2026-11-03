# Test execution evidence — TillFlow, 24 October 2026

Source baseline: `cebd811fe61363836cca65902fde083b557c0df1`. Remediation branch: `audit/commercial-readiness-20261024`. Execution against the branch working tree is explicitly distinguished from the deployed SHA. The eventual PR commit contains these changes; no test pass is inferred from historical commit messages.

## Environments

1. Local managed cloud workspace, Linux, Node24.19.0 initially; final verification Node22.23.4. No production environment file was copied into the repo. Unit guard pins Prisma URLs to job-local SQLite.
2. Temporary Vercel Sandbox Node22.23.4, two vCPUs/four GB, with guarded disposable Neon child `audit-commercial-20261024`, database `tillflow_preview`. Explicit test URL and endpoint/database allowlist were passed privately. All Prisma URL aliases were pinned by the guard. Credentials are deliberately omitted.
3. Chromium149.0.7827.55, Playwright1.61.1 in that cloud sandbox. Native IndexedDB harness uses an ephemeral localhost server and isolated browser contexts. Running-app browser checks used localhost6200 in the sandbox, pointing only at the disposable database.

## Actual results

| Command / check | Result | Interpretation |
|---|---|---|
| `npm ci --ignore-scripts` then `npx prisma generate --schema=prisma/schema.postgres.prisma` | Installation and client generation succeeded; initial Node24 emitted EBADENGINE | Install warning confirms engine mismatch; no migration run by install. |
| `npm run typecheck` | Passed on22, also initial24 check passed | Standalone TypeScript, not inferred from build. |
| `npm run lint` | Zero errors, two existing hook dependency warnings | Warnings at POS client514–515 recorded as TF-017. |
| Initial `npm test` with PostgreSQL-generated client and default SQLite unit target | 3,982 passed, five failed,21 skipped;51 unhandled client-provider errors | Invalid environment for full unit suite and source changed during initial regression reproduction. Not a valid clean baseline or product failure count. Brand test also expected old SW cache version; updated with version bump. |
| `DATABASE_URL=file:./ci-unit.db npm run db:prepare:ci` | SQLite schema/client preparation succeeded; seed CLI failed EPERM on tsx IPC socket | Workspace restriction; reran seed through Node import mode below. |
| `DATABASE_URL=file:./ci-unit.db node --import tsx prisma/seed.ts` | Passed;21 products,7 categories,5 customers,4 suppliers,17 accounts | Disposable SQLite only. No production seeding. |
| Final `DATABASE_URL=file:./ci-unit.db npm test` on Node22 | **4,017 passed, zero failed,21 skipped;499 files passed, two skipped** | 511.57seconds. Skips are not passes; default suite excludes live PG by design. Later targeted retest covers subsequent small return/mobile changes. |
| `npm run test:pos-safety:unit` initial focused run | 224 passed, zero failed, zero skipped; seven files | Before final extra input/refund regressions; not summed with full unit count. |
| `npx vitest run lib/services/payments.test.ts lib/services/returns.test.ts --reporter=dot` final financial subset | **72 passed, zero failed/skipped**, two files | Failing-before sets:5 failures for terminal/paid-void, two for VAT/date, six for runtime money validation, seven for purchase refund validation. Repeated passes are overlapping evidence, not extra unique test totals. |
| `npx vitest run lib/offline/storage-scope.test.ts lib/offline/dead-letter-scope.test.ts lib/offline/sync-retry.test.ts lib/offline/storage.test.ts --reporter=dot` | **20 passed, zero failed/skipped**, four files | Failing-before retry4/5 and storage3/4 reproduced against original source. Tests verify scope/migration and bounded retry contract. |
| `npx vitest run lib/plan-pricing.test.ts lib/subscription-lifecycle.test.ts lib/billing-entitlements.internal-qa.test.ts app/actions/register.test.ts --reporter=dot` | **61 passed, zero failed/skipped**, four files | Mocked/unit business lifecycle and registration coverage; not live billing activation. |
| Disposable PG `npx prisma migrate status --schema=prisma/schema.postgres.prisma` |63 repository migrations; schema history up to date | Preview child only; history status is not a complete catalog drift proof. |
| Initial selected PG run: receipt-ledger, valuation, walkthrough tenant/store, purchases retry, shift concurrency, stocktake, debt reconciliation | **55 passed, zero failed/skipped** | Baseline financial service/database evidence. One supplied nonexistent filename did not add a suite; actual JSON count is authoritative. |
| Second selected PG run: customer/supplier/expense concurrency, inventory increase/reversal, shifts, numbers/import, money-received, monthly balance, migration integration | **43 passed, zero failed/skipped** | Working-tree financial fixes included. |
| Broad PG/concurrency command below | **138 passed, zero failed, two skipped**,30 files | Includes commercial-day persisted checks.65.56seconds. Do not add overlapping selected runs to claim236 unique passing PG tests. |
| `npx vitest run lib/services/commercial-audit.pg.test.ts --reporter=verbose` | **Two passed, zero failed/skipped**, including successful cleanup | Earlier authored-fixture attempts failed required invoice-document validation; next attempt assertions passed but cleanup failed missing PurchaseDocument deletion. Fixture/teardown corrected, rerun completely green. |
| `node scripts/commercial-offline-browser-audit.cjs` | **Six passed, zero failed/skipped** | Real browser/IndexedDB migration and isolation. Initial workspace browser download failed; cloud install required Linux library packages, then succeeded. |
| `npm run build` with PG client but no PG environment (initial local) | Failed prerender `/shop/sitemap.xml`: missing POSTGRES_PRISMA_URL | Environment failure, not proof of a production code defect. |
| Cloud `npm run build` with disposable PG | Compilation passed; no completed successful full build result captured | Four-GB environment stopped progressing after type/lint stage; resource/command completion limitation. Do not count as a successful build. Final local seeded SQLite build recorded separately when complete. |
| Existing `node scripts/critical-path-smoke.js` | Failed before checkout: hidden first TillFlow text locator | Harness corrected to visible h1; rerun progressed but lacked default owner/cashier fixture. No checkout success claimed. |
| Running-app mobile script | Authenticated routes exercised; small branch-select tap target observed at36px | TF-018. Full route matrix did not receive blanket acceptance. Focused post-fix check is recorded in final addendum. |

### Broad PostgreSQL command

```bash
npx vitest run $(find lib -type f | grep -E '(\.pg\.test\.ts|pg\.integration\.test\.ts|concurrency\.test\.ts)$') \
  --reporter=json --outputFile=/vercel/sandbox/pg-complete.json
```

The runner receives private `TILLFLOW_TEST_DATABASE_URL`, an explicit isolated endpoint/database allowlist, `TILLFLOW_INCLUDE_PG_TESTS=1`, and `TZ=Africa/Accra`. Never paste a production URL into this command. Never weaken the production-deny guard to force execution.

Two skipped cases are in `final-walkthrough-gate.pg.test.ts`: negative actual-cash close and store-transfer replay. That suite accepts only two historically named isolated endpoints, so it skips this new disposable endpoint despite the general allowlist. Other executed PG suites cover shift/store/concurrency behavior, but these exact skipped cases must not be represented as executed. No guard was weakened.

### Exact trading-day assertions

For each of two stores/tills, using different owner/cashier actors:

- Drawer: OPEN_FLOAT20,000 + CASH_SALE50,000 + CASH_DEBTOR_PAYMENT10,000 − PAID_OUT_SUPPLIER12,000 − PAID_OUT_EXPENSE3,000 − CASH_REFUND5,000 = **60,000 pesewas**.
- GH300 MoMo starts PENDING_MANUAL, then authorised manual confirmation; no physical drawer increase.
- GH150 credit sale receives GH100 cash; AR remains GH50.
- Repeated sale/customer receipt/supplier payment keeps one persisted payment/movement where asserted.
- Shift closes expected60,000, counted60,000, variance0; other till drawer unchanged.
- Stock quantity98, known value109,000, movement quantity/value sums equal balance.
- Every posted journal balances. Account deltas: cash+40,000 (opening cash already in fixture GL), bank/MoMo+30,000, AR+5,000, AP0, revenue credit90,000, COGS debit3,000, expense debit3,000, inventory debit9,000.
- Separate returned/voided unpaid invoice cases prove no new customer/supplier payment, journal, drawer entry or terminal-status change.

These are service-to-database tests; framework cache/header plumbing and asynchronous fraud notifications are mocked explicitly. They do not test the browser-to-action boundary or a provider's actual settlement network.

## Read-only production evidence

- Current deployment SHA/target/runtime samples and domain configuration verified through Vercel.
- Error log groups in24-hour sample: Products427, POS19. Counts are log records; not unique failed requests.
- Production query found **zero unbalanced journals** among persisted entries with lines. A balanced journal can still use the wrong account/date/amount; this is not a full ledger certification.
-63 successfully applied migrations. All applied file checksums match repository bytes directly or after historical CRLF normalisation. Subscription lifecycle has an old rolled-back attempt plus a successful matching application. No migration-history write performed.
-543 eligible positive cash supplier payments,216 without a linked supplier drawer movement, all unmatched dates February–June2026. Provenance remains unresolved; no automatic repair.
- Production/preview environment variable **names and targets** inspected. Distinct DB variable configuration exists; no secret values appear in reports. Shared BLOB token targets production/preview/development, which warrants object-level isolation review; distinct DBs alone do not prove storage isolation.
- No SENTRY_DSN or UPSTASH credentials appeared in inspected Vercel variable names. Code integrates both mechanisms; external configuration outside these variable names was not established. Durable cross-instance throttling/error collection must be verified before making operational claims.

## Unexecuted or incomplete acceptance matrix

Not certified: live subscription money verification/activation; every direct feature route/API across all plans/roles; complete password reset/MFA login journey; native barcode hardware; thermal receipt printing; full desktop/tablet/mobile retail journey; every date-filter/export cross-report reconciliation; real provider webhooks; full disconnected checkout/reconnect/closed-shift/multiple-device matrix; end-to-end backup restore; peak-load/latency acceptance. These remain release gates, not passing results.

The browser fixture failure and resource-limited build are reported separately from application defects. No credentials were requested from the founder and none are embedded in this report.

## Final verification addendum

- Final `DATABASE_URL=file:./ci-unit.db npm run build` on Node22, using SQLite-generated Prisma client and seeded disposable database: **passed**, including page generation and route output. This is an application production build, not a Vercel production deployment and not the PostgreSQL migration-bearing `build:vercel` command.
- Final `npm run test:pos-safety:unit`: **231 passed**, zero failed/skipped, seven files.
- Final `npx vitest run components/OperationalStoreSwitcher.test.tsx lib/reliability/operational-store-ui.test.ts lib/services/payments.test.ts lib/services/returns.test.ts lib/offline/storage-scope.test.ts lib/offline/dead-letter-scope.test.ts lib/offline/sync-retry.test.ts lib/offline/storage.test.ts --reporter=dot`: **106 passed**, zero failed/skipped, eight files. Covers final refund validation and mobile class change after full unit run.
- `node scripts/migration-p1-schema-pg-test.cjs`: **20 PASS gates**, no reported failures; complete behavioural schema history test passed in disposable PG.
- `node scripts/migration-p1-slice2a-pg-test.cjs`: **15 PASS gates**, no reported failures; hardened schema/object lifecycle gates passed.
- `node scripts/payment-receipt-origin-pg-test.cjs`: **16 assertions passed**, executed1/skipped0, tagged-business cleanup completed.
- Original authenticated mobile responsiveness run: **18 failure records**, including36px branch selector and a small error-state Try Again control; not a release pass. All three storefront checkout cases skipped because fixture had no enabled slug. Run happened on memory-constrained dev server; error-state geometry needs a stable-build rerun before attributing every failure to production.
- Focused retest used a temporary copy of the same mobile script with `protectedRoutes` restricted to `/onboarding`, against the patched shared selector. **Three viewport route checks passed**, zero failures; three storefront skips. Sizes390×844,375×667,430×932. Original script and its broader scope were not weakened in the repository.
- Critical smoke h1-locator fix allowed public/demo checks to proceed, then failed fixture session lookup for default `cashier@store.com`/`owner@store.com`. This is not an actual password-authentication test: the legacy script provisions sessions directly. Complete authenticated Playwright roles and browser checkout remain unverified.

Full unit/PG/browser summary is recorded above; no cumulative headline sums repeated or overlapping suites. Branch commit contains report and fixes; production still runs the original SHA until separately approved.
