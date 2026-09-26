import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner Home, forecast day keys, and Today KPI lookbacks still use the server clock.
 * 2026-06-30T22:00:00.000Z is 1 Jul 01:00 in Nairobi and 30 Jun 22:00 in Accra.
 */
const BOUNDARY = new Date('2026-06-30T22:00:00.000Z');
const NAIROBI = 'Africa/Nairobi';
const ACCRA = 'Africa/Accra';
const REQUIRED = 'Business timezone is required for report windows';
const NAIROBI_TODAY_START = '2026-06-30T21:00:00.000Z';
const NAIROBI_TODAY_END = '2026-07-01T21:00:00.000Z';
const ACCRA_TODAY_START = '2026-06-30T00:00:00.000Z';

const prismaMock = vi.hoisted(() => {
  function emptyDelegate() {
    return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
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
  return new Proxy({} as Record<string, ReturnType<typeof emptyDelegate>>, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = emptyDelegate();
      return target[prop];
    },
  });
});

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/reports/financials', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/financials')>('@/lib/reports/financials');
  return { ...actual, getAccountBalance: vi.fn(async () => 0) };
});

vi.mock('@/lib/reports/money-received', () => ({
  aggregateMoneyReceivedByMethod: vi.fn(async () => []),
  aggregateConfirmedReceiptsThroughAsOf: vi.fn(async () => ({ amountPence: 0 })),
  requireMoneyReceivedMethodRows: (rows: unknown) => rows ?? [],
  resolveMoneyReceivedScope: (scope: unknown) => scope,
}));

import { getOwnerHomeAttentionData } from '@/lib/owner-home/attention';
import { getCashflowForecast } from '@/lib/reports/forecast';
import { getTodayKPIs } from '@/lib/reports/today-kpis';

function iso(value: Date | undefined) {
  return value?.toISOString() ?? null;
}

function whereOf(mock: { mock: { calls: unknown[][] } }, index = 0) {
  return (mock.mock.calls[index]?.[0] as { where?: Record<string, unknown> } | undefined)?.where;
}

describe('A7 remaining tenant windows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BOUNDARY);
    vi.clearAllMocks();
    prismaMock.$executeRawUnsafe = vi.fn(async () => 0);
    prismaMock.business.findUnique.mockResolvedValue({ timezone: NAIROBI, openingCapitalPence: 0 });
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ timezone: NAIROBI, openingCapitalPence: 0 });
    prismaMock.journalLine.findMany.mockResolvedValue([]);
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([]);
    prismaMock.purchaseInvoice.count.mockResolvedValue(0);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.salesPayment.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
  });

  it('treats a Nairobi supplier due before local midnight as overdue', async () => {
    const dueAt = new Date('2026-06-30T12:00:00.000Z');
    prismaMock.purchaseInvoice.count.mockImplementation(async (args: { where?: { dueDate?: { lt?: Date } } }) => {
      const cutoff = args?.where?.dueDate?.lt;
      return cutoff && dueAt.getTime() < cutoff.getTime() ? 1 : 0;
    });

    const attention = await getOwnerHomeAttentionData('biz-1');
    const cutoff = (whereOf(prismaMock.purchaseInvoice.count)?.dueDate as { lt?: Date } | undefined)?.lt;

    expect(iso(cutoff)).toBe(NAIROBI_TODAY_START);
    expect(dueAt.getTime() < cutoff!.getTime()).toBe(true);
    expect(attention.overdueSupplierInvoiceCount).toBe(1);
  });

  it('keeps the same supplier current in Ghana', async () => {
    prismaMock.business.findUnique.mockResolvedValue({ timezone: ACCRA, openingCapitalPence: 0 });
    const dueAt = new Date('2026-06-30T12:00:00.000Z');
    prismaMock.purchaseInvoice.count.mockImplementation(async (args: { where?: { dueDate?: { lt?: Date } } }) => {
      const cutoff = args?.where?.dueDate?.lt;
      return cutoff && dueAt.getTime() < cutoff.getTime() ? 1 : 0;
    });

    const attention = await getOwnerHomeAttentionData('biz-1');
    expect(iso((whereOf(prismaMock.purchaseInvoice.count)?.dueDate as { lt?: Date }).lt)).toBe(ACCRA_TODAY_START);
    expect(attention.overdueSupplierInvoiceCount).toBe(0);
  });

  it.each([null, '', '   ', 'Mars/Olympus'])(
    'fails closed for Owner Home timezone %j before the overdue query',
    async (timezone) => {
      prismaMock.business.findUnique.mockResolvedValue({ timezone, openingCapitalPence: 0 });
      await expect(getOwnerHomeAttentionData('biz-1')).rejects.toThrow(REQUIRED);
      expect(prismaMock.purchaseInvoice.count).not.toHaveBeenCalled();
    },
  );

  it('projects Nairobi-local forecast days and a half-open 30-day expense window', async () => {
    prismaMock.salesInvoice.findMany.mockResolvedValue([{
      paymentStatus: 'UNPAID',
      totalPence: 10_000,
      dueDate: new Date('2026-07-01T21:00:00.000Z'),
      createdAt: BOUNDARY,
      payments: [],
      customer: { paymentTermsDays: 7 },
    }]);

    const forecast = await getCashflowForecast('biz-1', 7);
    const expenseWhere = prismaMock.expense.findMany.mock.calls
      .map((call) => (call[0] as { where?: { createdAt?: { gte?: Date; lt?: Date } } })?.where?.createdAt)
      .find((window) => window?.gte) as { gte?: Date; lt?: Date };

    expect(forecast.days[0]?.date).toBe('2026-07-02');
    expect(forecast.days[1]?.date).toBe('2026-07-03');
    expect(forecast.days[0]?.expectedInflowPence).toBe(Math.round(10_000 * 0.85));
    expect(iso(expenseWhere.gte)).toBe('2026-05-31T21:00:00.000Z');
    expect(iso(expenseWhere.lt)).toBe(NAIROBI_TODAY_END);
    expect(new Date('2026-05-31T21:00:00.000Z').getTime() >= expenseWhere.gte!.getTime()).toBe(true);
    expect(new Date(NAIROBI_TODAY_END).getTime() < expenseWhere.lt!.getTime()).toBe(false);
  });

  it('keeps Ghana forecast days on the Accra calendar', async () => {
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ timezone: ACCRA, openingCapitalPence: 0 });
    const forecast = await getCashflowForecast('biz-1', 7);
    const expenseWhere = prismaMock.expense.findMany.mock.calls
      .map((call) => (call[0] as { where?: { createdAt?: { gte?: Date; lt?: Date } } })?.where?.createdAt)
      .find((window) => window?.gte) as { gte?: Date; lt?: Date };
    expect(forecast.days[0]?.date).toBe('2026-07-01');
    expect(iso(expenseWhere.gte)).toBe('2026-05-31T00:00:00.000Z');
    expect(iso(expenseWhere.lt)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('fails closed for an invalid forecast timezone before the expense query', async () => {
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ timezone: 'Mars/Olympus', openingCapitalPence: 0 });
    await expect(getCashflowForecast('biz-1', 7)).rejects.toThrow(REQUIRED);
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
  });

  it('uses Nairobi half-open lookbacks on the SQLite Today KPI path', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./ci-unit.db';
    process.env.POSTGRES_PRISMA_URL = 'file:./ci-unit.db';
    try {
      await getTodayKPIs('biz-1');
    } finally {
      process.env.DATABASE_URL = previous;
    }

    const sales = whereOf(prismaMock.salesInvoice.findMany)?.createdAt as { gte?: Date; lt?: Date };
    const alerts = whereOf(prismaMock.riskAlert.findMany)?.occurredAt as { gte?: Date; lt?: Date };
    const expenses = whereOf(prismaMock.expense.findMany)?.createdAt as { gte?: Date; lt?: Date };
    const shifts = whereOf(prismaMock.shift.findMany)?.closedAt as { gte?: Date; lt?: Date };

    expect(iso(sales.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(sales.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(alerts.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(alerts.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(shifts.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(shifts.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(expenses.gte)).toBe('2026-05-26T21:00:00.000Z');
    expect(iso(expenses.lt)).toBe(NAIROBI_TODAY_END);
    expect(sales.gte && sales.lt && alerts.gte && alerts.lt).toBeTruthy();
  });

  it('uses the same Nairobi lookbacks on the PostgreSQL Today KPI path', async () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
    };
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/tillflow_ci?schema=public';
    process.env.POSTGRES_PRISMA_URL = process.env.DATABASE_URL;
    try {
      await getTodayKPIs('biz-1');
    } finally {
      process.env.DATABASE_URL = previous.DATABASE_URL;
      process.env.POSTGRES_PRISMA_URL = previous.POSTGRES_PRISMA_URL;
    }

    const expenseCalls = prismaMock.expense.aggregate.mock.calls.map((call) => (
      (call[0] as { where?: { createdAt?: { gte?: Date; lt?: Date } } }).where?.createdAt
    ));
    const [thirty, seven, fourWeek] = expenseCalls;
    const alerts = whereOf(prismaMock.riskAlert.count)?.occurredAt as { gte?: Date; lt?: Date };
    const discounts = whereOf(prismaMock.salesInvoice.count)?.createdAt as { gte?: Date; lt?: Date };
    const shifts = whereOf(prismaMock.shift.findMany)?.closedAt as { gte?: Date; lt?: Date };

    expect(iso(thirty?.gte)).toBe('2026-05-31T21:00:00.000Z');
    expect(iso(thirty?.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(seven?.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(fourWeek?.gte)).toBe('2026-05-26T21:00:00.000Z');
    expect(iso(fourWeek?.lt)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(alerts.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(alerts.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(discounts.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(discounts.lt)).toBe(NAIROBI_TODAY_END);
    expect(iso(shifts.gte)).toBe('2026-06-23T21:00:00.000Z');
    expect(iso(shifts.lt)).toBe(NAIROBI_TODAY_END);
  });
});
