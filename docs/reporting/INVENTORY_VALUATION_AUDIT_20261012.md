# Inventory valuation and COGS: initial audit

Baseline: master merge e7092016bcfcf0a0cd0fb5f4c32e80ea0cb18cc9.
Scope: code review and isolated mocked reproductions only. No live financial
records have been read or changed by this audit. This is not a certified valuation.

## Agreed sequence

Release the reviewed forward MoMo receipt correction. Then reconcile inventory
quantity, valuation and sales COGS; audit historical entries read-only; prepare
record-level adjustment proposals for owner approval. Enable the Balance Sheet
and cash-flow reporting only after their underlying contracts and balances are
validated. Do not overwrite historical entries or infer receipt confirmation.

## Confirmed discrepancy

`getIncompleteStockSnapshot` clears a sold-without-cost warning if a product
currently has a positive default cost or any business branch has a positive
average cost. `resolveAuthoritativeLineCost` still correctly treats the historical
zero line cost as unproven without explicit evidence. Adding today's cost therefore
can clear the disclosure without establishing the original sale's COGS. A cost in
another branch has the same effect.

Two characterization cases in `inventory-valuation-audit.test.ts` reproduce this
disagreement; both passed on 12 October 2026. They use mocked database responses,
not Production records. They document current behavior, not an approved contract.

## Further concerns requiring validation

- Purchases compute a rounded average from a fetched balance, then increment
  quantity while replacing average cost. Concurrent purchases can use the same
  pre-update valuation; prove behavior with isolated PostgreSQL transactions.
- Unpaid purchases without an idempotency key use separate writes rather than one
  enclosing transaction. Inject failures between invoice, journal and stock writes
  to determine whether partial commits are possible.
- Rounding a base-unit cost can make quantity multiplied by rounded average differ
  from the purchase value posted to inventory. Define residual handling rather
  than silently forcing equality.
- Quantity-only opening stock preserves an existing average cost but posts no
  inventory value. Check valued and unvalued quantities mixed for the same product;
  a positive average alone is insufficient evidence that every unit was valued.
- The withheld Balance Sheet applies the difference between sale-line and journal
  profit to inventory. This is not reconciliation evidence. Keep it withheld while
  validating actual inventory and COGS postings.

These are code-path concerns, not claims that specific live accounts are wrong.

## 13 October: implementation and database evidence

Draft PR #125 preserves historical missing-cost warnings regardless of today's
product cost, another branch's cost or product activation status. Historical costs
and journals are unchanged. Purchases now use a single transaction even when
unpaid and without an idempotency key; stock/link failures must roll back the
invoice, payments, journal and quantity changes together.

Initial PostgreSQL CI run 38381426581 reproduced these fixture discrepancies:

| Scenario | Inventory ledger | Quantity times stored average | Difference |
| --- | ---: | ---: | ---: |
| Sell an item costing GH₵10, restock at GH₵20, return the original item | GH₵30 | GH₵40 | GH₵10 overstatement |
| Buy a three-piece pack for GH₵10 | GH₵10 | GH₵9.99 | One pesewa understatement |
| Add one quantity-only opening item to one valued GH₵10 item | GH₵10 | GH₵20 | GH₵10 unsupported value |

The same initial run proved partial commits on an unpaid purchase after an
injected stock-movement failure. This is addressed in the draft and requires
the updated rollback case to pass. One initial audit case failed at pack-unit
cleanup because an invoice still referenced that unit; cleanup now runs after
invoice deletion. Final exact-head results will supersede this initial run.

These discrepancies are synthetic evidence. No live stock has been certified,
revalued or repaired. Balanced individual journals are necessary but do not by
themselves prove that inventory quantities and values reconcile.

### Proposed valuation controls for the next implementation

Keep moving weighted average. Preserve exact monetary inventory value separately
from a rounded display unit cost, allocate fractional-pesewa residuals consistently
to stock outflows, and return the original stored sale cost to inventory. Track
quantity lacking cost evidence explicitly. Adding a default price must not turn
unknown opening value or old COGS into verified accounting.

All quantity/value writers need one shared transaction/locking contract, including
purchases, sales, returns, opening stock, stocktakes, transfers and adjustments.
Test overlapping different commands as well as duplicate retries. Historical
balances must remain explicitly unverified until a consistent read-only audit and
owner-approved opening/adjustment proposal establish their values. Do not populate
an authoritative value field from an assumed average times quantity.

## Next implementation and acceptance boundary

First make incomplete-cost disclosure follow stored historical evidence without
changing old sale costs or journals. Then establish a valuation contract covering
opening stock, pack conversions, purchases, sales, returns, voids, amendments,
adjustments, stocktakes, transfers, negative stock, rounding and concurrency.

For each supported fixture, reconcile stock movements to on-hand quantity,
valuation to inventory account 1200, and stored sale costs to COGS postings.
Verify tenant/branch isolation, retries and rollback. Show discrepancies explicitly;
do not use balancing plugs. A broader historical audit needs a consistent snapshot
and a separately reviewed plan. No automatic repair or new reporting release is
included in this initial audit.
