# Recorded-money foundation for cash flow

The existing cash-flow helper starts with the cash-on-hand account only, adds an undated legacy capital field, and derives closing cash from operating profit plus selected working-capital changes. This cannot establish recorded combined cash and bank/MoMo closing balances and omits other money movements.

The new recorded-money reader sums the cash (1000) and combined bank/MoMo (1010) ASSET accounts using dated journal entries. Beginning balances exclude the start instant; period movements include the start and exclude the end. Each account and journal relation is scoped to the authenticated business. One serializable transaction reads the positions. Negative balances are retained, integer-pence arithmetic is checked, and undated capital is not injected. Transfers between the two money accounts cancel in the combined net movement.

The reader returns per-account opening, net movement and closing positions and combined totals. It deliberately does not label raw ledger debits as customer receipts or credits as supplier payments: an internal transfer appears on both sides of those totals. Cash-flow activity categories and the report UI will be added after the journal source patterns and noncash entries have been checked. The existing cash-flow screen and helper are not switched to this reader in this foundation PR.

Tests cover a receipt/payment/transfer period, transfers alone, negative and empty balances, tenant relations, half-open date boundaries, transaction isolation, and unsupported arithmetic precision. The PostgreSQL fixture compares the combined closing position with the balance sheet at the same boundary, including exclusion of undated capital and next-period entries.
