# Stage 1: product identity and scanner acceptance

Scope: isolated demo Preview only. Do not merge or deploy to production until the user reviews and authorises rollout.

## Implemented for review

- Business-scoped primary and alternate barcode identity, including a database registry protecting primary/alias collisions.
- Publisher/brand and edition/format describe versions. Identical names, publishers and editions are permitted; distinct barcodes identify independently tracked products.
- Additional barcodes refer only to the same interchangeable product; publisher variants have separate stock identities.
- Scanner entry is explicitly labelled in product setup and purchase receiving; camera is a separate option. Scanner Enter does not submit an unfinished setup form.
- POS online/offline catalogue, purchase lookup and stocktake scan paths carry alternate barcodes.
- Product list and product detail omit costs for cashiers; product mutations remain owner/manager only.
- Product setup/edit shows estimated gross profit, margin and markup separately.
- Imports no longer silently clear barcode clashes. Same-title publisher ambiguity stops the import with guidance rather than updating an arbitrary product.

## Acceptance checklist

- [ ] Create Book A / Publisher X and Book A / Publisher Y with identical title text and distinct barcodes.
- [ ] Confirm owner sees estimated profit/margin as cost and price change, including below-cost and missing-cost cases.
- [ ] Scan primary and alternate codes in purchases; match the correct version; unknown codes offer creation.
- [ ] Receive X and Y independently; their quantities and cost records remain separate.
- [ ] Scan and sell X and Y independently at POS; verify online and cached/offline lookup.
- [ ] Confirm the same barcode can belong to a different isolated test business, while duplicate claims inside one business fail.
- [ ] Confirm primary-to-alias and alias-to-primary collisions cannot steal another product's code.
- [ ] Confirm cashier list/detail responses omit restricted cost/management data and writes remain denied.
- [ ] Confirm conflicting import leaves barcodes intact and displays an actionable error.
- [ ] Verify migration backfill preserves existing product IDs, quantities and codes.
- [ ] Test a physical USB/Bluetooth keyboard-mode scanner; automated key input is not hardware acceptance.
- [ ] Review phone and desktop layout in the isolated demo.

## Remaining agreed roadmap

Stage 2: category hierarchy, independent author/theme attributes, full product activity and price history, bulk price changes with preview and exact restore.

Stage 3: supplier invoice reference, linked delivery costs, per-book quantity allocation, explicit expense/inventory treatment, consignment receipts/earned entitlement/settlements/returns/carry-forward.

Stage 4: printed and digital blind stocktake, counter/reviewer handoff, variance follow-up and history, reconciliation of movements during counting.

Stage 5: supplier/category margins, complete discount reports and reconciled filters. Estimated purchase profitability must be labelled; exact invoice-level attribution remains a separately planned later capability.

The persistent online-order attention banner already exists; include it in regression acceptance rather than duplicating it.

## Demo feedback corrections — 19 October

- Same descriptive fields no longer force invented editions. Barcode uniqueness remains business-scoped and applies across primary and alternate codes.
- Purchase search includes barcode and selling price. POS already displays the barcode alongside price.
- Additional barcodes have visible rows and an Add another barcode button (maximum 50 total codes).
- Purchases start Unpaid; due dates apply only to Unpaid/Part paid. Payment controls appear when paying. Enter an explicit payment amount.
- Purchase validation returns inline errors without clearing the cart or redirecting away; drafts retain funding selection.
- Cash source is explicit: till drawer; recorded business cash held outside the till; owner-funded advance repayable to owner; owner contribution. Managers cannot be personal funders.
- Both initial purchase payments and later supplier payments use the selected source. Only till cash requires an open till and posts a drawer outflow.
- Cash handovers and returns are ledger transfers. Balances are tracked per person and branch; cash spending cannot exceed that recorded balance. Owner advances and contributions have separate accounts. Owner repayments cannot exceed recorded liability.
- Cash held outside tills remains part of reported business cash; internal transfers do not create revenue/expenses or inflate total cash flow. Owner direct-to-supplier funding does not invent business cash receipts/payments.
- Funding references are persisted on purchase payments and shown as plain-language source labels in purchase history. Funded purchases cannot be hard-deleted; use returns to preserve their payment trail.

### Cash walkthrough

1. Purchases → cash source → Cash handovers and owner balances.
2. Give GH₵1,000 business cash to the manager (from a funded bank/open till, or an identified owner).
3. Record GH₵800 supplier payment from Business cash held outside the till; select that manager. Drawer unchanged.
4. Confirm GH₵200 remains held. Return GH₵200 to the bank/open till and confirm zero remains.
5. Try exceeding held cash; reject without purchase/payment/stock writes.
6. Pay directly from Owner’s money; verify owner liability or contribution and no drawer outflow. Repay a recorded advance, verifying liability reduction and no extra expense.

This is a Preview-only review. Physical USB/Bluetooth hardware acceptance remains outstanding.

### Verification and release status

- 82 targeted tests passed for funding, initial/later supplier payments, money reports, cross-store isolation and purchase UI.
- Full unit regression completed. Two obsolete source/query assertions were corrected and passed their focused reruns. After generating the correct SQLite client for local unit tests, all affected environment-error files reran cleanly: 455 passed, eight integration cases skipped.
- Typecheck, targeted lint and PostgreSQL schema validation passed. Identical descriptive fields with distinct barcodes were exercised successfully on the separate migration-rehearsal database; fixture rows rolled back.
- Hosted acceptance, real PostgreSQL cash-workflow/concurrency acceptance and physical scanner acceptance remain pending. Existing Preview and production deployments have not been changed by this update.
- Publication to the existing public TillFlow repository and the demo Preview branch was explicitly approved by the user. Keep the pull request in draft and do not merge or release to production.


## Purchase and balance-sheet follow-up (19 October)

- Supplier’s original invoice number is separate from the PUR number, retained in purchase drafts and displayed on the saved purchase and purchase list. A tenant/supplier-scoped duplicate hint links the earlier record.
- Delivery and other purchase costs can be capitalised or expensed. Capitalised costs are allocated by physical base-item quantity using exact largest-remainder rounding. Stock movement values, weighted-average inventory values and purchase-return inventory credits include the allocated amounts.
- An expensed cost creates a linked Expense and its own payment history. Actual tender is split between goods and cost; it is never copied. Unpaid cost is posted to AP. Goods and linked expense can subsequently be settled separately. The cost note can record the delivery provider/reference; the goods supplier is not automatically asserted to be the cost payee.
- Add product now starts with name, barcode, selling price and cost. Details, purchasing/pack settings and advanced settings are collapsed. Opening stock is clearly reserved for stock carried into TillFlow, with normal deliveries directed to Purchases.
- Repeatable labelled product details support brand, author, edition, colour, size and arbitrary classifications. Existing brand/edition information is preserved. Up to 50 details and repeated labels are supported.
- Root loading now shows a neutral page skeleton outside intentional launch sessions. URL toast handling has its own Suspense boundary so it cannot hide the page or discard active forms while reading URL parameters.
- Add category works inline in product creation/editing and preserves unsaved fields on success/failure. Internal operational links use Next navigation, preserving the application shell rather than reloading the whole document.
- Balance-sheet accounts and amounts open supporting journals with the same exclusive cutoff instant. AP groups purchase/expense obligations and their payments as at that date, preserving opening/unallocated entries explicitly. Inventory shows product movement values and discloses any difference against the ledger. Entries paginate without changing the all-page closing balance. Owner account names identify the funding owner.
- Preview PUR-000103 was checked directly: inventory debit GH₵2,400 and Akosua Asante owner-contribution equity credit GH₵2,400, with no business-cash credit.

### Follow-up acceptance

- [ ] Enter a supplier reference and delivery cost; verify saved reference, allocation, combined tender and linked expense as appropriate.
- [ ] Open product creation on a phone; add repeated details and an inline category while retaining the product name.
- [ ] Drill cash, AP, owner contribution/advance and inventory from the balance sheet; compare source totals and historical payments.
- [ ] Check hosted navigation for white-screen flashes and test real scanner hardware.

Migration `20261019173500_purchase_references_costs_attributes` was applied successfully on the separate rehearsal branch. 147 focused accounting/UI tests, 49 loading/toast regression tests and 27 branding/label/launch contract checks passed (223 total). Typecheck, targeted lint and PostgreSQL schema validation passed before Preview publication. Browser acceptance remains distinct from automated checks; cloud-browser credential protection currently prevents inspecting the signed-in Preview UI. The Vercel connector also returned 403 for the existing deployment; deployment status is checked through GitHub’s Vercel integration.


## Purchase attribution corrections

- Purchase lists, including Missing supplier, expose Edit on active purchases on desktop and mobile. The invoice detail page has an editable supplier, original invoice reference, due date and cost description.
- Management permission and tenant ownership are enforced on the server. Credit purchases cannot lose their supplier. Returned/voided purchases remain closed.
- A reason and atomic before/after audit record accompany each correction. Stale forms must refresh before overwriting another correction. Metadata corrections do not replay inventory receipts, payments or funding entries. Linked expense descriptions stay aligned.
- Quantity, cost and payment corrections use the existing return-and-receive workflow. This update does not silently rewrite posted financial amounts.


## Mandatory purchase invoice documents

- Every new trading purchase requires a supplier invoice photo, scan or PDF before stock, payments or journals can be written. This applies at the shared purchase service and to Purchases-mode CSV imports; supporting files must cover the import’s rows. Genuine opening-stock migration entries retain their separate opening-stock purpose.
- Up to five PDF/JPEG/PNG/WebP files can be attached, totalling 2 MB. Large phone photos are reduced automatically. Drafts preserve purchase fields; files must be selected again after reopening a page.
- Invoice bytes, checksum, filename, uploader and timestamp are durably retained with the purchase in the same transaction. Private owner/manager download routes require both the business and purchase to match. Public asset URLs are not used.
- Older records can add invoice documents from the detail page. Additional uploads are audited and duplicate file hashes are ignored. Normal purchase editing cannot remove or replace source documents. Backup export/restore retains the document bytes and integrity checks; administrative reset workflows clear them with their purchase records. Purchases with source documents use Returns rather than hard deletion.
- Expense attachments remain optional.
- Follow-up also addresses the earlier CI findings: SQLite-compatible duplicate lookup, neutral-root-loader expectations, the balance-sheet basis disclosure, report-drilldown entitlement coverage, unpaid reset and Next Link source assertions.

Follow-up validation: 148 focused correction/document/access/import/CI regression checks passed. SQLite typecheck and targeted lint passed. The invoice-document migration and binary save/read round trip passed on the separate rehearsal branch; the synthetic document was removed in that same test transaction.

Backup follow-up: binary invoice documents survive JSON export/restore with checksum verification and invoice ownership checks. Linked purchase-expense references are restored after their expenses, and administrative cleanup handles document dependencies. Eighteen focused backup/cleanup checks, both database typechecks and targeted lint passed. The main purchase-controls commit passed 3,812 full unit tests (21 integration cases skipped), its hosted build and PostgreSQL Smoke.
