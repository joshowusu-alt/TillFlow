# Step 6J — Business Movement comparison-period clarity

## 1. Verdict

**BUSINESS MOVEMENT PERIOD CLARITY READY — ready for preview/deploy.**

## 2. Scope

Owner-facing Business Movement page and CSV export now name the current period and the comparison period in human-readable language. Vague labels such as “last period” and “comparison period” are rewritten at display/export time.

Hard rules held:

- Calculations unchanged
- Period bound logic unchanged (`periods.ts` not edited)
- Money Received aggregation unchanged
- Insight ranking rules unchanged (`insight-engine.ts` not edited)
- No AI advice
- No stock-causation inference
- No migrations
- No production data mutation

## 3. Files changed

```
lib/reports/business-movement/owner-copy.ts
lib/reports/business-movement/owner-copy.test.ts
lib/reports/business-movement/index.ts
lib/reports/business-movement/export.ts
lib/reports/business-movement/business-movement-ui.test.ts
app/(protected)/reports/business-movement/page.tsx
docs/reporting/STEP_6J_BUSINESS_MOVEMENT_PERIOD_CLARITY.md
```

## 4. Human-readable labels

`formatHumanPeriodRange` (presentation only):

| Range | Label |
| --- | --- |
| Full calendar month `2026-07-01` → `2026-07-31` | July 2026 (short: July) |
| Multi-month aligned `2026-06-01` → `2026-07-31` | Jun-Jul 2026 (short: Jun-Jul) |
| Multi-month aligned `2026-04-01` → `2026-05-31` | Apr-May 2026 |
| Non-month-aligned `2026-06-01` → `2026-07-17` | 1 Jun-17 Jul 2026 |
| Cross-year months `2025-12-01` → `2026-01-31` | Dec 2025-Jan 2026 |

Exact ISO keys remain in smaller metadata (`2026-07-01 → 2026-07-31 vs 2026-06-01 → 2026-06-30`) and in export `currentFromKey` / `comparisonFromKey` fields.

## 5. Owner-facing copy

| Surface | Before | After |
| --- | --- | --- |
| Top pill | Header “July 2026 vs June 2026” only | **Comparing: July 2026 vs June 2026** (`data-testid="comparing-line"`) plus audit keys |
| Summary strip | `2026-06-01 sales were down…` / `vs June` | `July sales were down GH¢X compared with June.` |
| Headline cards | `vs last period` | `vs June 2026` (or the named comparison label) |
| Insight cards | `vs the comparison period` | `compared with June 2026` via `ownerInsightCopy` |
| Product qty | `85 sold vs 21 last period` | `85 sold vs 21 in June` (or `in Apr-May`) |
| Table headers | This period / Last period | Named labels (`July 2026` / `June 2026`) |
| Export meta | ISO keys only | `currentPeriodLabel`, `comparisonPeriodLabel`, `comparingLine`, plus original date keys |
| Export insights | Engine wording with “comparison period” | Same rewrite as the page |

Internal ranking objects still use engine phrasing. Owners never see that phrasing on the page or in the CSV insight rows.

## 6. Tests

```
npx vitest run lib/reports/business-movement
→ 6 files, 48 tests passed

npx tsc --noEmit -p tsconfig.json → 0
```

Coverage added:

- Month label formatting (`July 2026` / `June 2026`)
- Multi-month label formatting (`Jun-Jul 2026` / `Apr-May 2026`)
- Non-month-aligned range formatting (`1 Jun-17 Jul 2026`)
- No visible “last period” on the owner page source
- No visible “comparison period” in owner insight copy (page + rewritten insights + export CSV)
- Ranking scores, sales ChangePairs, and Money Received values unchanged after label application

## 7. What stayed the same

- `insight-engine.ts` ranking, categories, and internal Fact/Evidence/Signal text
- Money Received module and BM money composition
- Period pair construction
- Stock availability gate (`NOT_RELIABLE`) and Data note
- Access: Owner/Manager only
- Export completeness: `COMPLETE_STREAM`

## 8. Limitations

- Filter preset still reads “Last full calendar month” (that is the preset name, not a comparison label).
- Hosted preview/deploy is the next step (not this polish).
