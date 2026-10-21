# Product history and compact supplier accounts

Preview review scope. No production release or data migration is part of this change.

## Product history

Open a product as Owner or Manager and choose **View history**. The view uses the
active authorised branch; date filters affect history rows, not current stock.

- Stock movements are paged in groups of 25, ordered by recorded timestamp and ID.
- Signed quantities, recorded actor, and before/after quantities are preserved.
  Missing before/after figures are not reconstructed.
- Only inventory-value-v1 stock values are displayed as verified; present-day
  product cost is never substituted into historical movements.
- Current stock is compared with the sum of all recorded movements in the branch.
  A difference is a review signal, not an automatic adjustment or a physical-count
  certification. Legacy opening quantities may be absent from recorded history.
- Validated purchase, sale and return references link to their original documents.
  Adjustment and transfer links filter their existing pages to the linked record.
  References that cannot be validated remain unlinked rather than invented.
- Supplier receipt costs retain the supplier from each purchase invoice, independent
  of the catalogue preferred-supplier link. Quoted unit price, discounted goods cost
  and capitalised extra costs are separate. Returned/voided receipts stay labelled.
  This history does not allocate sold units to supplier batches or calculate settlement.
- Receipt and movement pages have independent pagination and preserve date filters.
  Dates use the business timezone. Invalid ranges do not silently query all records.

## Supplier accounts

The full account balance and main actions stay visible. Purchase history, statement,
linked-product sales and linked products are collapsed by default. History filters
and pagination reveal the purchase section. Fragment action links reveal their
section, including repeated clicks after a manual collapse.

Purchase history shows 25 invoices per page. Full-account and date-selected totals
remain independent of those pages. CSV includes the complete selected purchase set.
The statement running subtotal explicitly covers the displayed purchase set only.

## Verification

Targeted service/route/component tests cover tenant/branch isolation, date bounds,
pagination, missing evidence, return-source resolution and disclosure behavior.
The owner-flow CI walkthrough checks product-history quantities against stored
balances and movements, responsive layouts, and supplier disclosure actions.
