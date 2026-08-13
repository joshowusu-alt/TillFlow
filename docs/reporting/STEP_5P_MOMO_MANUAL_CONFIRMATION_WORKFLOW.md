# Step 5P — Manual MoMo confirmation workflow

## 1. Verdict

**MOMO MANUAL CONFIRMATION READY — ready for hosted preview/deploy.**

## 2. Objective result

Owners and Managers can confirm a single `PENDING_MANUAL` Mobile Money payment from MoMo Confirmation Review. Confirmation is a reporting-gate: `status` becomes `CONFIRMED`, a transactional `AuditLog` is written, and Money Received picks the row up through **existing** inclusion rules on the original `receivedAt`.

Hard rules held:

- No Prisma / production migration
- Money Received aggregation/inclusion files not edited
- No auto-confirm
- No bulk confirm
- No reject / duplicate workflow
- Invoice status, GL, and cash drawer / shift untouched
- `receivedAt` and `receiptOrigin` preserved
- `RETURNED` / `VOID` parent sales blocked
- Owner/Manager only
- Audit written in the same database transaction (not `audit()`)

## 3. Files changed

```
lib/audit.ts
lib/services/momo-confirmation.ts
lib/services/momo-confirmation.test.ts
app/actions/momo-confirmation.ts
lib/reports/momo-confirmation/types.ts
lib/reports/momo-confirmation/query.ts
lib/reports/momo-confirmation/momo-confirmation.test.ts
app/(protected)/reports/momo-confirmation/page.tsx
app/(protected)/reports/momo-confirmation/MomoConfirmDrawer.tsx
app/(protected)/reports/audit-log/page.tsx
docs/reporting/STEP_5P_MOMO_MANUAL_CONFIRMATION_WORKFLOW.md
```

Not changed: `lib/reports/money-received/compute.ts`, `query.ts`, `types.ts` inclusion predicates.

## 4. Write path

`confirmMomoPaymentAction` → `confirmMomoPayment` (`lib/services/momo-confirmation.ts`):

1. Role must be Owner or Manager.
2. Load `SalesPayment` + parent invoice (+ collection if linked).
3. Tenant: invoice `businessId` must match actor.
4. Branch: invoice `storeId` must be in authorised stores for the business.
5. Method must be `MOBILE_MONEY`.
6. If `status === CONFIRMED` → return `{ alreadyConfirmed: true }` with no update and no audit.
7. Else status must be `PENDING_MANUAL` (or another unclassified stuck status).
8. Parent sale must not be `RETURNED` or `VOID`.
9. Linked collection must not already be provider `CONFIRMED`.
10. Require trimmed reference (≥2) and note (≥3).
11. In one transaction:
    - `updateMany` where `id` + current status → `status = CONFIRMED`
    - fill `reference` only if it was empty
    - `auditLog.create` action `MOMO_PAYMENT_CONFIRM` with before/after, reason, confirmedBy, confirmedAt
12. If `updateMany` count is 0 and the row is now CONFIRMED (race) → idempotent success, no second audit.

Does **not** write `receivedAt`, `receiptOrigin`, invoice `paymentStatus`, journals, or cash-drawer entries.

## 5. UI behaviour

`/reports/momo-confirmation`:

- Banner explains this confirms money already received, and that Money Received uses the original payment date.
- Each row has **Review**.
- Drawer shows invoice, amount, branch, cashier, receivedAt, status, sale status, existing reference / network / provider / MSISDN / collection.
- Warning: confirmation adds the amount to Money Received for the original `receivedAt`, not today.
- Form requires provider/statement reference and note.
- Button: **Confirm MoMo payment**.
- `RETURNED` / `VOID` rows: review only, confirm hidden.
- Success toast + `router.refresh()` so the row leaves the list and totals update.

## 6. Audit behaviour

| Field | Value |
| --- | --- |
| `action` | `MOMO_PAYMENT_CONFIRM` |
| `actionType` | `PAYMENT` |
| `entity` / `entityId` | `SalesPayment` / payment id |
| `beforeState` / `afterState` | status, reference, receivedAt |
| `reason` | confirmation note |
| `details` | payment id, sale id, amount, provider ref, note, confirmedBy, confirmedAt, original receivedAt |
| Write style | `tx.auditLog.create` in the same transaction as the status update |

Owner audit log page labels the action **MoMo Payment Confirmed**.

## 7. Permission behaviour

| Actor | Result |
| --- | --- |
| Owner | Allowed |
| Manager | Allowed |
| Cashier | Denied (action `withBusinessContext(['OWNER', 'MANAGER'])` + service role check) |
| Other business payment | Denied (`TENANT`) |
| Store not in authorised list | Denied (`BRANCH`) |

## 8. Blocked cases

- Missing / whitespace reference or note
- Non-MoMo method
- Classified non-CONFIRMED status (`FAILED`, `PENDING`, …)
- Parent `RETURNED` or `VOID`
- Provider-confirmed linked collection
- Cross-tenant or unauthorised branch
- Already CONFIRMED → safe no-op (no duplicate audit)

## 9. Tests / validation

```
npx vitest run lib/services/momo-confirmation.test.ts lib/reports/momo-confirmation lib/reports/money-received
 Test Files  8 passed | 4 skipped
      Tests  73 passed | 18 skipped

npx tsc --noEmit -p tsconfig.json  → exit 0
npx eslint <touched paths>         → exit 0
npx next build                     → exit 0
  routes include /reports/momo-confirmation and /exports/momo-confirmation
```

Coverage:

- Owner / Manager confirm
- Cashier denied
- Cross-tenant denied
- Unauthorised branch denied
- RETURNED / VOID blocked
- Already CONFIRMED idempotent
- Reference and note required
- AuditLog in same transaction
- Existing Money Received compute includes the row only after CONFIRMED
- `receivedAt` / invoice / GL / drawer unchanged
- UI: Review + Confirm MoMo payment; no bulk / reject

## 10. Safety confirmation

- No production data mutation occurred in this step
- No production / Prisma migration occurred
- Money Received aggregation logic was unchanged
- No auto-confirm or bulk confirm
- Step 6 expansion not started
