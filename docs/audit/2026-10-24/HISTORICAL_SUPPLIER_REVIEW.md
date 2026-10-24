# TF-015 — read-only historical supplier-payment assessment

Assessment date:24October2026. No production mutation, migration, backfill or journal adjustment was performed. Production is still `cebd811`.

## What the records establish

The216 unmatched positive CASH supplier payments occur in **six business tenants**, from18February through26June2026. All lack a recorded funding reference, idempotency key, transaction number and QA tag. Names did not match explicit demo/test/QA/mock/fixture/walkthrough/disposable patterns. Therefore **none can responsibly be labelled demo/test or operational solely from current metadata**. The founder's zero-paying-customer statement does not itself prove every record is fictional.

Tenant labels below are anonymised and stable only within this review; no personal names, contact details or raw tenant IDs are published.

| Tenant | Unmatched payments | Actor recorded | Within5seconds of invoice creation | Invoice-linked supplier-payment journal exists | Purchase journal exists | Any store shift overlaps recorded payment time |
|---|---:|---:|---:|---:|---:|---:|
| T1 |198|137|61|141|198|179|
| T2 |8|0|8|0|8|0|
| T3 |3|0|3|0|3|0|
| T4 |3|0|3|0|3|0|
| T5 |2|0|1|2|2|0|
| T6 |2|0|2|0|2|0|

Every unmatched payment's invoice-reference journal set contains a credit to generic Cash account1000; none contains an observed credit to dedicated `1000.HOLD.*`, `2300.OWNER.*` or `3100.OWNER.*` funding accounts. This establishes historical cash accounting intent at the **invoice-reference** level. Since multiple payments can share an invoice reference, it does not establish a one-to-one journal/payment match or prove that the cash physically came from a till.

The within-five-second count is an origin signal consistent with an embedded purchase payment. It is not proof of the application/version/device that created it. Historical origin/version cannot be reconstructed from absent idempotency/QA/transaction fields. Only three T1 rows have an observed purchase/payment audit reference.

## Shift attribution limits

-37payments have **no** contemporaneous shift in the invoice store:19inT1 and18inT2–T6. They cannot be attributed to an existing till without external evidence.
-176T1payments have exactly one overlapping shift:118also match the recorded actor,58do not.
-ThreeT1payments have two overlapping store shifts and no actor-shift match; attribution is ambiguous.
-Even the118actor-and-single-shift matches are **candidates**, not authorised corrections. Backdated `paidAt`, incomplete shift history and money held outside the drawer can invalidate inference.

For a genuine till-funded supplier payment, expected physical cash should decrease once and generic Cash should be credited once. For a non-till payment, reducing a drawer would be wrong; an appropriate funding account should represent the movement. The stored evidence cannot settle this distinction for216rows.

## Classification and proposed reconciliation

Current classification: **216legacy funding/attribution-unresolved records**. This is a confirmed data-quality gap, not a claim that216customer transactions were lost.

1. Review each affected tenant with the founder/operator using its original supplier invoices, payment evidence and any exported shift counts. Confirm explicitly whether it is fictional/demo or operational. Do not infer from tenant name or commercial subscription alone.
2. Produce a private per-payment review list: payment/invoice IDs, amount/date, recorded actor, linked journals, candidate shifts, funding evidence and reviewer decision. Do not put customer-identifying evidence in a public repository.
3. Classify each item as proven till-funded, proven business-cash/owner-funded, imported opening/legacy transaction, fictional/test, duplicate or unresolved. Retain evidence and reasons.
4. Reconcile invoice/payments/AP and journal totals **before** considering any drawer adjustment. A missing drawer row is not permission to post another cash journal.
5. For a proven historical drawer omission, design a separate tenant-specific repair with exact before/after expected cash and variance impact. Prefer a documented current-period correction where closed-history preservation requires it; accounting policy/operator sign-off determines treatment.
6. Rehearse the proposed repair on a disposable copy with invariant assertions and rollback evidence. Supply founder a concrete row list, sums, affected shifts, rationale, risks and rollback before requesting production approval.
7. Apply no repair until that separate approval. Keep new pilot customers in clean, independently onboarded tenants; never inherit these legacy balances as fictional opening stock/cash.

No automated repair is included in the remediation branches. Current new-payment and trading-day regression evidence is separate from historical data provenance.

## Reproduction method

Queries were SELECT-only, joined PurchasePayment to its invoice/business tenant, and excluded explicit `funding:%` references. Missing linkage requires absence of a matching PURCHASE_PAYMENT/PAID_OUT_SUPPLIER drawer row. Aggregate checks grouped by tenant and counted journal references, timing and candidate shifts; no personal records were printed. All table joins used invoice tenant identity and existing FK keys. Production access was through the connected read-only query workflow; credentials were never exported into this report.
