import { describe, expect, it } from 'vitest';
import { computeOutstandingBalance } from './accounting';

describe('computeOutstandingBalance', () => {
  it('treats paid invoices as closed even when legacy payment rows are missing', () => {
    expect(computeOutstandingBalance({
      totalPence: 7_480_00,
      paymentStatus: 'PAID',
      payments: [],
    })).toBe(0);
  });

  it('subtracts recorded payments for unpaid and part-paid invoices', () => {
    expect(computeOutstandingBalance({
      totalPence: 10_000,
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 2_500 }, { amountPence: 3_000 }],
    })).toBe(4_500);
  });
});
