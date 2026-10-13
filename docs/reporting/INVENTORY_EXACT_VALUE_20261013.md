# Forward inventory valuation

This change follows the inventory audit in PR #125. It retains weighted-average
costing and stores exact monetary value separately from the rounded base-unit
cost displayed to staff.

## Contracts

- A fully costed purchase or opening receipt into a new balance establishes an
  exact value. Sales allocate that amount proportionally; the final units consume
  the remaining amount. Pack rounding cannot lose a pesewa.
- A sales return restores its original stored sale cost, including after later
  purchases at another price. Amendments reverse removed lines at their original
  cost and allocate added lines from the current stock pool.
- Transfers move the same exact amount between branches, under ordered locks.
- Quantity-only receipts persist unknown quantity. A later catalogue cost does
  not supply missing evidence. Sales remain available; affected line costs and
  profit are marked incomplete. If issuing from a mixed known/unknown pool cannot
  establish which value remains, remaining value becomes unverified.
- Opening setup preserves the selected unit's entered cost, including packs.
  A blank product-opening cost does not fall back to the catalogue price.
  Product creation and owner-funded opening stock commit together through the
  opening-equity path, rather than an unpaid purchase without a supplier.
  A proven sole branch works without a selection cookie; multiple branches still
  require explicit server-validated selection, including stale-cookie checks.
- A verified zero-pesewa rounding allocation carries a cost-basis marker. Reports
  distinguish it from missing cost rather than inventing free goods.
- Valued adjustments preserve exact money. Unknown costs require review before
  posting a valued adjustment. Receipt reversals use their original amount and
  reject a reversal that cannot reconcile with the remaining stock.
- Legacy balances remain NULL in the new value fields. No rounded quantity-times-
  average reconstruction, historical cost backfill or journal repair is included.
  Legacy costing remains operational, but exact stock value is disclosed as
  unconfirmed until separately reviewed.
- Other quantity paths invalidate exact metadata when they cannot preserve it;
  an old exact amount must never be displayed against a changed quantity.

## Release boundary

The nullable schema additions and report changes are forward tracking only. This
PR is reviewable separately, stacked on PR #125. Production release and any
historical reconciliation or opening-value certification require owner approval.
No Production financial data is used for tests or changed by this work.

## Verification

Pure valuation tests exercise conservation across 3,030 stock pools, original-cost
returns, pack rounding, unknown-cost sales, legacy balances and arithmetic bounds.
PostgreSQL integration cases use the guarded disposable localhost CI database and
compare exact stock value with balanced inventory journal entries, and verify
atomic product/opening-stock creation and failure rollback. Hosted CI is
the authoritative database and browser gate; passing unit tests alone is not a
release approval.
