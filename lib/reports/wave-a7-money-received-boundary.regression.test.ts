import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { businessDayWindow } from '@/lib/reports/reporting-clock';

/**
 * Wave A7 — confirmed receipts used by the Today KPI operational fallback must
 * honour an exclusive reporting-clock end.
 *
 * The only production caller of `aggregateConfirmedReceiptsThroughAsOf` is
 * `getOperationalLiquidAssetsEstimatePence`, which passes
 * `todayEnd = businessDayWindow(now, tz).endExclusive`. The query currently
 * filters `receivedAt: { lte: args.asOf }`, so a CONFIRMED receipt stamped
 * exactly at the next local midnight leaks into today's liquid-asset estimate
 * whenever the accounting cash/bank balance is zero and the fallback runs.
 *
 * Expected: `receivedAt: { lt: endExclusive }` — include immediately before,
 * exclude exactly at and after. Status rules stay CONFIRMED-only and must not
 * drop a confirmed receipt solely because its parent later became RETURNED/VOID.
 *
 * Instants are ISO UTC. Business timezone is Africa/Nairobi unless noted.
 */

const BIZ = 'biz-a7-mr';
const NAIROBI = 'Africa/Nairobi';
const ACCRA = 'Africa/Accra';
const KPI_NOW = new Date('2026-03-10T20:30:00.000Z');
const NAIROBI_TODAY_END = '2026-03-10T21:00:00.000Z';
const ACCRA_TODAY_END = '2026-03-11T00:00:00.000Z';

type DateFilter = { lt?: Date; lte?: Date; gt?: Date; gte?: Date };
type ReceiptRow = {
  status: string;
  receivedAt: Date;
  amountPence: number;
  businessId: string;
  storeId?: string;
  parentPaymentStatus?: string;
};

const { prismaMock, ledger, recorded, kpiRuntime } = vi.hoisted(() => {
  const ledger: { receipts: ReceiptRow[]; accountingLiquidPence: number } = {
    receipts: [],
    accountingLiquidPence: 0,
  };

  const recorded: { salesPaymentWhere: Array<{ receivedAt?: DateFilter; status?: unknown; salesInvoice?: unknown }> } = {
    salesPaymentWhere: [],
  };

  const kpiRuntime = { sqlite: false };

  function matchesDateFilter(filter: DateFilter | undefined, value: Date) {
    if (!filter) return true;
    const t = value.getTime();
    if (filter.lt !== undefined && !(t < filter.lt.getTime())) return false;
    if (filter.lte !== undefined && !(t <= filter.lte.getTime())) return false;
    if (filter.gt !== undefined && !(t > filter.gt.getTime())) return false;
    if (filter.gte !== undefined && !(t >= filter.gte.getTime())) return false;
    return true;
  }

  function matchesStatus(expected: unknown, actual: string) {
    if (expected === undefined) return true;
    if (typeof expected === 'string') return actual === expected;
    if (expected && typeof expected === 'object' && 'notIn' in (expected as { notIn?: string[] })) {
      return !(expected as { notIn: string[] }).notIn.includes(actual);
    }
    return true;
  }

  const salesPaymentAggregate = vi.fn(async (args: {
    where?: { receivedAt?: DateFilter; status?: unknown; salesInvoice?: { businessId?: string; storeId?: string } };
  }) => {
    const where = args.where ?? {};
    recorded.salesPaymentWhere.push(where);
    const rows = ledger.receipts.filter(
      (row) =>
        matchesStatus(where.status, row.status) &&
        matchesDateFilter(where.receivedAt, row.receivedAt) &&
        (where.salesInvoice?.businessId === undefined || row.businessId === where.salesInvoice.businessId) &&
        (where.salesInvoice?.storeId === undefined || row.storeId === where.salesInvoice.storeId),
    );
    return {
      _sum: { amountPence: rows.length === 0 ? null : rows.reduce((sum, row) => sum + row.amountPence, 0) },
      _count: { id: rows.length },
    };
  });

  function emptyDelegate(model: string) {
    const seed: Record<string, ReturnType<typeof vi.fn>> =
      model === 'salesPayment'
        ? { aggregate: salesPaymentAggregate, groupBy: vi.fn(async () => []) }
        : {};
    return new Proxy(seed, {
      get(target, prop: string) {
        if (!(prop in target)) {
          target[prop] = prop === 'count'
            ? vi.fn(async () => 0)
            : prop === 'aggregate'
              ? vi.fn(async () => ({ _sum: { totalPence: 0, amountPence: 0 }, _count: { id: 0 } }))
              : vi.fn(async () => (prop === 'findUnique' || prop === 'findUniqueOrThrow' ? null : []));
        }
        return target[prop];
      },
    });
  }

  const prismaMock = new Proxy({} as Record<string, ReturnType<typeof emptyDelegate>>, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = emptyDelegate(prop);
      return target[prop];
    },
  });

  return { prismaMock, ledger, recorded, kpiRuntime };
});

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000', bank: '1010', inventory: '1200', ap: '2000',
    sales: '4000', inventoryGain: '4100',
    cogs: '5000', inventoryLoss: '5100', vatReceivable: '1300', ar: '1100',
  },
}));

vi.mock('@/lib/reports/financials', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/financials')>('@/lib/reports/financials');
  return {
    ...actual,
    getAccountBalance: vi.fn(async () => ledger.accountingLiquidPence / 2),
  };
});

vi.mock('@/lib/reports/sqlite-report-date-normalization', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/sqlite-report-date-normalization')>(
    '@/lib/reports/sqlite-report-date-normalization',
  );
  return {
    ...actual,
    isSqliteRuntime: () => kpiRuntime.sqlite,
  };
});

import { aggregateConfirmedReceiptsThroughAsOf } from '@/lib/reports/money-received';
import { getTodayKPIs } from '@/lib/reports/today-kpis';

function iso(value: Date | undefined) {
  return value?.toISOString() ?? null;
}

function receipt(
  amountPence: number,
  receivedAt: Date,
  extras: Partial<ReceiptRow> = {},
): ReceiptRow {
  return {
    status: 'CONFIRMED',
    receivedAt,
    amountPence,
    businessId: BIZ,
    parentPaymentStatus: 'PAID',
    ...extras,
  };
}

function nairobiBoundaryReceipts(): ReceiptRow[] {
  const end = new Date(NAIROBI_TODAY_END);
  return [
    receipt(100, new Date(end.getTime() - 1)),
    receipt(200, end),
    receipt(400, new Date(end.getTime() + 1)),
  ];
}

function throughAsOfWheres() {
  return recorded.salesPaymentWhere.filter((where) => where.receivedAt && !where.receivedAt.gte);
}

function resetRecorders() {
  recorded.salesPaymentWhere.length = 0;
}

describe('A7 aggregateConfirmedReceiptsThroughAsOf — exclusive endExclusive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecorders();
    ledger.receipts = nairobiBoundaryReceipts();
    ledger.accountingLiquidPence = 0;
  });

  it('includes the receipt immediately before Nairobi next local midnight and excludes the exact boundary', async () => {
    const endExclusive = new Date(NAIROBI_TODAY_END);
    const result = await aggregateConfirmedReceiptsThroughAsOf(prismaMock as never, {
      businessId: BIZ,
      endExclusive,
    });

    expect(iso(businessDayWindow(KPI_NOW, NAIROBI).endExclusive)).toBe(NAIROBI_TODAY_END);
    // 100 immediately before; 200 at the boundary and 400 after belong to the next local day.
    expect(result.amountPence).toBe(100);
  });

  it('queries receivedAt with `lt` endExclusive, never `lte`', async () => {
    const endExclusive = new Date(NAIROBI_TODAY_END);
    await aggregateConfirmedReceiptsThroughAsOf(prismaMock as never, {
      businessId: BIZ,
      endExclusive,
    });

    const filters = throughAsOfWheres();
    expect(filters.length).toBeGreaterThan(0);
    for (const where of filters) {
      expect(where.receivedAt).not.toHaveProperty('lte');
      expect(Object.keys(where.receivedAt ?? {})).toEqual(['lt']);
      expect(iso(where.receivedAt?.lt)).toBe(NAIROBI_TODAY_END);
    }
  });

  it('keeps CONFIRMED-only status rules and does not discard a parent RETURNED/VOID receipt', async () => {
    const before = new Date(new Date(NAIROBI_TODAY_END).getTime() - 1);
    ledger.receipts = [
      receipt(100, before, { parentPaymentStatus: 'RETURNED' }),
      receipt(50, before, { status: 'PENDING' }),
      receipt(60, before, { status: 'MANUAL_PENDING' }),
      receipt(70, before, { status: 'FAILED' }),
      receipt(80, before, { status: 'CANCELLED' }),
      receipt(90, before, { status: 'VOID' }),
      receipt(110, before, { status: 'UNKNOWN' }),
      receipt(200, new Date(NAIROBI_TODAY_END), { parentPaymentStatus: 'VOID' }),
    ];

    const result = await aggregateConfirmedReceiptsThroughAsOf(prismaMock as never, {
      businessId: BIZ,
      endExclusive: new Date(NAIROBI_TODAY_END),
    });

    expect(result.amountPence).toBe(100);
    const where = throughAsOfWheres()[0];
    expect(where.status).toBe('CONFIRMED');
    expect(JSON.stringify(where)).not.toContain('RETURNED');
    expect(JSON.stringify(where.salesInvoice)).not.toContain('VOID');
    expect(JSON.stringify(where.salesInvoice)).not.toMatch(/paymentStatus/);
  });
});

describe('A7 Today KPI operational fallback — exclusive next local midnight', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(KPI_NOW);
    vi.clearAllMocks();
    resetRecorders();
    ledger.receipts = nairobiBoundaryReceipts();
    ledger.accountingLiquidPence = 0;

    (prismaMock as unknown as { $executeRawUnsafe: ReturnType<typeof vi.fn> }).$executeRawUnsafe =
      vi.fn(async () => 0);
    prismaMock.business.findUnique.mockResolvedValue({ timezone: NAIROBI, openingCapitalPence: 0 });
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ timezone: NAIROBI, openingCapitalPence: 0 });
    prismaMock.openingBalance.findMany.mockResolvedValue([]);
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([]);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([]);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([]);
    prismaMock.riskAlert.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['PostgreSQL', false],
    ['SQLite', true],
  ])('%s path: fallback includes only the receipt immediately before Nairobi todayEnd', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    const kpis = await getTodayKPIs(BIZ);
    expect(kpis.cashOnHandEstimatePence).toBe(100);
  });

  it.each([
    ['PostgreSQL', false],
    ['SQLite', true],
  ])('%s path: through-as-of query uses receivedAt `lt` Nairobi todayEnd', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    await getTodayKPIs(BIZ);

    const filters = throughAsOfWheres();
    expect(filters.length).toBeGreaterThan(0);
    for (const where of filters) {
      expect(where.receivedAt).not.toHaveProperty('lte');
      expect(Object.keys(where.receivedAt ?? {})).toEqual(['lt']);
      expect(iso(where.receivedAt?.lt)).toBe(NAIROBI_TODAY_END);
    }
  });

  it.each([
    ['PostgreSQL', false],
    ['SQLite', true],
  ])('%s path: Accra fallback uses Accra next local midnight, not the Nairobi instant', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    prismaMock.business.findUnique.mockResolvedValue({ timezone: ACCRA, openingCapitalPence: 0 });
    const end = new Date(ACCRA_TODAY_END);
    ledger.receipts = [
      receipt(100, new Date(end.getTime() - 1)),
      receipt(200, end),
      receipt(400, new Date(end.getTime() + 1)),
    ];

    const kpis = await getTodayKPIs(BIZ);
    expect(iso(businessDayWindow(KPI_NOW, ACCRA).endExclusive)).toBe(ACCRA_TODAY_END);
    expect(kpis.cashOnHandEstimatePence).toBe(100);

    const filters = throughAsOfWheres();
    expect(filters.length).toBeGreaterThan(0);
    for (const where of filters) {
      expect(iso(where.receivedAt?.lt)).toBe(ACCRA_TODAY_END);
    }
  });

  it('nonzero accounting cash/bank still takes precedence over the operational fallback', async () => {
    kpiRuntime.sqlite = false;
    ledger.accountingLiquidPence = 9000;
    const kpis = await getTodayKPIs(BIZ);
    expect(kpis.cashOnHandEstimatePence).toBe(9000);
  });
});
