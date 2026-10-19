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
- Publication to the existing public TillFlow repository was blocked by automatic approval review and requires explicit user approval before the Preview branch can be updated.
