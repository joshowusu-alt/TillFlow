import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const unused = vi.fn(() => { throw new Error('Home must not calculate unused financial totals'); });
  return { unused, sales: vi.fn(), purchases: vi.fn(), lines: vi.fn(), balances: vi.fn(), alerts: vi.fn(), shifts: vi.fn(), discounts: vi.fn(), momo: vi.fn() };
});
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/observability', () => ({ measureServerOperation: (_: string, fn: () => unknown) => fn(), PERFORMANCE_THRESHOLDS_MS: { route: 1500 } }));
vi.mock('./sqlite-report-date-normalization', async importOriginal => ({
  ...await importOriginal<typeof import('./sqlite-report-date-normalization')>(),
  ensureSqliteReportDateColumnsNormalized: async () => {}, isSqliteRuntime: () => false,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  business: { findUnique: async () => ({ timezone: 'Africa/Accra' }) },
  salesInvoice: { findMany: mocks.sales, aggregate: mocks.unused, count: mocks.discounts },
  purchaseInvoice: { findMany: mocks.purchases },
  salesInvoiceLine: { findMany: mocks.lines },
  inventoryBalance: { findMany: mocks.balances },
  riskAlert: { count: mocks.alerts }, shift: { findMany: mocks.shifts },
  mobileMoneyCollection: { count: mocks.momo }, expense: { aggregate: mocks.unused },
} }));
vi.mock('./money-received', () => ({ aggregateMoneyReceivedByMethod: mocks.unused, aggregateConfirmedReceiptsThroughAsOf: mocks.unused, resolveMoneyReceivedScope: mocks.unused, requireMoneyReceivedMethodRows: (rows: unknown) => rows }));
vi.mock('./financials', () => ({ getAccountBalance: mocks.unused }));
import { getHomeIssueFlags } from './today-kpis';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sales.mockResolvedValue([{ paymentStatus: 'UNPAID', totalPence: 100, dueDate: new Date('2020-01-01'), createdAt: new Date('2020-01-01'), payments: [] }]);
  mocks.purchases.mockResolvedValue([{ paymentStatus: 'UNPAID', totalPence: 200, payments: [] }]);
  mocks.lines.mockResolvedValue([]);
  mocks.balances.mockResolvedValue([{ qtyOnHandBase: 2, product: { reorderPointBase: 5, active: true } }]);
  mocks.alerts.mockResolvedValue(2); mocks.shifts.mockResolvedValue([{ variance: -10 }]);
  mocks.discounts.mockResolvedValue(4); mocks.momo.mockResolvedValue(3);
});

describe('Home issue-only report read', () => {
  it('retains issue rules without querying receipt/profit/expense/cash totals', async () => {
    const flags = await getHomeIssueFlags('tenant-a');
    expect(flags).toMatchObject({ arOver60Pence: 100, outstandingAPPence: 200, cashVarianceTotalPence: 10, momoPendingCount: 3, negativeMarginProductCount: 0, discountOverrideCount: 4, openHighAlerts: 2 });
    expect(Object.keys(flags)).toHaveLength(9);
    expect(mocks.unused).not.toHaveBeenCalled();
    expect(mocks.sales.mock.calls[0][0].where.businessId).toBe('tenant-a');
    expect(mocks.balances.mock.calls[0][0].where).toEqual({ store: { businessId: 'tenant-a' } });
  });
  it('never shares concurrent flags between different businesses', async () => {
    await Promise.all([getHomeIssueFlags('tenant-a'), getHomeIssueFlags('tenant-b')]);
    expect(mocks.sales.mock.calls.map(([query]) => query.where.businessId).sort()).toEqual(['tenant-a', 'tenant-b']);
  });
});
