# TillFlow Reliability Programme — Shared Contracts

Baseline: `origin/master` = `1e176577`.
Commit `6eaf0a2` / branch `audit/tillflow-reliability-p0` do **not** exist locally or remotely.
Integration branch: `audit/tillflow-reliability-programme`.

Agents must not edit files outside their exclusive list. Shared files are integrator-owned.

## Policy decisions (binding)

### P1. Operational POS sale identity
Every operational POS sale (not online-order bypass) MUST belong to:
- one authenticated business
- one active store of that business
- one **active** till of that store
- one **OPEN** shift of that exact till
- one authorised user in the same business/store context

`bypassOpenTillRequirement` is allowed **only** for `lib/services/online-order-commit.ts`. POS, offline sync, and payment/refund cash paths must not set it.

Historical `SalesInvoice.shiftId = null` rows are `UNRECONCILED_LEGACY`. Never fabricate shifts for them. They remain reportable.

### P2. requireOpenTillForSales migration
- Schema + register default: `true` for **new** businesses.
- Existing rows keep stored value (no bulk UPDATE).
- **Server POS enforcement is mandatory regardless of the stored flag.** The flag no longer permits unshifted POS sales. Existing businesses that never opened a till see blocking UI: open a till with float, then sell.
- Settings copy: “Sales require an open till” is always-on for POS. Do not offer a setting that silently allows `shiftId = null`.
- Compatibility: existing false flags are inert for POS; they are not a silent data rewrite.

### P3. Multi-shift per user
**Explicitly support** multiple OPEN shifts per user (one per till).
- One OPEN shift per till (`openKey = tillId`) remains unique.
- Shifts UI lists **all** of the current user’s OPEN shifts in the active store and allows closing each.
- Never `findFirst` as the only visible open shift.

### P4. Till 3 selection
Opening Till 3 makes Till 3 the explicit POS context:
- `openShiftAction` redirects to `/pos?till=<tillId>` (or equivalent explicit till query).
- POS selects `searchParams.till` first if that till is active and has an OPEN shift.
- localStorage must not override server open-shift state: if saved till has no OPEN shift, ignore it.
- Displayed till MUST equal persisted `SalesInvoice.tillId`, `shiftId`, payment parent, and drawer `tillId`/`shiftId`.

### P5. Live tender totals
At sale commit, atomically update the **exact** OPEN shift:
- CASH → expectedCashPence increment + CASH_SALE drawer row
- CARD → cardTotalPence increment
- TRANSFER → transferTotalPence increment
- MOMO → momoTotalPence increment
- Split tender → each component

Close: lock shift row first, then snapshot from invoices/payments (authoritative), write close. Live columns are for in-shift display; close re-sum is the reconciliation source of truth.

### P6. Offline lifecycle
Capture immutable context in the queue item: businessId, storeId, tillId, shiftId, cashierUserId, localSaleTime, localSequence, idempotencyKey, payloadHash, tenders, catalogue version/ids needed to validate.

Sync:
- exact replay (same key + same hash) → existing sale
- same key, different hash → reject
- original shift closed → attach to **original** shift as late-offline (`saleSource = LATE_OFFLINE` or equivalent auditable classification). Do **not** reassign to a later open shift.
- stock decrement exactly once
- statuses: synced | already_synced | needs_review | rejected (safe reason)
- never tell cashier to recreate without checking the idempotency key
- tenant mismatch → reject

### P7. Money movements
Every externally repeatable money command: durable idempotency key, payload hash, exact replay, mismatch reject.
Concurrent payments cannot overpay. Status from payment sum inside locked transaction.
Drawer + journal + operational row commit or all roll back.
`PurchasePayment.businessId` always set on new rows.

### P8. Cache tags (tenant-scoped)
Readers and writers must use the same tags:
- `pos-products:{businessId}`
- `pos-inventory:{businessId}:{storeId}`
- `pos-tills:{businessId}:{storeId}`
- `pos-shifts:{businessId}:{storeId}`
- `pos-categories:{businessId}`
- `pos-customers:{businessId}`
- `checkout-context:{businessId}`

After successful checkout: optimistic client stock + invalidate store-scoped inventory.
Business A must not require evicting Business B.

### P9. Integrity vs best-effort
In-transaction (or durable outbox): stock movement, journal, cash drawer, idempotency record, essential audit.
Forbidden: serverless fire-and-forget with empty `catch`.
Best-effort (logged, no empty catch): notifications, analytics, celebrations, low-stock WhatsApp.

### P10. Catalogue
Do not hydrate 50k full products into PosClient. Minimal sellable DTO. Indexed local snapshot for offline scope. Server search/pagination for large catalogues. No images on checkout path.

## File ownership (exclusive)

### Agent A — shifts/tills
- `lib/services/shifts.ts`
- `lib/services/cash-drawer.ts` (+ tests)
- `app/actions/shifts.ts`
- `app/(protected)/shifts/**`
- `components/TillManagement.tsx`
- Till CRUD + requireOpenTill copy in `app/actions/settings.ts` and settings tills UI only
- `app/actions/register.ts` (default true)
- `lib/pos/till-context.ts` (NEW — selection helpers)
- `app/(protected)/products/new/page.tsx` (NEW redirect to `#product-create`)
- `components/ReadinessJourney.tsx` (product link only)
- `app/(protected)/setup/opening-stock/OpeningStockClient.tsx` (empty-state link only)
- `lib/services/sales.ts` — **only** till/shift gate, live tender increments, in-tx shift lock, stockMovement moved in-tx. Do not refactor catalogue, payments, or offline modules.
- `lib/services/sales.test.ts` and `checkout-shift-cashdrawer-rtx.test.ts` for shift/till cases
- `app/(protected)/pos/PosClient.tsx` — till selection / tillReady / no-till block only
- `app/(protected)/pos/PosClient.test.tsx` — till cases only
- `prisma/schema.prisma` + `schema.postgres.prisma` — `requireOpenTillForSales @default(true)` and `SalesInvoice.saleSource` / `unreconciledLegacy` if needed
- matching forward-only SQL migration

Do not edit: offline/*, payments.ts, expenses*, purchases.ts, PosBoard product query, CI yaml.

### Agent B — offline
- `lib/offline/storage.ts` (+ tests)
- `lib/offline/sync.ts`
- `lib/offline/dead-letter.ts`
- `app/api/offline/process-offline-sale.ts` (+ tests)
- `app/api/offline/sync-sale/route.ts`
- `app/api/offline/batch-sync/**`
- `public/sw.js` (sync/dead-letter dequeue only)
- `app/offline/sales/page.tsx`
- `components/NetworkStatus.tsx` (status labels only)
- `lib/offline/capture.ts` (NEW)
- Prisma: `OfflineSaleAttempt` or fields on a new model — propose in `docs/reliability/agent-b-schema-proposal.md` if A already owns schema; integrator merges.

PosClient: only the `queueOfflineSale` call to persist new capture fields. Coordinate via NEW helper `lib/offline/capture.ts` that PosClient already can import.

Do not edit sales.ts (call createSale; add optional `saleSource` / `capturedShiftId` args only if already present — otherwise document required sales.ts hook in `docs/reliability/agent-b-sales-hook.md`).

### Agent C — money concurrency
- `lib/services/payments.ts` (+ tests)
- `lib/services/expensePayments.ts`
- `lib/services/expenses.ts`
- `lib/services/purchases.ts`
- `lib/services/returns.ts` (remove empty catch; drawer failure rolls back)
- `app/actions/payments.ts`, `app/actions/expense-payments.ts`
- `lib/services/payments-concurrency.test.ts` (extend)
- `lib/services/money-idempotency.ts` (NEW helpers)
- Prisma payment idempotency columns — `docs/reliability/agent-c-schema-proposal.md` + migration SQL under `prisma/migrations/` with a unique timestamp after A's migration.

Do not edit sales.ts, shifts.ts, cash-drawer.ts (use existing `recordCashDrawerEntryTx`; A will make it atomic). Do not empty-catch drawer errors.

### Agent D — catalogue scale
- `lib/pos/**` except `till-context.ts`
- `lib/payments/pos-search.ts`, `pos-barcode.ts`, `pos-weighed-barcode.ts`, `pos-completion.ts` (DTO only)
- `hooks/usePosBarcodeHandler.ts`
- `app/(protected)/pos/PosBoard.tsx` — product/inventory query + DTO shape only
- `components/pos/PosProgressiveShell.tsx` — product props only
- `scripts/perf/pos-catalogue-scale*` (NEW POS benches, not Home)
- `app/api/offline/cache-data/route.ts` (minimal DTO, no images)
- `lib/offline/useOfflinePos.ts` wiring for snapshot

Do not edit till selection, sales.ts, CI yaml, cache invalidation call sites in purchases/returns.

### Agent E — cache, audit, observability
- Cache tag helpers `lib/cache/pos-tags.ts` (NEW)
- Invalidation at writers: sales completeSale revalidate, returns, purchases, inventory, import, products, settings tills, shifts, refresh.ts, PosBoard/PosDeferredSection **tag names only**
- `lib/observability.ts` + checkout metrics
- Move remaining FAF empty catches
- `PosDeferredSection.tsx` loadSettled logging (no swallow)

If A/D already edited PosBoard/PosDeferredSection, only change tag strings via `lib/cache/pos-tags.ts`.

### Agent F — CI / E2E / tenancy tests
- `.github/workflows/**`
- `playwright.config.ts` + new specs under `playwright/`
- Postgres checkout/shift/concurrency test runner scripts
- Timezone `TZ=Africa/Accra` in CI
- Tenant-adversarial tests
- Do not change production product code except tests.

### Agent G — review only
No edits.

## Integration order
A → C → B → E → D → F → G review → gates → PR → Preview only.

---

## Blocker-closure contracts (2026-08-30, SHA `2d758385`)

These are P1 until disproved. Agents must not invent a later OPEN till.

### P11. Explicit cash-drawer destination
Every till-funded cash movement MUST identify one exact active till and one OPEN shift in the same business/store.

- Cash expense create/pay and cash supplier payment (including cash purchase create) require `tillId` (and optional `shiftId`).
- Server validates: business, store, active till, OPEN shift on that till, authorised actor, tenant chain.
- `getOpenCashShiftForPayment` MUST NOT fall back to the user's newest OPEN shift.
- Invoice-till fallback (`fallbackTillId`) is allowed only when the economic event has an authoritative invoice till (customer receipt, sales cash refund). Purchase cash refunds must also pass an explicit till or the purchase store's selected till — never user-newest.
- If no suitable OPEN shift: reject with a clear operational message.
- Non-cash methods create no drawer entries.
- Exact replay must not duplicate drawer or journal.

### P12. Import chunk idempotency
Paid (and unpaid purchase) import chunks MUST use a deterministic key, never `randomUUID()` per retry:

`IMPORT:{businessId}:{importRunId}:{mode}:{op}:{supplierOrEquity}:{chunkIndex}`

Create the `ProductImport` row **before** chunk writes so `importRunId` exists. Payload hash covers lines, amounts, method, store. Exact retry returns prior invoice. Same key/different payload rejects. Partial failure resumes later chunks without duplicating earlier ones. Cross-business key injection rejects.

### P13. LATE_OFFLINE decision is in-transaction
`process-offline-sale` always passes `capturedShiftId`. It MUST NOT decide `saleSource` from a pre-transaction shift read.

Inside `createSale`'s transaction:
1. Lock the captured shift row (`FOR UPDATE` on Postgres; equivalent serialize on SQLite).
2. Re-read status.
3. If OPEN and still the till's valid shift → attach and update **that** shift (ordinary sync).
4. If CLOSED → `saleSource = LATE_OFFLINE`, invoice.shiftId = captured id, no tender/drawer on a later OPEN shift.
5. Concurrent close/reopen: exactly one valid ordering. Replay remains exact-once.

### P14. Inventory writers must pass storeId
`revalidatePosCatalog(businessId)` without storeId does **not** evict `pos-inventory:{biz}:{store}`. Every inventory-qty writer must call a helper that requires storeId (or both stores for transfers). Product-only mutations may skip the inventory tag.

### P15. Paged POS must not load all inventory
When `catalogueMode === 'paged'`: do not `inventoryBalance.findMany` for the whole store; do not hydrate all products. Barcode and search join balances only for returned product IDs. Offline cap remains 5,000 with honest UI copy.

### Blocker-closure file ownership (exclusive)

**WS1 explicit drawer** — `lib/services/cash-drawer.ts` (+test), `expenses.ts`, `expensePayments.ts`, `payments.ts` (+tests), `purchases.ts` (tillId on cash only), `purchase-cash-drawer.test.ts`, `expenses-cash-drawer.test.ts`, `returns.ts` purchase-refund till only, `app/actions/expenses.ts`, `expense-payments.ts`, `payments.ts`, `purchases.ts`, `app/(protected)/expenses/page.tsx`, `payments/expense-payments/page.tsx`, `payments/supplier-payments/page.tsx`, `components/SupplierPaymentForm.tsx`, `app/(protected)/purchases/PurchaseFormClient.tsx` (till field only). Do not edit sales.ts, process-offline-sale, import-stock, PosBoard, pos-tags.

**WS2 import idempotency** — `app/actions/import-stock.ts`, `lib/import/import-chunk-identity.ts` (NEW), `lib/services/money-idempotency.ts` (add IMPORT hash + kind only), import tests. Do not edit cash-drawer, expenses, payments services, sales.ts, PosBoard.

**WS3 LATE_OFFLINE tx** — `lib/services/sales.ts`, `lib/services/sales.test.ts`, `app/api/offline/process-offline-sale.ts` (+test). Do not edit cash-drawer, import-stock, PosBoard, pos-tags.

**WS4 cache** — `lib/cache/pos-tags.ts` (+test), `app/actions/products.ts`, `repair.ts`, `reorder.ts`, `reset-purchase-data.ts`, inventory/stocktake if missing storeId. Do not edit PosBoard queries, sales.ts, import-stock, cash-drawer.

**WS5 paged inventory** — `app/(protected)/pos/PosBoard.tsx`, `lib/pos/sellable-dto.ts`, `app/api/pos/search/route.ts`, `app/api/pos/barcode/route.ts`, related pos tests, offline cache-data cap copy. Do not edit sales.ts, payments, import-stock, cash-drawer.

Integration order: WS1 → WS3 → WS2 → WS4 → WS5 → WS6 benches → WS7 Phase 9 → Agent G.
