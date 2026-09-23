import { describe, expect, it } from 'vitest';
import { evaluateMarginSet, resolveAuthoritativeLineCost } from './margin-line';

describe('margin cost authority', () => {
  it('accepts a positive stored line cost as READY', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 10_000,
            lineDiscountPence: 500,
            promoDiscountPence: 0,
            lineCostPence: 4_000,
            qtyBase: 2,
            defaultCostBasePence: 0,
          },
        ],
      },
    ]);
    expect(result.state).toBe('READY');
    expect(result.recognisedSalesPence).toBe(9_500);
    expect(result.grossProfitPence).toBe(5_500);
  });

  it('treats authoritative zero as READY only when that evidence is supplied', () => {
    const cost = resolveAuthoritativeLineCost({
      lineSubtotalPence: 3_000,
      lineDiscountPence: 0,
      promoDiscountPence: 0,
      lineCostPence: 0,
      qtyBase: 1,
      costEvidence: 'AUTHORITATIVE_ZERO',
    });
    expect(cost).toEqual({ authoritative: true, costPence: 0 });
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 3_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 0,
            qtyBase: 1,
            costEvidence: 'AUTHORITATIVE_ZERO',
          },
        ],
      },
    ]);
    expect(result.state).toBe('READY');
    expect(result.grossProfitPence).toBe(3_000);
  });

  it('uses a positive default only when missing line cost is proven', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 8_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 0,
            qtyBase: 2,
            defaultCostBasePence: 1_500,
            costEvidence: 'MISSING',
          },
        ],
      },
    ]);
    expect(result.state).toBe('READY');
    expect(result.grossProfitPence).toBe(8_000 - 3_000);
  });

  it('keeps an ambiguous stored zero incomplete and does not substitute the default', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PART_PAID',
        discountPence: 0,
        lines: [
          {
            lineSubtotalPence: 8_000,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 0,
            qtyBase: 2,
            defaultCostBasePence: 1_500,
          },
        ],
      },
    ]);
    expect(result.state).toBe('INCOMPLETE_COSTS');
    expect(result.grossProfitPence).toBeNull();
    expect(result.incompleteLineCount).toBe(1);
    expect(result.recognisedSalesPence).toBe(8_000);
  });

  it('allocates an invoice discount in integer half-up pesewas with the remainder on the largest line', () => {
    const result = evaluateMarginSet([
      {
        paymentStatus: 'PAID',
        discountPence: 100,
        lines: [
          {
            lineSubtotalPence: 100,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 10,
            qtyBase: 1,
          },
          {
            lineSubtotalPence: 100,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 10,
            qtyBase: 1,
          },
          {
            lineSubtotalPence: 200,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineCostPence: 10,
            qtyBase: 1,
          },
        ],
      },
    ]);
    expect(result.state).toBe('READY');
    expect(result.recognisedSalesPence).toBe(400 - 100);
    expect(result.grossProfitPence).toBe(300 - 30);
  });
});
