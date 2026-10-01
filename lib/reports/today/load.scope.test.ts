import { describe, expect, it } from 'vitest';
import { ReportingScopeStoreError } from '@/lib/reports/reporting-scope';
import { TodayLoadError, assertTodayStoreScope, loadToday, type TodayLoadInput } from '@/lib/reports/today/load';
import { buildTodayWindows } from '@/lib/reports/today/windows';

const now = new Date('2026-09-30T12:00:00.000Z');

function input(overrides: Partial<TodayLoadInput> = {}): TodayLoadInput {
  const windows = buildTodayWindows({
    now,
    timeZone: 'Africa/Accra',
    plan: 'STARTER',
    authorisedFrom: '2026-09-24',
    authorisedTo: '2026-09-30',
  });
  return {
    businessId: 'biz-1',
    ownedStoreIds: ['store-1'],
    storeIds: ['store-1'],
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    plan: 'STARTER',
    windows,
    showProfit: false,
    consolidated: false,
    storeNames: [{ id: 'store-1', name: 'Accra' }],
    hrefForShift: '/shifts',
    hrefForCash: '/reports/cash-drawer',
    hrefForMomo: null,
    hrefForNetwork: null,
    hrefForCustomers: null,
    hrefForSuppliers: null,
    hrefForBelowCost: null,
    hrefForLowStock: null,
    ...overrides,
  };
}

function untouchedDb() {
  let called = false;
  const db = new Proxy({}, {
    get() {
      called = true;
      throw new Error('query');
    },
  });
  return { db, called: () => called };
}

describe('Today store gate', () => {
  it('rejects an empty, duplicate or foreign store list before a query', async () => {
    expect(() => assertTodayStoreScope([], ['store-1'])).toThrow(ReportingScopeStoreError);
    expect(() => assertTodayStoreScope(['store-1', 'store-1'], ['store-1'])).toThrow(ReportingScopeStoreError);
    expect(() => assertTodayStoreScope(['store-foreign'], ['store-1'])).toThrow(ReportingScopeStoreError);

    const empty = untouchedDb();
    await expect(loadToday(empty.db as never, input({ storeIds: [], ownedStoreIds: [] }))).rejects.toBeInstanceOf(ReportingScopeStoreError);
    expect(empty.called()).toBe(false);

    const foreign = untouchedDb();
    await expect(loadToday(foreign.db as never, input({ storeIds: ['store-foreign'] }))).rejects.toBeInstanceOf(ReportingScopeStoreError);
    expect(foreign.called()).toBe(false);
  });

  it('does not query a comparison Starter is not allowed to request', async () => {
    const windows = input().windows;
    const db = untouchedDb();
    await expect(loadToday(db.db as never, input({
      windows: {
        ...windows,
        comparison: { last30: windows.today, previous30: windows.today },
      },
    }))).rejects.toBeInstanceOf(TodayLoadError);
    expect(db.called()).toBe(false);
  });

  it('does not query a window outside the authorised range', async () => {
    const windows = input().windows;
    const db = untouchedDb();
    await expect(loadToday(db.db as never, input({
      windows: {
        ...windows,
        authorised: {
          ...windows.today,
          startInclusive: windows.today.endExclusive,
          endExclusive: new Date(windows.today.endExclusive.getTime() + 86_400_000),
        },
      },
    }))).rejects.toBeInstanceOf(TodayLoadError);
    expect(db.called()).toBe(false);
  });
});
