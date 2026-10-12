# MoMo receipt posting contract

Pending manual MoMo is a recorded tender, not confirmed money in Bank. Operational
customer balances already deduct only confirmed receipts, so Accounts Receivable
(1100) is the existing exposure contract. A separate clearing asset would duplicate
that exposure unless the reporting contracts changed too.

## Forward posting treatment

New receipts persist `ledgerTreatment = CONFIRMED_RECEIPTS_AR_V1`. This is independent
of `receiptOrigin`, payment dates and invoice stamps. Existing rows remain NULL;
the additive migration contains no historical UPDATE or financial adjustment.

| Path | Posting and receipt behavior |
| --- | --- |
| Cash, card, transfer at checkout | Debit Cash/Bank, credit Sales/VAT; normal COGS/Inventory pair |
| Provider-confirmed MoMo at checkout | Debit Bank; link the confirmed collection and prevent collection reuse |
| Manual pending MoMo at checkout | Debit AR instead of Bank for that portion; stored tender/invoice stamp remains unchanged |
| Partial/unpaid sale | AR includes unpaid amounts and pending MoMo, with no duplicate clearing asset |
| Later manual MoMo collection | Create one pending receipt; leave AR unchanged until confirmation |
| V1 manual confirmation | Debit Bank and credit AR for exactly that receipt amount; one transactional audit |
| Retry/concurrent confirmation | Invoice lock, fresh receipt read and status compare/update prevent a second transfer or audit |
| Legacy NULL confirmation | Preserve existing posting treatment; status/audit only, never an additional Bank debit |
| Failed/cancelled provider collection | Checkout rejects; no receipt or sale journal |
| Offline replay | Same external reference and captured shift return the first committed invoice; no second posting or stock/drawer effect |
| Full return/void of pending V1 receipt | Reverse AR; closed parent blocks confirmation; preserve the receipt claim for investigation, with no invented Bank or cash refund |
| Legacy pending return/void | Reverse the previously booked Bank exposure; do not represent an unconfirmed tender as a refund of received money |
| Full return of confirmed tender | Refund confirmed amounts using the explicitly selected refund method |
| Single confirmed-tender void | Refund/reverse the original tender method; cash requires an open shift and drawer reversal |

All journal writes use the existing exact debit/credit balance check and run inside
the sale/payment transaction. Confirmation, amendment, return and later collection
share the tenant-scoped invoice lock. PostgreSQL detection also works when the
runtime supplies POSTGRES_* URLs without DATABASE_URL.

## Guarded cases

Pending MoMo must be reconciled before amending its parent sale. This avoids
silently reducing or splitting a receipt that may later be confirmed in full.
An amendment that adds new manual MoMo creates a new pending V1 receipt and debits
AR for that additional exposure.

The existing return row represents one refund method. A void with multiple confirmed
tender methods therefore rejects before writes; use a return with an explicit
refund method. Full-sale reversal with a smaller cash refund also rejects rather
than inventing a customer-credit posting. These restrictions preserve balanced
journals while a separate split-refund/customer-credit contract is defined.

Returned/void sales reject manual confirmation. Unknown non-NULL treatment markers
fail closed. Existing action role, tenant and selected-branch guards remain enforced.
Legacy pending reversals also require the original invoice/receipt journals to
match the expected Bank posting. Missing or inconsistent history rejects before
writes and requires separate reconciliation; NULL is not evidence of a debit.

## Dates and historical reports

`receivedAt` remains the persisted original receipt date. Confirmation does not
rewrite it. Existing operational Money Received reports classify a receipt only
after confirmation and attribute it to that original date, so a later confirmation
can change a past receipt-date report. This is not an immutable historical snapshot.

`confirmedAt` records the actual confirmation time. A V1 AR-to-Bank journal uses
that time as `entryDate`. Initial journals retain the existing commit/posting-date
contract; offline invoice capture time is not silently substituted for it. Historical
GL reporting follows journal entry dates. Receipt-date reports and GL date reports
must not be labelled equivalent. NULL legacy timestamps do not establish a past
confirmation time and must not be reconstructed from guessed dates.

Current operational-to-AR reconciliation is tested on isolated fixtures. Historical
AR/receipt reconstruction and the Balance Sheet remain withheld until they have a
separately validated contract.

## Validation and historical adjustment boundary

The PostgreSQL suite covers actual checkout, provider confirmation, mixed tender,
partial/unpaid sales, later collections, captured offline replay, amendments,
confirmation retries/concurrency, transaction rollback, returns/voids, and access
rejections. Fixtures belong to an isolated disposable database; no Production
payment is confirmed for testing.

Any historical adjustment requires a separate read-only, consistent audit of the
receipt and original journal, followed by a record-level plan and explicit owner
approval. This change supplies neither an automatic backfill nor a historical
adjustment executor. Home and the withheld Balance Sheet presentation stay unchanged.
