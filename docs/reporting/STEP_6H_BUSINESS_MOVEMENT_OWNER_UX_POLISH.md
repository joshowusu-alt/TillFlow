# Step 6H — Business Movement owner-language and UX polish

## 1. Verdict

**BUSINESS MOVEMENT UX POLISH READY — ready for preview/deploy.**

## 2. Files changed

```
lib/reports/business-movement/owner-copy.ts
lib/reports/business-movement/owner-copy.test.ts
lib/reports/business-movement/index.ts
lib/reports/business-movement/business-movement-ui.test.ts
app/(protected)/reports/business-movement/page.tsx
docs/reporting/STEP_6H_BUSINESS_MOVEMENT_OWNER_UX_POLISH.md
```

No ranking-rule changes. No Money Received aggregation changes. No migrations. No production data mutation. No AI advice.

## 3. Owner-facing changes

| Before | After |
| --- | --- |
| Amber stock warning at top | Smaller **Data note** at the bottom |
| Internal category slugs (`momo confirmation risk`) | Plain labels (`MoMo to confirm`, `Product grew`, `Product dropped`) |
| `confidence high` | Subtle **Strong signal** (medium/low hidden) |
| Fact / Evidence / Signal / Recommended check | **What changed** / **Why it matters** / **What to check** (evidence smaller under why) |
| “Deterministic ranking — not AI advice” | Removed from owner page |
| Contribution “-123% of product-level sales change” | Reworded; % over 100 hidden |
| `no_current_sales` / qty `39 / 0` | New product / no current sales / grew / dropped; “39 sold vs 0 last period” |
| Full branch/cashier tables for one row | “All movement is from Main Branch.” / short cashier note |
| Money Received / MoMo Confirmation | **Review MoMo confirmations**, **Open Money Received**, **Export CSV** |

## 4. Summary strip

`buildOwnerSummaryStrip` composes three clauses from existing ChangePairs + ranked insights, e.g.:

> July sales were down GH¢2,154.50 vs June. July money received was down GH¢50.00 vs June. MoMo needing confirmation rose by GH¢3,870.50, so confirm pending MoMo before judging cash performance.

## 5. What stayed the same

- Insight engine ranking, categories, Fact/Evidence/Signal/Recommended check on the **object**
- CSV export still complete and traceable (internal fields unchanged)
- Stock disclaimer wording preserved in Data note
- Access: Owner/Manager only

## 6. Tests

```
npx vitest run lib/reports/business-movement
→ 6 files, 42 tests passed

npx tsc --noEmit -p tsconfig.json → 0
npx eslint (touched files) → 0
```

Coverage: owner labels, contribution % guard, summary strip, single-branch/cashier collapse, no internal labels on page, stock note below product movers, calculations/Money Received unchanged.

## 7. Limitations

- Export CSV still uses internal category ids (intentional — traceable).
- Headline StatCards remain; the strip is the 30-second read.
- Hosted preview/deploy is the next step (not this polish).
