# Stage 1: product identity and scanner acceptance

Scope: isolated demo Preview only. Do not merge or deploy to production until the user reviews and authorises rollout.

## Implemented for review

- Business-scoped primary and alternate barcode identity, including a database registry protecting primary/alias collisions.
- Publisher/brand and edition/format distinguish products sharing a displayed title.
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
