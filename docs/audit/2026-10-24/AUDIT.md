# TillFlow commercial technical audit — 24 October 2026

## Executive decision

**C — Not ready for paying-customer acquisition on the current production release.**

This is a release-gate decision, not a claim that the product has no useful engineering. Real PostgreSQL checks demonstrate a working cash/stock/ledger core. However, production still contains a reproduced terminal-invoice financial defect; production logs show repeated connection-pool failures; the installed Next.js release is affected by a current Server Actions denial-of-service advisory. Safe financial/offline fixes are proposed on `audit/commercial-readiness-20261024`, not deployed. Passing tests on that branch do not repair the running service.

Do not advertise November launch readiness until the open release gates below have passed. Internal demonstrations using fictional records may continue, with the limitations disclosed. No production deployment, environment change, migration repair or data repair was performed by this audit.

## Evidence and scope

- Repository and current `master`: `cebd811fe61363836cca65902fde083b557c0df1`.
- Production: Vercel `dpl_9PvK3eNegxZGp61mXSBhDeeedk39`, target `production`, READY, same SHA. A newer READY deployment with target `null` is a preview, not production.
- Verified production domain configuration: `www.tillflow.app`, apex redirect from `tillflow.app`, and `supermarket-pos-five.vercel.app`. Deployment-specific aliases also exist. Domain configuration was inspected; a complete external DNS/HTTP uptime audit was not completed.
- Project setting is Node `24.x`; observed production function logs identify `nodejs22.x`. Original package engine `>=18 <24`; original CI Node 20. Proposed package, `.nvmrc`, and CI pin Node 22. Project settings were not edited.
- Vercel deployment/configuration lists `iad1`, while sampled logs show `lhr1` and `fra1`. Actual workload placement must be checked when resolving latency; do not assume a configuration field proves execution region.
- Production Neon project `tillflow`, PostgreSQL 17, London region; separate project `tillflow-preview`. Tests used a newly created child of preview, `audit-commercial-20261024`, never the production endpoint.
- Test branch creation initially rejected an unsupported suspend interval; creation without that override succeeded. No production compute change occurred.
- Local runtime initially Node 24.19.0, then Node 22.23.4 for final checks. Cloud development runtime Node 22.23.4. Full test execution details are in `TESTS.md`.

Evidence classes used here: **confirmed** (reproduced or directly observed), **risk** (plausible but not demonstrated), **gap** (not sufficiently tested), and **pass** (specific executed assertions only). Unit mocks are never presented as persisted PostgreSQL evidence. No real money-provider transaction or destructive production test was attempted.

## Module assessment and launch scorecard

| Workstream | Assessment | Evidence / practical limit |
|---|---|---|
| Deployment and infrastructure | BLOCKED | READY SHA verified; production pool errors confirmed. Runtime drift proposed fix; full production-build reproduction and load proof remain gates. |
| POS and financial integrity | CONDITIONAL on branch; BLOCKED in production | Persisted trading-day and terminal-invoice checks pass; terminal-payment bug remains live until approved release. Card/transfer/payment concurrency and receipt-ledger selected tests executed. No provider settlement certification. |
| Purchases, suppliers, expenses | CONDITIONAL | Supplier cash-out and debtor cash-in reconcile; payment idempotency tested. Paid-void and VAT reversal protections added. Only full purchase returns supported; partial amounts now rejected clearly. |
| Cash drawers and closing | PASS for tested scenarios | Exact GH200 opening, GH500 cash sales, GH300 MoMo, GH150 credit, GH100 cash collection, GH120 supplier cash-out, GH30 expense, GH50 refund closes at GH600, variance zero. Repeated across two stores/tills and two actors. Does not establish every deployment/network failure scenario. |
| Inventory | CONDITIONAL | Real movements, quantity/value totals, COGS, concurrency, transfer/reversal suites selected. Complete physical-scanner and multi-unit staff acceptance not established. |
| Offline | CONDITIONAL on branch | Six native Chromium checks pass for schema migration, store-specific product snapshots, logged-out reads, recovery retention, and app/SW compatibility. Network retry unit regressions pass. Full disconnected checkout/replay/closed-shift/multi-device matrix remains incomplete. |
| Security and access | BLOCKED | Tenant/store tests pass for covered services, offline exposure fixed on branch. Applicable framework advisory unresolved. No exhaustive penetration test or all-route entitlement certification. |
| Subscriptions/onboarding | CONDITIONAL / acceptance gap | 61 pricing/lifecycle/registration unit checks pass. No live subscription-payment activation, complete owner-to-first-cashier browser journey, or recurring renewal run proven. |
| Reports/accounting | CONDITIONAL | Selected customer-debt, money-received, monthly-balance, receipt-ledger PG checks pass; trading-day ledger balances. Entire P&L/BS/CF/export/date/store matrix not certified. |
| Usability/customer readiness | NOT ACCEPTED | Native browser storage checks are not a staff usability trial. Desktop/tablet/mobile checkout, scanning, receipt readability and slow-network operations require signed-off acceptance. |
| Backup/disaster recovery | GAP | Production history retention setting is 21,600 seconds (six hours). Export snapshot logic and unit checks exist; an application restore to a fresh isolated tenant with control-total comparison was not completed. History retention alone is not a tested backup strategy. |

No numerical readiness score is awarded: averaging unverified areas would conceal financial/security release gates.

### Implemented pricing verified from source and unit execution

| Plan | Monthly GHS | Annual GHS | Storefront |
|---|---:|---:|---|
| Starter | 199 | 1,990 | Excluded |
| Growth | 349 | 3,490 | Excluded unless add-on |
| Growth + storefront | 549 | 5,490 | Included through GHS200 add-on |
| Pro | 699 | 6,990 | Included |

Annual calculation charges ten monthly totals for twelve months. `lib/plan-pricing.ts` is authoritative for this check. Lifecycle tests cover seven-day trial/grace/expiry math and registration setup; this is not proof that actual customer payments activate the correct subscription.

## Prioritised defect register

### TF-001 — P0 — Payments reopen returned or voided invoices (confirmed)

- **Reproduce:** create an unpaid sale or purchase; return/void it; submit a new customer receipt/supplier payment with a fresh idempotency key.
- **Expected:** reject without payment, drawer, journal or status changes. **Actual before fix:** service accepted the payment and could overwrite terminal status and move AR/AP after reversal.
- **Evidence:** four failing-before unit cases; new real PostgreSQL terminal-invoice test checks both RETURN and VOID, customer and supplier, with persisted no-write assertions.
- **Root cause:** `lib/services/payments.ts` locked and reloaded the invoice but did not validate terminal `paymentStatus`.
- **Fix:** reject RETURNED/VOID after row lock, while preserving replay semantics for already-completed idempotent requests.
- **Status/retest:** implemented; focused units and persisted PG regression pass. Not deployed; production remains affected.

### TF-002 — P1 — Purchase return races supplier payment (confirmed missing locking discipline)

- **Reproduce:** payment commits between the return's pre-transaction invoice read and financial reversal.
- **Expected:** reversal uses the latest locked payment total. **Actual:** return calculated AP/refund from an earlier snapshot.
- **Evidence:** before/after source inspection plus refreshed-snapshot unit regression. Real purchase/return services pass trading-day/terminal PG runs; this audit has not proved every interleaving through a new concurrent return-versus-payment PG test.
- **Root cause/fix:** move invoice/payment read into transaction after `lockPurchaseInvoiceForUpdate`; reject terminal status there.
- **Status:** implemented; unit regression passes; explicit concurrent-race retest remains a gap.

### TF-003 — P1 — Paid purchase VOID produces unbalanced journal (confirmed)

- **Reproduce:** void a fully/part-paid purchase. **Expected:** a defined, financially balanced operation. **Actual:** VOID forced refund zero but credited full stock/tax and reversed only unpaid AP; accounting rejects and rolls back.
- **Evidence:** failing-before regression and journal algebra. No silent journal bypass was introduced.
- **Root cause/fix:** paid VOID has no defined refund/liability semantics. Service now refuses it with a message directing the user to purchase return/refund.
- **Status/retest:** implemented; paid VOID rejects before effects; unpaid VOID remains covered. This deliberately does not invent a partial-return feature.

### TF-004 — P1 — Purchase VAT reversal depends on today's VAT setting (confirmed)

- **Reproduce:** record VAT-bearing purchase; disable VAT; return purchase. **Expected:** reverse recorded VAT. **Actual:** VAT credit was omitted, producing an unbalanced reversal.
- **Root cause:** `returns.ts` checked current business flag instead of captured invoice VAT. **Fix:** reverse positive invoice VAT regardless of current setting.
- **Evidence/status:** failing-before regression, passing-after focused tests. No production adjustment posted; historical affected attempts need investigation if reported.

### TF-005 — P1 — Arbitrary payment method / invalid money input accepted (confirmed)

- **Reproduce:** call customer/supplier payment boundary with method `FOO` or invalid amount such as fractional/negative/nonfinite minor units.
- **Expected:** reject before writes. **Actual:** TypeScript casts did not validate runtime input; unknown noncash methods could be routed as bank movement.
- **Root cause/fix:** add private runtime validation in payment service for CASH/CARD/TRANSFER/MOBILE_MONEY and nonnegative safe integer minor units; zero-value split fields remain allowed then filtered.
- **Evidence/status:** six failing-before regressions; final focused tests pass. No claim that this validation alone covers every other monetary entry point.

### TF-006 — P1 — Offline transient failures stop automatic retries (confirmed)

- **Reproduce:** queued sale sync returns network error/503; for SW also 408/429. **Expected:** retain and retry transient work. **Actual:** inner code caught failures, outer page/SW promise reported success; 429 could become dead letter.
- **Root cause/fix:** page inspects failed pending work and schedules bounded backoff; cleanup cancels timers. SW aggregates transient failures and rejects background-sync promise after processing other rows; temporary statuses remain queued.
- **Evidence:** four failing-before cases plus actual extracted SW 503 harness; expanded passing regression tests.
- **Status:** implemented; unit verified. Real browser migration checks pass; comprehensive real network retry timing and multi-device replay still acceptance gates.

### TF-007 — P1 — Product cache loses another store's stock snapshot (confirmed)

- **Reproduce:** cache the same product ID in stores A/B with different stock; revisit A offline. **Expected:** independent snapshots. **Actual:** IndexedDB product key was only `id`, so B overwrote A.
- **Fix:** schema v4 composite business/store/product key, migrate retained scoped products without clearing money queue; service worker supports same version.
- **Evidence/status:** failing-before storage tests; passing native Chromium migration/store-refresh checks. Previously overwritten snapshots cannot be reconstructed from that cache; refresh online before relying on offline stock.

### TF-008 — P1 — Logged-out recovery UI exposes retained business data (confirmed)

- **Reproduce:** queue/cache records, log out, visit public offline recovery shell with no active business cookie.
- **Expected:** no unscoped reads/amendment/deletion; retain money queue for legitimate re-login. **Actual:** no-business fallback returned records from all retained scopes; unscoped clear could erase them.
- **Fix:** fail-closed no-scope getters/mutations and dead-letter reads; sign-in message; retain queued sales.
- **Evidence/status:** unit scope regressions plus native browser logout/re-login preservation pass. Device owner/developer-tools access to local storage is still possible; this fix is not encryption or proof of server tenant access.

### TF-009 — P1 — Production Prisma connection starvation (confirmed; OPEN)

- **Reproduce/evidence:** Vercel production logs over sampled preceding 24 hours: error/fatal log groups include `/products` 427 and `/pos` 19; these are log-record counts, not unique failures or customers. Samples show P2024 at ten-second pool timeout, connection limit five, on Unit/Customer/Category queries.
- **Expected:** ordinary product/POS loads complete reliably. **Actual:** repeated request/cache-revalidation failures. Zero paying customers makes this especially concerning.
- **Root cause:** pool exhaustion confirmed; cause of occupancy/load/hold time not established. No claim that increasing connection limit fixes it.
- **Recommended fix/retest:** reproduce representative concurrent browser workload on isolated PG, measure per-operation transaction hold time/query fan-out and pool occupancy; address specific long operations/cache stampede/connection reuse; verify runtime region and DB latency. Then rerun real checkout/retry reconciliation under load and inspect an approved staging release.
- **Status:** no speculative pool/production change made; unresolved launch blocker.

### TF-010 — P1 — Applicable Next.js Server Actions DoS advisory (confirmed affected dependency; OPEN)

- **Reproduce/applicability:** locked Next14.2.35; app uses App Router and Server Actions. Primary advisory GHSA-p3m5-59mp-jv5r covers this configuration. No hostile exploit was executed.
- **Expected:** patched supported framework. **Actual:** affected release. Vendor states upgrade is required.
- **Recommended fix:** separately review/test upgrade to at least 15.5.28 or 16.4.1, including async framework API compatibility, auth/middleware, receipts, offline and financial smoke tests. Do not blindly force a major dependency upgrade into this financial patch.
- **Status:** unresolved security release gate. See sources below.

### TF-011 — P1 risk — Image optimizer and spreadsheet parser advisories (OPEN)

- **Evidence:** sharp0.34.5; Next wildcard HTTPS remote image configuration; upstream optimizer advisory GHSA-2464-fhr4-w9xw. Vendor workaround sharp>=0.35.5. Vercel-managed optimizer mitigation was not verified; **no production RCE demonstrated**.
- **Spreadsheet evidence:** xlsx0.18.5 and client `XLSX.read` imports. Vendor CVE-2024-22363 recommends official SheetJS release>=0.20.2; npm package has no available patched release.
- **Expected/fix:** patched parser/image pipeline with import/image regressions. Review official vendor artifact integrity; restrict external image sources where appropriate. Do not equate every `npm audit` transitive severity with reachable exploitation.
- **Status:** risk/applicability review incomplete, release gate until patched or deployment-specific mitigation demonstrated. Sentry tunnel advisory is not confirmed applicable because no `tunnelRoute` is configured; Zod vulnerable collection-schema usage was not found.

### TF-012 — P2 — Backdated supplier payment journal dated today (confirmed)

- **Reproduce:** supplier payment with historical `paidAt`; compare payment report and GL period. **Expected:** posting follows chosen payment date. **Actual:** PurchasePayment stored date but journal defaulted to now.
- **Root cause/fix:** pass `entryDate: paidAt` to journal posting.
- **Evidence/status:** failing-before date regression, passing-after unit test. Drawer recording timestamp still reflects recording event; do not rewrite closed shift history as a side effect.

### TF-013 — P2 — Runtime/CI configuration drift (confirmed)

- **Evidence:** package excludes24, project setting24, deployed logs22, CI20. Local Node24 install emits EBADENGINE.
- **Fix/status:** branch pins package/.nvmrc/CI22; no Vercel project setting changed. TypeScript/lint/PG/browser checks run on22. Before deployment inspect effective runtime and deliberately reconcile project setting with the approved release.

### TF-014 — P2 — Renewal reminder cron not scheduled in repository (confirmed config gap)

- **Reproduce:** inspect `vercel.json` crons and `/api/cron/subscription-reminders`; the route is the only observed caller of due-reminder enqueue.
- **Expected:** scheduled due reminders if product promises them. **Actual:** dispatch cron exists, enqueue schedule absent. External scheduler not verified.
- **Fix/status:** open; verify desired cadence and platform schedule limits, add separately after checking deduplication. This is not a reason to change production configuration without approval.

### TF-015 — P1 data-quality investigation — Historical supplier drawer links (confirmed unmatched rows; cause not established)

- **Evidence:** production read-only aggregate: 543 positive cash supplier payments excluding explicit `funding:%` references; 216 lack a matching PURCHASE_PAYMENT/PAID_OUT_SUPPLIER drawer entry. Unmatched payment dates span 18 February–26 June2026, none since22October, none explicitly QA-tagged.
- **Expected:** genuine till-funded payments link to cash-out. **Limit:** legacy/non-till/test records may explain some rows; this count is not proof that 216 live customer payments were lost. No customer is reported paying.
- **Recommended fix:** tenant-scoped assessment with provenance and funding-source classification; separate demo/test tenants; reconcile current balances before first customer/demo acceptance. Never automatically backfill closed shifts from this count.
- **Status:** investigation open, no production repair. Current trading-day supplier linkage passes PG assertions.

### TF-016 — P2 — Purchase partial/excessive refund amounts fail obscurely (confirmed)

- **Reproduce:** full purchase return request with refund below/above recorded paid amount or invalid number.
- **Expected:** clear supported-workflow validation before stock writes. **Actual:** overpayments were silently clamped, partial amounts later caused unbalanced-journal error/rollback.
- **Fix:** require full recorded paid amount, safe integer/nonnegative, and give explicit full-return message. No partial item return feature introduced.
- **Evidence/status:** seven failing-before regressions, final financial subset72pass. Full-return PG paths pass. Partial sales returns are also outside supported scope; training must say so.

### TF-017 — P3 — Existing POS hook dependency warnings

- **Evidence:** lint zero errors, two warnings in `PosClient.tsx` useEffect dependencies514–515. No incorrect user outcome reproduced.
- **Fix/status:** leave out of financial patch; simplify derived dependency inputs in a separate reviewed change if still warranted. Retest not applicable to a cosmetic claim.

### TF-018 — P2 — Branch selector too short for mobile tap targets (confirmed)

- **Reproduce:** authenticated mobile route with multiple branches; measure branch select. **Expected:** at least44px mobile height. **Actual:**36px shared select caused mobile harness failures on several routes.
- **Root cause/fix:** `OperationalStoreSwitcher.tsx` used `h-9` at every viewport. Set `h-11 sm:h-9` so phones get44px while desktop keeps existing compact layout.
- **Evidence/status:** native browser focused onboarding retest passes390×844,375×667 and430×932 after fix; full original mobile run recorded18 failures and does not become a full pass from this targeted retest. A tiny Try Again target appeared in the resource-constrained dev-server error state and remains a follow-up UI investigation. Storefront checks skipped because no enabled storefront existed in the fixture.

## Remediation and review boundaries

The branch changes payment/return validation and locking, supplier posting date, offline retry/scope/store cache migration, matching regression tests, one shared mobile control, and Node/CI pins. Final verification:4,017 unit tests passed with21 skipped;138 selected PostgreSQL/concurrency tests passed with two skipped;231 focused POS-safety tests passed;106 final focused financial/offline/store-control regressions passed; six native browser storage checks passed. These overlap and must not be added together. The seeded SQLite production build completed successfully. No database migration or production data rewrite is required for these fixes. IndexedDB changes are an application/SW local schema migration, not a PostgreSQL migration.

Audit branch automatic Vercel Git deployment is disabled in its `vercel.json` so opening the review does not intentionally deploy it. Keep approval as a separate release step. Do not merge this document's open risks into an assertion that code changes have resolved them.

## Before the first paying customer

1. Review and approve the financial/offline patch; require clean CI on the exact reviewed commit and complete the remaining interleaving/retry checks.
2. Patch applicable framework/import/image dependencies on a separate controlled branch; establish current advisory status again at release time.
3. Resolve TF-009 with measured isolated workload evidence. Set an operational target for checkout/error rate and owner-visible recovery; do not buy a larger database before locating the bottleneck.
4. Complete authenticated desktop/tablet/mobile acceptance: register a new Ghana business, choose each permitted plan, import opening stock, create cashier, trade, retry a failed save, return a full sale, close, export/report. Prove direct route/action denial for excluded plans and expired/suspended accounts.
5. Complete offline matrix: refresh while disconnected, interrupted sync, delayed sync to closed shift, stock conflict, duplicate replay from two devices, tenant switch, recovery after failure. No blanket offline guarantee until passed.
6. Restore an actual application export into a fresh isolated target and compare stock, AR/AP, drawer and journal control totals. Document recovery owner, credentials access, six-hour history limit, RPO/RTO and a regular off-platform export process that does not expose secrets.
7. Resolve historical demo/data provenance before giving staff the demo. Produce a reproducible demo seed in an isolated business, clearly labelled fictional; no changing real opening balances to make a demo appear balanced.
8. After explicit production approval, release the tested commit, verify domains/runtime/DB isolation, run read-only production smoke, inspect errors and keep rollback ready. Only then onboard one supervised paying business, reconcile daily for at least a full trading week, and expand to a few businesses before pursuing20.

November2026 is a target, not a reason to waive gates. Family-led sales can gather leads, arrange demos and practise training now; they should not promise production reliability, automated provider confirmation or partial-return workflows that have not been proved. No large engineering team or new paid infrastructure is required by this report.

## Deployment and rollback instructions (approval required; not executed)

- Rebase/retest if `master` moves. Confirm the reviewed SHA, lockfile, clean lint/typecheck/unit/PG results, and native browser schema-upgrade proof.
- Configure an approved isolated preview explicitly; no shared production URL/DB fallback. Branch auto-deploy remains disabled until approval. Validate package22 against effective Vercel runtime before staging.
- Stage a production-target build without domain assignment only after approval; inspect build logs and migrations. `build:vercel` runs `prisma migrate deploy`, so even a build can write its configured database. Do not run that script against production as a mere test.
- Promote only the approved tested production-target deployment. Check checkout/drawer/report operations using authorised records and read-only production health where possible; do not insert fictional trades into real customer tenants.
- Rollback application to the last verified deployment if errors/financial invariants fail. This patch has no PG schema migration; do not reset production data.
- **Offline rollback caveat:** old application code expects IndexedDBv3 and may fail after v4 upgrade. Do not simply roll back to old SW/application code for active offline devices. Retain v4 reader compatibility in a rollback build or suspend offline capture and recover queues with the v4-capable recovery build. Never tell staff to clear browser storage containing unsynced sales.

## Sources and limitations

Code references are repository-relative to audited SHA plus this branch. Primary security advisories retrieved24October2026:

- https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r
- https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55
- https://cdn.sheetjs.com/advisories/CVE-2024-22363
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

The audit is comprehensive in workstream coverage and explicit about missing evidence; it is **not completed certification of every requested scenario**. Tests cannot establish real Ghanaian retailer usability without staff acceptance, or third-party settlement without a provider test transaction. Historical passing commit messages were not used as present test results.
