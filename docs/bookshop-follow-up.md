# Bookshop follow-up — agreed scope, 20 October 2026

Preview only. Existing production rollout is not authorised by this scope.

The existing purchase controls and category workflow remain the baseline. This is
an extension of that work, not a replacement architecture.

## Decisions

- Categories remain sufficient for a business or product. Optional classification
  is Category → Division → Group → Product. Selecting a group derives its umbrella.
- Keep purchase discounts percentage-based, with the monetary saving visible.
- A delivery note can support stock receipt before the invoice, once quantity and
  cost are established. Retain the mandatory attachment, distinguish the document
  type, and expose an awaiting-invoice queue. Later invoice attachment and number
  corrections must not replay stock or payments.
- Supplier reports show quantity, sales, historical recorded cost and calculated
  margin. Their scope and attribution basis must be explicit.
- Bishop and Women of Faith receive full selling proceeds. Their calculated margin
  is not the shop's retained earnings or a settlement calculation. Staff handle
  their settlement using the report. Do not introduce automatic settlements or
  change ledger recognition based solely on this reporting request.
- Other described suppliers are paid agreed cost as goods sell. Do not use the
  preferred-supplier report to claim receipt-level settlement accuracy.
- Unsold supplier goods use linked supplier returns, not sales or generic losses.
- Expenses retain optional evidence.

## Delivery sequence

1. Optional classification: schema, setup, product create/edit, catalogue display
   and filtering, safeguards and backup support. Preserve category totals.
2. Hierarchy import mapping and report filters/rollups; review existing entry paths.
3. Purchase percentage discounts and document-type/invoice-follow-up workflow.
4. Supplier profitability, with returns and historical cost handled consistently;
   explicit reporting-versus-settlement disclosure.
5. Bulk pricing, product history, cashier shortcuts and management insights after
   the main operational paths have been verified.

## Preview review checklist

1. Products → Categories: add a division beneath an existing category, then add
   a group beneath that division. In product create/edit, choose the group and
   confirm its category fills automatically. A category-only product still works.
2. Products: filter by category, division or group. Export products and confirm
   all three names appear. Import templates accept optional division and group
   columns, supplied together with category. Category-only imports preserve an
   existing group assignment.
3. Purchases: apply an item percentage and an invoice percentage. Invoice discount
   applies after item discounts; the displayed saving and net total should agree.
   Stock value and supplier debt use the discounted amount. Attached evidence
   remains required.
4. Purchases: receive against a delivery note, then open Awaiting invoice. Attach
   the later invoice and its original reference in purchase details. This closes
   the follow-up flag without receiving stock or paying the supplier again.
5. Reports → Sales by supplier: choose dates and optional classification filters,
   drill into a supplier, then export. Check quantity, sales, net sales excluding
   tax, historical cost, calculated gross profit and margin. Missing historical
   costs show as incomplete; current product cost is not substituted.

The first implementation creates hierarchy nodes with fixed parents. Renaming,
reparenting and deletion screens, bulk pricing, product history, cashier shortcuts
and additional management insights remain later work. Supplier settlements remain
manual, including full selling proceeds for Bishop and Women of Faith.

Versioned additive database migrations were rehearsed on the isolated test branch;
legacy products remain category-only and historical purchases receive neutral
defaults. Automated checks and Preview deployment are required before handover.
