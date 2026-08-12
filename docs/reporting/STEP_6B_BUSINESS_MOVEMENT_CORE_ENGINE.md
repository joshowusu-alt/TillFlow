# Step 6B — Business Movement core comparison engine

## 1. Verdict

**BUSINESS MOVEMENT CORE READY — ready to add money/refund leakage layer.**

## 2. Scope delivered

Implemented deterministic month-on-month **sales** comparison only (no UI, no Money Received changes, no stock availability claims).

| Included | Excluded (by design) |
| --- | --- |
| Period pair helpers (business TZ) | Money Received / refunds / amends (→ 6C) |
| Absolute / % / contribution maths | Stock days-at-zero / causation (gate NOT_RELIABLE) |
| Headline sales, tx count, ATV, units | UI / export (→ 6F) |
| Product growers / decliners / new / no-current | AI advice |
| Branch movement | Migrations / production mutation |
| Cashier movement (schema-supported) | Vague “review availability” insights |

## 3. Files changed

```
lib/reports/business-movement/types.ts
lib/reports/business-movement/change-math.ts
lib/reports/business-movement/periods.ts
lib/reports/business-movement/sales-comparison.ts
lib/reports/business-movement/query.ts
lib/reports/business-movement/index.ts
lib/reports/business-movement/business-movement.test.ts
docs/reporting/STEP_6B_BUSINESS_MOVEMENT_CORE_ENGINE.md
```

## 4. Calculations implemented

### Periods

- `resolveLastFullCalendarMonthPair` — last full calendar month vs prior month (business TZ half-open bounds).
- `resolveEqualLengthPeriodPair` — custom inclusive local date range vs equal-length window immediately before.

### Change maths

- Absolute: `current − comparison`
- Percentage: `(current − comparison) / comparison × 100`, else **null** with status `undefined_zero_comparison` / `insufficient_data` when comparison is 0
- Contribution: `entityΔ / totalΔ`, else **null** with `undefined_zero_total_delta`

### Sales headline

| Metric | Source |
| --- | --- |
| Sales value | Σ `SalesInvoice.totalPence` (excl. RETURNED/VOID) via `createdAt` |
| Transaction count | Invoice count |
| Average transaction value | sales / tx (null when tx = 0) |
| Units sold | Σ `SalesInvoiceLine.qtyBase` for in-scope invoices |

### Product movement

- Value: Σ `lineTotalPence`; qty: Σ `qtyBase`
- Kinds: `new` (comparison 0, current > 0), `no_current_sales` (current 0, comparison > 0), `continuing`
- Top growers / decliners by absolute sales Δ; contribution among product Δs

### Branch / cashier

- Invoice `storeId` / required `cashierUserId` groupBy of `totalPence` + tx count
- Cashier **included** — `SalesInvoice.cashierUserId` is required on schema (not deferred)

### Stock gate

- `STOCK_AVAILABILITY_READINESS = 'NOT_RELIABLE'`
- `stockInsightsEmitted: false` on every result

## 5. Assumptions

1. Sales contract matches `sales-revenue.ts` / Option B (`createdAt`, exclude RETURNED/VOID).
2. Product contribution uses **line** totals; headline uses **invoice** totals — they may differ slightly (discounts/rounding). Contribution denominator for products is the sum of product line deltas, not headline Δ.
3. Default MoM pair is last **full** calendar month vs prior (not MTD).
4. Branch filter uses invoice `storeId` (`branchIds: null` = all).

## 6. Known limitations

- No Money Received / refund leakage yet (6C).
- No insight copy builder / Fact→Evidence→Signal prose yet (types only in `BusinessMovementInsight`).
- No stock signals (blocked by readiness).
- No UI/export.
- Line vs invoice total mismatch possible when interpreting product contribution vs headline Δ.
- `computeSalesComparisonFromDb` not yet integration-tested against Postgres (pure + where-shape tests only).

## 7. Tests run

```
npx vitest run lib/reports/business-movement
 Tests  10 passed

npx tsc --noEmit   (exit 0)
npx eslint lib/reports/business-movement/**  (exit 0)
```

Coverage: period boundaries, ±/flat change, zero comparison %, new/disappeared products, contribution (incl. zero total Δ), branch/cashier scoping where clause, stock gate lock.

## 8. Recommendation for Step 6C

Add Money Received + refund outflows + sale-amend money-out as a **second period pair** using existing `computeMoneyReceivedBundle` / money-received module only (parity tests; no formula fork). Keep sales engine untouched. Still no stock claims; still no UI required unless desired for compile.

## 9. Safety

- Money Received logic unchanged (not imported for compute yet).
- No production data mutation.
- No migrations.
- No stock-out causation / days-at-zero claims.

## 10. Final verdict

**BUSINESS MOVEMENT CORE READY — ready to add money/refund leakage layer.**
