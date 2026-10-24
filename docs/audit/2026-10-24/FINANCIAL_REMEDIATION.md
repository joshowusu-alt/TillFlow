# Financial/offline completion evidence

Baseline: PR144 tree (`4cc1067f0c3fe550a64e66c1a6a7ce22c6f1ccbb`), no production change.

## Reviewed fixes

The terminal payment checks remain after invoice row lock and transactional reload. Idempotent replay of an already completed payment returns its persisted result rather than writing again. Paid purchase VOID remains explicitly rejected; full return reverses captured VAT rather than today's flag. Supplier payment dates flow into journal dates; payment amounts/methods and full purchase refunds are validated before writes. No change was made to these valid fixes.

The offline v4 composite key and no-scope readers preserve queued money records. Mobile select height change affects phones only. Local IndexedDB confidentiality is still limited by device/browser-profile access; none of these controls replaces server-side authorisation.

## Additional confirmed defect and fix

An expired session's HTTP401 reached the service worker's permanent4xx rejection branch, moving an otherwise recoverable sale to dead letter. New regression first failed (one failure/seven passes), then passed after401 was classified with408/429 as a recoverable event. Follow-up scope review found that wrong-tenant responses actually use HTTP400 with reason `tenant_mismatch`; these and HTTP403 now retain the original pending sale until correct authentication/authorisation returns. Other HTTP400 permanent rejects still follow the existing manual-recovery policy. No server-side permission bypass is introduced.

The SW queue reader also failed open when active-business metadata was absent and could lose its native IndexedDB completion event by awaiting metadata after starting `getAll`. It now reads scope first, returns no work without scope, and installs the request event handlers without an intervening await. Four follow-up regressions failed before this fix; all13 offline retry/scope tests pass afterward. The native browser migration harness now adds two real SW reader cases (eight total checks), pending CI execution.

Local Node22.23.4 execution:

```bash
npx vitest run lib/offline/sync-retry.test.ts lib/services/payments.test.ts lib/services/returns.test.ts --reporter=dot
```

Result: **80 passed, zero failed/skipped**, three files. Standalone TypeScript and targeted ESLint passed. The new PostgreSQL and browser tests below require the isolated CI execution result before their acceptance can be claimed.

## Real PostgreSQL concurrency and rollback gates

`lib/services/purchase-return-payment-race.pg.test.ts` uses guarded Prisma clients, real transactions, real row locks and actual financial/stock services. Middleware adds deterministic pause barriers after persisted writes; it does not fake database responses.

Five cases:

1. Supplier payment holds invoice lock after its payment row is written; purchase return starts and waits. After payment commits, return reloads its payment amount and refunds it exactly, with AP zero and cash/stock reconciled.
2. Return holds invoice lock; supplier payment waits, then rejects terminal status after return commits. No payment/drawer/journal effect survives.
3. Two returns overlap; exactly one stock reversal, journal and return record survives.
4. Injected late return-journal failure rolls back return/status/cash/stock, then retry succeeds once.
5. Injected late supplier-audit failure rolls back payment/journal/drawer/retry identity; same-key retry posts once.

`final-walkthrough-gate.pg.test.ts` now uses the central guarded PostgreSQL target rather than two historic endpoint names. Local CI and explicitly allowlisted disposable endpoints execute its two exact negative-close/transfer-replay cases; production-deny rules and live database identity verification remain unchanged. Both suites are added to Postgres Smoke path filters and invocation.

```bash
TILLFLOW_INCLUDE_PG_TESTS=1 npx vitest run \
  lib/services/purchase-return-payment-race.pg.test.ts \
  lib/services/final-walkthrough-gate.pg.test.ts --reporter=verbose
```

Run only with existing guarded isolated URL variables; never provide production credentials.

## Native browser retry gate

```bash
node scripts/commercial-offline-retry-browser.cjs
```

Five native Chromium checks use real IndexedDB, browser reload, actual application sync/backoff code and a clearly simulated local API:503 leaves the sale pending; refresh preserves it; a lost response after simulated commit causes same-ID retry; automatic backoff recovers without another online event; acknowledged sale never resubmits on later refresh. The simulated server must record one economic commit despite at least three requests. This complements real PostgreSQL idempotency checks; it does not certify a live provider or real-server browser checkout.

No production data, environment variables, infrastructure, merge or deployment is changed by this work.
