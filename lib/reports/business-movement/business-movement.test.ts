import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  STOCK_AVAILABILITY_READINESS,
  absoluteChange,
  buildChangePair,
  buildSalesHeadline,
  businessMovementSalesInvoiceWhere,
  compareSalesMovement,
  contributionToChange,
  percentageChange,
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
  type BusinessMovementScope,
} from '@/lib/reports/business-movement';

function scopeWithPeriods(
  periods: ReturnType<typeof resolveLastFullCalendarMonthPair>,
): BusinessMovementScope {
  return {
    businessId: 'biz-1',
    branchIds: null,
    currency: 'GHS',
    periods,
    asOf: new Date('2026-08-12T12:00:00.000Z'),
    definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
  };
}

describe('Business Movement 6B — change maths', () => {
  it('computes absolute and percentage change', () => {
    expect(absoluteChange(120, 100)).toBe(20);
    expect(percentageChange(120, 100)).toBeCloseTo(20);
    const pair = buildChangePair(80, 100);
    expect(pair.absoluteChange).toBe(-20);
    expect(pair.percentageChange).toBeCloseTo(-20);
    expect(pair.percentageChangeStatus).toBe('ok');
  });

  it('avoids divide-by-zero percentage when comparison is zero', () => {
    const fromZero = buildChangePair(50, 0);
    expect(fromZero.percentageChange).toBeNull();
    expect(fromZero.percentageChangeStatus).toBe('undefined_zero_comparison');
    expect(fromZero.absoluteChange).toBe(50);

    const bothZero = buildChangePair(0, 0);
    expect(bothZero.percentageChange).toBeNull();
    expect(bothZero.percentageChangeStatus).toBe('insufficient_data');
  });

  it('computes contribution and guards zero total delta', () => {
    expect(contributionToChange(40, 100).contribution).toBeCloseTo(0.4);
    expect(contributionToChange(40, 100).status).toBe('ok');
    expect(contributionToChange(-10, 0).contribution).toBeNull();
    expect(contributionToChange(-10, 0).status).toBe('undefined_zero_total_delta');
  });
});

describe('Business Movement 6B — period boundaries', () => {
  it('last full calendar month vs prior month in Africa/Accra', () => {
    // Mid-August 2026 Accra → July (current) vs June (comparison)
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    expect(periods.preset).toBe('last_full_calendar_month');
    expect(periods.currentFromKey).toBe('2026-07-01');
    expect(periods.currentToKey).toBe('2026-07-31');
    expect(periods.comparisonFromKey).toBe('2026-06-01');
    expect(periods.comparisonToKey).toBe('2026-06-30');
    expect(periods.comparisonEndExclusive.getTime()).toBe(periods.currentStart.getTime());
    expect(periods.currentStart < periods.currentEndExclusive).toBe(true);
  });

  it('equal-length custom window places comparison immediately before', () => {
    const periods = resolveEqualLengthPeriodPair({
      timeZone: 'Africa/Accra',
      currentFromKey: '2026-08-01',
      currentToKey: '2026-08-07',
    });
    expect(periods.preset).toBe('equal_length_custom');
    expect(periods.currentFromKey).toBe('2026-08-01');
    expect(periods.currentToKey).toBe('2026-08-07');
    expect(periods.comparisonFromKey).toBe('2026-07-25');
    expect(periods.comparisonToKey).toBe('2026-07-31');
    expect(periods.comparisonEndExclusive.getTime()).toBe(periods.currentStart.getTime());
  });
});

describe('Business Movement 6B — sales headline', () => {
  it('handles positive, negative, and no change', () => {
    const up = buildSalesHeadline(
      { salesValuePence: 200_00, transactionCount: 4, unitsSold: 10 },
      { salesValuePence: 100_00, transactionCount: 2, unitsSold: 5 },
    );
    expect(up.salesValuePence.absoluteChange).toBe(100_00);
    expect(up.transactionCount.absoluteChange).toBe(2);
    expect(up.averageTransactionValuePence.current).toBe(50_00);
    expect(up.averageTransactionValuePence.comparison).toBe(50_00);
    expect(up.averageTransactionValuePence.absoluteChange).toBe(0);

    const flat = buildSalesHeadline(
      { salesValuePence: 100, transactionCount: 1, unitsSold: 1 },
      { salesValuePence: 100, transactionCount: 1, unitsSold: 1 },
    );
    expect(flat.salesValuePence.absoluteChange).toBe(0);
    expect(flat.salesValuePence.percentageChange).toBe(0);

    const down = buildSalesHeadline(
      { salesValuePence: 50, transactionCount: 0, unitsSold: 0 },
      { salesValuePence: 100, transactionCount: 2, unitsSold: 4 },
    );
    expect(down.salesValuePence.absoluteChange).toBe(-50);
    expect(down.averageTransactionValuePence.current).toBeNull();
    expect(down.averageTransactionValuePence.comparison).toBe(50);
  });
});

describe('Business Movement 6B — product / branch / cashier comparison', () => {
  it('marks new and disappeared products and ranks growers/decliners', () => {
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    const result = compareSalesMovement({
      scope: scopeWithPeriods(periods),
      currentHeadline: { salesValuePence: 300, transactionCount: 3, unitsSold: 30 },
      comparisonHeadline: { salesValuePence: 200, transactionCount: 2, unitsSold: 20 },
      currentProducts: [
        { id: 'p-grow', name: 'Grower', salesValuePence: 150, qtyBase: 15 },
        { id: 'p-new', name: 'New SKU', salesValuePence: 100, qtyBase: 10 },
        { id: 'p-drop', name: 'Decliner', salesValuePence: 50, qtyBase: 5 },
      ],
      comparisonProducts: [
        { id: 'p-grow', name: 'Grower', salesValuePence: 50, qtyBase: 5 },
        { id: 'p-drop', name: 'Decliner', salesValuePence: 120, qtyBase: 12 },
        { id: 'p-gone', name: 'Gone', salesValuePence: 30, qtyBase: 3 },
      ],
      currentBranches: [
        { id: 's1', name: 'Main', salesValuePence: 200, transactionCount: 2 },
        { id: 's2', name: 'Annex', salesValuePence: 100, transactionCount: 1 },
      ],
      comparisonBranches: [
        { id: 's1', name: 'Main', salesValuePence: 150, transactionCount: 1 },
        { id: 's2', name: 'Annex', salesValuePence: 50, transactionCount: 1 },
      ],
      currentCashiers: [
        { id: 'c1', name: 'Ama', salesValuePence: 180, transactionCount: 2 },
        { id: 'c2', name: 'Kofi', salesValuePence: 120, transactionCount: 1 },
      ],
      comparisonCashiers: [
        { id: 'c1', name: 'Ama', salesValuePence: 100, transactionCount: 1 },
        { id: 'c2', name: 'Kofi', salesValuePence: 100, transactionCount: 1 },
      ],
      topN: 5,
    });

    expect(result.stockAvailabilityReadiness).toBe('NOT_RELIABLE');
    expect(result.stockInsightsEmitted).toBe(false);

    expect(result.newProducts.map((p) => p.productId)).toContain('p-new');
    expect(result.newProducts.find((p) => p.productId === 'p-new')?.kind).toBe('new');
    expect(result.newProducts.find((p) => p.productId === 'p-new')?.salesValuePence.percentageChange).toBeNull();

    expect(result.noCurrentSalesProducts.map((p) => p.productId)).toContain('p-gone');
    expect(result.noCurrentSalesProducts[0]?.kind).toBe('no_current_sales');

    expect(result.productGrowers[0]?.productId).toBe('p-grow');
    expect(result.productGrowers[0]?.salesValuePence.absoluteChange).toBe(100);

    expect(result.productDecliners[0]?.productId).toBe('p-drop');
    expect(result.productDecliners[0]?.salesValuePence.absoluteChange).toBe(-70);

    // Product contribution: grower +100 of total product Δ (+100 +100 -70 -30) = +100
    const productTotalDelta = 100 + 100 - 70 - 30;
    expect(result.productGrowers[0]?.contributionToSalesChange).toBeCloseTo(100 / productTotalDelta);

    expect(result.branches.find((b) => b.storeId === 's1')?.salesValuePence.absoluteChange).toBe(50);
    expect(result.cashiers.find((c) => c.cashierUserId === 'c1')?.contributionToSalesChange).toBeCloseTo(
      80 / 100,
    );
  });

  it('labels contribution undefined when total delta is zero', () => {
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    const result = compareSalesMovement({
      scope: scopeWithPeriods(periods),
      currentHeadline: { salesValuePence: 100, transactionCount: 1, unitsSold: 1 },
      comparisonHeadline: { salesValuePence: 100, transactionCount: 1, unitsSold: 1 },
      currentProducts: [
        { id: 'a', name: 'A', salesValuePence: 60, qtyBase: 1 },
        { id: 'b', name: 'B', salesValuePence: 40, qtyBase: 1 },
      ],
      comparisonProducts: [
        { id: 'a', name: 'A', salesValuePence: 40, qtyBase: 1 },
        { id: 'b', name: 'B', salesValuePence: 60, qtyBase: 1 },
      ],
      currentBranches: [],
      comparisonBranches: [],
      currentCashiers: [],
      comparisonCashiers: [],
    });
    // Product deltas +20 and -20 → total 0
    expect(result.productGrowers[0]?.contributionStatus).toBe('undefined_zero_total_delta');
    expect(result.productGrowers[0]?.contributionToSalesChange).toBeNull();
  });

  it('scopes invoice where by branchIds and excluded statuses', () => {
    const where = businessMovementSalesInvoiceWhere({
      businessId: 'biz-1',
      branchIds: ['store-a'],
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(where.businessId).toBe('biz-1');
    expect(where.storeId).toEqual({ in: ['store-a'] });
    expect(where.paymentStatus).toEqual({ notIn: ['RETURNED', 'VOID'] });
    expect(where.createdAt).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const all = businessMovementSalesInvoiceWhere({
      businessId: 'biz-1',
      branchIds: null,
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(all.storeId).toBeUndefined();
  });
});

describe('Business Movement 6B — stock gate encoding', () => {
  it('locks readiness to NOT_RELIABLE and does not emit stock insights', () => {
    expect(STOCK_AVAILABILITY_READINESS).toBe('NOT_RELIABLE');
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    const result = compareSalesMovement({
      scope: scopeWithPeriods(periods),
      currentHeadline: { salesValuePence: 0, transactionCount: 0, unitsSold: 0 },
      comparisonHeadline: { salesValuePence: 0, transactionCount: 0, unitsSold: 0 },
      currentProducts: [],
      comparisonProducts: [],
      currentBranches: [],
      comparisonBranches: [],
      currentCashiers: [],
      comparisonCashiers: [],
    });
    expect(result.stockInsightsEmitted).toBe(false);
  });
});
