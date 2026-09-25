import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const prismaMock = vi.hoisted(() => {
  function emptyDelegate() {
    return new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        if (!(prop in target)) {
          target[prop] = prop === 'count'
            ? vi.fn(async () => 0)
            : prop === 'aggregate' || prop === 'groupBy'
              ? vi.fn(async () => (prop === 'groupBy' ? [] : { _sum: { totalPence: 0, amountPence: 0 }, _count: { id: 0, _all: 0 }, _max: { createdAt: null } }))
              : vi.fn(async () => (prop === 'findUnique' || prop === 'findFirst' || prop === 'findUniqueOrThrow' ? null : []));
        }
        return target[prop];
      },
    });
  }
  const base = {
    $executeRawUnsafe: vi.fn(async () => 0),
    business: {
      findUnique: vi.fn(async () => ({ timezone: 'Africa/Accra', openingCapitalPence: 0, minimumMarginThresholdBps: 1500 })),
      findUniqueOrThrow: vi.fn(async () => ({ timezone: 'Africa/Accra', openingCapitalPence: 0, minimumMarginThresholdBps: 1500 })),
    },
    salesInvoice: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { totalPence: 0 }, _count: { id: 0 } })),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
    salesInvoiceLine: { findMany: vi.fn(async () => []) },
    salesPayment: { findMany: vi.fn(async () => []), aggregate: vi.fn(async () => ({ _sum: { amountPence: 0 } })) },
    purchaseInvoice: { findMany: vi.fn(async () => []) },
    purchasePayment: {
      aggregate: vi.fn(async () => ({ _sum: { amountPence: 0 } })),
      findMany: vi.fn(async () => []),
    },
    expense: { findMany: vi.fn(async () => []) },
    expensePayment: { aggregate: vi.fn(async () => ({ _sum: { amountPence: 0 } })) },
    riskAlert: { findMany: vi.fn(async () => []) },
    inventoryBalance: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    mobileMoneyCollection: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    shift: { findMany: vi.fn(async () => []) },
    openingBalance: { findMany: vi.fn(async () => []) },
    journalLine: { findMany: vi.fn(async () => []) },
    account: { findFirst: vi.fn(async () => null) },
    customer: { count: vi.fn(async () => 1), findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    storefrontCustomer: { findMany: vi.fn(async () => []) },
    onlineOrder: { groupBy: vi.fn(async () => []) },
    product: { findMany: vi.fn(async () => []) },
    store: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    messageOutbox: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'out-1' })) },
    supplier: { findMany: vi.fn(async () => []) },
    salesReturn: { count: vi.fn(async () => 0) },
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (!(prop in target)) (target as Record<string, unknown>)[prop] = emptyDelegate();
      return (target as Record<string, unknown>)[prop];
    },
  }) as typeof base & Record<string, ReturnType<typeof emptyDelegate>>;
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/reports/money-received', () => ({
  aggregateMoneyReceivedByMethod: vi.fn(async () => []),
  aggregateConfirmedReceiptsThroughAsOf: vi.fn(async () => ({ amountPence: 0 })),
  requireMoneyReceivedMethodRows: (rows: unknown) => rows ?? [],
  resolveMoneyReceivedScope: (scope: unknown) => scope,
}));
vi.mock('@/lib/reports/financials', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/financials')>('@/lib/reports/financials');
  return { ...actual, getAccountBalance: vi.fn(async () => 0) };
});

import { evaluateMarginSet } from '@/lib/reports/margin-line';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { getCustomers, getCustomer } from '@/lib/services/customers';
import { getSupplierListKpis } from '@/lib/services/supplier-kpis';
import { getMarginAnalysisSnapshot } from '@/lib/reports/margin-analysis';
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';
import { getCashflowForecast } from '@/lib/reports/forecast';
import { enqueueOwnerDailySummarySms } from '@/lib/notifications/owner-daily-summary-sms';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';

const NOW = new Date('2026-03-15T12:00:00.000Z');
const SALE_AT = new Date('2026-03-15T10:00:00.000Z');

const gpLine = {
  lineSubtotalPence: 2000,
  lineDiscountPence: 100,
  promoDiscountPence: 51,
  lineCostPence: 834,
  qtyBase: 1,
  product: { id: 'p1', defaultCostBasePence: 834, name: 'Rice' },
  salesInvoice: { createdAt: SALE_AT, paymentStatus: 'PAID', discountPence: 0, id: 'inv-gp' },
  salesInvoiceId: 'inv-gp',
};

function projectRow(row: Record<string, unknown>, select?: Record<string, unknown>): Record<string, unknown> {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue;
    const value = row[key];
    if (spec === true) out[key] = value;
    else if (spec && typeof spec === 'object' && 'select' in spec) {
      const nested = (spec as { select: Record<string, unknown> }).select;
      out[key] = Array.isArray(value)
        ? value.map((item) => projectRow(item as Record<string, unknown>, nested))
        : value && typeof value === 'object'
          ? projectRow(value as Record<string, unknown>, nested)
          : value;
    }
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  prismaMock.purchaseInvoice.findMany.mockReset();
  prismaMock.purchaseInvoice.findMany.mockResolvedValue([]);
  prismaMock.salesInvoice.findMany.mockReset();
  prismaMock.salesInvoice.findMany.mockResolvedValue([]);
  prismaMock.expense.findMany.mockReset();
  prismaMock.expense.findMany.mockResolvedValue([]);
  prismaMock.customer.findMany.mockReset();
  prismaMock.customer.findMany.mockResolvedValue([]);
});

describe('Wave A re-gate fixtures', () => {
  it('D1 canonical GP is 1015 and Today KPIs publish that figure', async () => {
    const canonical = evaluateMarginSet([{
      paymentStatus: 'PAID',
      discountPence: 0,
      lines: [{
        lineSubtotalPence: 2000,
        lineDiscountPence: 100,
        promoDiscountPence: 51,
        lineCostPence: 834,
        qtyBase: 1,
        defaultCostBasePence: 834,
      }],
    }]);
    expect(canonical.grossProfitPence).toBe(1015);

    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: unknown } }) => {
      if (args?.where?.paymentStatus) return [];
      return [{ totalPence: 1849, createdAt: SALE_AT, paymentStatus: 'PAID', discountOverrideReason: null }];
    });
    prismaMock.salesInvoiceLine.findMany.mockImplementation(async (args: { select?: Record<string, unknown> }) => [projectRow(gpLine, args?.select)]);

    const kpis = await getTodayKPIs('biz-1');
    expect(kpis.grossMarginPence).toBe(1015);
    expect(kpis.grossMarginPence).not.toBe(1166);
  });

  it('D2/D13 customer list keeps canonical AR 12833 when a payment status is missing', async () => {
    const invoice = {
      paymentStatus: 'UNPAID',
      totalPence: 12833,
      payments: [{ amountPence: 6000, status: undefined as unknown as string }],
    };
    expect(receivableDocumentBalance(invoice).balancePence).toBe(12833);

    prismaMock.customer.findMany.mockResolvedValue([{
      id: 'c1', name: 'Ama', phone: null, email: null, creditLimitPence: 0, storeId: null, tagsJson: null,
    }]);
    prismaMock.salesInvoice.findMany.mockResolvedValue([{
      customerId: 'c1',
      paymentStatus: 'UNPAID',
      totalPence: 12833,
      payments: [{ amountPence: 6000 }],
    }]);
    const listed = await getCustomers('biz-1');
    expect(listed.customers[0].outstandingBalancePence).toBe(12833);
  });

  it('D3 supplier list keeps a PAID shortfall inside canonical AP 10500', async () => {
    const unpaid = { paymentStatus: 'UNPAID', totalPence: 7000, payments: [] };
    const paidShort = { paymentStatus: 'PAID', totalPence: 3500, payments: [] };
    expect(payableDocumentBalance(unpaid).balancePence + payableDocumentBalance(paidShort).balancePence).toBe(10500);

    const rows = [
      { supplierId: 's1', ...unpaid },
      { supplierId: 's1', ...paidShort },
    ];
    prismaMock.purchaseInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: { in?: string[] } } }) => {
      const allowed = args?.where?.paymentStatus?.in;
      if (!allowed) return rows;
      return rows.filter((row) => allowed.includes(row.paymentStatus));
    });

    const kpis = await getSupplierListKpis('biz-1');
    expect(kpis.totalApOutstandingPence).toBe(10500);
  });

  it('D4 a from-and-to customer filter keeps both gte and lt', async () => {
    const from = new Date('2026-03-15T00:00:00.000Z');
    const endExclusive = new Date('2026-03-16T00:00:00.000Z');
    await getCustomer('c1', 'biz-1', { from, endExclusive });
    const arg = prismaMock.customer.findFirst.mock.calls[0][0] as {
      include: { salesInvoices: { where: { createdAt?: { gte?: Date; lt?: Date } } } };
    };
    expect(arg.include.salesInvoices.where.createdAt).toEqual({ gte: from, lt: endExclusive });
  });

  it('D5 Nairobi 21:30Z is outside the prior Nairobi business day', async () => {
    prismaMock.business.findUnique.mockResolvedValue({ timezone: 'Africa/Nairobi', openingCapitalPence: 0, minimumMarginThresholdBps: 1500 });
    vi.setSystemTime(new Date('2026-06-15T20:00:00.000Z'));
    const boundarySale = new Date('2026-06-15T21:30:00.000Z');
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: unknown } }) => {
      if (args?.where?.paymentStatus) return [];
      return [{ totalPence: 500, createdAt: boundarySale, paymentStatus: 'PAID', discountOverrideReason: null }];
    });
    const kpis = await getTodayKPIs('biz-nairobi');
    expect(kpis.totalSalesPence).toBe(0);
  });

  it('D6 analytics buckets use the business timezone', async () => {
    const clock = await import('@/lib/reports/reporting-clock');
    expect(typeof (clock as { zonedDateTimeParts?: unknown }).zonedDateTimeParts).toBe('function');
    const parts = (clock as { zonedDateTimeParts: (d: Date, tz: string) => { hour: number; day: number } })
      .zonedDateTimeParts(new Date('2026-06-15T21:30:00.000Z'), 'Africa/Nairobi');
    expect(parts.hour).toBe(0);
    expect(parts.day).toBe(16);
  });

  it('D7 margin analysis does not publish firm GP for incomplete cost', async () => {
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'p1',
      qtyBase: 1,
      lineSubtotalPence: 2000,
      lineDiscountPence: 100,
      promoDiscountPence: 51,
      lineCostPence: 0,
      createdAt: SALE_AT,
      salesInvoice: { createdAt: SALE_AT, paymentStatus: 'PAID', discountPence: 0, salesReturn: null },
      product: { name: 'Rice', defaultCostBasePence: 0, minimumMarginThresholdBps: null },
    }]);
    const snapshot = await getMarginAnalysisSnapshot({
      businessId: 'biz-1',
      start: new Date('2026-03-15T00:00:00.000Z'),
      end: new Date('2026-03-16T00:00:00.000Z'),
    });
    expect(snapshot.totalProducts).toBe(1);
    expect((snapshot as { state?: string }).state).toBe('INCOMPLETE_COSTS');
    expect((snapshot as { grossProfitPence?: number | null }).grossProfitPence).toBeNull();
  });

  it('D8 owner dashboard yesterday GP uses discounts', async () => {
    const today = await import('@/lib/reports/today-kpis');
    vi.spyOn(today, 'getTodayKPIs').mockResolvedValue({
      totalSalesPence: 1849,
      grossMarginPence: 1015,
      gpPercent: 54.9,
      marginState: 'READY',
      incompleteLineCount: 0,
      txCount: 1,
      outstandingARPence: 0,
      outstandingAPPence: 0,
      arOver60Pence: 0,
      arOver90Pence: 0,
      cashVarianceTotalPence: 0,
      openHighAlerts: 0,
      totalTrackedProducts: 0,
      productsAboveReorderPoint: 0,
      paymentSplit: {},
      avgDailyExpensesPence: 0,
      cashOnHandEstimatePence: 0,
      openExpectedCashPence: null,
      todayReceiptsPence: 0,
      negativeMarginProductCount: 0,
      momoPendingCount: 0,
      stockoutImminentCount: 0,
      urgentReorderCount: 0,
      thisWeekExpensesPence: 0,
      fourWeekAvgExpensesPence: 0,
      discountOverrideCount: 0,
    });
    const { getOwnerDashboardSnapshot } = await import('@/lib/reports/owner-dashboard');
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 0 }, _count: { id: 0 } });
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([{
      ...gpLine,
      salesInvoice: { createdAt: new Date('2026-03-14T10:00:00.000Z'), paymentStatus: 'PAID', discountPence: 0 },
    }]);
    const snapshot = await getOwnerDashboardSnapshot('biz-1', 'GHS');
    const card = snapshot.overviewCards.find((row) => row.id === 'gross-profit');
    expect(card?.trend.direction).toBe('flat');
  });

  it('D9 margin analysis uses net pre-tax revenue 1849 and GP 1015', async () => {
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'p1',
      qtyBase: 1,
      lineSubtotalPence: 2000,
      lineDiscountPence: 100,
      promoDiscountPence: 51,
      lineCostPence: 834,
      salesInvoice: { id: 'inv-gp', createdAt: SALE_AT, paymentStatus: 'PAID', discountPence: 0, salesReturn: null },
      product: { name: 'Rice', defaultCostBasePence: 834, minimumMarginThresholdBps: null },
    }]);
    const snapshot = await getMarginAnalysisSnapshot({
      businessId: 'biz-1',
      start: new Date('2026-03-15T00:00:00.000Z'),
      end: new Date('2026-03-16T00:00:00.000Z'),
    });
    expect(snapshot.rows[0]?.revenuePence).toBe(1849);
    expect(snapshot.rows[0]?.profitPence).toBe(1015);
  });

  it('D10 a zero-base invoice keeps the unallocated sales difference', async () => {
    const ranked = rankRecognisedProductSales({
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 0,
      totalPence: 500,
      lines: [{
        productId: 'p1',
        lineSubtotalPence: 0,
        lineDiscountPence: 0,
        promoDiscountPence: 0,
        lineVatPence: 0,
        lineTotalPence: 0,
      }],
    });
    expect(ranked.ok).toBe(false);
    expect(ranked.differencePence).toBe(500);

    prismaMock.product.findMany.mockResolvedValue([{
      id: 'p1', name: 'Rice', sku: null, preferredSupplierId: 's1', preferredSupplier: { id: 's1', name: 'Mill' },
    }]);
    prismaMock.salesInvoice.findMany.mockResolvedValue([{
      id: 'inv-z',
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 0,
      totalPence: 500,
      lines: [{
        productId: 'p1',
        qtyBase: 0,
        lineSubtotalPence: 0,
        lineDiscountPence: 0,
        promoDiscountPence: 0,
        lineVatPence: 0,
        lineTotalPence: 0,
        lineCostPence: 0,
        product: { id: 'p1', name: 'Rice', defaultCostBasePence: 0 },
      }],
    }]);
    const report = await getSupplierSalesReport('biz-1', {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-04-01T00:00:00.000Z'),
    });
    expect((report as { unallocatedSalesDifferencePence?: number }).unallocatedSalesDifferencePence).toBe(500);
  });

  it('D15 customer detail ledger matches the canonical headline and does not settle a shortfall', async () => {
    const specifier = ['@/lib/reports/', 'detail-ledger'].join('');
    const ledger = await import(specifier) as {
      buildCustomerDetailLedger: (invoices: Array<{
        id: string;
        createdAt: Date;
        paymentStatus: string;
        totalPence: number;
        payments: Array<{ id: string; amountPence: number; status?: string; receivedAt: Date; method: string; reference: string | null }>;
      }>) => Array<{ description: string; balancePence: number }>;
    };
    const rows = ledger.buildCustomerDetailLedger([{
      id: 'inv-1',
      createdAt: SALE_AT,
      paymentStatus: 'PAID',
      totalPence: 12833,
      payments: [{ id: 'pay-1', amountPence: 6000, status: 'PENDING', receivedAt: SALE_AT, method: 'CASH', reference: null }],
    }]);
    expect(rows.at(-1)?.balancePence).toBe(12833);
    expect(rows.some((row) => row.description === 'Balance settled')).toBe(false);
  });

  it('D16 forecast input uses canonical AR 12833 and AP 10500', async () => {
    prismaMock.journalLine.findMany.mockResolvedValue([]);
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: { in?: string[] } } }) => {
      const allowed = args?.where?.paymentStatus?.in;
      const rows = [{ totalPence: 12833, dueDate: new Date('2026-03-20T00:00:00.000Z'), paymentStatus: 'UNPAID', payments: [{ amountPence: 6000 }], customer: null, createdAt: SALE_AT }];
      if (!allowed) return rows;
      return rows.filter((row) => allowed.includes(row.paymentStatus));
    });
    prismaMock.purchaseInvoice.findMany.mockImplementation(async (args: { where?: { paymentStatus?: { in?: string[] } } }) => {
      const allowed = args?.where?.paymentStatus?.in;
      const rows = [
        { totalPence: 7000, dueDate: new Date('2026-03-20T00:00:00.000Z'), paymentStatus: 'UNPAID', payments: [], createdAt: SALE_AT },
        { totalPence: 3500, dueDate: new Date('2026-03-20T00:00:00.000Z'), paymentStatus: 'PAID', payments: [], createdAt: SALE_AT },
      ];
      if (!allowed) return rows;
      return rows.filter((row) => allowed.includes(row.paymentStatus));
    });
    const forecast = await getCashflowForecast('biz-1', 14);
    const inflow = forecast.days.find((day) => day.date === '2026-03-20')?.expectedInflowPence ?? 0;
    const outflow = forecast.days.find((day) => day.date === '2026-03-20')?.expectedOutflowPence ?? 0;
    expect(inflow).toBe(Math.round(12833 * 0.85));
    expect(outflow).toBe(10500);
  });

  it('A11 SMS sales use the VAT-inclusive invoice total, not pre-tax margin revenue', async () => {
    const captured: { body?: string } = {};
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      name: 'Shop',
      currency: 'GHS',
      phone: '+233200000000',
      whatsappPhone: null,
      whatsappEnabled: true,
      timezone: 'Africa/Accra',
      whatsappBranchScope: 'ALL',
      isDemo: false,
      subscriptionStatus: 'ACTIVE',
    });
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { select?: { lines?: unknown; payments?: unknown } }) => {
      if (args?.select?.payments) return [];
      return [{
        paymentStatus: 'PAID',
        discountPence: 0,
        totalPence: 1180,
        salesReturn: null,
        lines: [{
          lineSubtotalPence: 1000,
          lineDiscountPence: 0,
          promoDiscountPence: 0,
          lineCostPence: 200,
          qtyBase: 1,
          product: { defaultCostBasePence: 200 },
        }],
      }];
    });
    prismaMock.messageOutbox.create.mockImplementation(async (args: { data: { body: string } }) => {
      captured.body = args.data.body;
      return { id: 'out-1' };
    });
    await enqueueOwnerDailySummarySms('biz-1', { now: NOW, tx: prismaMock as never });
    expect(captured.body).toContain('Sales GHS 11.80');
    expect(captured.body).not.toContain('Sales 10.00');
  });
});
