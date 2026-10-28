import { describe, expect, it } from 'vitest';
import { allocatedReturnValue, partialReturnSettlement } from './partial-return';

describe('partial purchase return allocation', () => {
  it('returns only four of ten GH₵10 books', () => {
    expect(allocatedReturnValue(10000, 10, 0, 4)).toBe(4000);
  });
  it('absorbs rounding on the final return without over-crediting', () => {
    expect([0, 1, 2].reduce((sum, previous) => sum + allocatedReturnValue(100, 3, previous, 1), 0)).toBe(100);
  });
  it('rejects cumulative excess and malformed quantities', () => {
    for (const qty of [0, -1, 1.5, NaN, Infinity, 7]) expect(() => allocatedReturnValue(10000, 10, 4, qty)).toThrow();
  });
});
describe('supplier return settlement', () => {
  it.each([[0, 6000, 0], [5000, 1000, 0], [10000, 0, 4000]])('keeps payment of %i separate from credit', (paidPence, debt, credit) => {
    expect(partialReturnSettlement({ invoiceTotalPence: 10000, paidPence, previousCreditsPence: 0, newCreditPence: 4000 })).toEqual({ chargeAfterPence: 6000, supplierDebtPence: debt, supplierCreditPence: credit, cashReceivedPence: 0 });
  });
  it('applies further credits against the remaining purchase value', () => {
    expect(partialReturnSettlement({ invoiceTotalPence: 10000, paidPence: 0, previousCreditsPence: 4000, newCreditPence: 2000 }).supplierDebtPence).toBe(4000);
    expect(() => partialReturnSettlement({ invoiceTotalPence: 10000, paidPence: 0, previousCreditsPence: 4000, newCreditPence: 7000 })).toThrow();
  });
});
