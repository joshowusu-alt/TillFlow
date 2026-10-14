# Cash-flow statement: indirect method and receipts/payments detail

The Cash flow report is under Reports → More reports. It opens with an indirect statement and includes an expandable **Money received and paid** section. Both CSV views use the same rows as the screen.

## Recorded basis

- Opening and closing positions include cash (1000) and combined bank/MoMo (1010), using posted entries only. Undated opening-capital settings are never added.
- The period is business-local and half-open. Today stops at request time. Future periods are rejected.
- One serializable transaction reads opening positions, movements and paginated journals. Both journal ownership and account ownership are scoped to the signed-in business.
- Indirect profit is posted income less posted expenses, consistent with the profit basis used in balance-sheet equity. It is not the sale-line margin estimate.
- Operating working-capital movements cover customer balances, inventory, VAT receivable, supplier balances and VAT payable. Noncash stock gains/losses cancel through their inventory adjustment. Unpaid transactions do not create cash receipts/payments.
- Operating sources are sales, customer receipts/MoMo confirmation, sales returns, purchase invoices/payments, supplier payments/returns, expenses/payments and stock adjustments. Only their money-bearing entries appear in direct detail.
- Cash/bank transfers cancel within each journal before receipts or payments are counted. Refunds and reversals retain their signs.
- Dated opening-balance sources are separate from operating cash. Cash against the existing equity account (3000) is financing, shown as gross equity receipts and payments.
- The current chart/services have no dedicated equipment/loan activity classification. Unrecognised money-bearing journals are explicitly shown as **Other money received/paid**, with a count below the report. They are not guessed into investing or financing. The investing total has no classified entries in the current supported chart. Adding fixed-asset/borrowing workflows requires explicit activity mappings and tests.
- Profit effects outside the supported operating sources are removed from the operating reconciliation. Unknown noncash entries are not presented as cash.
- Indirect operating cash and actual operating money are calculated independently. A nonzero entry difference is shown, never used to manufacture inventory, profit or money balances. Closing positions always follow the recorded money accounts.

## Access

Existing Growth/Pro owner/manager, whole-business and billing/read-only policies remain in force. Access decisions run before data reads. Export permission is checked separately; restricted billing accounts can view but cannot export.

## Validation

Tests cover accrual sales, purchases, VAT, stock losses, refunds, reversed payments, internal transfers, opening balances, equity funding, unrecognised activity, unbalanced entries, empty/negative balances, precision limits, tenant relations, pagination, timezone boundaries, current-time clipping, future/invalid dates, allowed-range application, access denial and both CSV methods. PostgreSQL fixtures compare the report close with the balance-sheet money total, including an accrual sale/purchase/refund/transfer sequence.

Reference: IAS 7 permits direct or indirect operating presentation. Noncash investing/financing transactions are excluded from cash movements. This feature reports the activity recorded in TillFlow; it does not add missing asset/loan classifications or claim standards certification.
https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/
