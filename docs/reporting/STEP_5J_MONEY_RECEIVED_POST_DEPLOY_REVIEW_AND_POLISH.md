# Step 5J — Canonical Money Received post-deploy review and owner-facing polish

## 1. Context

| Field | Value |
| --- | --- |
| Live Production SHA (Step 5I) | `b9361077285b9520a7d1e6a3a0ac7b39f5936d1b` |
| Review branch (local polish) | `integration/money-received-canonical-5e` (post-5I working tree) |
| Scope | Post-deploy UX/copy/table clarity + negative CONFIRMED row investigation |
| Production deploy in this step | **Not executed** |

## 2. Current live behaviour (Step 5I contract)

Confirmed still in force on Production:

- CONFIRMED receipts only for Money Received
- Parent sale RETURNED/VOID does **not** exclude confirmed historical receipts
- Refunds via `SalesReturn` remain separate as `refund_outflows`
- Unverified/legacy receipts surfaced separately, not forced to clean zero
- Owner/Manager allowed; Cashier denied
- Export complete stream on `/exports/money-received`

**No aggregation / inclusion rule changes** were made in this step.

## 3. UX / copy issues found

| Issue | Severity | Notes |
| --- | --- | --- |
| Page title “Payments and Money Received” was long and overlapped other Payments nav | Medium | Shorten to **Money Received** |
| Banner + footer used technical reconcile / timezone / as-of density | Medium | Softened for owners |
| Filter label “Drill-down” is engineer language | Low | Renamed to **Show transactions for** |
| `/reports/receipts` page still titled **Money received** | High confusion | Conflicts with primary Money Received report |
| Receipts page mentioned raw `SalesPayment` | Medium | Owner-unfriendly |

## 4. Navigation clarity

| Label (before) | Route | Risk |
| --- | --- | --- |
| Payments & Money Received | `/reports/money-received` | Overlaps “Payments” area and “Customer Receipts” |
| Receipt transactions | `/reports/receipts` | OK in nav, but page title said Money received |
| Payments and Money Received (hub card) | same | Same naming clutter |

**Decision:** Primary report = **Money Received**. Detail list = **Receipt transactions**. Keep Customer Receipts (recording money in) distinct under Payments.

## 5. Table clarity issues

Too technical for owners/managers on live page:

| Column | Problem |
| --- | --- |
| Source (`SalesPayment:cuid…`) | Internal id |
| Status (`CONFIRMED`) | Always confirmed on this metric; noise |
| Sale (`cuid…`) | Not the invoice number merchants recognise |

## 6. Negative CONFIRMED receipt investigation

### Production evidence (read-only)

Probe: `tmp/probe-negative-confirmed.cjs` → `tmp/step5j-negative-probe.log`  
Host: production Neon (`ep-fancy-darkness-…`, not preview).

| Metric | Value |
| --- | --- |
| Negative CONFIRMED `SalesPayment` rows | **41** |
| Sum | **−GH₵1,513.50** (−151350 pence) |
| Method | All **CASH** |
| Parent sale status | All still **PAID** |
| Pairing | **41/41** invoices also have a positive CONFIRMED payment |
| Origin | Mostly null; 1 `UNCLASSIFIED` |

### Source / type

These are **sale amendment refund lines**, not `SalesReturn` refunds.

Code path: `lib/services/sales.ts` creates a `SalesPayment` with `amountPence: -refundAmount` when a sale amend lowers the total. Default payment status is `CONFIRMED`.

Full returns/voids create `SalesReturn` rows (already shown as **Refund outflows**) and do **not** create these negative payment lines.

### Should they stay in Money Received?

**Yes — keep inside Money Received for Phase 1.**

Reasons:

1. They are CONFIRMED payment movements on the sale and net the cash that actually stayed with the business after an amend.
2. Moving them to `refund_outflows` would require an accounting contract change (and would double-count risk vs true returns).
3. Hard rule for this step: do not alter core aggregation unless a real defect is proven. This is **expected operational data**, not bad data and not a Step 3R defect.

Owner confusion is a **presentation** problem: label negative lines clearly.

## 7. Changes made (low-risk polish only)

| Path | Change |
| --- | --- |
| `lib/reports/money-received/display.ts` | New row-kind helpers (money in / sale amend out / refund / unverified) |
| `lib/reports/money-received/types.ts` | Optional `transactionNumber` on drill rows |
| `lib/reports/money-received/query.ts` | Select `transactionNumber` for owner Sale column |
| `lib/reports/money-received/index.ts` | Export display helpers |
| `lib/reports/money-received/export.ts` | Meta report name → Money Received |
| `app/(protected)/reports/money-received/page.tsx` | Owner copy, Type column, Sale #, drop id/status columns, amend note |
| `app/(protected)/reports/receipts/page.tsx` | Retitle to Receipt transactions; link to Money Received |
| `app/(protected)/reports/page.tsx` | Hub card label/description |
| `lib/navigation-config.ts` | Nav label → Money Received |
| `lib/reports/money-received/money-received-display.test.ts` | New focused tests |
| `lib/reports/money-received/money-received-preview-validation.test.ts` | Copy expectations updated |

**Not changed:** `compute` / inclusion predicates / CONFIRMED-only rule / parent RETURNED/VOID rule / refund_outflows aggregation.

## 8. Tests / validation

```
npx vitest run lib/reports/money-received lib/reports/dashboard-clarity.test.ts lib/reports/money-received-method.test.ts lib/reports/reports-index-polish.test.ts
 Test Files  8 passed | 4 skipped
      Tests  91 passed | 18 skipped

npx tsc --noEmit -p tsconfig.json
(exit 0)

npx eslint lib/reports/money-received app/(protected)/reports/money-received app/(protected)/reports/receipts/page.tsx app/(protected)/reports/page.tsx lib/navigation-config.ts
(exit 0)

npx next build
(exit 0 — see tmp/step5j-build.log)
```

## 9. Remaining risks

| Risk | Notes |
| --- | --- |
| Live Production still has pre-polish UI until a polish deploy | Expected — this step did not deploy |
| Amendment negatives still net Money Received | Correct under current contract; owners need the new labels |
| Future contract may want gross inflows vs amend-outs split | Out of scope (would be later reporting work, not Step 6 product expansion here) |
| Receipts page still offers origin/method filters | Fine for power users; primary totals stay on Money Received |

## 10. Recommendation

Safe UX/copy/table polish is implemented locally and validated.

**A controlled preview → production polish deploy is recommended** so owners see clearer labels for negative amend rows and stop confusing Money Received with Receipt transactions.

Do **not** treat this as an emergency accounting hotfix.

## 11. Safety confirmation

- No production migration occurred
- No production data mutation occurred (read-only negative-row probe only)
- Step 6 was not started
- Canonical Money Received accounting contract was preserved

## 12. Final verdict

**POST-DEPLOY POLISH READY — safe UX/copy changes ready for preview/deploy.**
