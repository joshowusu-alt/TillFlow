import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const createdPayloads: string[] = [];

const prismaMock = vi.hoisted(() => {
  const salesFindMany = vi.fn(async () => []);
  const salesAggregate = vi.fn(async () => ({ _sum: { totalPence: 0 }, _count: { id: 0 } }));
  return {
    salesInvoice: {
      findMany: salesFindMany,
      aggregate: salesAggregate,
      count: vi.fn(async () => 0),
    },
    purchaseInvoice: {
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { totalPence: 0 } })),
      count: vi.fn(async () => 0),
    },
    expense: { findMany: vi.fn(async () => []) },
    business: {
      findUnique: vi.fn(async () => ({
        id: 'biz-1',
        name: 'Till',
        currency: 'GHS',
        phone: '+233200000000',
        whatsappPhone: '+233200000000',
        whatsappEnabled: true,
        timezone: 'Africa/Nairobi',
        whatsappBranchScope: 'ALL',
        isDemo: false,
        subscriptionStatus: 'ACTIVE',
        plan: 'GROWTH',
        mode: 'GROWTH',
        storeMode: 'SINGLE',
      })),
    },
    store: { findFirst: vi.fn(async () => null) },
    salesPayment: { findMany: vi.fn(async () => []) },
    salesInvoiceLine: { findMany: vi.fn(async () => []) },
    inventoryBalance: { count: vi.fn(async () => 0) },
    salesReturn: { count: vi.fn(async () => 0) },
    shift: { findMany: vi.fn(async () => []) },
    expensePayment: { aggregate: vi.fn(async () => ({ _sum: { amountPence: 0 } })) },
    messageOutbox: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: { data: { payloadJson: string } }) => {
        createdPayloads.push(args.data.payloadJson);
        return { id: 'out-1' };
      }),
    },
    product: { findMany: vi.fn(async () => []) },
  } as any;
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/exports/branded-export', () => ({
  detectExportFormat: () => 'csv',
  respondWithExport: (input: { exportOptions: { rows: unknown[] } }) =>
    new Response(JSON.stringify(input.exportOptions.rows)),
}));
vi.mock('@/lib/auth', () => ({
  getUser: vi.fn(async () => ({ role: 'OWNER', businessId: 'biz-1' })),
  requireBusiness: vi.fn(async () => ({
    business: { id: 'biz-1', currency: 'GHS', timezone: 'Africa/Nairobi', name: 'Till', plan: 'GROWTH', mode: 'GROWTH' },
    store: null,
    stores: [],
    user: { role: 'OWNER' },
  })),
  requireBusinessAndOptionalStore: vi.fn(async () => ({
    business: { id: 'biz-1', currency: 'GHS', timezone: 'Africa/Nairobi' },
    store: { id: 'store-1', name: 'Main' },
    stores: [{ id: 'store-1', name: 'Main' }],
    user: { role: 'OWNER' },
  })),
}));

describe('final Wave A gaps', () => {
  beforeEach(() => {
    createdPayloads.length = 0;
    vi.clearAllMocks();
  });

  it('SMS outstanding AR matches the canonical receivables helper, including a stored excess', async () => {
    const invoice = {
      paymentStatus: 'PAID',
      totalPence: 10000,
      payments: [{ amountPence: 12000, status: 'CONFIRMED' }],
    };
    const canonical = receivableDocumentBalance(invoice).balancePence;
    expect(canonical).toBe(-2000);

    prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 10000 }, _count: { id: 1 } });
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { dueDate?: unknown; createdAt?: unknown } }) => {
      if (args?.where?.dueDate || args?.where?.createdAt) return [];
      return [invoice];
    });

    const { enqueueOwnerDailySummarySms } = await import('@/lib/notifications/owner-daily-summary-sms');
    await enqueueOwnerDailySummarySms('biz-1', { now: new Date('2026-06-15T12:00:00.000Z') });
    const metrics = JSON.parse(createdPayloads[0] ?? '{}').metrics;
    expect(metrics.outstandingArPence).toBe(canonical);
  });

  it('resolveExportDateRange uses the tenant timezone instead of constructing a window without one', () => {
    const request = new Request('http://localhost/exports/sales?from=2026-06-16&to=2026-06-16');
    const range = resolveExportDateRange(request, '30d', 'Africa/Nairobi');
    expect(range.start.toISOString()).toBe('2026-06-15T21:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-06-16T21:00:00.000Z');
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
  });

  it('notification debtors keep a PAID-labelled shortfall in the published AR total', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      name: 'Till',
      currency: 'GHS',
      phone: '+233200000000',
      whatsappPhone: '+233200000000',
      whatsappEnabled: true,
      timezone: 'Africa/Accra',
      whatsappBranchScope: 'ALL',
      plan: 'GROWTH',
      mode: 'GROWTH',
      storeMode: 'SINGLE',
    });
    const openInvoices = [
      { paymentStatus: 'UNPAID', totalPence: 7000, payments: [] as Array<{ amountPence: number; status: string }> },
      { paymentStatus: 'PAID', totalPence: 5833, payments: [] as Array<{ amountPence: number; status: string }> },
    ];
    prismaMock.salesInvoice.findMany.mockResolvedValue(openInvoices);
    prismaMock.salesInvoice.aggregate.mockImplementation(async (args: { where?: { paymentStatus?: { in?: string[] } } }) => {
      const statuses = args?.where?.paymentStatus?.in;
      if (statuses) return { _sum: { totalPence: 7000 }, _count: { id: 1 } };
      return { _sum: { totalPence: 12833 }, _count: { id: 2 } };
    });

    const { buildEodSummaryPreviewForBusiness } = await import('@/app/actions/notifications');
    const payload = await buildEodSummaryPreviewForBusiness('biz-1', { timezoneOverride: 'Africa/Accra' });
    expect(payload.text).toContain('Debtors (AR): GH₵128.33');
  });

  it('sales export does not treat an ambiguous zero cost as a default-cost margin', async () => {
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([
      {
        qtyInUnit: 1,
        qtyBase: 1,
        unitPricePence: 2000,
        lineDiscountPence: 100,
        promoDiscountPence: 51,
        lineSubtotalPence: 2000,
        lineVatPence: 0,
        lineTotalPence: 1849,
        lineCostPence: 0,
        salesInvoice: {
          id: 'inv-1',
          transactionNumber: 'S-1',
          createdAt: new Date('2026-06-16T10:00:00.000Z'),
          paymentStatus: 'PAID',
          discountPence: 0,
          store: { name: 'Main' },
          customer: { name: 'Ada' },
          salesReturn: null,
        },
        product: { name: 'Oil', sku: 'OIL', defaultCostBasePence: 400 },
        unit: { name: 'pcs' },
      },
    ]);
    prismaMock.business.findUnique.mockResolvedValue({ name: 'Till', currency: 'GHS', timezone: 'Africa/Accra' });

    const { GET } = await import('@/app/(protected)/exports/sales/route');
    const response = await GET(new Request('http://localhost/exports/sales?from=2026-06-16&to=2026-06-16'));
    const rows = await response.json() as Array<{ margin: string; cost: string }>;
    expect(rows[0].margin).toBe('');
    expect(rows[0].cost).not.toBe('4.00');
  });

  it('analytics and supplier-sales payloads expose an unallocated sales difference of 500', async () => {
    const supplierSource = readFileSync(join(process.cwd(), 'lib/reports/supplier-sales.ts'), 'utf8');
    const pageSource = readFileSync(join(process.cwd(), 'app/(protected)/reports/sales-by-supplier/page.tsx'), 'utf8');
    const exportSource = readFileSync(join(process.cwd(), 'app/(protected)/reports/sales-by-supplier/export/route.ts'), 'utf8');
    expect(supplierSource).toContain("unallocatedSalesDifferenceLabel: 'Unallocated sales difference'");
    expect(pageSource).toContain('report.unallocatedSalesDifferenceLabel');
    expect(exportSource).toContain('report.unallocatedSalesDifferenceLabel');

    const { default: AnalyticsContent } = await import('@/app/(protected)/reports/analytics/AnalyticsContent');
    const gapSale = {
      id: 'sale-gap',
      paymentStatus: 'PAID',
      discountPence: 0,
      vatPence: 0,
      totalPence: 500,
      createdAt: new Date(),
      lines: [{
        productId: 'prod-1',
        lineSubtotalPence: 0,
        lineDiscountPence: 0,
        promoDiscountPence: 0,
        lineVatPence: 0,
        lineTotalPence: 0,
        lineCostPence: 0,
        qtyBase: 1,
        product: { name: 'Rice', defaultCostBasePence: 0, category: { name: 'Food' } },
      }],
    };
    prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where?: { createdAt?: { lt?: Date } } }) => {
      const end = args?.where?.createdAt?.lt?.getTime() ?? 0;
      return end > Date.now() - 60_000 ? [gapSale] : [];
    });
    const view = await AnalyticsContent({ businessId: 'biz-1', currency: 'GHS', timeZone: 'Africa/Accra', periodDays: 7 });
    const data = view.props.data as {
      productData: Array<{ name: string; revenue: number }>;
      kpis: { totalSales: number; unallocatedSalesDifferencePence?: number };
    };
    expect(data.kpis.unallocatedSalesDifferencePence).toBe(500);
    expect(data.productData.some((row) => row.name === 'Unallocated sales difference')).toBe(true);
    const productSum = data.productData
      .filter((row) => row.name !== 'Unallocated sales difference')
      .reduce((sum, row) => sum + row.revenue, 0);
    expect(productSum + (data.kpis.unallocatedSalesDifferencePence ?? 0)).toBe(data.kpis.totalSales);
  });

  it('return-service Math.max is a journal reversal, not a published receivable balance', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/returns.ts'), 'utf8');
    const onboarding = readFileSync(join(process.cwd(), 'app/actions/onboarding.ts'), 'utf8');
    expect(source).toContain('const arReversal = Math.max(invoice.totalPence - totalPaid, 0)');
    expect(source).toContain('accountCode: ACCOUNT_CODES.ar, creditPence: arReversal');
    expect(source).not.toContain('receivableDocumentBalance');
    expect(onboarding).toContain('prisma.purchaseInvoice.count');
    expect(onboarding).not.toContain('payableDocumentBalance');
  });
});
