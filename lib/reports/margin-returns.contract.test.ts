import { describe, expect, it } from 'vitest';
import { evaluateMarginSet, type MarginInvoiceInput } from './margin-line';

const line = {
  lineSubtotalPence: 10_000,
  lineDiscountPence: 0,
  promoDiscountPence: 0,
  lineCostPence: 4_000,
  qtyBase: 1,
};

function invoice(overrides: Partial<MarginInvoiceInput>): MarginInvoiceInput {
  return {
    paymentStatus: 'PAID',
    discountPence: 0,
    lines: [line],
    returnKind: 'NONE',
    ...overrides,
  };
}

describe('margin returns', () => {
  it('removes attributable revenue and cost for a full return', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'RETURNED', returnKind: 'FULL_RETURN' }),
      invoice({}),
    ]);
    expect(result.state).toBe('READY');
    expect(result.recognisedSalesPence).toBe(10_000);
    expect(result.grossProfitPence).toBe(6_000);
    expect(result.unsupportedReturn).toBe(false);
  });

  it('removes attributable revenue and cost for a full void', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'VOID', returnKind: 'FULL_VOID' }),
    ]);
    expect(result.state).toBe('READY');
    expect(result.recognisedSalesPence).toBe(0);
    expect(result.grossProfitPence).toBe(0);
  });

  it('does not invent a partial goods return', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'RETURNED', returnKind: 'PARTIAL_GOODS' }),
    ]);
    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.unsupportedReturn).toBe(true);
    expect(result.grossProfitPence).toBeNull();
  });

  it('does not treat a payment-only refund as a goods return', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'PAID', returnKind: 'PAYMENT_ONLY_REFUND' }),
    ]);
    expect(result.unsupportedReturn).toBe(true);
    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.grossProfitPence).toBeNull();
    expect(result.recognisedSalesPence).toBe(10_000);
  });

  it('asserts exchange is unsupported', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'PAID', returnKind: 'EXCHANGE' }),
    ]);
    expect(result.unsupportedReturn).toBe(true);
    expect(result.grossProfitPence).toBeNull();
  });

  it('fails closed for a backup return whose parent stays recognised', () => {
    const result = evaluateMarginSet([
      invoice({ paymentStatus: 'PAID', returnKind: 'BACKUP_OR_REPLAY' }),
    ]);
    expect(result.unsupportedReturn).toBe(true);
    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.grossProfitPence).toBeNull();
  });

  it('does not reverse the same full return twice', () => {
    const once = evaluateMarginSet([
      invoice({ paymentStatus: 'RETURNED', returnKind: 'FULL_RETURN' }),
    ]);
    const replay = evaluateMarginSet([
      invoice({ paymentStatus: 'RETURNED', returnKind: 'FULL_RETURN' }),
      invoice({ paymentStatus: 'RETURNED', returnKind: 'BACKUP_OR_REPLAY' }),
    ]);
    expect(once.grossProfitPence).toBe(0);
    expect(once.recognisedSalesPence).toBe(0);
    expect(replay.unsupportedReturn).toBe(true);
    expect(replay.grossProfitPence).toBeNull();
  });
});
