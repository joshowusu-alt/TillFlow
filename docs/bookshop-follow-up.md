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

Follow-up review: purchase Unit Cost and Line Total headings align with their
amounts. In Reports → More reports → Income Statement, tap a monetary figure in
the cards or statement rows to open its supporting records. The date range is
preserved on detail, pagination and return links. Sales and historical costs use
the same calculation as the statement; posted operating costs use the same ledger
entries. Unknown costs remain incomplete. Source links open the sale or expense
where available. Profit details show each sale's revenue and cost, and the signed
effect of expenses and other income.

1. Stock → Products → Categories & groups: add a division beneath an existing category, then add
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
5. Reports → Activity → Sales by linked supplier: choose dates and optional classification filters,
   drill into a supplier, then export. Check quantity, sales, net sales excluding
   tax, historical cost, calculated gross profit and margin. Missing historical
   costs show as incomplete; current product cost is not substituted.

The classification setup now explains all three steps and offers Add group beside
each division. Saving a division selects it as the parent for the next group.
Product forms offer division/group selection within the chosen category, plus a
setup link that preserves the product form in its existing tab. Simple categories
remain sufficient. The supplier table keeps View products visible at the right
edge while scrolling. Its CSV uses numeric monetary columns, a currency header and
UTF-8 encoding for Excel. Reports use the available app width consistently with
Stock and Sell; wide tables scroll within the page on smaller screens.

Label follow-up: an empty queue now says Select products to print, with a direct
button to select the example. A product's Print label link preselects that product;
a newly generated barcode offers the same direct path. Preview alone is not a
print selection. The browser test requests printing in a stubbed print window;
physical printer output remains a user check.

Product assignment shows the full selected classification, and expands the group
controls for categories that have divisions. Choosing a division requires choosing
a group, or explicitly returning to Use category only. Product details show the
saved full path. Existing category-only products retain their assignments.

Reports → Activity → Sales analytics now includes Classification performance.
Compare category, division, group or product; tap a name to drill down. Configured
groups with no sales remain visible, and category-only/unclassified products have
explicit buckets so totals reconcile. Net sales exclude tax and include allocated
invoice discounts; cost uses historical sale evidence. Missing costs and unresolved
return records leave margin incomplete. The table uses the current catalogue
classification, so reclassifying a product moves earlier sales into its new group.
It honours the report's authorised branch and business-local period.

The first implementation creates hierarchy nodes with fixed parents. Renaming,
reparenting and deletion screens, bulk pricing, product history, cashier shortcuts
and additional management insights remain later work. Supplier settlements remain
manual, including full selling proceeds for Bishop and Women of Faith.

Versioned additive database migrations were rehearsed on the isolated test branch;
legacy products remain category-only and historical purchases receive neutral
defaults. Automated checks and Preview deployment are required before handover.

Report visual follow-up: Sales analytics offers trend lines and selectable bars,
plus a separate gross-profit trend when required costs are complete. Historical
custom ranges label their own calendar dates, with at most the latest thirty days
shown. Classification performance adds a net-sales doughnut for the selected
level and filters. Sales by linked supplier adds its own sales-mix doughnut.
Long tails are combined into Other without dropping their value; negative mixes
use the exact signed table instead of a misleading share chart. Business movement
compares current and earlier sales, receipts and refunds on a common bar scale;
these separate measures are never stacked or added. Payment query failures keep
payment series withheld. All charts retain exact figures for keyboard and touch.

Shelf tags, product stickers and A4 labels include the saved readable barcode
value beneath the bars. Print sizes remain unchanged. Review barcode legibility
and scanning with the actual printer after choosing the desired label template.
