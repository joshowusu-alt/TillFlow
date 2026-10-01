import { describe, expect, it } from 'vitest';
import { creditBuckets, selectAttention, type TodayAttentionFacts } from '@/lib/reports/today/attention';

function facts(overrides: Partial<TodayAttentionFacts> = {}): TodayAttentionFacts {
  return {
    currency: 'GHS',
    openTills: [],
    closedTills: [],
    momoManual: null,
    momoNetworkCount: null,
    customerPastDuePence: null,
    supplierPastDuePence: null,
    belowCost: null,
    lowStock: null,
    hrefForShift: '/shifts',
    hrefForCash: '/reports/cash-drawer',
    hrefForMomo: '/reports/momo-confirmation',
    hrefForNetwork: '/payments/reconciliation',
    hrefForCustomers: '/payments/customer-receipts',
    hrefForSuppliers: '/payments/supplier-aging',
    ...overrides,
  };
}

describe('Today attention', () => {
  it('keeps a cash difference below GHS 5 off the list and includes one at the threshold', () => {
    const below = selectAttention(facts({
      closedTills: [{ tillName: 'Front', storeName: 'Accra', closedAt: new Date('2026-09-30T12:00:00Z'), variancePence: -499 }],
    }));
    expect(below).toEqual([]);

    const at = selectAttention(facts({
      closedTills: [{ tillName: 'Front', storeName: 'Accra', closedAt: new Date('2026-09-30T12:00:00Z'), variancePence: -500 }],
    }));
    expect(at).toHaveLength(1);
    expect(at[0]?.href).toBe('/reports/cash-drawer');
    expect(at[0]?.title).toContain('GH₵5.00');
  });

  it('ranks an open till from a previous day ahead of later conditions and keeps five rows', () => {
    const rows = selectAttention(facts({
      openTills: [{ tillName: 'Front', storeName: 'Accra', openedAt: new Date('2026-09-29T08:00:00Z') }],
      closedTills: [{ tillName: 'Front', storeName: 'Accra', closedAt: new Date('2026-09-30T18:00:00Z'), variancePence: 500 }],
      momoManual: { count: 2, amountPence: 1000 },
      momoNetworkCount: 1,
      customerPastDuePence: 2000,
      supplierPastDuePence: 3000,
      belowCost: { productName: 'Rice', href: '/reports/margins' },
      lowStock: { productName: 'Oil', href: '/inventory' },
    }));
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]?.href).toBe('/shifts');
    expect(rows[2]?.detail).toContain('not included in money received');
  });

  it('does not treat missing amounts as zero', () => {
    expect(selectAttention(facts())).toEqual([]);
    expect(selectAttention(facts({ momoManual: { count: 0, amountPence: 0 }, momoNetworkCount: 0 }))).toEqual([]);
  });

  it('separates overdue customer credit from credit that is not yet due', () => {
    const today = new Date('2026-09-30T00:00:00.000Z');
    expect(creditBuckets([
      { dueDate: new Date('2026-09-29T00:00:00.000Z'), balancePence: 2500 },
      { dueDate: new Date('2026-09-30T00:00:00.000Z'), balancePence: 4000 },
      { dueDate: null, balancePence: 9000 },
      { dueDate: new Date('2026-09-01T00:00:00.000Z'), balancePence: 0 },
    ], today)).toEqual({ pastDuePence: 2500, notYetDuePence: 4000 });
  });
});
