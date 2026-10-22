# Product-specific cost evidence review

The missing-cost queue previously sent stock reviews to `/inventory` and sale
reviews to `/sales`, losing the selected product and the reason for the review.
Both phone and desktop actions now open `/products/[id]/cost-review`.

The owner/manager-only page checks product ownership before reading evidence.
Stock balances, affected sales and purchase receipts are scoped to the authenticated
business, including the related branch. It distinguishes current catalogue cost,
confirmed existing-stock value and missing historical sale costs. Affected sales
are paginated in groups of 25; recent purchase evidence is limited to 10 lines.
Rows link to their exact source invoices rather than general lists.

Home wording now describes missing stock-value or earlier sale-cost evidence;
the product count is not presented as a count of defective profit calculations.

This is a read-only navigation and evidence fix. It does not clear warnings,
value legacy stock from today's default, change quantities, backfill historical
COGS or post accounting entries. Data corrections require supported historical
values and a reviewed, auditable accounting treatment. The exact-value migration
was forward-only, so existing balances can remain unconfirmed despite a positive
catalogue or rounded average cost. Unverified sale lines continue to withhold
complete profit in affected report periods.
