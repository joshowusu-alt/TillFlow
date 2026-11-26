import { describe, expect, it } from 'vitest';
import { expectedCashPenceFromEntries } from './expected-cash';

describe('physical cash reconciliation', () => {
  it('includes all signed drawer movements and excludes non-cash, pending and closing adjustments', () => {
    const entries = [
      ['OPEN_FLOAT', 10000], ['CASH_SALE', 100000], ['CASH_DEBTOR_PAYMENT', 5000],
      ['CASH_ADJUSTMENT', 2000], ['CASH_ADJUSTMENT', -1000],
      ['PAID_OUT_SUPPLIER', -12000], ['PAID_OUT_EXPENSE', -3000],
      ['CASH_REFUND', -4000], ['SUPPLIER_REFUND_RECEIVED', 500],
      ['CLOSE_RECONCILIATION', -2000], ['CARD', 9000], ['MOBILE_MONEY', 9000], ['TRANSFER', 9000],
    ].map(([entryType, amountPence]) => ({ entryType: String(entryType), amountPence: Number(amountPence), shiftId: 'shift-a' }));
    expect(expectedCashPenceFromEntries([
      ...entries,
      { entryType: 'CASH_SALE', amountPence: 99999, paymentStatus: 'PENDING', shiftId: 'shift-a' },
      { entryType: 'CASH_SALE', amountPence: 99999, shiftId: 'shift-b' },
    ], { shiftId: 'shift-a' })).toBe(97500);
  });
});
