import { describe, expect, it } from 'vitest';

import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  summarizeCashDrawerEntries,
} from './cash-drawer';

describe('cash drawer summaries', () => {
  it('summarizes the standard shift expected-cash formula categories', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'OPEN_FLOAT', amountPence: 20000 },
      { entryType: 'CASH_SALE', amountPence: 100000 },
      { entryType: 'CASH_DEBTOR_PAYMENT', amountPence: 200000 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -50000 },
      { entryType: 'PAID_OUT_EXPENSE', amountPence: -10000 },
      { entryType: 'CASH_REFUND', amountPence: 0 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 0 },
    ]);

    expect(summary.byType).toMatchObject({
      OPEN_FLOAT: 20000,
      CASH_SALE: 100000,
      CASH_DEBTOR_PAYMENT: 200000,
      PAID_OUT_SUPPLIER: -50000,
      PAID_OUT_EXPENSE: -10000,
      CASH_REFUND: 0,
      CASH_ADJUSTMENT: 0,
    });
    expect(summary.totalPence).toBe(260000);
  });

  it('provides owner-friendly labels for cash drawer report categories', () => {
    expect(CASH_DRAWER_BREAKDOWN_ORDER).toEqual([
      'OPEN_FLOAT',
      'CASH_SALE',
      'CASH_DEBTOR_PAYMENT',
      'PAID_OUT_SUPPLIER',
      'PAID_OUT_EXPENSE',
      'CASH_REFUND',
      'CASH_ADJUSTMENT',
    ]);
    expect(CASH_DRAWER_ENTRY_LABELS.PAID_OUT_SUPPLIER).toBe('Supplier payments');
    expect(CASH_DRAWER_ENTRY_LABELS.CASH_DEBTOR_PAYMENT).toBe('Customer payments received');
  });
});
