# Step 6D — Business Movement deterministic insight ranking and owner summary

## 1. Verdict

**BUSINESS MOVEMENT INSIGHTS READY — ready to add stock weak-signal layer or UI/export.**

## 2. Files changed

```
lib/reports/business-movement/insight-types.ts
lib/reports/business-movement/insight-thresholds.ts
lib/reports/business-movement/insight-format.ts
lib/reports/business-movement/insight-engine.ts
lib/reports/business-movement/insight-engine.test.ts
lib/reports/business-movement/types.ts          (definition version → tf-bm/6d-insight-ranking-v1)
lib/reports/business-movement/index.ts
docs/reporting/STEP_6D_BUSINESS_MOVEMENT_INSIGHT_RANKING.md
```

No changes to Money Received aggregation (`lib/reports/money-received/**`).
No UI route, export, migrations, or production data writes.

## 3. Insight shape

Every insight is a `RankedBusinessMovementInsight`:

| Field | Role |
| --- | --- |
| `severity` | `info` \| `watch` \| `attention` |
| `category` | See §4 |
| `fact` | Plain-language measured change |
| `evidence` | Traceable TillFlow numbers / clocks |
| `signal` | What the change indicates (not a conclusion) |
| `recommendedCheck` | Next human check — not automated advice |
| `supportingMetrics` | Numeric/string evidence bag |
| `confidence` | `high` \| `medium` \| `low` |
| `rankScore` | Sort key: \|value Δ\| × category weight |

## 4. Insight categories implemented

| Category | Trigger (high level) |
| --- | --- |
| `sales_growth` / `sales_drop` | Headline invoice sales Δ above noise floor |
| `product_growth` / `product_decline` | Top product movers; new / disappeared SKUs flagged separately |
| `branch_growth` / `branch_drop` | Branch invoice sales Δ above floor |
| `cashier_movement` | Largest cashier \|Δ\| above floor |
| `money_received_gap` | \|sales − Money Received\| ≥ gap floor (timing/quality, not error) |
| `refund_increase` | Refund outflows Δ ≥ refund floor |
| `sale_amend_increase` | Sale-amend money-out Δ ≥ amend floor |
| `momo_confirmation_risk` | Needs MoMo confirmation balance or Δ above floor |
| `insufficient_data` | No material movers after thresholds |

## 5. Ranking rules

1. **Value movement first** — `rankScore = |Δ pence| × weight` (weights slightly boost declines / leakage).
2. **Percentage secondary** — `%` only when `ChangePair.percentageChangeStatus === 'ok'` and \|%\| ≥ `minPctForMention` (default 10); zero comparison never uses fake %.
3. **Noise suppression** — default floors (pence): sales/money/gap `100_00`, refunds/amends `50_00`, MoMo `1_00`.
4. **New products** — `kind=new` / comparison `0` → “new this period (no comparison base)”, category `product_growth`, not % growth.
5. **Disappeared products** — `kind=no_current_sales` → disappeared wording, not “down X%”.
6. **Money Received gaps** — wording from `BUSINESS_MOVEMENT_MONEY_LANGUAGE` (different clocks; not a balancing error).
7. **Per-category cap in candidates** — `maxPerCategory` default 2 (applied when building owner summary selection diversity).
8. **Owner summary** — top ranked insights, length clamped to **3–6**.

Category weight sketch (engine):

| Kind | Weight |
| --- | --- |
| Headline sales | 1.2 |
| Product decline | 1.15 |
| Product gone | 1.1 |
| Refund increase | 1.1 |
| Branch movement | 1.05 |
| MoMo risk | 1.05 |
| Money gap | 1.0 |
| Product growth | 0.95 |
| New product | 0.85–0.9 |
| Cashier | 0.7 |

Money Received MoM remains on the money layer for UI/export; ranked insights reserve `money_received_gap` for sales−MR clock gaps only.

## 6. Language guardrails

| Rule | Behaviour |
| --- | --- |
| Stock readiness `NOT_RELIABLE` | Runtime assert rejects forbidden stock-cause phrases; owner summary sets `stockCauseLanguagePresent: false` |
| Forbidden phrases | e.g. “days out of stock”, “stock caused”, “review availability”, … (`FORBIDDEN_STOCK_CAUSE_PHRASES`) |
| Zero comparison | “new this period” / “no comparison base” / “none in the current period” — never “up/down by X%” |
| Sales vs Money Received | Cite `createdAt` vs `receivedAt` clocks; gap is a quality/timing indicator |
| Pending MoMo | Needs confirmation before counting as Money Received (`pendingMomo` language constant) |

## 7. Owner summary

`buildOwnerInsightSummary(result)` → `OwnerInsightSummary`:

- `insights`: 3–6 ranked insights
- `headline`: one-line plain summary
- `stockAvailabilityReadiness`: mirrors `STOCK_AVAILABILITY_READINESS`
- `stockCauseLanguagePresent`: always `false` when gate is NOT_RELIABLE

## 8. Example insight objects

```json
{
  "id": "product-decline-frytol",
  "category": "product_decline",
  "severity": "attention",
  "confidence": "high",
  "fact": "Frytol 1L sales fell by GH¢300.00 (75.0%) vs the comparison period",
  "evidence": "Line sales current GH¢100.00 vs comparison GH¢400.00; qty 1 vs 1.",
  "signal": "This SKU is among the largest product sales declines.",
  "recommendedCheck": "Review Frytol 1L sales on Trading / Analytics and check restock timing before treating this as lower demand.",
  "supportingMetrics": {
    "productId": "frytol",
    "absoluteChangePence": -30000,
    "percentageChange": -75,
    "usedPercentage": 1
  },
  "rankScore": 34500
}
```

```json
{
  "id": "money-received-gap",
  "category": "money_received_gap",
  "severity": "watch",
  "confidence": "medium",
  "fact": "Invoice sales GH¢1000.00 vs Money Received GH¢600.00 in the current period",
  "evidence": "Sales use invoice createdAt; Money Received uses payment receivedAt under the canonical CONFIRMED where.",
  "signal": "A gap can reflect timing, pending MoMo, credit, or payment mix — not an automatic error.",
  "recommendedCheck": "Compare Money Received and MoMo Confirmation Review for the same dates; do not treat this gap as a balancing error.",
  "supportingMetrics": { "salesPence": 100000, "moneyReceivedPence": 60000, "gapPence": 40000 },
  "rankScore": 40000
}
```

```json
{
  "id": "momo-confirmation-risk",
  "category": "momo_confirmation_risk",
  "severity": "watch",
  "confidence": "high",
  "fact": "Needs MoMo confirmation rose by GH¢65.00 vs the comparison period",
  "evidence": "Needs MoMo confirmation current GH¢75.00 vs comparison GH¢10.00. Pending MoMo must be confirmed before it counts as Money Received.",
  "signal": "Unconfirmed Mobile Money rose and is outside Money Received until confirmed.",
  "recommendedCheck": "Open MoMo Confirmation Review and confirm or clear pending Mobile Money payments.",
  "supportingMetrics": { "currentPence": 7500, "absoluteChangePence": 6500 },
  "rankScore": 7875
}
```

## 9. Tests run

```
npx vitest run lib/reports/business-movement
→ 3 files, 24 tests passed
  - insight-engine.test.ts (8)
  - business-movement.test.ts (10)
  - money-leakage.test.ts (6)

npx tsc --noEmit -p tsconfig.json
npx eslint lib/reports/business-movement/**/*.{ts,tsx}
```

Coverage includes: biggest product decline ranks above tiny; noise suppressed; zero-base without fake %; pending MoMo; refund increase; sales/money gap careful wording; no stock causation when NOT_RELIABLE; owner summary capped 3–6.

## 10. Limitations

- Ranking is deterministic heuristics, not causal analysis.
- No stock weak-signal yet (readiness remains `NOT_RELIABLE`).
- No UI or export in this step.
- Cashier insight is a single top mover (not a full ranking panel).
- Product contribution % is relative to product-level change, not a causal attribution model.
- Money Received MoM is on the money layer but not a separate ranked category (gap / refunds / amends / MoMo cover money insights).
- Insight generation is pure over composed `BusinessMovementWithMoneyResult` — page wiring is Step 6E/6F.

## 11. Recommendation for Step 6E

**Step 6E — Stock weak-signal layer (optional gate flip prep)**  
Add a clearly labelled *current qty only* weak signal (never days-out-of-stock), still gated so causation language stays off while readiness is `NOT_RELIABLE`.  

Alternatively, if product priority is owner visibility: **Step 6F — `/reports/business-movement` UI + optional export** consuming `rankBusinessMovementInsights` / `buildOwnerInsightSummary` without changing ranking rules.
