import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wave A7 — point-in-time balances must honour the half-open reporting window.
 *
 * Every production caller of `getAccountBalance(businessId, code, asOf)` passes an
 * EXCLUSIVE boundary instant (`startInclusive` / `endExclusive` from the reporting
 * clock), so the balance "as of" that instant must EXCLUDE journals stamped exactly
 * at it. Today `getAccountBalance` filters `entryDate: { lte: asOf }`, and the
 * operational cash estimate in today-kpis filters `paidAt: { lte: asOf }`, so a
 * journal or payment stamped exactly at the boundary leaks into the wrong period.
 *
 * Expected semantics (fail today, pass once the filters become `lt`):
 *   beginning = balance(start)  → excludes the journal at exactly startInclusive
 *   ending    = balance(end)    → includes the journal at startInclusive, excludes the one at endExclusive
 *   delta     = ending - beginning covers exactly [startInclusive, endExclusive)
 *
 * All instants are ISO UTC; the business timezone is Africa/Accra (UTC+0) so the
 * expectations do not depend on the process TZ.
 */

const BIZ = 'biz-a7';

// Reporting window (Accra local 1 Mar 00:00 → 8 Mar 00:00).
const START = new Date('2026-03-01T00:00:00.000Z');
const END = new Date('2026-03-08T00:00:00.000Z');
const START_MINUS_1MS = new Date(START.getTime() - 1);
const END_PLUS_1MS = new Date(END.getTime() + 1);
const INSIDE = new Date('2026-03-04T12:00:00.000Z');

// Today-KPI clock: 10 Mar 20:30 UTC is 10 Mar 20:30 in Accra → todayEnd = 11 Mar 00:00Z.
const KPI_NOW = new Date('2026-03-10T20:30:00.000Z');
const KPI_TODAY_END = '2026-03-11T00:00:00.000Z';
const ACCRA = 'Africa/Accra';

type DateFilter = { lt?: Date; lte?: Date; gt?: Date; gte?: Date };
type JournalLineRow = { accountId: string; entryDate: Date; debitPence: number; creditPence: number };
type AccountRow = { id: string; code: string; name: string; type: string };

const { prismaMock, ledger, recorded, kpiRuntime } = vi.hoisted(() => {
  const ledger: { journalLines: JournalLineRow[]; accounts: AccountRow[] } = {
    journalLines: [],
    accounts: [
      { id: 'acc-cash', code: '1000', name: 'Cash on Hand', type: 'ASSET' },
      { id: 'acc-bank', code: '1010', name: 'Bank', type: 'ASSET' },
      { id: 'acc-ar', code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
      { id: 'acc-inv', code: '1200', name: 'Inventory', type: 'ASSET' },
      { id: 'acc-ap', code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    ],
  };

  const recorded: {
    journalAggregate: Array<{ accountId?: string; journalEntry?: { entryDate?: DateFilter } }>;
    purchasePaymentAggregate: Array<{ paidAt?: DateFilter }>;
    expensePaymentAggregate: Array<{ paidAt?: DateFilter }>;
  } = {
    journalAggregate: [],
    purchasePaymentAggregate: [],
    expensePaymentAggregate: [],
  };

  const kpiRuntime = { sqlite: false };

  // Honour Prisma comparison semantics exactly: lte includes equal, lt excludes equal.
  function matchesDateFilter(filter: DateFilter | Date | undefined, value: Date) {
    if (!filter) return true;
    const t = value.getTime();
    if (filter instanceof Date) return t === filter.getTime();
    if (filter.lt !== undefined && !(t < filter.lt.getTime())) return false;
    if (filter.lte !== undefined && !(t <= filter.lte.getTime())) return false;
    if (filter.gt !== undefined && !(t > filter.gt.getTime())) return false;
    if (filter.gte !== undefined && !(t >= filter.gte.getTime())) return false;
    return true;
  }

  const journalLineAggregate = vi.fn(async (args: {
    where: { accountId?: string; journalEntry?: { entryDate?: DateFilter } };
  }) => {
    const where = args.where;
    recorded.journalAggregate.push(where);
    const rows = ledger.journalLines.filter(
      (line) =>
        (where.accountId === undefined || line.accountId === where.accountId) &&
        matchesDateFilter(where.journalEntry?.entryDate, line.entryDate),
    );
    if (rows.length === 0) return { _sum: { debitPence: null, creditPence: null } };
    return {
      _sum: {
        debitPence: rows.reduce((sum, line) => sum + line.debitPence, 0),
        creditPence: rows.reduce((sum, line) => sum + line.creditPence, 0),
      },
    };
  });

  const accountFindFirst = vi.fn(async (args: { where: { code?: string } }) => {
    const account = ledger.accounts.find((a) => a.code === args.where.code);
    return account ? { id: account.id, type: account.type } : null;
  });

  const purchasePaymentAggregate = vi.fn(async (args: { where: { paidAt?: DateFilter } }) => {
    recorded.purchasePaymentAggregate.push(args.where);
    return { _sum: { amountPence: 0 } };
  });

  const expensePaymentAggregate = vi.fn(async (args: { where: { paidAt?: DateFilter } }) => {
    recorded.expensePaymentAggregate.push(args.where);
    return { _sum: { amountPence: 0 } };
  });

  const explicit: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
    journalLine: { aggregate: journalLineAggregate },
    account: { findFirst: accountFindFirst },
    purchasePayment: { aggregate: purchasePaymentAggregate },
    expensePayment: { aggregate: expensePaymentAggregate },
  };

  function emptyDelegate(model: string) {
    const seed = explicit[model] ?? {};
    return new Proxy(seed as Record<string, ReturnType<typeof vi.fn>>, {
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

// Same surface the A7 clock regression uses for getTodayKPIs — but financials is NOT
// mocked here because the real getAccountBalance is the unit under test.
vi.mock('@/lib/reports/money-received', () => ({
  aggregateMoneyReceivedByMethod: vi.fn(async () => []),
  aggregateConfirmedReceiptsThroughAsOf: vi.fn(async () => ({ amountPence: 0 })),
  requireMoneyReceivedMethodRows: (rows: unknown) => rows ?? [],
  resolveMoneyReceivedScope: (scope: unknown) => scope,
}));

vi.mock('@/lib/reports/sqlite-report-date-normalization', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/sqlite-report-date-normalization')>(
    '@/lib/reports/sqlite-report-date-normalization',
  );
  return {
    ...actual,
    isSqliteRuntime: () => kpiRuntime.sqlite,
  };
});

import { getAccountBalance, getCashflow } from '@/lib/reports/financials';
import { getTodayKPIs } from '@/lib/reports/today-kpis';

function iso(value: Date | undefined) {
  return value?.toISOString() ?? null;
}

function debit(accountId: string, entryDate: Date, debitPence: number): JournalLineRow {
  return { accountId, entryDate, debitPence, creditPence: 0 };
}

/** Cash debits straddling both boundaries: 100 | 200@start | 400 inside | 800@end | 1600 */
const CASH_BOUNDARY_LINES: JournalLineRow[] = [
  debit('acc-cash', START_MINUS_1MS, 100),
  debit('acc-cash', START, 200),
  debit('acc-cash', INSIDE, 400),
  debit('acc-cash', END, 800),
  debit('acc-cash', END_PLUS_1MS, 1600),
];

/** AR debits: 30 before | 50@start | 70 inside | 90@end */
const AR_BOUNDARY_LINES: JournalLineRow[] = [
  debit('acc-ar', START_MINUS_1MS, 30),
  debit('acc-ar', START, 50),
  debit('acc-ar', new Date('2026-03-05T09:00:00.000Z'), 70),
  debit('acc-ar', END, 90),
];

function entryDateFilters(accountId?: string) {
  return recorded.journalAggregate
    .filter((where) => accountId === undefined || where.accountId === accountId)
    .map((where) => where.journalEntry?.entryDate ?? {});
}

function resetRecorders() {
  recorded.journalAggregate.length = 0;
  recorded.purchasePaymentAggregate.length = 0;
  recorded.expensePaymentAggregate.length = 0;
}

describe('A7 getAccountBalance — asOf is an exclusive boundary instant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecorders();
    ledger.journalLines = [...CASH_BOUNDARY_LINES];
  });

  it('beginning balance at startInclusive EXCLUDES the journal stamped exactly at start', async () => {
    const beginning = await getAccountBalance(BIZ, '1000', START);
    // Only the 100 stamped 1 ms before start belongs to the prior period.
    expect(beginning).toBe(100);
  });

  it('ending balance at endExclusive INCLUDES the start journal and EXCLUDES the journal stamped exactly at end', async () => {
    const ending = await getAccountBalance(BIZ, '1000', END);
    // 100 (before) + 200 (at start) + 400 (inside) — the 800 at end belongs to the next period.
    expect(ending).toBe(700);
  });

  it('period delta covers exactly [startInclusive, endExclusive)', async () => {
    const beginning = await getAccountBalance(BIZ, '1000', START);
    const ending = await getAccountBalance(BIZ, '1000', END);
    // 200 (at start) + 400 (inside) — nothing from either neighbouring period.
    expect(ending - beginning).toBe(600);
  });

  it('queries journalEntry.entryDate with `lt`, never `lte`', async () => {
    await getAccountBalance(BIZ, '1000', START);
    await getAccountBalance(BIZ, '1000', END);

    const filters = entryDateFilters('acc-cash');
    expect(filters).toHaveLength(2);
    for (const filter of filters) {
      expect(Object.keys(filter)).toEqual(['lt']);
      expect(filter).not.toHaveProperty('lte');
    }
    expect(iso(filters[0].lt)).toBe(START.toISOString());
    expect(iso(filters[1].lt)).toBe(END.toISOString());
  });
});

describe('A7 getCashflow — opening/closing balances use exclusive period boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecorders();
    ledger.journalLines = [...CASH_BOUNDARY_LINES, ...AR_BOUNDARY_LINES];

    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ id: BIZ, openingCapitalPence: 0 });
    prismaMock.openingBalance.findMany.mockResolvedValue([]);
    prismaMock.account.findMany.mockResolvedValue(ledger.accounts);
    prismaMock.journalLine.groupBy.mockResolvedValue([]);
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([]);
    prismaMock.store.findMany.mockResolvedValue([]);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([]);
  });

  it('beginningCash excludes the cash journal stamped exactly at period start', async () => {
    const cashflow = await getCashflow(BIZ, START, END);
    expect(cashflow.beginningCash).toBe(100);
  });

  it('arChange equals only the in-period AR movement [start, end)', async () => {
    const cashflow = await getCashflow(BIZ, START, END);
    // endAr(30+50+70=150) - startAr(30) = 120; the 90 at end is next period's.
    expect(cashflow.arChange).toBe(120);
  });

  it('every point-in-time balance lookup uses `lt` at start and end for AR/AP/inventory/cash', async () => {
    await getCashflow(BIZ, START, END);

    // 7 lookups: AR/AP/inventory at start+end, cash at start.
    const filters = entryDateFilters();
    expect(filters).toHaveLength(7);
    for (const filter of filters) {
      expect(filter).not.toHaveProperty('lte');
      expect(Object.keys(filter)).toEqual(['lt']);
    }

    const byAccount = new Map<string, DateFilter[]>();
    for (const where of recorded.journalAggregate) {
      const list = byAccount.get(where.accountId ?? '') ?? [];
      list.push(where.journalEntry?.entryDate ?? {});
      byAccount.set(where.accountId ?? '', list);
    }

    // AR / AP / inventory: both boundaries; cash: start only.
    for (const accountId of ['acc-ar', 'acc-ap', 'acc-inv']) {
      const instants = (byAccount.get(accountId) ?? []).map((f) => iso(f.lt)).sort();
      expect(instants).toEqual([START.toISOString(), END.toISOString()]);
    }
    expect((byAccount.get('acc-cash') ?? []).map((f) => iso(f.lt))).toEqual([START.toISOString()]);
  });
});

describe('A7 getTodayKPIs liquid assets — todayEnd is the next local midnight, exclusive', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(KPI_NOW);
    vi.clearAllMocks();
    resetRecorders();

    // Cash + bank: a debit inside today and one stamped exactly at tomorrow's first instant.
    ledger.journalLines = [
      debit('acc-cash', new Date('2026-03-10T09:00:00.000Z'), 1000),
      debit('acc-cash', new Date(KPI_TODAY_END), 5000),
      debit('acc-bank', new Date('2026-03-10T10:00:00.000Z'), 250),
      debit('acc-bank', new Date(KPI_TODAY_END), 7000),
    ];

    (prismaMock as unknown as { $executeRawUnsafe: ReturnType<typeof vi.fn> }).$executeRawUnsafe =
      vi.fn(async () => 0);
    prismaMock.business.findUnique.mockResolvedValue({ timezone: ACCRA, openingCapitalPence: 0 });
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({ timezone: ACCRA, openingCapitalPence: 0 });
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
  ])('%s path: cash + bank journal lookups filter entryDate with `lt` todayEnd, never `lte`', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    await getTodayKPIs(BIZ);

    const cashFilters = entryDateFilters('acc-cash');
    const bankFilters = entryDateFilters('acc-bank');
    expect(cashFilters.length).toBeGreaterThan(0);
    expect(bankFilters.length).toBeGreaterThan(0);

    for (const filter of [...cashFilters, ...bankFilters]) {
      expect(filter).not.toHaveProperty('lte');
      expect(Object.keys(filter)).toEqual(['lt']);
      expect(iso(filter.lt)).toBe(KPI_TODAY_END);
    }
  });

  it.each([
    ['PostgreSQL', false],
    ['SQLite', true],
  ])('%s path: cashOnHandEstimatePence excludes journals stamped exactly at todayEnd', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    const kpis = await getTodayKPIs(BIZ);
    // 1000 cash + 250 bank inside today; the 5000/7000 at 11 Mar 00:00Z belong to tomorrow.
    expect(kpis.cashOnHandEstimatePence).toBe(1250);
  });

  it.each([
    ['PostgreSQL', false],
    ['SQLite', true],
  ])('%s path: operational purchase/expense payment filters use paidAt `lt` todayEnd', async (_label, sqlite) => {
    kpiRuntime.sqlite = sqlite;
    await getTodayKPIs(BIZ);

    expect(recorded.purchasePaymentAggregate.length).toBeGreaterThan(0);
    expect(recorded.expensePaymentAggregate.length).toBeGreaterThan(0);

    for (const where of [...recorded.purchasePaymentAggregate, ...recorded.expensePaymentAggregate]) {
      const paidAt = where.paidAt ?? {};
      expect(paidAt).not.toHaveProperty('lte');
      expect(Object.keys(paidAt)).toEqual(['lt']);
      expect(iso(paidAt.lt)).toBe(KPI_TODAY_END);
    }
  });
});
