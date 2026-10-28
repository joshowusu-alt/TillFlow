import { describe, expect, it } from 'vitest';
import { payableDocumentBalance } from './payables-balance';
describe('supplier balance after partial return credits', () => {
  it.each([[0, 6000], [5000, 1000], [10000, -4000]])('preserves %i paid and applies the credit', (paid, balance) => {
    const result = payableDocumentBalance({ paymentStatus: paid === 10000 ? 'PAID' : 'UNPAID', totalPence: 10000, returnCreditPence: 4000, payments: [{ amountPence: paid }] });
    expect(result.paidPence).toBe(paid);
    expect(result.balancePence).toBe(balance);
    expect(result.excessPence).toBe(Math.max(0, -balance));
  });
});
