import { describe, expect, it } from 'vitest';
import {
  assertExpenseStateMatchesAmounts,
  assertNoOverpayment,
  bucketForDueDate,
  creditPurchaseRequiresSupplier,
  displayDocumentNumber,
  expensePaymentState,
  formatDocumentNumber,
  remainingBalancePence,
  resolveStocktakeLineState,
} from './walkthrough-contracts';

describe('walkthrough contracts', () => {
  it('does not treat a missing due date as current', () => {
    const asOf = new Date('2026-09-17T12:00:00.000Z');
    expect(bucketForDueDate(asOf, null)).toBe('DUE_DATE_MISSING');
    expect(bucketForDueDate(asOf, new Date('2026-09-20T00:00:00.000Z'))).toBe('NOT_YET_DUE');
    expect(bucketForDueDate(asOf, new Date('2026-09-17T00:00:00.000Z'))).toBe('NOT_YET_DUE');
    expect(bucketForDueDate(asOf, new Date('2026-09-16T00:00:00.000Z'))).toBe('D1_30');
    expect(bucketForDueDate(asOf, new Date('2026-08-01T00:00:00.000Z'))).toBe('D31_60');
    expect(bucketForDueDate(asOf, new Date('2026-07-01T00:00:00.000Z'))).toBe('D61_90');
    expect(bucketForDueDate(asOf, new Date('2026-01-01T00:00:00.000Z'))).toBe('OVER_90');
  });

  it('derives expense states from amounts and rejects contradictions', () => {
    expect(expensePaymentState(1000, 0)).toBe('UNPAID');
    expect(expensePaymentState(1000, 400)).toBe('PART_PAID');
    expect(expensePaymentState(1000, 1000)).toBe('PAID');
    expect(remainingBalancePence(1000, 400)).toBe(600);
    expect(assertExpenseStateMatchesAmounts('PART_PAID', 1000, 400)).toBe('PART_PAID');
    expect(() => assertExpenseStateMatchesAmounts('PAID', 1000, 400)).toThrow(/contradicts/);
    expect(() => assertNoOverpayment(1000, 1001)).toThrow(/exceeds/);
  });

  it('treats historic uncounted stocktake zeros as UNCOUNTED', () => {
    expect(resolveStocktakeLineState({ countedBase: 0, countedAt: null, countState: null })).toBe('UNCOUNTED');
    expect(resolveStocktakeLineState({ countedBase: 0, countedAt: new Date(), countState: 'COUNTED' })).toBe('COUNTED');
    expect(resolveStocktakeLineState({ countedBase: 0, adjusted: true })).toBe('POSTED');
  });

  it('requires a supplier for any purchase that still has a balance', () => {
    expect(creditPurchaseRequiresSupplier('UNPAID', 0, 5000)).toBe(true);
    expect(creditPurchaseRequiresSupplier('PART_PAID', 1000, 5000)).toBe(true);
    expect(creditPurchaseRequiresSupplier('PAID', 5000, 5000)).toBe(false);
  });

  it('formats tenant document numbers without replacing ids', () => {
    expect(formatDocumentNumber('purchase', 12)).toBe('PUR-000012');
    expect(displayDocumentNumber('purchase', null, 'clxyzab12cd')).toBe('PUR-••••ab12cd');
    expect(displayDocumentNumber('purchase', 'PUR-000012', 'clxyzab12cd')).toBe('PUR-000012');
  });
});
