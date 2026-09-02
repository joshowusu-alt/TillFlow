# Agent C — money-movement idempotency schema

## Choice: dedicated `MoneyIdempotency` table

Use one table for customer receipts, expense payments, `createExpense` first payments, and `createPurchase` embedded payments.

Do **not** add `idempotencyKey` / `payloadHash` to `SalesPayment` or `ExpensePayment`.

### Why not alter payment rows

- `SalesPayment` has no `businessId`. Adding a unique `(businessId, idempotencyKey)` would require a new nullable column plus a denormalized tenant key, and would collide with existing payment indexes.
- `ExpensePayment` already has `businessId`, but a partial unique on `(businessId, idempotencyKey)` where not null still ties one economic event to a single payment row. Split tenders and create-then-pay flows need one key for the whole command.
- `PurchasePayment` already has `@@unique([businessId, idempotencyKey])` for `recordSupplierPayment`. Changing that unique or adding a second key column risks breaking existing supplier-payment replay tests.

### Why not reuse `PurchasePayment` uniqueness for everything

Supplier-payment idempotency is already production-tested on `PurchasePayment`. Agent C keeps that path and only **adds** `SELECT FOR UPDATE` + status-from-persisted-sum.

### Table

```
MoneyIdempotency
  id            String  @id
  businessId    String
  key           String
  payloadHash   String
  commandKind   String   -- CUSTOMER_RECEIPT | EXPENSE_PAYMENT | EXPENSE_CREATE | PURCHASE_CREATE
  resultJson    String   -- enough to reload the operational row on exact replay
  createdAt     DateTime
  @@unique([businessId, key])
```

- Unique is tenant-scoped. The same key in another business is a different event.
- `key` is required and non-null, so no partial-unique / NULL-collision issue.
- Existing payment rows are untouched (forward-only, null-safe).
- Replay: same key + same hash + same commandKind → return persisted result.
- Mismatch: same key + different hash or command → reject, no second post.

### Supplier payments (unchanged columns)

`PurchasePayment.businessId` / `idempotencyKey` / `payloadHash` stay the durable record for `recordSupplierPayment`. `createPurchase` now always sets `businessId` on every new `PurchasePayment`. When `createPurchase` is given an external idempotency key, the claim lives on `MoneyIdempotency` so it does not fight the existing supplier-payment unique.

### Migration

`prisma/migrations/20260830190000_money_movement_idempotency/migration.sql` (Postgres).

Both `prisma/schema.prisma` and `prisma/schema.postgres.prisma` include the model.
