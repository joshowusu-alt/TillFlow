# Bulk pricing

Preview scope: Growth and Pro, Owner and Manager. Open **Products → Bulk pricing**.
The catalogue is shared across branches. This change adds no database migration.

- Select active products by category, division, group and/or name, publisher,
  edition or exact barcode. Invalid or mismatched classification filters fail
  closed. Batches over 200 matches require narrower filters; no silent truncation.
- Increase or decrease a percentage or currency amount, starting from the current
  selling price or catalogue cost. Catalogue cost is not branch average stock cost.
  Cost plus a percentage is markup, not margin. Missing required costs block a row.
- Round once, half up, to 0, 1 or 2 decimal places using integer arithmetic.
  Zero, negative and out-of-range prices are rejected rather than clamped.
- Base-only mode updates the base price and any explicit base-unit override.
  Separately priced packs stay unchanged; inherited packs follow the new base.
  All-units mode calculates each pack independently using its own effective selling
  price or catalogue unit cost. Independent rounding may create a pack override.
- Preview all resulting prices and costs, exclude products, give a reason and
  explicitly confirm. Selected warnings (including below-cost prices and missing
  margin evidence) require acknowledgement. Invalid/unchanged rows cannot be selected.
- Apply authenticates again, checks billing write access and current plan, reloads
  the filtered products and compares the preview fingerprint, including unit
  overrides, costs, conversion factors, versions and timestamps. Submitted prices
  are never accepted as authority. A stale selection is rejected in full.
- Optimistic row guards plus a serializable transaction protect the update.
  Prices and per-product before/after audit records commit together. Failed batches
  roll back. A successful batch invalidates its own fingerprint, preventing replay.
  A lost response discards the client preview and asks the user to inspect prices.
- Catalogue cache is invalidated for connected tills. Offline tills use their last
  synced catalogue until they reconnect. Reprint affected shelf labels. Existing
  sales, purchases, stock values and costs remain historical records.

## Verification

Calculation tests cover decimal percentages/amounts, half-up rounding and bounds.
Service tests cover filter/tenant scoping, plan access, base/pack rules, stale and
replayed previews, warnings, selected IDs, optimistic guards and audit failures.
Route/action tests cover role and billing gates. UI tests cover invalidation,
selection, confirmation, asynchronous duplicate submits and uncertain responses.

The localhost/SQLite-only owner E2E creates dedicated fictional products, checks
320px/390px/1280px layouts, rejects a stale preview, injects a failure on the second
product write to verify full rollback, then applies the refreshed batch and checks
base/pack prices and committed audit evidence.
