# Payment receipt-origin foundation

Forward-only durable origin on `SalesPayment` so reporting can later distinguish sale-time receipts from later credit collections **without timestamp heuristics**.

## Problem (Outcome C)

Existing `SalesPayment` rows cannot reliably distinguish:

- `RECEIVED_AT_SALE`
- `LATER_CREDIT_COLLECTION`

Sparse signals (`collectionId`, drawer/JE linkage, invoice timestamps) are insufficient. A five-minute `receivedAt` vs invoice `createdAt` grace is **false accounting logic** and must not be used.

## Schema contract

| Item | Value |
|------|--------|
| Field | `SalesPayment.receiptOrigin` |
| Type | nullable `TEXT` / Prisma `String?` |
| Allowed values | `RECEIVED_AT_SALE`, `LATER_CREDIT_COLLECTION`, `UNCLASSIFIED`, or `NULL` |
| DB constraint | CHECK allowing NULL or the three literals |
| Default rewrite | **None** — no `DEFAULT` that mutates historical rows |

### Enum semantics

- **RECEIVED_AT_SALE** — money recorded through the authoritative original sale/checkout workflow, including each split-tender component and part-paid deposits created with the invoice.
- **LATER_CREDIT_COLLECTION** — money recorded through the debtor/customer-payment workflow after the sale already exists. Provenance is the workflow, not elapsed time.
- **UNCLASSIFIED** — the system lacks durable evidence for either classification (legacy, restore/import without provenance, amendment/refund where the action does not establish meaning).

### Historical-record contract

```text
NULL on pre-existing record = historical UNCLASSIFIED
```

Reads use `resolveReceiptOrigin(null) → UNCLASSIFIED`.

New application write paths **must** persist a non-null enum value.

A bulk UPDATE of historical rows to `UNCLASSIFIED` is **not** authorised in this foundation (material data migration; not required for honesty when NULL means unclassified).

## Why nullable (not non-null + default)

- Avoids rewriting every historical payment merely to store “unknown”.
- Additive `ADD COLUMN` is compatible with old app builds that ignore the column.
- No table-wide DEFAULT fill; locking risk is limited to a metadata DDL on Postgres (not a full-row rewrite of payment amounts/methods).
- Rollback drops the column (origin data lost); payment money fields remain intact.

## Migration

`prisma/migrations/20260808120000_sales_payment_receipt_origin/migration.sql`

- `ALTER TABLE "SalesPayment" ADD COLUMN "receiptOrigin" TEXT;`
- CHECK constraint for NULL or the three values
- No index (no demonstrated query need in this foundation)

### Lock / rewrite analysis

- Additive nullable column + CHECK: Postgres acquires `ACCESS EXCLUSIVE` briefly for `ADD COLUMN` without rewrite when no DEFAULT is set (PG 11+).
- Does **not** change payment amounts, methods, dates, invoice links, branches, or statuses.
- Expected: payment count and sum of amounts unchanged across the migration itself.

### Deployment compatibility

- Old code running during rollout: ignores unknown column; continues writing without origin (acceptable only during overlap; new code requires origin).
- New code reading historical rows: treats NULL as unclassified.
- Rollback to previous app version: safe for money fields; new column unused.
- Production migrate is **not** authorised by this foundation PR alone — Preview-only migrate for proof.

## Domain contract

`lib/payments/receipt-origin.ts`

- Typed literals + `RECEIPT_ORIGIN` constants
- `resolveReceiptOrigin` for reads
- `parseOptionalReceiptOrigin` for backup/import (missing → null; invalid → throw)
- `withReceiptOrigin` helper for intentional construction

## Write-site inventory (creates)

| Site | Mechanism | Assigned origin |
|------|-----------|-----------------|
| `lib/services/sales.ts` checkout nested `payments.create` | Original sale / split / part-paid deposit | `RECEIVED_AT_SALE` |
| `lib/services/payments.ts` `recordCustomerPayment` `createMany` | Debtor collection | `LATER_CREDIT_COLLECTION` |
| `lib/services/sales.ts` amend +payment / −refund | Amendment business action | `UNCLASSIFIED` |
| `app/actions/demo-day.ts` `createMany` | Demo generator | `RECEIVED_AT_SALE` |
| `app/actions/backup.ts` restore `create` | Backup restore | Preserve valid / NULL if missing |

Non-create paths inspected:

- MoMo status updates: `updateMany` only (no create).
- Returns / voids: `SalesReturn` + stock/journal; **no** `SalesPayment` create.
- Offline sale: routes into `createSale` checkout path.
- Import migration CSV (P1): no `SalesPayment` create in Slice 2A/2B paths inspected for this foundation.

## Assignment matrix

| Write path | Assigned origin | Reason | Persisted explicitly |
|------------|-----------------|--------|----------------------|
| Original checkout payment | `RECEIVED_AT_SALE` | Sale workflow | Yes |
| Split-tender component | `RECEIVED_AT_SALE` | Component of original sale | Yes |
| Part-paid deposit at checkout | `RECEIVED_AT_SALE` | Created with original sale | Yes |
| Debtor cash payment | `LATER_CREDIT_COLLECTION` | Customer-payment workflow | Yes |
| Debtor MoMo payment | `LATER_CREDIT_COLLECTION` | Customer-payment workflow | Yes |
| Multiple later collections | `LATER_CREDIT_COLLECTION` | Collection workflow | Yes |
| Imported payment without proven source | `UNCLASSIFIED` / NULL | Origin unavailable | Yes |
| Restored legacy payment missing origin | NULL → unclassified | Preserve truth | Yes |
| Demo/seed payment | `RECEIVED_AT_SALE` | Deterministic fixture | Yes |
| Amendment-created payment | `UNCLASSIFIED` | Amend does not establish sale vs collection | Yes |
| Negative amendment refund | `UNCLASSIFIED` | Direction via amount sign; not a receipt substitute | Yes |

## Refund / reversal / return / void contract

TillFlow does **not** model refunds as a separate refund entity linked to the original payment row.

| Concern | Behaviour |
|---------|-----------|
| Receipt origin | Amendment refund/add → `UNCLASSIFIED` (honest) |
| Payment direction | Negative `amountPence` on `SalesPayment` for amend refunds |
| Payment status | Invoice `paymentStatus` recomputed from payment sum |
| Refund relationship | No durable FK from refund payment → original payment |
| Money-received reporting | Must filter/sign-aware; origin alone is not a reversal model |
| Payment-method totals | Include signed amounts as today |
| Cash Drawer | Separate `CASH_REFUND` / payment entries where cash |
| Invoice revenue | Invoice totals / lines; returns use `SalesReturn` |
| Returns / voids | No new `SalesPayment`; stock + return records |

**Blocker (separate):** a true payment-reversal relationship model is out of scope. Origin must not substitute for it.

## Backup / restore / import

- Export version bumped to **1.1** (includes `receiptOrigin` when present on rows).
- Old 1.0 backups without the field restore successfully → `receiptOrigin` NULL.
- New backups preserve explicit origins on round trip.
- Invalid enum values fail restore clearly (`parseOptionalReceiptOrigin`).
- No timestamp fabrication.

## Out of scope (this PR)

- Trading Report classification UI / receipts drill-down (PR #84)
- Five-minute heuristics
- Historical speculative backfill
- Production migrate/deploy
- Modifying PR #83 or PR #84

## Tests

- Unit: `lib/payments/receipt-origin*.test.ts`, payments/sales regressions
- PostgreSQL (must not skip): `npm run test:payment-receipt-origin:pg`
- CI: `.github/workflows/postgres-smoke.yml`
- Preview probe: `scripts/payment-receipt-origin-preview-probe.cjs`
