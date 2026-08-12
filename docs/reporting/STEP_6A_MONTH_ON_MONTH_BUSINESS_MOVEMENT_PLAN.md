# Step 6A — Month-on-Month Business Movement Report (plan)

## 1. Verdict

**BUSINESS MOVEMENT PLAN PASSED — ready to implement first insight report.**

Core MoM comparisons (sales, Money Received, refunds/amends, product winners/decliners, branch, cashier, owner actions) can be built on existing TillFlow data with deterministic, auditable rules.

**Stock-linked sales-drop insights are gated by a stock availability data-readiness rule (§4.1).** Today that gate is **NOT RELIABLE** for historical availability. Therefore Step 6B–6F must **not** state days-at-zero, likely stock-out date, or that stock caused a sales drop. Current stock may appear only as a **weak signal** with an explicit “cannot confirm historical availability” disclosure. Stronger stock-causation copy is blocked until snapshots or a complete stock ledger exists (future step; may need migration — not in 6B).

## 2. What this report should answer

For an Owner/Manager comparing two periods (default: last calendar month vs prior calendar month, business timezone):

1. **Did the business move up or down?** — headline sales and money received.
2. **Where did the change come from?** — products, branches, cashiers that contributed most to the delta.
3. **Is cash tracking sales?** — sales (`createdAt`) vs Money Received (`receivedAt`) movement (credit timing, MoMo pending).
4. **What leaked?** — refunds, voids, sale-amend money out.
5. **What should I look at next?** — short, data-backed action list (not AI prose).

Every insight uses this format (no generative AI):

| Part | Meaning |
| --- | --- |
| **Fact** | Named calculation from TillFlow data |
| **Evidence** | The rows / aggregates / as-of timestamp that support the fact |
| **Signal** | Interpretable only at the strength the data-readiness gate allows (strong / weak / none) |
| **Recommended check** | Concrete next step for the owner (open a report, check restock timing, etc.) |

Do **not** use vague stock language such as “current stock is low, review availability” as the finished standard.

## 3. Data sources (existing)

| Domain | Source | Period field | Reliability for MoM |
| --- | --- | --- | --- |
| Sales revenue | `SalesInvoice.totalPence` via `salesRevenueWhere` / `getSalesRevenueSummary` | `createdAt` | **Strong** — exclude `RETURNED`/`VOID` |
| Sale lines / products | `SalesInvoiceLine` → `productId`, `lineTotalPence`, `qtyBase` | parent sale `createdAt` | **Strong** for volume/value; GP only if costs complete |
| Tx count | Count of in-scope invoices | `createdAt` | **Strong** |
| Money Received | `lib/reports/money-received` (`money_received*`) | `SalesPayment.receivedAt`, `CONFIRMED` | **Strong** — do not change aggregation |
| Needs MoMo confirmation | `unverified_legacy_receipts` / MoMo confirmation report | `receivedAt`, non-classified status | **Strong** as side metric |
| Refund outflows | `refund_outflows` (`SalesReturn` RETURN) | return `createdAt` | **Strong** |
| Sale amends (money) | Negative CONFIRMED `SalesPayment` inside Money Received | `receivedAt` | **Strong** if labelled separately |
| Voids / returns count | `SalesReturn` / invoice status | `createdAt` | **Strong** as counts |
| Branch | `SalesInvoice.storeId` (authorised stores) | — | **Strong** — prefer `storeId` over nullable `branchId` |
| Cashier | `SalesInvoice.cashierUserId` | — | **Medium–Strong** — Weekly Digest already uses |
| Purchases / restock | `PurchaseInvoice` / lines | purchase `createdAt` | **Medium** — optional v1.1 context |
| Expenses | `Expense.createdAt` / journals in financials | recorded date | **Weak for MoM insight** — disclose recorded-at; defer OpEx MoM |
| Current stock risk | `InventoryBalance` + `classifyInventoryState` | **as-of now** | **Point-in-time only** — weak signal |
| Stock movements | `StockMovement` | `createdAt` | **Incomplete ledger** — see §4.1 |
| Days out of stock / availability series | — | — | **Not reliable today** — gated |

### Contracts to preserve (do not reopen)

- Option B: sales = invoice `createdAt`; money = payment `receivedAt` (`docs/reporting/OPTION_B_REVENUE_RECEIPTS_CONTRACT.md`).
- Money Received Phase 1: CONFIRMED only; parent RETURNED/VOID does not erase confirmed receipts; refunds separate; amends net inside money received; `PENDING_MANUAL` excluded until confirmed.
- Store scope fail-closed; Owner/Manager only.

## 4. What is ready vs missing / weak

### 4.1 Stock availability data-readiness gate (required before stock-linked claims)

Before TillFlow makes **stock-linked sales-drop statements**, it must verify whether historical stock availability for the compared period can be reconstructed reliably.

#### Inputs required for a reliable reconstruction

| Input | Present in TillFlow? | Usable for daily availability? |
| --- | --- | --- |
| Opening stock | Partial (`OPENING` / opening-stock flows) | Weak — often qty-only movements |
| Sales stock deductions | Yes (`SALE` with `beforeQtyBase` / `afterQtyBase` on checkout) | Strong for sale events only |
| Purchases / restocks | Yes (`PURCHASE` / `OPENING` movements) | **Weak** — `purchases.ts` writes movements **without** `beforeQtyBase` / `afterQtyBase` |
| Stock adjustments | Yes (increase/decrease helpers) | Strong when those writers run (breadcrumbs present) |
| Stocktakes | Yes (sessions → adjustments / counts) | Medium — event-based, not a continuous series |
| Transfers | Yes (`stock-transfers.ts` writes before/after) | Strong for transfer events |
| Timestamps on movements | Yes (`StockMovement.createdAt`) | Strong for ordering events that exist |
| Current inventory balance | Yes (`InventoryBalance.qtyOnHandBase`) | Point-in-time only — not period history |

#### Gate result (as of Step 6A / pre-6B)

**NOT RELIABLE** for period stock availability.

Reasons:

1. No inventory snapshot / availability ledger table.
2. Purchases, sales returns, and sale amendments commonly omit `beforeQtyBase` / `afterQtyBase`, so walking from current balance backward through the period is **gappy and not product-grade**.
3. Current balance alone cannot prove how many days an SKU was at zero or below reorder during the month.

Therefore, until a later readiness flip (snapshots or complete ledger — plan separately; may need migration):

| Allowed | Forbidden |
| --- | --- |
| Sales-drop **Fact** from sales lines | “Out of stock for X days” |
| Current stock as **weak Evidence** (as-of timestamp) | “Likely date stock ran out” |
| Signal: “cannot confirm historical availability” | Implying stock **caused** the sales drop |
| Recommended check: restock timing / reorder / purchases | Broad fluff: “stock is low, review availability” as the finished insight |
| Lost-sales estimates from unavailable days | |

#### When the gate becomes RELIABLE (future)

Only after TillFlow can reconstruct, per store×product×trading day (or equivalent continuous ledger), on-hand qty through the period. Then insights **may** state:

- days at zero stock
- days below reorder / minimum level
- likely date stock ran out
- whether the sales drop **overlaps** unavailable / low-stock days

Copy strength then upgrades from weak signal → evidence-backed availability signal (still prefer “likely contributed” over absolute causation unless lost-sales math is separately contracted).

### Ready for v1 facts (non-stock)

- Calendar (or equal-length) period MoM for sales value, tx count, product contribution, branch contribution, cashier contribution.
- Money Received MoM + method split + refund outflows MoM + unverified MoMo side card.
- Absolute / % change and contribution-to-change for products and branches.
- Owner action list driven by thresholds (see §7), with stock actions limited by §4.1.

### Weak — include with disclosure

- Gross profit MoM if `lineCostPence` / WAC incomplete → show only when coverage ≥ threshold, else omit or mark incomplete.
- Expenses MoM → defer or “recorded expenses” footnote only.
- Analytics TZ discipline is weaker than Money Received / reporting-scope; **Business Movement must use business-TZ half-open bounds** (same pattern as Money Received `scope-clock`).
- Current stock on decliners → **weak signal only** (§4.1 / §5.7).

### Missing — do not claim as fact in v1

- Historical days out of stock / overlap with sales drop / lost sales from stockouts (**gate NOT RELIABLE**).
- Proven causal link “sales dropped **because** of stock-out.”
- Payment reversal ledger (still gated).
- Immutable monthly snapshots (optional later; not required to ship v1 sales/money MoM).

## 5. Report design — sections

**Route:** `/reports/business-movement`  
**Module (proposed):** `lib/reports/business-movement/`  
**Access:** Owner + Manager; Cashier denied  
**Default scope:** All authorised branches; last full calendar month vs prior full calendar month (business TZ). Allow custom equal-length windows later; v1 can ship calendar months + “last 30 days vs prior 30 days.”

### 5.1 Headline comparison

| Fact | Formula |
| --- | --- |
| Sales current / prior | Σ `SalesInvoice.totalPence` in period, excl. RETURNED/VOID |
| Sales Δ / % | absolute and pct vs prior |
| Money received current / prior | canonical `money_received` for each period scope |
| Money received Δ / % | absolute and pct |
| Sales vs money gap note | Fact: both values; Recommendation only if gap or MoMo pending exceeds thresholds |

### 5.2 Sales movement

- Sales value, transaction count, average basket (sales / tx).
- Optional: void count, return count (facts).

### 5.3 Money received movement

- Reuse `computeMoneyReceivedBundle` (or equivalent) twice — **no formula fork**.
- Method cards: cash / MoMo / card / transfer / other.
- Side: Needs MoMo confirmation total (link to `/reports/momo-confirmation`).
- Side: Refund outflows Δ.
- Side: Sale-amend money-out sum (filter negative CONFIRMED payments or row-kind) — fact inside money received, labelled clearly.

### 5.4 Refunds / amendments movement

| Fact | Source |
| --- | --- |
| Refund outflows current/prior/Δ | `refund_outflows` |
| Return count / void count | `SalesReturn` / invoice status |
| Amend money-out | Negative CONFIRMED `SalesPayment` in period |

Do not subtract refunds from Money Received headline (contract).

### 5.5 Product winners

Top N products by **contribution to sales increase** (or largest positive Δ in line sales).  
Columns: product, prior sales, current sales, Δ, % Δ, contribution share of total sales Δ (when total Δ ≠ 0).

### 5.6 Product decliners

Top N by contribution to sales decrease (largest negative Δ).  
Same columns. Suppress % when prior = 0 (show “new” / “stopped” labels instead of ±∞).

### 5.7 Stock availability signal on decliners (readiness-gated)

**Not** a free-standing “stock is low” section. Attach only to products that already have a sales-drop **Fact**.

#### When gate = NOT RELIABLE (current TillFlow — bind in 6B/6E)

Insight shape: **Fact → Evidence → Signal → Recommended check**

Example (required tone):

> **Fact:** Frytol 1L sales fell by GH¢1,240 vs last month.  
> **Evidence:** Line sales MoM for this SKU; current on-hand = 0 (as of {timestamp}, {branch}).  
> **Signal:** Weak — TillFlow cannot confirm how long it was unavailable during the period.  
> **Recommended check:** Check restock timing / purchases before treating this as lower demand.

Rules:

- Show current stock qty + `classifyInventoryState` only as weak evidence.
- Clearly say TillFlow **cannot yet confirm historical availability**.
- Do **not** claim days at zero, days below reorder, likely stock-out date, or that stock caused the drop.
- Do **not** ship vague copy like “current stock is low, review availability” as the finished insight.
- If current stock is healthy → omit stock signal entirely (sales drop stands alone; recommend reviewing winners / demand).

#### When gate = RELIABLE (future — after snapshots or complete ledger)

Same Fact → Evidence → Signal → Recommended check shape, but Evidence may include reconstructed availability:

Example (target tone — **blocked until readiness flip**):

> **Fact:** Frytol 1L sales fell by GH¢1,240 vs last month.  
> **Evidence:** Stock records show it was at zero for 5 trading days, including the final 3 days of the period.  
> **Signal:** Availability likely contributed (sales-drop days overlap zero-stock days).  
> **Recommended check:** Review restocking timing before reducing future orders.

### 5.8 Branch movement

Per authorised store: sales current/prior/Δ/%, contribution to total sales Δ.  
Optional: money received by store (same Money Received branch filter).

### 5.9 Cashier movement (if useful)

Include when ≥2 cashiers with sales in either period.  
Facts: sales, tx count, void count Δ.  
Avoid punitive language; recommendation = “Review void pattern on Risk Monitor / Weekly Digest” when void rate rises above threshold.

### 5.10 Owner action summary

Deterministic checklist (max ~5–7 bullets), each tied to a fact ID:

| Trigger (fact) | Recommended check |
| --- | --- |
| Needs MoMo confirmation > 0 (or Δ up) | Open MoMo Confirmation Review |
| Top decliner + current stockout/critical (**weak** stock gate) | Check restock timing / purchases — do **not** treat as proven lower demand |
| Refund outflows % of sales up beyond threshold | Review returns on Sales / Risk |
| Money received Δ ≪ sales Δ (gap threshold) | Review credit collections timing and pending MoMo |
| Single branch drives most of negative Δ | Open that branch filter on this report / Trading Dashboard |
| No material change | “No large movement this period — keep monitoring winners.” |

## 6. Exact calculations

### 6.1 Periods

```
timeZone = Business.timezone
currentStart = start of calendar month M (or start of selected window)
currentEndExclusive = start of next month (or end+1 day of window)
priorStart = start of month M-1 (or window shifted back by equal length)
priorEndExclusive = currentStart
```

Half-open `[start, endExclusive)` in business TZ — align with Money Received `scope-clock` / `reporting-scope`.

### 6.2 Change maths

For any metric value `C` (current), `P` (prior):

| Name | Formula | Notes |
| --- | --- | --- |
| Absolute change | `C - P` | Always defined |
| Percentage change | `(C - P) / P × 100` | **Undefined** if `P = 0`; UI shows “—” or “new” / “from zero” |
| Contribution to change (entity i) | `(C_i - P_i) / Σ_j (C_j - P_j)` when total Δ ≠ 0 | For products/branches; if total Δ = 0, omit contribution or show absolute only |
| Share of current | `C_i / C` | Optional context |

### 6.3 Sales / product / branch / cashier

Reuse `REPORTING_EXCLUDED_SALE_STATUSES` / `salesRevenueWhere`.  
Product sales = Σ `SalesInvoiceLine.lineTotalPence` (or agreed line field used by Analytics/Margins — pick one and lock in tests) for lines whose parent invoice is in-scope.  
Do not invent a second sales definition.

### 6.4 Money Received

Call existing Money Received compute for each period scope (`businessId`, `branchIds`, `periodStart`, `periodEndExclusive`).  
Method splits and `refund_outflows` / `unverified_legacy_receipts` from the same bundle.

### 6.5 Stock availability (readiness-gated)

```
stockAvailabilityReadiness = NOT_RELIABLE | RELIABLE   // module constant / capability flag until ledger exists
stockState(product, store) = classifyInventoryState(qtyOnHandBase, reorderPointBase)  // as-of now only when NOT_RELIABLE
```

When `NOT_RELIABLE` (current default):

- Do not compute days at zero, days below reorder, or stock-out date.
- Attach current qty/state to decliners only as weak evidence with as-of timestamp.

When `RELIABLE` (future):

- Reconstruct on-hand by trading day (or continuous ledger) from snapshots / complete movements.
- Then compute days at zero, days below reorder, likely stock-out date, overlap with sales-drop window.

### 6.6 Threshold defaults (tunable constants)

| Constant | Suggested v1 default | Purpose |
| --- | --- | --- |
| `MIN_ABS_SALES_DELTA_PENCE` | e.g. 100_00 (₵100) | Ignore noise in winners/decliners |
| `MIN_PCT_FOR_INSIGHT` | e.g. 10% | “Meaningful” movement copy |
| `TOP_N_PRODUCTS` | 5 | Winners / decliners |
| `STOCK_PROXY_MIN_DROP_PENCE` | e.g. 50_00 | Min sales drop before attaching **weak** current-stock signal |
| `STOCK_AVAILABILITY_READINESS` | `NOT_RELIABLE` | Flip only after ledger/snapshot readiness review |
| `MOMO_PENDING_ACTION_PENCE` | e.g. 1_00 | Surface MoMo action |
| `SALES_VS_MONEY_GAP_PCT` | e.g. 15% | Gap recommendation |
| `VOID_RATE_LIFT_PP` | e.g. +2 pp | Cashier void attention |

Document constants next to compute module; tests lock behaviour.

## 7. Insight rules (deterministic)

### 7.1 When to say product sales dropped (fact)

- Product has `Δ = C - P < 0` **and** `|Δ| ≥ MIN_ABS_SALES_DELTA_PENCE`.
- Copy: “Sales for {product} fell by {money} ({pct}%) vs prior period.”
- If `P = 0` and `C > 0`: “New in this period” — not a drop.
- If `C = 0` and `P > 0`: “No recorded sales this period (had {money} prior).”

### 7.2 When to attach a stock signal to a sales drop

**Always run the §4.1 readiness gate first.**

#### Gate = NOT_RELIABLE (6B default)

Attach stock copy only if:

1. Product qualifies as decliner (§7.1).
2. `|Δ| ≥ STOCK_PROXY_MIN_DROP_PENCE`.
3. Current `stockState` ∈ {`stockout`, `critical`} (or qty known and ≤ 0 / at critical band) for the scoped store.

Then emit **Fact → Evidence → Signal → Recommended check** using the weak template in §5.7.  
Do **not** imply causation. Do **not** invent days unavailable.

If inventory healthy/unknown → sales-drop Fact only; no stock Signal.

#### Gate = RELIABLE (future)

Additionally require reconstructed evidence (days at zero / below reorder / overlap). Only then may Signal say availability likely contributed.

### 7.3 When to avoid making a claim

- Prior = 0 and interpreting % change.
- GP / margin when cost coverage incomplete.
- Any historical stock claim while gate = `NOT_RELIABLE`.
- Implying stock caused a sales drop without RELIABLE overlap evidence.
- Vague stock fluff as the finished insight (“review availability”).
- Cross-tenant or unauthorised store.
- Treating Money Received Δ as “sales performance.”
- Treating `PENDING_MANUAL` as confirmed cash.
- Inferring receipt origin or payment method remaps.
- Expenses as “profitability” without incurred-at.

### 7.4 Insight format (mandatory)

| Part | Sales/money example | Stock (NOT_RELIABLE) example |
| --- | --- | --- |
| **Fact** | “Money received fell ₵X (Y%).” | “Frytol 1L sales fell by GH¢1,240 vs last month.” |
| **Evidence** | Bundle metric IDs + period scope | MoM line sales + current on-hand 0 as of timestamp |
| **Signal** | Method mix / MoMo pending side facts | “TillFlow cannot confirm how long it was unavailable during the period.” |
| **Recommended check** | “Review MoMo confirmations (₵Z pending).” | “Check restock timing before treating this as lower demand.” |

UI may render the four parts as compact prose or labelled lines; strength of Signal must match readiness.

## 8. UI proposal

### Route and chrome

- Path: `/reports/business-movement`
- Nav: Reports → “Business Movement” (Owner/Manager)
- Hub card on `/reports`
- Scope chrome: period pair, branch, generated-at, timezone (mandatory)
- Links out: Money Received, MoMo Confirmation, Trading Dashboard, Reorder Suggestions (Growth+ if gated)

### Layout (one job per section)

1. Title + one sentence: “What changed this month vs last — facts first.”
2. Headline strip: Sales Δ, Money Received Δ (large numbers).
3. Filters: period preset, branch.
4. Sections 5.2–5.9 as stacked report cards (tables, not dashboard clutter).
5. Owner action summary pinned near top on mobile / after headline on desktop.
6. Empty / thin data: honest empty states (“Not enough sales in prior period to compare”).

### Export

| Format | Path (proposed) | Contents |
| --- | --- | --- |
| CSV | `/exports/business-movement` | Meta (periods, TZ, business, branch, completeness), headline metrics, product winners/decliners, branch rows, cashier rows, action triggers as facts |  
| Completeness | `X-Export-Completeness: COMPLETE_STREAM` | Same streaming discipline as Money Received |

Optional later: PDF one-pager for owners — not required for v1.

## 9. Tests and validation

### Unit / focused

- Period bound construction (calendar month, TZ edge cases).
- Δ / % / contribution maths (incl. P=0, total Δ=0).
- Sales exclusion of RETURNED/VOID.
- Money Received compute invoked with two scopes; **golden equality** with standalone Money Received for same scope (parity test — proves no fork).
- `STOCK_AVAILABILITY_READINESS = NOT_RELIABLE`: insight builder never emits days-at-zero / stock-caused language; weak template used when current stockout/critical.
- Healthy stock + sales drop → no stock Signal.
- Access: Owner/Manager allow; Cashier deny; fail-closed store.
- Export COMPLETE_STREAM + scoped rows.

### Preview / production (later steps)

- Hosted preview with synthetic two-month data.
- Production smoke: page renders, export header, no server errors, Money Received parity spot-check.

### Non-goals for tests (until readiness flip)

- Emitting historical stock-out day counts from incomplete movements.
- Lost-sales attribution.
- Production migrations for snapshots.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Owners confuse sales MoM with cash MoM | Dual headline + explicit copy; link Money Received |
| Stock-out language over-trusted | §4.1 gate + Fact→Evidence→Signal→Check; forbid days/causation while NOT_RELIABLE |
| Vague “review availability” copy | Ban as finished insight; require recommended check specificity |
| Cost-incomplete GP misleads | Gate GP section on coverage |
| MoMo pending understates cash MoM | Surface unverified metric + link review |
| Heavy queries on large catalogues | Aggregate in DB (`groupBy`); Top-N in SQL/order; page bounds |
| Forking Money Received logic | Parity tests; import existing module only |
| TZ drift vs Analytics | Use business-TZ scope clock only |

## 11. Missing data (explicit backlog — not v1 blockers)

1. **Stock availability readiness** — snapshots or complete movement ledger with before/after on all writers → unlock RELIABLE gate (separate plan; may need migration).
2. Complete `beforeQtyBase`/`afterQtyBase` on purchase / return / amend writers (quality improvement toward ledger).
3. Expense `incurredAt` (DEP-EXP-1).
4. Payment reversal ledger (DEP-PAY-3).
5. Immutable month-end report snapshots (optional audit aid).

## 12. Recommended implementation sequence

| Step | Deliverable |
| --- | --- |
| **6B** | Module scaffold: types, period resolver, sales MoM + product contribution; encode `STOCK_AVAILABILITY_READINESS = NOT_RELIABLE` + insight template types (Fact/Evidence/Signal/Check) |
| **6C** | Wire Money Received + refunds/amends sections (parity tests); no aggregation changes |
| **6D** | Branch + cashier sections; non-stock insight rules |
| **6E** | Attach **weak** current-stock signal to decliners only; enforce gate (no days/causation); tests for forbidden copy |
| **6F** | UI page `/reports/business-movement` + nav/hub + CSV export |
| **6G** | Preview validation + production deploy (separate gate docs) |
| **Later** | Stock ledger / snapshots readiness review → flip gate → strong availability insights |

Do **not** start AI assistant work. Do **not** run production migrations for 6B–6G. Do **not** implement RELIABLE stock-day math in 6B.

## 13. Safety / scope confirmation

- No change to Money Received accounting logic (consume only).
- No production data mutation in planning.
- No production migration required for MoM v1 (sales/money/product insights).
- Stock-linked language stays honesty-bound by §4.1 (`NOT_RELIABLE` today).
- Step 6 insight report is deterministic and auditable.

## 14. Final verdict

**BUSINESS MOVEMENT PLAN PASSED — ready to implement first insight report.**

Proceed to Step 6B with stock availability readiness locked to **NOT_RELIABLE** and insight format **Fact → Evidence → Signal → Recommended check**.
