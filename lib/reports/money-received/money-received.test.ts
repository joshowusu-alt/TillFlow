/**
 * Step 5A-R — Money Received conformance + reconciliation (pure + mocked DB shapes).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildMoneyReceivedDrillRows,
  buildMoneyReceivedExportCsv,
  buildMoneyReceivedExportCsvFromRows,
  computeMoneyReceivedBundleFromFacts,
  computeMoneyReceivedMetrics,
  drillSumPence,
  fetchDrillPage,
  getGatedMoneyMetric,
  paginateDrillRows,
  reconcileMethodBreakdownToMoneyReceived,
  reconcileMoneyReceivedToDetailSum,
  resolveMoneyReceivedScope,
  spreadsheetSafeCell,
  type MoneyMovementFacts,
  type ReportingScopeContext,
} from '@/lib/reports/money-received';
import { getBusinessDayBounds } from '@/lib/notifications/utils';

function baseScope(overrides: Partial<ReportingScopeContext> = {}): ReportingScopeContext {
  return {
    businessId: 'biz-1',
    branchIds: null,
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEndExclusive: new Date('2026-02-01T00:00:00.000Z'),
    asOf: new Date('2026-03-01T12:00:00.000Z'),
    definitionVersion: 'tf-rc/3R.4R-phase1-money-received',
    ...overrides,
  };
}

describe('Economic classification (Step 3R)', () => {
  it('CONFIRMED + unknown method → money_received_other, not unverified', () => {
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'p1',
          amountPence: 1200,
          method: 'CHEQUE',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-01-05T10:00:00.000Z'),
          salesInvoiceId: 'i1',
          branchId: 's1',
        },
      ],
      refunds: [],
    };
    const r = computeMoneyReceivedMetrics(facts, baseScope());
    expect(r.find((x) => x.metricId === 'money_received')?.valuePence).toBe(1200);
    expect(r.find((x) => x.metricId === 'money_received_other')?.valuePence).toBe(1200);
    expect(r.find((x) => x.metricId === 'unverified_legacy_receipts')?.valuePence).toBe(0);
  });

  it('null/unclassified status → unverified_legacy_receipts; excluded from money_received', () => {
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'legacy',
          amountPence: 5000,
          method: 'CASH',
          status: null,
          receivedAt: new Date('2026-01-05T10:00:00.000Z'),
          salesInvoiceId: 'i1',
          branchId: 's1',
        },
        {
          id: 'weird',
          amountPence: 300,
          method: 'CASH',
          status: 'LEGACY_RAW',
          receivedAt: new Date('2026-01-05T10:00:00.000Z'),
          salesInvoiceId: 'i2',
          branchId: 's1',
        },
      ],
      refunds: [],
    };
    const r = computeMoneyReceivedMetrics(facts, baseScope());
    expect(r.find((x) => x.metricId === 'unverified_legacy_receipts')?.valuePence).toBe(5300);
    expect(r.find((x) => x.metricId === 'unverified_legacy_receipts')?.qualityState).toBe('UNVERIFIED');
    expect(r.find((x) => x.metricId === 'money_received')?.valuePence).toBe(0);
  });

  it('FAILED/PENDING/CANCELLED/VOID never enter money_received', () => {
    const facts: MoneyMovementFacts = {
      receipts: (['FAILED', 'PENDING', 'CANCELLED', 'VOID'] as const).map((status, i) => ({
        id: `x${i}`,
        amountPence: 1000,
        method: 'CASH',
        status,
        receivedAt: new Date('2026-01-05T10:00:00.000Z'),
        salesInvoiceId: 'i',
        branchId: 's1',
      })),
      refunds: [],
    };
    expect(computeMoneyReceivedMetrics(facts, baseScope()).find((x) => x.metricId === 'money_received')?.valuePence).toBe(0);
  });
});

describe('CT01 — Later refund after confirmed receipt', () => {
  it('PASS', () => {
    const janScope = baseScope();
    const febScope = baseScope({
      periodStart: new Date('2026-02-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-03-01T00:00:00.000Z'),
    });
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'pay-jan',
          amountPence: 20000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-01-10T12:00:00.000Z'),
          salesInvoiceId: 'inv-1',
          branchId: 'store-1',
          parentPaymentStatus: 'RETURNED',
        },
      ],
      refunds: [
        {
          id: 'ret-feb',
          amountPence: 20000,
          refundEffectiveAt: new Date('2026-02-05T12:00:00.000Z'),
          salesInvoiceId: 'inv-1',
          branchId: 'store-1',
        },
      ],
    };
    const jan = computeMoneyReceivedMetrics(facts, janScope);
    const feb = computeMoneyReceivedMetrics(facts, febScope);
    expect(jan.find((r) => r.metricId === 'money_received')?.valuePence).toBe(20000);
    expect(feb.find((r) => r.metricId === 'refund_outflows')?.valuePence).toBe(20000);
    expect(feb.find((r) => r.metricId === 'money_received')?.valuePence).toBe(0);
    const gate = getGatedMoneyMetric('payment_reversal_outflows', febScope);
    expect(gate.qualityState).toBe('UNAVAILABLE UNTIL DEPENDENCY RESOLVED');
    expect(gate.valuePence).toBeNull();
    expect(gate.dependencyReason).toBe('DEP-PAY-3');
  });
});

describe('CT07 — Unknown payment status', () => {
  it('PASS', () => {
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'legacy-1',
          amountPence: 5000,
          method: 'CASH',
          status: null,
          receivedAt: new Date('2026-01-12T10:00:00.000Z'),
          salesInvoiceId: 'inv-x',
          branchId: 'store-1',
        },
      ],
      refunds: [],
    };
    const results = computeMoneyReceivedMetrics(facts, baseScope());
    expect(results.find((r) => r.metricId === 'unverified_legacy_receipts')?.valuePence).toBe(5000);
    expect(results.find((r) => r.metricId === 'money_received')?.valuePence).toBe(0);
  });
});

describe('CT19 — Scope mismatch', () => {
  it('PASS', () => {
    const headline = computeMoneyReceivedMetrics(
      {
        receipts: [
          {
            id: 'p1',
            amountPence: 1000,
            method: 'CASH',
            status: 'CONFIRMED',
            receivedAt: new Date('2026-01-05T10:00:00.000Z'),
            salesInvoiceId: 'i1',
            branchId: 'store-a',
          },
        ],
        refunds: [],
      },
      baseScope({ branchIds: ['store-a'] }),
    ).find((r) => r.metricId === 'money_received')!;
    const result = reconcileMoneyReceivedToDetailSum(headline, 1000, baseScope({ branchIds: ['store-b'] }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('SCOPE_MISMATCH');
  });
});

describe('CT27 — Timezone midnight Accra', () => {
  it('PASS', () => {
    const instant = new Date('2026-01-16T00:30:00.000Z');
    const dayD = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-01-15T12:00:00.000Z'),
      periodEndInclusive: new Date('2026-01-15T12:00:00.000Z'),
    });
    const dayD1 = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-01-16T12:00:00.000Z'),
      periodEndInclusive: new Date('2026-01-16T12:00:00.000Z'),
    });
    expect(getBusinessDayBounds(instant, 'Africa/Accra').dayStart.getTime()).toBe(dayD1.periodStart.getTime());
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'late-night',
          amountPence: 777,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: instant,
          salesInvoiceId: 'inv',
          branchId: 'store-1',
        },
      ],
      refunds: [],
    };
    expect(computeMoneyReceivedMetrics(facts, dayD).find((r) => r.metricId === 'money_received')?.valuePence).toBe(0);
    expect(computeMoneyReceivedMetrics(facts, dayD1).find((r) => r.metricId === 'money_received')?.valuePence).toBe(777);
  });
});

describe('CT02G / CT11G gates', () => {
  it('CT02G PASS', () => {
    const r = getGatedMoneyMetric('payment_reversal_outflows', baseScope());
    expect(r.qualityState).toBe('UNAVAILABLE UNTIL DEPENDENCY RESOLVED');
    expect(r.dependencyReason).toBe('DEP-PAY-3');
    expect(r.valuePence).toBeNull();
  });
  it('CT11G PASS', () => {
    const paid = getGatedMoneyMetric('paid_at_sale_value_incl_tax', baseScope());
    const credit = getGatedMoneyMetric('credit_originated_sale_value_incl_tax', baseScope());
    expect(paid.dependencyReason).toBe('DEP-SALE-1');
    expect(credit.dependencyReason).toBe('DEP-SALE-1');
    expect(paid.valuePence).toBeNull();
    expect(credit.valuePence).toBeNull();
  });
});

describe('Multi-page reconciliation', () => {
  it('headline equals all pages; page size does not change totals; methods reconcile', () => {
    const receipts = Array.from({ length: 55 }, (_, i) => ({
      id: `p${String(i).padStart(3, '0')}`,
      amountPence: 100 + i,
      method: (['CASH', 'MOBILE_MONEY', 'CARD', 'TRANSFER', 'CHEQUE'] as const)[i % 5],
      status: 'CONFIRMED' as const,
      receivedAt: new Date(Date.UTC(2026, 0, 2, 12, 0, i)),
      salesInvoiceId: `i${i}`,
      branchId: 's1',
      parentPaymentStatus: i % 7 === 0 ? 'RETURNED' : 'PAID',
    }));
    const facts: MoneyMovementFacts = {
      receipts,
      refunds: [
        {
          id: 'rf1',
          amountPence: 250,
          refundEffectiveAt: new Date('2026-01-20T00:00:00.000Z'),
          salesInvoiceId: 'i0',
          branchId: 's1',
        },
      ],
    };
    const scope = baseScope();
    const results = computeMoneyReceivedMetrics(facts, scope);
    const mr = results.find((r) => r.metricId === 'money_received')!;
    const all = buildMoneyReceivedDrillRows(facts, scope, 'money_received');
    expect(drillSumPence(all)).toBe(mr.valuePence);
    expect(reconcileMethodBreakdownToMoneyReceived(results).ok).toBe(true);

    const pageSizeA = 10;
    const pageSizeB = 17;
    let sumA = 0;
    let sumB = 0;
    const pagesA = Math.ceil(all.length / pageSizeA);
    const pagesB = Math.ceil(all.length / pageSizeB);
    for (let p = 1; p <= pagesA; p++) sumA += drillSumPence(paginateDrillRows(all, p, pageSizeA).rows);
    for (let p = 1; p <= pagesB; p++) sumB += drillSumPence(paginateDrillRows(all, p, pageSizeB).rows);
    expect(sumA).toBe(mr.valuePence);
    expect(sumB).toBe(mr.valuePence);

    const refundRows = buildMoneyReceivedDrillRows(facts, scope, 'refund_outflows');
    expect(drillSumPence(refundRows)).toBe(
      results.find((r) => r.metricId === 'refund_outflows')?.valuePence,
    );

    const bundle = computeMoneyReceivedBundleFromFacts(
      {
        businessId: scope.businessId,
        currency: scope.currency,
        timeZone: scope.timeZone,
        periodStart: scope.periodStart,
        periodEndInclusive: scope.periodEndExclusive,
        absoluteBounds: true,
      },
      facts,
    );
    const csv = buildMoneyReceivedExportCsvFromRows(bundle, all, 'money_received');
    expect(csv).toContain('drillReconcilesToHeadline,YES');
    expect(spreadsheetSafeCell('=1+1')).toBe("'=1+1");
  });

  it('query failure is not zero; empty success is zero', () => {
    const failed = computeMoneyReceivedMetrics(
      { receipts: [], refunds: [], queryFailed: true, queryError: 'timeout' },
      baseScope(),
    );
    expect(failed.find((r) => r.metricId === 'money_received')?.valuePence).toBeNull();
    expect(failed.find((r) => r.metricId === 'money_received')?.qualityState).toBe('QUERY_FAILED');

    const empty = computeMoneyReceivedMetrics({ receipts: [], refunds: [] }, baseScope());
    expect(empty.find((r) => r.metricId === 'money_received')?.valuePence).toBe(0);
    expect(empty.find((r) => r.metricId === 'money_received')?.qualityState).toBe('COMPLETE');
  });
});

describe('Database pagination query shape', () => {
  it('fetchDrillPage passes skip/take and never filters parent RETURNED/VOID', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(120);
    const db = {
      salesPayment: { findMany, count },
      salesReturn: { findMany: vi.fn(), count: vi.fn() },
    } as any;

    const result = await fetchDrillPage(db, baseScope(), {
      metricId: 'money_received',
      page: 3,
      pageSize: 25,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
    expect(args.orderBy).toEqual([{ receivedAt: 'desc' }, { id: 'desc' }]);
    expect(JSON.stringify(args.where)).toContain('CONFIRMED');
    expect(JSON.stringify(args.where)).not.toContain('RETURNED');
    expect(result.queryShape.whereHasParentReturnedVoid).toBe(false);
    expect(result.totalCount).toBe(120);
    expect(result.totalPages).toBe(5);
  });

  it('export streams multiple bounded pages without truncating at 5000', async () => {
    const total = 5001;
    const findMany = vi.fn().mockImplementation(async ({ skip, take }: { skip: number; take: number }) => {
      const rows = [];
      for (let i = skip; i < Math.min(skip + take, total); i++) {
        rows.push({
          id: `id-${i}`,
          amountPence: 1,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-01-02T00:00:00.000Z'),
          salesInvoiceId: `inv-${i}`,
          salesInvoice: { storeId: 's1', businessId: 'biz-1' },
        });
      }
      return rows;
    });
    const count = vi.fn().mockResolvedValue(total);
    const aggregate = vi.fn().mockResolvedValue({ _sum: { amountPence: total }, _count: { id: total } });
    const groupBy = vi.fn().mockResolvedValue([{ method: 'CASH', _sum: { amountPence: total } }]);
    const db = {
      salesPayment: { findMany, count, aggregate, groupBy },
      salesReturn: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { refundAmountPence: 0 }, _count: { id: 0 } }),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    } as any;

    const { computeMoneyReceivedBundleFromDb } = await import('@/lib/reports/money-received/service');
    const bundle = await computeMoneyReceivedBundleFromDb(db, {
      businessId: 'biz-1',
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      absoluteBounds: true,
    });
    expect(bundle.byId.money_received.valuePence).toBe(total);
    expect(aggregate).toHaveBeenCalled();
    expect(groupBy).toHaveBeenCalled();

    const csv = await buildMoneyReceivedExportCsv(db, bundle, {
      drillMetricId: 'money_received',
      pageSize: 500,
    });
    expect(csv).toContain('exportCompleteness,COMPLETE_STREAM');
    expect(csv).toContain('drillRowCountExported,5001');
    expect(csv).toContain('drillReconcilesToHeadline,YES');
    expect(csv).not.toContain('PARTIAL_EXPORT_CAP');
    // 5001 rows → at least 11 page fetches at pageSize 500
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(11);
    expect(findMany.mock.calls.every((c: any[]) => c[0].take <= 500)).toBe(true);
  });

  it('fetchDrillPage marks queryFailed instead of empty success', async () => {
    const db = {
      salesPayment: {
        findMany: vi.fn().mockRejectedValue(new Error('db down')),
        count: vi.fn().mockRejectedValue(new Error('db down')),
      },
      salesReturn: { findMany: vi.fn(), count: vi.fn() },
    } as any;

    const result = await fetchDrillPage(db, baseScope(), {
      metricId: 'money_received',
      page: 1,
      pageSize: 25,
    });
    expect(result.queryFailed).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('iterateDrillPages throws on query failure (export must not treat failure as end)', async () => {
    const { iterateDrillPages } = await import('@/lib/reports/money-received/query');
    const db = {
      salesPayment: {
        findMany: vi.fn().mockRejectedValue(new Error('db down')),
        count: vi.fn().mockRejectedValue(new Error('db down')),
      },
      salesReturn: { findMany: vi.fn(), count: vi.fn() },
    } as any;

    await expect(async () => {
      for await (const _ of iterateDrillPages(db, baseScope(), 'money_received', 50)) {
        // should not yield
      }
    }).rejects.toThrow(/failed|db down/i);
  });

  it('requireMoneyReceivedMethodRows refuses queryFailed (no silent empty split)', async () => {
    const { requireMoneyReceivedMethodRows } = await import('@/lib/reports/money-received/query');
    expect(() =>
      requireMoneyReceivedMethodRows({ queryFailed: true, queryError: 'timeout' }),
    ).toThrow(/timeout|failed/i);
    expect(requireMoneyReceivedMethodRows([{ method: 'CASH', amountPence: 100 }])).toEqual([
      { method: 'CASH', amountPence: 100 },
    ]);
  });

  it('exactly 5000 rows still reconciles completely', async () => {
    const total = 5000;
    const findMany = vi.fn().mockImplementation(async ({ skip, take }: { skip: number; take: number }) => {
      const rows = [];
      for (let i = skip; i < Math.min(skip + take, total); i++) {
        rows.push({
          id: `id-${i}`,
          amountPence: 2,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-01-02T00:00:00.000Z'),
          salesInvoiceId: `inv-${i}`,
          salesInvoice: { storeId: 's1', businessId: 'biz-1' },
        });
      }
      return rows;
    });
    const db = {
      salesPayment: {
        findMany,
        count: vi.fn().mockResolvedValue(total),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amountPence: total * 2 }, _count: { id: total } }),
        groupBy: vi.fn().mockResolvedValue([{ method: 'CASH', _sum: { amountPence: total * 2 } }]),
      },
      salesReturn: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { refundAmountPence: 0 }, _count: { id: 0 } }),
      },
    } as any;
    const { computeMoneyReceivedBundleFromDb } = await import('@/lib/reports/money-received/service');
    const bundle = await computeMoneyReceivedBundleFromDb(db, {
      businessId: 'biz-1',
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      absoluteBounds: true,
    });
    const csv = await buildMoneyReceivedExportCsv(db, bundle, { pageSize: 500 });
    expect(csv).toContain('drillRowCountExported,5000');
    expect(csv).toContain('drillReconcilesToHeadline,YES');
  });
});
