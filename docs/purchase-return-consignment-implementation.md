# Partial returns and consignment implementation contract

Status: selected-item purchase returns and explicit supplier credit settlements are implemented on the isolated preview branch. Production release remains gated on authenticated browser verification. Consignment remains unimplemented.

## Current implementation evidence

- Source-invoice return form loads original lines, payments, current branch stock and earlier partial returns.
- New immutable return credits retain the original invoice and payment records. Transactional writes cover stock value, movements, supplier credit, journal and audit.
- Supplier balance calculations, payment caps, supplier history/statement, inventory history and financial source links account for credits.
- Local disposable SQLite checks passed for unpaid, part-paid and fully paid purchases, repeat returns, replay, insufficient remaining quantities and foreign branches. Focused regression: 102 tests passed; TypeScript and changed-file lint passed.
- Explicit invoice offsets, bank refunds and open-till cash refunds preserve original invoice payments and inventory. Checks reconcile supplier balances to AP, cashflow, balance sheet and income statement. The prior hosted preview passed the settlement checks, including competing concurrent refunds, on isolated Postgres branch br-dark-breeze-zayhdifo.
- VAT CSV now includes posted sales and purchase return reversals, including partial purchase credits, by journal entry date. Original invoice VAT stays in its invoice period; an offset or later cash/bank refund does not reverse VAT again. The hosted VAT check passed for commit f1f18079793e57d2d848dfc8e0bf6ecdbf565163, including half-open date boundaries and business isolation.
- Authenticated browser verification of the actual saved return and settlement forms remains pending preview sign-in. The public supplier-stock example is a simulation and is not evidence that financial writes work. No production migration or data change was performed.
- Pilot writes are disabled in production and limited to demo businesses. Capitalised delivery-cost returns are blocked pending allocation review. Missing goods expected later and cash refunds are not automatically credited or paid by this workflow.

## Purchase corrections

Preserve original invoice lines. Store each correction as a separate document with source invoice line, base-unit quantity, original unit conversion, proportional net value, tax, allocated inventory cost, reason and actor. Multiple corrections must be supported. Existing whole-invoice reversals remain readable and consume the full original quantities.

Lock the source purchase and inventory in a consistent order. Recompute remaining returnable quantities inside the transaction. Reject duplicate requests, cross-tenant or cross-branch references, excess quantities and insufficient stock. Persist stock movements, supplier credit, journal and audit atomically. Do not mark a partially corrected invoice fully returned.

Separate physical returns from corrections of stock recorded but never delivered. If a supplier will deliver the balance later, preserve the outstanding delivery rather than silently reducing the supplier charge. Require an explicit confirmed credit when reducing the amount owed.

Supplier credit and cash received are separate events. Apply credit to unpaid debt first according to the confirmed correction; retain excess as supplier credit/refund receivable. Record a cash refund only when money is actually received, using the existing open-till controls. Reject excessive refunds rather than silently capping them.

Keep rounding cumulative: the final return of a source line receives the remaining original value and tax, preventing penny residuals. Specify treatment of non-refundable delivery charges independently of the value removed from inventory.

Update supplier statements, payables helpers, purchase reports/exports, product history, backup/restore and purchase-edit guards. Existing queries that exclude every purchase with a return must distinguish partial corrections from complete reversals.

## Consignment

Record supplier-owned receipts separately from ordinary purchased inventory and payable invoices. Each lot needs supplier, product, branch, agreed settlement price, received quantity and source document. Supplier ownership must not be inferred from a product's preferred supplier.

Allocate sales to owned or consigned lots explicitly and retain that attribution for customer returns, transfers and offline replay. Record sold quantities awaiting settlement, unsold physical returns, and settlement documents. Prevent the same sold quantity being settled twice. A later selling-price change must not change the historical agreed supplier price.

Do not activate consignment sales until accounting, sales allocation, customer returns, transfers and offline behaviour are implemented or visibly blocked. Do not retroactively reclassify historical purchases without a reviewed conversion workflow.

## Required acceptance stories

1. Ten purchased books at GH₵10: return four, remove four units and GH₵40 only; preserve the other six and their payment history.
2. Receive invoice quantities five and four, correct undelivered quantities one and one: recorded stock becomes four and three; only confirmed credited values reduce supplier debt.
3. Ten consigned books: sell six, return four, settle six at GH₵10 = GH₵60; supplier lot closes with no unexplained units.
4. Return a further two units after an earlier partial return; reject a cumulative return exceeding the source quantity.
5. Concurrent duplicate return/settlement requests produce one result, one stock effect and balanced journals.
6. Paid, unpaid and part-paid invoices preserve correct supplier credit, debt and actual cash movement.
7. Multi-unit quantities, discounts, tax and delivery allocations round back exactly on the final eligible return.
8. Cross-tenant/branch access and stale inventory checks fail without partial writes.

Release: isolated synthetic-data verification and preview review before any production rollout. Do not modify live customer records during development.
