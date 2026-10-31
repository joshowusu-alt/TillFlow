# Linked stock conversion

An owner or manager uses Inventory → Convert stock to consume one product and produce another in the same operational branch. The actual output count determines the resulting unit cost. Both legs share a reference, actor and note. Selling units of a single product already share stock; this workflow is for separate product records.

The service locks both products in the shared writer order, validates the tenant, branch, actor and unit mappings, and recomputes the cost in the transaction. A stale reviewed source cost requires a new review. The source's confirmed stock value, or its existing recorded weighted average where no unvalued flag is present, supplies the cost; the destination's default buying price is never used. Unknown source value blocks posting. Unknown older destination value remains disclosed. A cost transfer is an inventory debit and inventory credit, never income, expense, COGS, cash or a supplier payment.

Two movements, both balances, an inventory-only journal, audit and the idempotency receipt commit together. An identical retry returns the original reference. The conversion is visible in each product history and in branch-scoped recent conversions. There is no automatic historical backfill or conversion inference. The feature does not resolve legacy stock valuation gaps or historical source-unit mistakes.

## Verification

`npm run test:stock-conversion:sqlite` creates and removes a disposable SQLite database, runs service transactions and costing checks, and restores the previously generated Prisma provider. It tests duplicate requests, changed-payload conflicts, cross-tenant/role/unit rejection, stale quotes, overselling, value conservation, varied yield, downstream sale cost rounding and rollback after a journal failure.

The PostgreSQL writer uses the existing shared advisory/row locks in `lockInventoryValues`; multi-session PostgreSQL concurrency must also be verified before production release. No database migration is required: existing movements, journals, audit and idempotency records hold the linked transaction.

## Historical review

Treat timestamp proximity and names as candidate evidence, not proof. Match source/output units, quantities, branch, actor and explicit notes. Confirm the source cost and subsequent sales before correcting a past conversion. Preserve original journals and document approved corrections with a traceable adjustment. Never replace an unexplained increase with invented opening stock, purchase, bag deduction or yield. Reconcile both cost-of-sales records and the ledger after any approved correction.
