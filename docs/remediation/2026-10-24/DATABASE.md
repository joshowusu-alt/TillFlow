# Database reliability remediation — 24 October 2026

## Evidence status

Production is unchanged. PR145 is a development proposal, not a released fix. Historical production logs prove P2024 connection acquisition timeouts with pool size five and a ten-second wait, but do not record which earlier work held those five connections. Current production `pg_stat_activity` had no other active sessions during inspection. `pg_stat_statements` is absent; no extension was installed or production setting changed.

An isolated GitHub Actions PostgreSQL16 test has now reproduced **a concrete source-level starvation mechanism**, and the same mechanism passes after correction without increasing pool capacity. This does not establish that every historical Products/POS timeout had that single cause.

## Confirmed mechanism: composed purchases request a second connection

Opening-stock and stock-import actions compose `createPurchase(input, tx)` inside an existing interactive transaction. The purchase implementation used the supplied transaction for stock/products, but read business/store/supplier/chart-of-accounts through the root Prisma client.

With five outer transactions holding five available connections, those root-client validation reads queue for connections that their own callers are holding. Ten seconds later they fail P2024. Product/unit loads arriving behind that workload can also be victims; a Unit error is not evidence that the Unit SQL was inherently expensive.

The fix uses the supplied `dbClient` for every purchase validation/account read and account bootstrap. Calls without an outer transaction retain normal behavior. Atomic stock, documents, payment and ledger work remains inside the existing transaction.

## Executed before/after evidence

Job: https://github.com/joshowusu-alt/TillFlow/actions/runs/40061251495/job/120775044986

Tested remote SHA: `23b4db89d45d9af99fd302b0cdb2d0b2877728c2`.

The workflow saves patched purchase source, substitutes original production source from `cebd811`, and executes only the controlled five-held-transactions case. It requires nonzero exit **and P2024 evidence**, restores patched source through an EXIT trap, then runs the fixed workload. Database service is disposable/local to the runner. No production URL or secret is used.

| Controlled scenario | Original purchase source | Patched purchase source |
|---|---:|---:|
| Workers already holding pool slots | 5 | 5 |
| Pool limit | 5 | 5 |
| Completed purchases | 0/5 | 5/5 |
| Elapsed time | 10,027.05ms | 35.70ms |
| Errors | Five P2024 pool timeouts | Zero |

The initial full workload then exposed a **second real defect**, so that job correctly failed. It is not a full pilot acceptance pass.

## New first-sale invoice sequence race

Two cashiers in different stores of the same new business can both observe no invoice sequence. The original custom invoice allocator attempted INSERT, caught the duplicate-key error, then updated the sequence inside the same PostgreSQL transaction. PostgreSQL keeps that transaction aborted after a unique violation; the recovery query fails25P02.

Actual workload on the above SHA:22/24 successful logical checkouts (91.67%), two25P02 errors. The database log identified duplicate `BusinessSequence_pkey` inserts. This must not be hidden by pre-seeding sequence rows in the fixture.

Correction: the missing-sequence path uses the shared atomic upsert allocator, with the existing latest historical `INV-` number as its initial floor. The normal existing-sequence update stays fast. The controlled six-cashier workload intentionally begins with no invoice sequences and must reach24/24 successful checkouts before this defect is considered retested.

## Initial workload metrics, before sequence correction

These are **service-operation latencies**, not browser/HTTP request latencies. The `baseline` label compares the frozen original three-query unit loader against the optimized loader; other patched service source is present. It is not an entire old deployment replay.

| Metric | Recorded initial baseline phase |
|---|---:|
| Concurrent fictional cashiers | 6 |
| Logical checkout attempts | 24 |
| Checkout success | 22/24 |
| Error count | 2 |
| Service operation p50 | 121.63ms |
| Service operation p95 | 207.11ms |
| Checkout/purchase operation p95 | 110.96ms |
| Database SQL events | 1,915 |
| SQL event duration p95 | 1ms |
| Observed application connections | Maximum5 |
| Independent connection samples | 31 |

The fixed unit-loader phase did not execute because the preceding phase correctly failed its zero-error requirement. No after-performance percentage is invented.

## Query/pool pressure improvements

- A production module evaluation now also retains its Prisma instance on the process-global cache. This prevents repeated module evaluations in a warm worker constructing extra pools; it does not create a pool shared across serverless workers.
- Unit lookup combines the standard and preferred-piece lookup, reducing three database reads to two per cold business lookup.
- Overlapping reads for the same business share the in-flight promise. Completed results and failures are removed immediately. There is no extra stale-value cache, no tenant-wide shared key and no invalidation delay.
- Caller transaction budgets and pool limit are not increased. No automatic retry of potentially committed money writes is added.

## Acceptance gate and pending retest

`database-pilot-gate.yml` uses existing GitHub Actions infrastructure, local PostgreSQL16 and Node22. `TILLFLOW_RUN_DATABASE_PILOT=1` explicitly opts into the workload; generic unit/PG runs do not accidentally execute the capacity benchmark. The central guard owns database URL selection and pins every Prisma alias.

After source correction, the benchmark uses three fictional businesses, two stores and cashiers per business,250 products per business, and1,500 stocked balances. Each cashier repeats product/stock/unit loads, cash checkout, lost-ack identity replay, unpaid purchase and sales aggregate reporting. A separate read-only PostgreSQL observer samples connection use. Persisted invoice/payment counts, inventory quantity, expected cash and balanced journals are asserted.

Thresholds defined before execution: six concurrent users, service-operation p95≤2seconds, checkout/purchase operation p95≤3seconds, zero unexpected errors,100% logical checkout success. Pool size remains five. The output must include before/after metrics and correct financial invariants. These local runner timings do not establish Ghana network or deployed-region latency; browser/HTTP acceptance and approved staging verification remain separate.

Local checks completed:25 focused lookup/client tests,21 purchase tests and30 guard/client/scope tests passed in their respective overlapping runs; fresh TypeScript and targeted lint passed. Sequence-specific unit retest and final PG gate evidence will be recorded after execution. No production release, migration or financial data repair was performed.

### PostgreSQL sale retry follow-up

PostgreSQL unique violations abort the transaction. Sale replay and stale invoice-counter recovery now happen outside the rolled-back transaction; only a known transaction-number uniqueness conflict receives one retry. A committed external-reference winner is returned only after matching the checkout context. The isolated gate now requires both genuinely overlapping identical sale requests to succeed with one persisted invoice, payment and journal, and exercises a stale counter without duplicate cash. Local verification: `npx vitest run lib/services/sales.test.ts lib/reliability/database-test-safety.test.ts --reporter=dot` — 84 passed, 0 failed; `npx tsc --noEmit --incremental false` — passed. These additional persisted PostgreSQL assertions await CI; local unit checks do not establish them as verified.
