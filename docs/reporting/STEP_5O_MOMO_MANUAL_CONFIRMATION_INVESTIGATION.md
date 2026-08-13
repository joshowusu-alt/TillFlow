# Step 5O — Manual MoMo confirmation investigation

## 1. Verdict

**MOMO MANUAL CONFIRMATION PLAN PASSED — ready to build safe confirmation workflow.**

This step is investigation and design only. No confirmation buttons, no writes, no aggregation changes.

## 2. Objective result

MoMo Confirmation Review is live and read-only. `PENDING_MANUAL` Mobile Money payments stay stuck in **Needs MoMo confirmation** because no owner/manager write path exists to confirm them.

This investigation maps the payment lifecycle, write paths, permissions, audit capability, evidence, and risks needed to add a **single-row, audited, Owner/Manager-only** confirm action in Phase B.

Hard rules held:

- No production data mutation
- No production migration
- No confirmation action implemented
- No auto-confirm
- Money Received aggregation/inclusion logic unchanged
- Step 6 expansion not started

## 3. Current payment lifecycle

```
POS / offline / online checkout
        │
        ├─ MoMo + confirmed MobileMoneyCollection.id
        │     → SalesPayment.status = CONFIRMED
        │     → collectionId linked
        │     → reference/network/msisdn copied from collection
        │     → included in Money Received (receivedAt period)
        │
        └─ MoMo without collectionId  ← live stuck path
              → SalesPayment.status = PENDING_MANUAL
              → collectionId = null
              → invoice.paymentStatus still PAID / PART_PAID (amount counts)
              → GL already debits Bank at checkout
              → cash drawer / shift NOT touched
              → excluded from Money Received until status = CONFIRMED
              → listed on /reports/momo-confirmation
              → NO owner/manager confirm action exists
```

### 3.1 Status values in use

`SalesPayment.status` is a free `String`, default `"CONFIRMED"` (`prisma/schema.prisma`).

| Status | Role | Money Received |
| --- | --- | --- |
| `CONFIRMED` | Classified; cash-truth included | **Included** |
| `FAILED` | Classified | Excluded |
| `CANCELLED` | Classified | Excluded |
| `VOID` | Classified | Excluded |
| `PENDING` | Classified (provider in-flight) | Excluded |
| `PENDING_MANUAL` | **Not classified** | **Excluded** (Needs MoMo confirmation) |
| null / other | Unverified legacy | Excluded |

Production control set (Step 5L read-only probe): **CONFIRMED** and **PENDING_MANUAL** only.

### 3.2 Exact stuck-state cause

1. Checkout allows MoMo without a confirmed collection. The guard that would have required `momoCollectionId` is **commented out** in `app/actions/sales.ts` (`completeSaleAction`): *“MoMo collection API not yet integrated — allow sales without a confirmed collectionId.”*
2. `lib/services/sales.ts` then sets `payment.status = payment.status ?? 'PENDING_MANUAL'` when MoMo amount > 0 and no confirmed collection is attached.
3. Invoice `paymentStatus` is derived from **amounts**, not payment `status`. A `PENDING_MANUAL` row still makes the sale `PAID`.
4. Money Received includes **CONFIRMED only**, keyed by `receivedAt`. `PENDING_MANUAL` is `isUnverifiedLegacyStatus` → Needs MoMo confirmation.
5. The only live `SalesPayment` **update** path is `lib/services/mobile-money.ts` `updateMany` where `collectionId` matches. Step 5L: **0** stuck rows have `collectionId`. That path cannot unstick them.
6. Review UI (`/reports/momo-confirmation`) is read-only by design (Step 5M/5N). No confirm/reject buttons.

Result: payments remain in Needs MoMo confirmation indefinitely.

## 4. SalesPayment data model

```
model SalesPayment {
  id             String
  salesInvoiceId String
  method         String
  amountPence    Int
  receivedAt     DateTime  @default(now())
  reference      String?
  network        String?
  payerMsisdn    String?
  provider       String?
  status         String    @default("CONFIRMED")
  receiptOrigin  String?   // RECEIVED_AT_SALE | LATER_CREDIT_COLLECTION | UNCLASSIFIED | null
  collectionId   String?
  branchId       String?
  qaTag          String?
  qaRunId        String?
}
```

### 4.1 Fields available vs missing

| Need | Available? | Where |
| --- | --- | --- |
| Status | Yes | `SalesPayment.status` |
| Method | Yes | `SalesPayment.method` (`MOBILE_MONEY`) |
| Amount | Yes | `amountPence` |
| Received clock | Yes | `receivedAt` (set at create; default `now()`) |
| Provider / statement ref | Partial | `reference` (often empty; Step 5L: 2/67 filled) |
| Network / MSISDN | Partial | `network`, `payerMsisdn` |
| Provider name | Partial | `provider` |
| Receipt origin | Yes | `receiptOrigin` (do not infer; do not rewrite on confirm) |
| Collection link | Yes | `collectionId` (null on stuck rows) |
| Branch | Yes | `branchId` and/or parent invoice `storeId` |
| Sale / invoice | Yes | `salesInvoiceId` → `SalesInvoice` |
| Cashier | Via invoice | `SalesInvoice.cashierUserId` — **not** on the payment |
| Sale status | Via invoice | `SalesInvoice.paymentStatus` |
| Customer | Via invoice | `SalesInvoice.customerId` |
| `confirmedAt` | **No** | Not on `SalesPayment` |
| `updatedAt` | **No** | Not on `SalesPayment` |
| Confirmed-by user | **No** | Not on `SalesPayment` |
| Notes | **No** | Not on `SalesPayment` |
| Attachment | **No** | Expense attachments exist; payment attachments do not |

Cashier/user identity for confirmation must come from the **acting Owner/Manager**, stored on `AuditLog`, not from the original cashier.

## 5. Existing create / update paths

| Path | File | What it writes | Status written |
| --- | --- | --- | --- |
| POS checkout (`completeSaleAction`) | `app/actions/sales.ts` → `createSale` | Creates payments; optional `momoCollectionId`, `momoRef`, network, MSISDN | Confirmed collection → `CONFIRMED`; else MoMo → `PENDING_MANUAL`; cash/card/transfer default `CONFIRMED` |
| Older form checkout | `app/actions/sales.ts` form path | Cash/card/transfer only (no MoMo) | Default `CONFIRMED` |
| Offline sync | `app/api/offline/process-offline-sale.ts` → `createSale` | Same as checkout; no collection id | MoMo → `PENDING_MANUAL` |
| Online storefront | `lib/services/online-order-commit.ts` → `createSale` | MoMo; collection id only if provider paid | Manual-reference orders → `PENDING_MANUAL` |
| Provider collection status | `lib/services/mobile-money.ts` | **`updateMany` where `collectionId`** | Mirrors collection: `CONFIRMED` / `FAILED` / `TIMEOUT`; sets `reference` from provider ids |
| Customer receipt (later collection) | `lib/services/payments.ts` `recordCustomerPayment` | `createMany`; origin `LATER_CREDIT_COLLECTION` | **Omits status → schema default `CONFIRMED`** |
| Sale amend refund / add | `lib/services/sales.ts` | Extra `create` (negative refund or positive add); origin `UNCLASSIFIED` | **Omits status → default `CONFIRMED`** |
| Return / void | `lib/services/returns.ts` | Creates `SalesReturn`; sets invoice `RETURNED` / `VOID`; **does not update or create `SalesPayment`** | Original payment status **unchanged** |
| Backup restore | `app/actions/backup.ts` | Recreates rows; nulls `collectionId` | Preserves imported `status` |
| Demo seed | `app/actions/demo-day.ts` | `createMany` | Seed-defined |
| Admin payment edit | — | **None** | — |

There is **no** existing “edit payment status” or “confirm MoMo” merchant action.

### 5.1 What does **not** happen on confirm today

Because no confirm path exists, nothing currently:

- flips `PENDING_MANUAL` → `CONFIRMED` for unlinked rows
- writes a confirmation audit event
- changes `receivedAt`
- posts a second journal
- writes a cash-drawer / shift entry for MoMo

## 6. What must change when a payment becomes CONFIRMED

Phase B confirm is a **reporting-gate** action, not a second cash event.

| Effect | Change? | Policy |
| --- | --- | --- |
| `status` | **Yes** | `PENDING_MANUAL` → `CONFIRMED` only. Idempotent if already `CONFIRMED`. Refuse other from-statuses. |
| `receivedAt` | **No** | Preserve original. Money Received periods use `receivedAt`. Overwriting would move or invent cash dates. |
| `receiptOrigin` | **No** | Leave as persisted (`RECEIVED_AT_SALE`, null, etc.). Origin is a separate contract. |
| `reference` | Optional fill | If empty, persist the required confirmation reference. Do not silently overwrite a non-empty original ref. |
| `network` / `payerMsisdn` / `provider` | No | Display only unless already set. |
| `collectionId` | No | Stay null unless a real collection is later linked (out of Phase B). |
| Invoice `paymentStatus` | **No** | Already PAID in the common case; amounts already counted. |
| Journal / GL | **No** | Checkout already debited Bank for MoMo via `debitCashBankLines` (`splitPayments` treats non-cash as bank). Confirm must not re-post. |
| Cash drawer / shift | **No** | Drawer entries are cash-only (`CASH_SALE`, `CASH_REFUND`, `CASH_DEBTOR_PAYMENT`). MoMo never hits expected cash. |
| Money Received | **Yes, by existing predicate** | Row becomes `isConfirmedReceipt` and appears in the **`receivedAt` period**. Do not change `compute.ts` / query predicates. |
| Needs MoMo confirmation | Leaves the review list | Same unverified predicate; no report-logic change. |
| Audit | **Yes, required** | Transactional `AuditLog` write; fail the confirm if audit write fails. |

**Do not** treat confirmation time as `receivedAt`. Confirmation clock lives on the audit row (`createdAt`) and in `details.confirmedAt`.

## 7. Audit capability

### 7.1 Existing table — reuse it

`AuditLog` already exists (`prisma/schema.prisma`) with financial-control fields:

| Column | Use for confirm |
| --- | --- |
| `businessId` | Tenant |
| `userId` / `userName` / `userRole` | Confirmed-by |
| `action` | New code value `MOMO_PAYMENT_CONFIRM` (TypeScript `AuditAction` union; **not** a Prisma enum) |
| `actionType` | `PAYMENT` |
| `entity` / `entityType` / `entityId` | `SalesPayment` / payment id |
| `beforeState` / `afterState` | `{ status, reference, receivedAt }` |
| `reason` | Required confirmation note |
| `details` | Invoice id, txn #, amount, method, original `receivedAt`, confirmation clock, provider ref, sale status |
| `branchId` | Invoice store / payment branch |
| `ipAddress` | From request headers |
| `createdAt` | Confirmation timestamp |

Owner-facing audit page: `/reports/audit-log` (Owner, Pro feature). Add a label for the new action when implementing.

### 7.2 Write style that is safe enough

| Helper | Behaviour | Fit for confirm? |
| --- | --- | --- |
| `audit()` in `lib/audit.ts` | Best-effort, 3s timeout, **never throws** | **No** — silent loss is unacceptable for a cash-truth gate |
| `tx.auditLog.create` (supplier payments, cash drawer) | Same transaction as the money write; uses `beforeState` / `afterState` / `reason` | **Yes** |

Phase B must follow the **cash-drawer / supplier-payment** pattern: confirm + audit in one transaction; if audit insert fails, roll back the status change.

Existing MoMo collection actions (`MOMO_COLLECTION_INITIATE` / `STATUS` / `REINITIATE` / `RECONCILE`) log provider collections, not unlinked `PENDING_MANUAL` sales payments. Do not overload those actions.

### 7.3 Schema migration decision

| Need | Required before Phase B writes? | Recommendation |
| --- | --- | --- |
| New `SalesPaymentReviewAudit` table | **No** | Reuse `AuditLog` |
| `SalesPayment.confirmedAt` / `confirmedByUserId` | **No** | Nice-to-have later for list filters; store on audit for MVP |
| `SalesPayment.notes` | **No** | Use `reference` (if empty) + `AuditLog.reason` |
| `reviewState` parallel flag | **No** | `status` remains source of truth |
| Payment attachment column | **No** | Defer; Blob storage is often unconfigured |
| Prisma enum for status | **No** | Keep documented string statuses |

**No Prisma migration is required** to start Phase B writes, provided confirmation always writes a transactional `AuditLog` row.

A dedicated audit table (Step 5L sketch) is optional later if Owner audit-log volume or Pro gating becomes a problem. Do not block Phase B on it.

## 8. Who may confirm

Merchant roles are `OWNER` | `MANAGER` | `CASHIER` only (`lib/auth.ts`). There is no tenant `ADMIN` role.

| Role | Review page / export | Confirm action |
| --- | --- | --- |
| Owner | Allowed | **Allowed** |
| Manager | Allowed | **Allowed** |
| Cashier | Denied | **Denied** — cashiers created the unverified row |
| Platform / control staff | N/A | **Denied** — not a tenant financial actor |

Reuse `resolveMoneyReceivedAccess` (Owner/Manager, actor `businessId`, authorised stores) plus a server-side check that `payment.salesInvoice.businessId === actor.businessId` and the invoice store is in scope.

Do not allow cashiers to self-confirm. Do not add a second approver in Phase B (Option D).

## 9. Required confirmation evidence

| Evidence | Required in Phase B? | Storage |
| --- | --- | --- |
| Provider / statement reference | **Yes** (min length, trimmed) | `AuditLog.details.providerReference`; fill `SalesPayment.reference` if currently empty |
| Confirmation note | **Yes** (why the owner believes money arrived) | `AuditLog.reason` |
| Confirmation date/time | **Yes** (server clock) | `AuditLog.createdAt` + `details.confirmedAt` |
| Confirmed-by user | **Yes** | `AuditLog.userId` / `userName` / `userRole` |
| Original `receivedAt` | Snapshot | `beforeState` / `details.originalReceivedAt` — not edited |
| Attachment | **Defer** | Expense upload exists; not wired to payments; storage often disabled |

UI copy should say the reference is the MoMo txn id or bank/MoMo statement line the owner checked — not a free-text “ok”.

## 10. Risks and controls

| Risk | Level | Control in Phase B |
| --- | --- | --- |
| Fake confirmation (money never arrived) | High | Owner/Manager only; required reference + note; transactional audit; no bulk confirm; no auto-confirm |
| Duplicate confirm (double-click / retry) | Medium | Update only `where status = PENDING_MANUAL`; second call is a no-op success (“already confirmed”); never insert a second payment |
| Confirming the wrong invoice | Medium | Detail drawer: sale #, customer, amount, cashier, branch, `receivedAt`, network, existing ref; explicit Confirm on that `paymentId` |
| Confirm after return / void | High | **Block** if parent `paymentStatus` is `RETURNED` or `VOID`. Confirming would enter Money Received (parent RETURNED/VOID does **not** exclude CONFIRMED — DEP-PAY-1) while refunds live on `SalesReturn`. Surface “review only — do not confirm” |
| Cross-tenant / cross-branch | High | Trusted access helper + invoice `businessId` + authorised `storeId`; never trust client-supplied business id |
| Historical Money Received restatement | Medium (expected) | Preserve `receivedAt`. A July payment confirmed in August appears in **July** Money Received. Warn in the drawer: “This will add the amount to Money Received for the original received date, not today.” |
| Backdating `receivedAt` to confirmation day | High if allowed | **Forbidden.** Confirmation clock ≠ cash date |
| Re-posting GL / drawer | High if allowed | Confirm does not call `postJournalEntry` or `recordCashDrawerEntryTx` |
| Reject / FAILED without reversing GL | High if added naively | **Out of Phase B.** Checkout already booked Bank. Reject needs a later designed reversing/exclude path |
| Provider collection later confirms the same sale | Low on stuck set | Stuck rows have `collectionId` null; do not invent a link |

## 11. Workflow options

| Option | Description | Verdict |
| --- | --- | --- |
| **A. Confirm payment only** | One click, no evidence | Reject — financial control without audit evidence |
| **B. Confirm with reference / note** | Single-row confirm; required ref + note; audit; status → CONFIRMED; preserve `receivedAt` | **Phase B MVP** |
| **C. Confirm / reject / mark duplicate** | Adds FAILED / DUPLICATE | Defer. No `DUPLICATE` status today. `FAILED` would leave GL Bank debit in place. Design reject with accounting in a later step |
| **D. Full approval workflow** | Request + second approver | Overkill for current volume; not needed for Owner/Manager |

## 12. Recommended Phase B (minimum viable safe)

Build on the existing read-only review page. Do **not** change Money Received predicates.

1. **Row detail drawer** — payment id, sale # (link), customer, branch, cashier, amount, method, status, sale status, `receivedAt`, origin, network, MSISDN, existing reference, collection id (expect none), PAID-vs-pending tension.
2. **Confirm action** — Owner/Manager only; single `paymentId`; no bulk.
3. **Require note + reference** — server-validated; reject empty/whitespace.
4. **Write transactional `AuditLog`** — action `MOMO_PAYMENT_CONFIRM`; fail closed if audit insert fails. Extend `AuditAction` in `lib/audit.ts` (code only).
5. **Update `status` to `CONFIRMED`** — only from `PENDING_MANUAL`; scoped by tenant/branch.
6. **Preserve `receivedAt`** unless a later explicit policy says otherwise (this investigation says preserve).
7. **Optional:** set `reference` if currently null/empty.
8. **Do not** change `receiptOrigin`, invoice status, journals, or cash drawer.
9. **Block** confirm when parent sale is `RETURNED` or `VOID`.
10. **Idempotent** already-CONFIRMED.
11. After success, row leaves the review list and **immediately appears in Money Received for the original `receivedAt` period** via existing inclusion rules.

Suggested implementation shape (not built in this step):

- Server action e.g. `confirmMomoPaymentAction` under `app/actions/`
- Service e.g. `lib/services/momo-confirmation.ts` with the guards above
- UI drawer on `app/(protected)/reports/momo-confirmation/page.tsx`
- Tests: role denial, tenant/branch scope, idempotency, RETURNED block, `receivedAt` unchanged, audit required, Money Received fixtures still exclude `PENDING_MANUAL` until status is CONFIRMED

## 13. What stays unchanged

- `lib/reports/money-received/compute.ts` inclusion predicates
- `CLASSIFIED_PAYMENT_STATUSES` / `isUnverifiedLegacyStatus`
- Parent RETURNED/VOID does not exclude CONFIRMED receipts
- Refunds remain `SalesReturn` / `refund_outflows`
- Amend negative payments remain inside Money Received when CONFIRMED
- No auto-confirm, no confirm-all, no Step 6 work

## 14. Implementation phase recommendation

| Phase | Scope | Gate |
| --- | --- | --- |
| **5O (this doc)** | Investigation | Passed |
| **Phase B** | Drawer + confirm + required evidence + transactional audit + Owner/Manager + preserve `receivedAt` | Preview, then Owner QA on real `PENDING_MANUAL` rows |
| **Later** | Reject / duplicate / reversing journal; optional `confirmedAt` column; attachments | Separate design — do not fold into first write |

## 15. Safety confirmation (this step)

- No production data mutation occurred
- No production migration occurred
- Money Received logic was preserved (no edits to aggregation/inclusion)
- No confirmation action was implemented yet
- Step 6 was not started

## 16. Final verdict

**MOMO MANUAL CONFIRMATION PLAN PASSED — ready to build safe confirmation workflow.**
