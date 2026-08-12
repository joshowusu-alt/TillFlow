# Step 6C — Business Movement money received and leakage layer

## 1. Verdict

**BUSINESS MOVEMENT MONEY LAYER READY — ready to add insight ranking and owner summary.**

## 2. Files changed

```
lib/reports/business-movement/types.ts          (bump to 6c; money/leakage types)
lib/reports/business-movement/money-language.ts (careful copy constants)
lib/reports/business-movement/money-leakage.ts  (compose from canonical metrics)
lib/reports/business-movement/money-compose.ts  (DB + pure compose entrypoints)
lib/reports/business-movement/money-leakage.test.ts
lib/reports/business-movement/index.ts
docs/reporting/STEP_6C_BUSINESS_MOVEMENT_MONEY_AND_LEAKAGE.md
```

No changes to `lib/reports/money-received/**` aggregation formulas.

## 3. Canonical modules reused

| Capability | Module / symbol |
| --- | --- |
| Scope clock | `resolveMoneyReceivedScope` (`absoluteBounds: true` on BM half-open windows) |
| DB bundle | `computeMoneyReceivedBundleFromDb` |
| Pure metrics | `computeMoneyReceivedMetrics` |
| Confirmed where | `paymentWhereForMetric(scope, 'money_received')` |
| Status helpers | `isConfirmedReceipt`, `isUnverifiedLegacyStatus` |
| Definition version | `MONEY_RECEIVED_DEFINITION_VERSION` |

Sale-amend money-out is a **side metric**: aggregate of `amountPence < 0` under the **same** confirmed payment where as `money_received`. It does not change the headline; negatives remain inside Money Received net.

## 4. Calculations added

For current vs comparison periods:

| Metric | Source |
| --- | --- |
| Money Received | `money_received` |
| Refund outflows | `refund_outflows` |
| Needs MoMo confirmation | `unverified_legacy_receipts` |
| Sale-amend money-out | Abs(Σ negative CONFIRMED `SalesPayment`) via canonical where |

Each uses existing ChangePair maths (absolute / % with zero guards).

## 5. Leakage / quality summary

`LeakageQualitySummary` includes:

- sales value, money received, refunds, sale-amend out, needs MoMo (as ChangePairs)
- `salesMinusMoneyReceivedCurrentPence` / `…ComparisonPence`
- `salesVsMoneyReceivedGapChangePence` (Δsales − Δmoney)
- `languageNotes` (fixed strings — not AI)

### Language rules (locked)

1. Sales ≠ Money Received (different clocks / inclusion).
2. Pending MoMo not in Money Received until CONFIRMED.
3. Refunds are separate cash-out — not subtracted from Money Received headline.
4. Sale-amend negatives remain inside Money Received under current contract.
5. Sales−Money gap is a timing/quality indicator, not an “error” total.

## 6. Parity test evidence

From `money-leakage.test.ts`:

- Derived `moneyReceivedPence` / `refundOutflowsPence` / `needsMomoConfirmationPence` **equal** `computeMoneyReceivedMetrics` for the same facts+scope.
- CONFIRMED + negative amend → nets inside Money Received; amend outflow reported separately as absolute.
- `PENDING_MANUAL` → Money Received 0, Needs MoMo = amount.
- Refunds do not reduce Money Received headline.
- Period movement + leakage gaps; zero-comparison % guards.

```
npx vitest run lib/reports/business-movement
 Tests  16 passed

npx tsc --noEmit  (exit 0)
npx eslint lib/reports/business-movement/**  (exit 0)
```

## 7. Limitations

- No UI / export yet.
- No insight ranking / owner action engine yet (→ 6D).
- Stock still `NOT_RELIABLE`; no stock claims.
- Sale-amend side metric is not a separate Phase-1 Metric ID in the Money Received registry — presentation/leakage only.
- DB compose path (`computeBusinessMovementWithMoneyFromDb`) not Postgres-integration tested in 6C (pure + where reuse covered).

## 8. Recommendation for Step 6D

Build deterministic insight ranking + owner summary from sales (6B) + money/leakage (6C) using Fact → Evidence → Signal → Recommended check. Still no AI; still no stock-causation; optional weak current-stock attach remains 6E.

## 9. Safety

- Money Received aggregation unchanged (consume only).
- No production mutation / migrations.
- No stock-out causation.

## 10. Final verdict

**BUSINESS MOVEMENT MONEY LAYER READY — ready to add insight ranking and owner summary.**
