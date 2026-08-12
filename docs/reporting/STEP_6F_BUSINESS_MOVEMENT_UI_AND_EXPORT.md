# Step 6F — Business Movement UI and export

## 1. Verdict

**BUSINESS MOVEMENT UI READY — ready for hosted preview/deploy.**

## 2. Routes added

| Surface | Path |
| --- | --- |
| Report page | `/reports/business-movement` |
| CSV export | `/exports/business-movement` |
| Nav | Reports → Business Movement (Owner/Manager) |
| Hub card | `/reports` → Sales & Payments |

## 3. Files changed

```
lib/reports/business-movement/period-params.ts
lib/reports/business-movement/export.ts
lib/reports/business-movement/index.ts
lib/reports/business-movement/business-movement-ui.test.ts
lib/reports/business-movement/business-movement-export-access.test.ts
app/(protected)/reports/business-movement/page.tsx
app/(protected)/exports/business-movement/route.ts
app/(protected)/reports/page.tsx
lib/navigation-config.ts
lib/reports/reports-index-polish.test.ts
docs/reporting/STEP_6F_BUSINESS_MOVEMENT_UI_AND_EXPORT.md
```

No changes to `lib/reports/money-received/**` aggregation formulas.
No ranking-rule changes in the insight engine.
No migrations; no production data mutation; no AI advice.

## 4. UI sections

1. Title + subtitle (“What changed this month vs last — facts first.”)
2. Stock limitation banner (readiness NOT_RELIABLE)
3. Scope chrome (business, branch, current + comparison windows, clocks note)
4. Period selector (last full calendar month | custom equal-length) + branch
5. Headline cards: Sales, Money Received, Refund outflows, Needs MoMo confirmation, Sales vs Money Received gap
6. Owner summary (3–6 insights): Fact / Evidence / Signal / Recommended check
7. Product movers table
8. Branch movement table
9. Cashier movement table (when rows exist; attributed via `SalesInvoice.cashierUserId`)
10. Leakage / quality notes
11. Links: Money Received, MoMo Confirmation, Export CSV

## 5. Export sections

CSV via `iterBusinessMovementExportCsvChunks`:

- Metadata (business, branch, TZ, period pair, definition versions, stock disclaimer)
- `exportCompleteness=COMPLETE_STREAM` (header + early/late meta rows)
- Headline comparison (sales + money layer change pairs + gap)
- Owner insights (fact/evidence/signal/recommendedCheck)
- Product movers
- Branch movement
- Cashier movement
- Leakage/quality notes
- Trailer counts + final `COMPLETE_STREAM`
- Response header: `X-Export-Completeness: COMPLETE_STREAM`

## 6. Access-control behaviour

| Actor | Page | Export |
| --- | --- | --- |
| Owner / Manager | Allowed (`requireBusiness` + `resolveMoneyReceivedAccess`) | Allowed (`requireExportUser` + access) |
| Cashier | Denied (redirect `/pos`) | Denied (redirect `/login`) |
| Foreign `businessId` | EmptyState / TENANT_MISMATCH | 403 + `completeExport: false` |
| Unauthorised `storeId` | EmptyState / BRANCH_NOT_AUTHORISED | 403 + `completeExport: false` |

Branch/tenant scoping uses the same access helper as Money Received / MoMo.

## 7. Stock limitation wording

> Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.

Readiness remains `NOT_RELIABLE`. Page and export assert / avoid forbidden stock-causation phrases.

## 8. Tests / validation

```
npx vitest run lib/reports/business-movement lib/reports/reports-index-polish.test.ts
→ 46 passed

npx tsc --noEmit -p tsconfig.json → 0
npx eslint (touched files) → 0
npx next build → exit 0 (tmp/step6f-next-build.log)
```

Focused coverage: page surface wiring, COMPLETE_STREAM, Owner/Manager allow, Cashier deny, tenant/branch deny, no forbidden stock language, Fact/Evidence/Signal/Recommended check labels, Money Received composition parity.

## 9. Confirmations

- No migration run
- No production data mutation
- No AI-generated advice
- Money Received logic unchanged
- Insight ranking rules unchanged

## 10. Limitations

- Hosted preview / production smoke not run in this step
- No PDF export
- Stock weak-signal (Step 6E) still deferred
- Custom period requires valid `currentFrom`/`currentTo`; otherwise defaults to last full calendar month

## 11. Next step recommendation

Hosted preview smoke for `/reports/business-movement` + CSV header/body `COMPLETE_STREAM`, then production deploy when preview is green. Optional later: Step 6E stock weak-signal behind the same readiness gate.
