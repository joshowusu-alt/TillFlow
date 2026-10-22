# Sale stock evidence integrity

Checkout and sale amendment persist invoice lines, payments, stock balances,
stock movements and accounting entries in one database transaction. Both paths
use `recordSaleStockMovements`, which requires the inserted movement count to
match the requested batch. A missing row fails the transaction rather than
committing a sale or quantity change without its evidence.

Movement before/after quantities form a continuous chain for repeated products,
including different selling units and amendment restorations followed by additions.
The helper preserves each movement's recorded cost and cost basis. It does not
assign values to legacy stock or turn unverified sale costs into confirmed costs.

The Postgres inventory valuation suite injects a missing movement during checkout
and amendment and compares the complete invoice, payment, stock and journal
snapshot before and after the failed transaction. It also verifies the successful
restoration/replacement quantity chain and exact inventory/COGS reconciliation.

Business backup exports read every table inside one repeatable-read transaction
on Postgres (serializable on SQLite). A sale committing during export is either
fully included or fully excluded. The Postgres suite commits a concurrent sale
between export reads and verifies that invoices, movements and stock quantities
all belong to the earlier snapshot. A failed evidence read returns no backup.

Historical discrepancies require a scoped investigation. Compare invoice product
quantities with the net SALE and SALE_AMENDMENT movements; account for returns,
opening records and transfers separately. A missing historical movement must not
decrement today's stock a second time. Preserve original journals and add a
balanced, auditable cost correction only where source evidence supports it.
Current default or rounded average costs alone do not establish historical value.
