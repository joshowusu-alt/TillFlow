# Inventory Increase Phase 2 — Discovery Closure

**Status:** CLOSED — ready for controlled Phase 2 implementation  
**Date:** 2026-08-03  
**Scope of this document:** Discovery only. No implementation, migration, or deployment.

Evidence is taken from current `master` (post Phase 1 decrease: `lib/services/inventory-decrease.ts`, PR #67/#72).

---

## A. Balance-lock and concurrency matrix

### Shared primitives (`lib/services/shared/inventory-utils.ts`)

| Helper | Qty | Avg cost | Row lock |
|---|---|---|---|
| `fetchInventoryMap` | Read snapshot | Read snapshot | None |
| `upsertInventoryBalance` | Absolute write | Absolute write | None (RMW) |
| `decrementInventoryBalance` | Atomic `decrement` | Unchanged | Implicit UPDATE lock only |
| `batchDecrementInventoryBalance` | Single SQL atomic `-` | Unchanged | Implicit multi-row UPDATE |
| `incrementInventoryBalance` | Atomic `increment` | Absolute overwrite | Implicit UPDATE lock only |

**Only production writer that uses explicit `SELECT … FOR UPDATE` before valuation:** `createInventoryDecrease` (`lockInventoryBalance`, Postgres path).

### Workflow matrix

| Workflow | Tx boundary | Exact row locked (`FOR UPDATE`)? | Lock before qty/cost calc? | Multi-balance lock order | Qty update | Avg-cost update | Idempotency | Concurrent behaviour |
|---|---|---|---|---|---|---|---|---|
| **Sale (enforce inventory)** `createSale` | `prisma.$transaction` with invoice + journal | No | Pre-tx soft check; in-tx atomic UPDATE | Single multi-row `UPDATE` (PG scan order, not sorted) | Atomic batch decrement | Unchanged | `externalRef` unique + P2002 replay | Qty race-safe vs other atomic writers; can still race absolute RMW writers |
| **Sale (allow-negative)** | Same tx | No | Read then absolute write in tx | Map iteration, unsorted | Absolute RMW | Absolute keep | `externalRef` | Lost updates under concurrency |
| **Sale void/return** `createSalesReturn` | `$transaction` | No | `fetchInventoryMap` then absolute upsert | Map iteration | Absolute RMW restore | Absolute keep | `SalesReturn.salesInvoiceId` unique | Lost updates vs concurrent sale/adjustment |
| **Sale amendment** `amendSale` | `$transaction` | No | Re-fetch then absolute net upsert | Unsorted product set | Absolute RMW | Absolute keep | None beyond business rules | Lost updates |
| **Owner cleanup void** | `$transaction` | No | Read then absolute restore | Unsorted | Absolute RMW | Absolute keep | Status / existing-return guard | Lost updates |
| **Purchase receipt** `createPurchase` | Often **split**: invoice commit then inventory; atomic only if caller passes outer `db` | No | WAC computed from unlocked `fetchInventoryMap` **before** increment | Unsorted product map | Atomic `+` (or bulk `ON CONFLICT` qty `+`) | Absolute stale WAC write | None on inventory | Qty mostly safe; **avgCost TOCTOU**; orphan-invoice risk on split path |
| **Purchase return/void** | `$transaction` | No | Read then absolute decrease | Unsorted | Absolute RMW | Absolute keep | `PurchaseReturn.purchaseInvoiceId` unique | Lost updates |
| **Purchase delete reverse** | `$transaction` | No | Absolute `Math.max(0, …)` write | Line order | Absolute RMW | Unchanged | None | Lost updates |
| **Customer return** | Same as sale void/return | No | Same | Same | Absolute RMW `+` | Absolute keep | Same | Same defect class |
| **Transfer complete** | `$transaction` | No | Source read **outside** tx; in-tx absolute upserts | Per line: fromStore → toStore; lines unsorted | Absolute RMW both sides | Absolute blend at target | Status must be `PENDING` | Lost updates; reverse-transfer deadlock risk |
| **Opening stock** `recordOpeningInventory` | `$transaction` for writes; WAC calc pre-tx | No | WAC from unlocked map before increment | Unsorted | Atomic `+` | Absolute stale WAC | Movement `OPENING_BALANCE_INVENTORY` + `referenceId` | Qty mostly safe; avgCost TOCTOU |
| **Inventory decrease (Phase 1)** | `$transaction` (or nested outerTx) | **Yes (Postgres)** | **Yes** — lock → qty/cost checks → decrement | Single `(storeId, productId)` | Atomic decrement after lock | Locked read only (not rewritten) | `@@unique([storeId, idempotencyKey])` + `payloadHash` + P2002 replay | Safe against concurrent decrease/atomic sale on same row (PG) |
| **Proposed inventory increase** | **Not implemented** (legacy increase throws; action rejects non-DECREASE; stocktake surplus = `SURPLUS_PENDING_REVIEW` only) | — | — | — | — | — | — | Must follow Phase 2 service design below |
| **Online reserve / restore** | Order create tx / caller tx | No (`updateMany` + `gte` / increment) | Predicate update | Unsorted / `Promise.all` | Conditional atomic − / atomic + | Unchanged | Order-level | Optimistic qty guard; unrelated to WAC |

### Classification

| Item | Class |
|---|---|
| Inventory decrease Phase 1 path | **Safe without changes** (for its own contract on Postgres) |
| Sale enforce-inventory qty path | **Safe without changes** for qty vs other atomic/`FOR UPDATE` writers; does **not** prove cross-workflow avg-cost safety |
| Proposed inventory increase | **Safe only with the Phase 2 service design** (mirror decrease: interactive tx, `FOR UPDATE` before valuation, inherit locked avg cost, atomic qty increment without WAC recompute, store+idempotencyKey + payloadHash, reject missing valuation) |
| Sale allow-negative absolute RMW | **Pre-existing defect** — defer (not introduced by increase) |
| Sales return/void/amend/owner-cleanup absolute RMW | **Pre-existing defect** — defer; residual risk: absolute upsert can overwrite a committed increase/purchase qty |
| Transfer absolute RMW + unlocked source check | **Pre-existing defect** — defer |
| Purchase / opening avgCost TOCTOU (compute WAC then absolute write) | **Pre-existing defect** — defer; increase `FOR UPDATE` does **not** make purchase WAC correct under concurrency |
| Purchase invoice vs inventory split transaction | **Pre-existing defect** — defer (orphan invoice) |
| Online reserve/restore | **Unrelated / acceptable** for Phase 2 increase scope |
| SQLite decrease path (no `FOR UPDATE`) | **Unrelated / dev-only residual**; Production is Postgres |

**Do not claim cross-workflow safety merely because the proposed increase uses `FOR UPDATE`.** Absolute RMW writers can still lose updates after the increase commits. Purchase WAC can still overwrite avg cost from a stale unlocked read.

---

## B. Confirmed concurrency defects

1. **Absolute RMW lost updates** — `upsertInventoryBalance` after unlocked/`fetchInventoryMap` read in returns, voids, amends, owner cleanup, transfers, allow-negative sales, purchase returns/deletes.
2. **Purchase/opening WAC TOCTOU** — avg cost computed from a non-locked snapshot, then written absolutely while qty uses atomic increment.
3. **Purchase split transaction** — inventory often applied after invoice commit.
4. **Transfer** — source availability checked outside the write transaction; dual-store absolute writes without global lock ordering.
5. **No multi-product deterministic lock order** on sale batch / transfer lines (deadlock class under reverse contention).

Defects (1)–(5) are **pre-existing**. They are residual risk for Phase 2, not proof that increase-with-`FOR UPDATE` is globally safe.

---

## C. Required concurrency corrections

### Must ship inside Phase 2 increase service

1. Interactive DB transaction (same durability bar as decrease).
2. `SELECT … FOR UPDATE` on the exact `InventoryBalance` row **before** quantity check and valuation.
3. Valuation = locked `avgCostBasePence` only (no `defaultCost` fallback; no user-entered cost).
4. Quantity via atomic increment; **do not recompute or blend WAC** on increase (inherit locked cost; write-through of the same locked avg cost is allowed only to satisfy upsert helpers that require an avgCost field).
5. Persist `StockAdjustment` + `StockMovement` + journal + audit in the same transaction.
6. Required idempotency key; `payloadHash` mismatch → hard fail; unique race → replay/mismatch outside aborted tx.
7. Single product per posting (avoids multi-row lock-order design in Phase 2).
8. Serialize with concurrent decrease/sale on the same row via row lock / UPDATE lock — not via application-level optimism alone.

### Must ship with Phase 2 (reporting — see D)

9. Income-statement / BS NP plug must recognise non-sales inventory-gain income (section D). Without this, Dr 1200 / Cr 4100 is cancelled on the balance sheet by the sale-line-vs-journal NP inventory plug.

### Explicitly not required to unblock Phase 2

- Full rewrite of returns/amends/transfers to atomic ops (defer; track as residual risk).
- Purchase WAC `FOR UPDATE` hardening (defer).
- Automated reversal engine (see E).

---

## D. Approved inventory-gain account and report treatment

### Current COA / reporting facts

- Only income account today: `4000 Sales Revenue` (`lib/accounting.ts`).
- `4100` does not exist.
- No account-range assumption `4000–4999 = sales` in code.
- Gross sales / IS Revenue / GP / till / product / customer revenue KPIs are **sale-invoice/line based**, not GL 4xxx rollups.
- VAT/GST sales report aggregates invoice tax fields, not income accounts.
- IS `otherExpenses` includes journal `EXPENSE` except `5000`; journal `INCOME` is **not** added to IS net profit.
- Balance sheet computes `npAdjustment = saleLineNP − journalNP` and applies it to **inventory** — so an unrecognised Cr 4100 would inflate `journalNP` and **plug away** the inventory debit.

### Recommendation

| Field | Value |
|---|---|
| Code | **`4100`** |
| Name | **Inventory Gain & Surplus** |
| Type | **`INCOME`** |
| Reporting class | **Other operating income** (below gross profit; never “Sales”) |

Journal for a valued increase:

- Dr `1200` Inventory  
- Cr `4100` Inventory Gain & Surplus  

### What 4100 must not inflate

| Metric | Inflates? | Why |
|---|---|---|
| Sales revenue / IS Revenue | No | Sale lines only |
| Transaction / till / product / customer revenue | No | Sale documents only |
| Gross profit | No | `revenue − cogs` from sale lines only |
| VAT/GST sales reporting | No | Invoice VAT aggregates; increase is non-customer, non-VAT |
| Combined with Sales (4000) | No | Distinct code; no 4xxx sales rollup |

### Smallest required reporting correction (ship with Phase 2)

TillFlow cannot presently surface other income on the income statement or in BS equity NP. **Minimum fix:**

1. In `getIncomeStatement`, compute `otherOperatingIncome` = sum of journal balances for `type === 'INCOME' && code !== '4000'` (initially only 4100).
2. Present it as its own line (Other operating income / Inventory gains).
3. `netProfit = grossProfit − otherExpenses + otherOperatingIncome`.
4. Keep Revenue / COGS / Gross profit sale-line-only.
5. Reuse the adjusted NP on the balance sheet so the inventory plug no longer erases 4100-funded stock.

No Prisma schema migration is required to add account `4100` (string code via `ensureChartOfAccounts` / narrow ensure helper analogous to decrease’s 1200+5100 helper).

---

## E. Correction / reversal interim policy

### Mistaken prior guidance (corrected)

Phase 1 UI copy (`inventory/adjustments` empty state) says stock corrections should be recorded as a **decrease**. That is wrong for mistaken decreases and must not be carried into Phase 2.

**A wrongly posted decrease must never be corrected with another decrease.**  
**A wrongly posted increase must never be “fixed” by posting another increase.**

### Temporary pre-reversal rules (until automated reversal exists)

| Mistake | Temporary rule |
|---|---|
| Mistaken **increase** | Owner-only compensating **decrease** for the same store/product/qty, referencing the original increase ID; or wait for automated reversal |
| Mistaken **decrease** | Owner-only compensating **increase** (Phase 2 reasons only if the stock truly exists; otherwise defer to support + automated reversal). **Never** a second decrease |
| Wrong **product** | Compensating opposite on the wrong product **and** correct-direction entry on the right product; both reference the original ID; Owner-only |
| Wrong **store** | Opposite at the wrong store + correct entry at the right store; do not use transfer to “hide” an adjustment error unless it was truly a transfer |
| Wrong **quantity** | Opposite entry for the excess/shortfall quantity only; original remains immutable |
| Wrong **reason** | Do **not** re-post quantity. Annotate via audit/note linked to original ID; quantity-affecting re-post only if quantity/product/store was also wrong |

### May Phase 2 ship before automated reversals?

**Yes**, if and only if compensating entries are constrained as below. Automated reversal remains follow-on work; `reverseStockAdjustmentAction` stays blocked until that design lands.

### Compensating-entry requirements (interim)

1. Original `StockAdjustment` row immutable.  
2. Reference to original adjustment ID (structured in audit `details` JSON + human note in `reason`).  
3. Correction reason code/text distinct from ordinary surplus/found-stock reasons.  
4. Explanatory note (min length, normalised like decrease).  
5. Correct opposite direction only.  
6. **Owner-only** authority (Managers may post ordinary Phase 2 increases; corrections are Owner-only).  
7. Audit linkage both ways in `AuditLog.details` (`correctsAdjustmentId` / `correctedByAdjustmentId` pattern in JSON).

### Schema / migration for linkage

| Need | Migration? |
|---|---|
| Interim audit JSON + reason-text reference | **No** — `AuditLog.details`, `StockAdjustment.reason` already exist |
| Queryable FK `correctsAdjustmentId` on `StockAdjustment` | **Yes** — defer to automated-reversal phase |

Phase 2 may retain linkage **without** a migration for the interim policy. A dedicated column is recommended later, not required to close discovery or ship the minimum increase.

**SYSTEM_CORRECTION** is not a Phase 2 operator reason for routine surplus (see F).

---

## F. Approved Phase 2 reasons

### Minimum release reasons

| Reason code | Use |
|---|---|
| `PHYSICAL_COUNT_SURPLUS` | Stocktake / physical count surplus after review (replaces silent `SURPLUS_PENDING_REVIEW` non-posting when approved) |
| `STOCK_FOUND` | Stock found outside a formal stocktake count workflow |

### Excluded from Phase 2 minimum

| Code | Decision |
|---|---|
| `OTHER_APPROVED` | **Excluded** |
| `SYSTEM_CORRECTION` | **Excluded** from operator UI. Reserve for a later **internal support / Owner-only** workflow that requires original-record reference; not part of minimum surplus posting |
| Supplier delivery, customer return, transfer, sale correction, opening balance, migration correction | **Remain in their proper workflows** — never as inventory-increase reasons |

Phase 1 decrease reasons (including `AUTHORISED_QUANTITY_CORRECTION`) stay decrease-only and are not increase reasons.

---

## G. Valuation decision

**Inherit locked `avgCostBasePence` after `FOR UPDATE`. No user-entered cost in the minimum release.**

| Case | Decision |
|---|---|
| Zero quantity with retained average cost (`qtyOnHandBase = 0`, `avgCostBasePence > 0`) | **Valid** — increase at retained locked avg cost |
| Zero or unknown average cost (`avgCostBasePence <= 0`) | **Reject** (`MISSING_VALUATION`) — same bar as decrease; no `defaultCost` fallback |
| Genuinely free stock | **Out of scope** for minimum release (would need explicit zero-value policy + possibly non-valued qty path); do not allow user cost of 0 as a bypass |
| Previously written down / damaged SKU | Increase inherits **current** locked avg cost of remaining/retained balance; no separate damaged valuation flag on `InventoryBalance` |
| Cost changed by concurrent purchase | Increase holds row lock during its valuation; after commit, purchase may still apply a **stale pre-computed WAC** (pre-existing purchase defect). Increase must **not** recompute WAC |
| Serialize vs purchase WAC | Increase locks and values **before** its own qty write; it does not wait for or participate in purchase WAC. Purchase hardening is separate/deferred. Do not blend purchase cost into the increase |

GL value = `checkedMul(lockedAvgCost, qtyBase)`; post Dr 1200 / Cr 4100 for that value.

---

## H. Schema or migration impact

| Change | Migration needed? |
|---|---|
| Account `4100` seed/ensure | No (data upsert / ensure helper) |
| `StockAdjustment.direction = INCREASE` + new reason codes | No (string fields already) |
| Idempotency / payloadHash / unitCost / value / schemaVersion | No (Phase 1 columns exist) |
| Interim correction linkage | No (audit JSON + reason text) |
| IS other-income field | No (report logic only) |
| Automated reversal FK / status | **Later migration** — not Phase 2 minimum |
| Prisma model changes for increase | None required for minimum |

---

## I. Revised changed-file list (implementation preview — not done here)

| Area | Files (expected) |
|---|---|
| Accounting | `lib/accounting.ts`; new `lib/accounting-inventory-increase-accounts.ts` (+ tests); optional 4100 name constant module |
| Service | new `lib/services/inventory-increase.ts` (+ tests); wire shared increment helper carefully |
| Flag / gate | `lib/inventory-increase-flag.ts` (or extend decrease flag policy — decide at implement); action guards |
| Actions | `app/actions/inventory.ts`; `app/actions/stocktake.ts` (approve/post surplus via increase) |
| UI | `StockAdjustmentClient.tsx`; adjustments page copy (remove “correct with decrease” guidance); reverse form remains blocked |
| Reporting | `lib/reports/financials.ts` (+ tests); financials API/UI labels for other operating income |
| Seed / register | `prisma/seed.ts`; register essentials if accounts are seeded there |
| Tests | service, action contract, reporting, stocktake surplus posting tests |
| Docs | this closure doc; brief OPERATIONS note on interim corrections |

---

## J. Revised acceptance criteria

1. Manager/Owner can post `PHYSICAL_COUNT_SURPLUS` and `STOCK_FOUND` increases only when Phase 2 flag enabled.  
2. Each post runs in one transaction: lock row → validate qty/cost → `StockAdjustment` + movement + Dr 1200/Cr 4100 + audit.  
3. Missing/zero locked avg cost rejected; no user-entered cost; no defaultCost fallback.  
4. Idempotent replay with same payload; mismatch fails closed.  
5. Concurrent decrease/sale on same row cannot oversell below zero when enforce-inventory is on; increase valuation uses locked cost.  
6. Sales, till, product, customer, VAT sales reports unchanged by 4100 postings.  
7. Income statement shows Other operating income (4100) below GP; NP includes it; BS inventory plug does not erase the gain.  
8. `OTHER_APPROVED` and operator-facing `SYSTEM_CORRECTION` absent.  
9. Automated reversal still unavailable; Owner-only compensating opposite entries require original ID + note + audit linkage (JSON).  
10. Wrong-direction “correction” UX copy removed; mistaken decrease must not be corrected by another decrease.  
11. Stocktake surplus posting uses `PHYSICAL_COUNT_SURPLUS` through the increase service (no silent qty write).  
12. Supplier/return/transfer/opening/migration paths unchanged and not re-labelled as increases.

---

## K. Go / no-go decision

**GO** for controlled Phase 2 implementation, with these binding constraints:

- Increase service must mirror Phase 1 decrease locking/idempotency/valuation bars.  
- Account **4100 Inventory Gain & Surplus (INCOME)** plus the **smallest IS/BS other-income correction** are in scope.  
- Reasons limited to **`PHYSICAL_COUNT_SURPLUS`** and **`STOCK_FOUND`**.  
- Interim Owner-only compensating entries allowed; automated reversal deferred; no mistaken same-direction corrections.  
- Pre-existing absolute-RMW and purchase-WAC defects remain **deferred residual risk**, explicitly not cured by increase `FOR UPDATE`.

No discovery blocker remains that requires a schema migration or cross-workflow rewrite before a controlled Phase 2 implement PR.

---

INVENTORY INCREASE DISCOVERY CLOSED — READY FOR CONTROLLED PHASE 2 IMPLEMENTATION
