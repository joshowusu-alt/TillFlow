import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLocalDays,
  localDateKey,
  windowForLocalDates,
  zonedDateTimeParts,
} from '@/lib/reports/reporting-clock';

/**
 * Default report ranges still subtract days with server-local setDate.
 * A seven-day default must cover exactly seven tenant-local dates ending today,
 * and the same instant must select the same window under every server timezone.
 */
const ACCRA = 'Africa/Accra';
const NAIROBI = 'Africa/Nairobi';
const REQUIRED = 'Business timezone is required for report windows';
const INSTANTS = [
  '2026-03-10T20:30:00.000Z',
  '2026-03-10T23:30:00.000Z',
  '2026-03-01T02:00:00.000Z',
  '2026-01-01T03:00:00.000Z',
] as const;
const ZONES = [ACCRA, NAIROBI] as const;

const {
  getUserMock,
  requireBusinessMock,
  businessFindUniqueMock,
  shiftFindManyMock,
  shiftCountMock,
  riskAlertFindManyMock,
  salesInvoiceFindManyMock,
  stockMovementCountMock,
  storefrontEventFindManyMock,
  salesReturnCountMock,
  getBusinessStoresMock,
  computeMoneyReceivedBundleMock,
  drillDownForMetricMock,
  listMomoConfirmationPaymentsMock,
  listMomoConfirmationCashiersMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  requireBusinessMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  shiftFindManyMock: vi.fn(),
  shiftCountMock: vi.fn(),
  riskAlertFindManyMock: vi.fn(),
  salesInvoiceFindManyMock: vi.fn(),
  stockMovementCountMock: vi.fn(),
  storefrontEventFindManyMock: vi.fn(),
  salesReturnCountMock: vi.fn(),
  getBusinessStoresMock: vi.fn(),
  computeMoneyReceivedBundleMock: vi.fn(),
  drillDownForMetricMock: vi.fn(),
  listMomoConfirmationPaymentsMock: vi.fn(),
  listMomoConfirmationCashiersMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUser: getUserMock,
  requireBusiness: requireBusinessMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    business: { findUnique: businessFindUniqueMock },
    shift: { findMany: shiftFindManyMock, count: shiftCountMock },
    riskAlert: { findMany: riskAlertFindManyMock, create: vi.fn() },
    salesInvoice: { findMany: salesInvoiceFindManyMock },
    stockMovement: { count: stockMovementCountMock, findMany: vi.fn(async () => []) },
    storefrontEvent: { findMany: storefrontEventFindManyMock },
    product: { findMany: vi.fn(async () => []) },
    salesReturn: { count: salesReturnCountMock },
  },
}));

vi.mock('@/lib/exports/branded-export', () => ({
  detectExportFormat: () => 'csv',
  fmtDateTime: (value: Date) => value.toISOString(),
  fmtMoney: (pence: number) => (pence / 100).toFixed(2),
  respondWithExport: (params: unknown) => Response.json(params),
}));

vi.mock('@/lib/services/stores', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/stores')>('@/lib/services/stores');
  return { ...actual, getBusinessStores: getBusinessStoresMock };
});

vi.mock('@/lib/reports/money-received', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/money-received')>('@/lib/reports/money-received');
  return {
    ...actual,
    computeMoneyReceivedBundle: computeMoneyReceivedBundleMock,
    drillDownForMetric: drillDownForMetricMock,
  };
});

vi.mock('@/lib/reports/momo-confirmation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/momo-confirmation')>('@/lib/reports/momo-confirmation');
  return {
    ...actual,
    listMomoConfirmationPayments: listMomoConfirmationPaymentsMock,
    listMomoConfirmationCashiers: listMomoConfirmationCashiersMock,
  };
});

import { GET as getEodCsv } from '@/app/(protected)/exports/eod-csv/route';
import { GET as getEodPdf } from '@/app/(protected)/exports/eod-pdf/route';
import { GET as getRiskExport } from '@/app/(protected)/exports/risk-summary/route';
import CashDrawerReportPage from '@/app/(protected)/reports/cash-drawer/page';
import RiskMonitorPage from '@/app/(protected)/reports/risk-monitor/page';
import StockMovementsPage from '@/app/(protected)/reports/stock-movements/page';
import MoneyReceivedReportPage from '@/app/(protected)/reports/money-received/page';
import MomoConfirmationReviewPage from '@/app/(protected)/reports/momo-confirmation/page';
import AnalyticsSettingsPage from '@/app/(protected)/settings/analytics/page';
import { detectCashVarianceRisk, detectVoidFrequencyRisk } from '@/lib/services/risk-monitor';

type Bounds = { gte: string | null; lt: string | null };

function business(timezone: string | null) {
  return {
    id: 'biz-1',
    name: 'Market',
    currency: 'GHS',
    timezone,
    plan: 'GROWTH',
    mode: 'GROWTH',
    storeMode: 'SINGLE',
  };
}

function expectedRange(now: Date, timeZone: string, inclusiveLocalDays: number) {
  const today = zonedDateTimeParts(now, timeZone);
  const start = addLocalDays(today, -(inclusiveLocalDays - 1));
  const window = windowForLocalDates(start, today, timeZone);
  return {
    gte: window.startInclusive.toISOString(),
    lt: window.endExclusive.toISOString(),
    fromKey: localDateKey(start),
    toKey: localDateKey(today),
    inclusiveLocalDays,
  };
}

function coveredLocalDays(bounds: Bounds, timeZone: string) {
  const start = zonedDateTimeParts(new Date(bounds.gte!), timeZone);
  const last = zonedDateTimeParts(new Date(new Date(bounds.lt!).getTime() - 1), timeZone);
  let count = 0;
  let cursor = start;
  while (localDateKey(cursor) <= localDateKey(last)) {
    count += 1;
    cursor = addLocalDays(cursor, 1);
    if (count > 400) break;
  }
  return count;
}

function useZone(timezone: string | null) {
  requireBusinessMock.mockResolvedValue({
    user: { role: 'OWNER', businessId: 'biz-1' },
    business: business(timezone),
  });
  businessFindUniqueMock.mockResolvedValue(business(timezone));
}

function bundleFrom(input: { periodStart: Date; periodEndInclusive: Date; timeZone?: string | null }) {
  const metric = { valuePence: 0, state: 'READY' };
  return {
    byId: new Proxy({} as Record<string, typeof metric>, { get: () => metric }),
    quality: { overall: 'READY', legacyWarning: false, messages: [] },
    results: [],
    methodReconcile: { ok: true, reason: null },
    scope: {
      periodStart: input.periodStart,
      periodEndExclusive: input.periodEndInclusive,
      timeZone: input.timeZone,
    },
  };
}

describe('A7 default report ranges follow the tenant calendar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
    useZone(NAIROBI);
    getBusinessStoresMock.mockResolvedValue({
      stores: [{ id: 'store-1', name: 'Main' }],
      selectedStoreId: 'store-1',
    });
    shiftFindManyMock.mockResolvedValue([]);
    shiftCountMock.mockResolvedValue(0);
    riskAlertFindManyMock.mockResolvedValue([]);
    salesInvoiceFindManyMock.mockResolvedValue([]);
    stockMovementCountMock.mockResolvedValue(0);
    storefrontEventFindManyMock.mockResolvedValue([]);
    salesReturnCountMock.mockResolvedValue(0);
    computeMoneyReceivedBundleMock.mockImplementation(async (input: { periodStart: Date; periodEndInclusive: Date; timeZone?: string | null }) => bundleFrom(input));
    drillDownForMetricMock.mockResolvedValue({
      page: { rows: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 1, queryFailed: false },
      reconcile: { ok: true, reason: null },
    });
    listMomoConfirmationPaymentsMock.mockResolvedValue({
      rows: [], totalCount: 0, totalAmountPence: 0, page: 1, totalPages: 1, queryFailed: false,
    });
    listMomoConfirmationCashiersMock.mockResolvedValue([]);
  });

  it.each(INSTANTS.flatMap((instant) => ZONES.map((zone) => [instant, zone] as const)))(
    'uses the same %s %s default on every corrected call site',
    async (instant, zone) => {
      vi.setSystemTime(new Date(instant));
      useZone(zone);
      const week = expectedRange(new Date(instant), zone, 7);
      const month = expectedRange(new Date(instant), zone, 30);
      const fortnight = expectedRange(new Date(instant), zone, 14);

      const windows: Array<[string, Bounds, typeof week]> = [];

      await CashDrawerReportPage({});
      windows.push(['cash-drawer', openedAtFrom(shiftCountMock.mock.calls.at(-1)?.[0]?.where?.openedAt), week]);

      await getEodCsv(new Request('http://localhost/exports/eod-csv'));
      windows.push(['eod-csv', openedAtFrom(shiftFindManyMock.mock.calls.at(-1)?.[0]?.where?.openedAt), week]);

      await getEodPdf(new Request('http://localhost/exports/eod-pdf'));
      windows.push(['eod-pdf', openedAtFrom(shiftFindManyMock.mock.calls.at(-1)?.[0]?.where?.openedAt), week]);

      await RiskMonitorPage({});
      windows.push(['risk-screen', occurredAtFrom(riskAlertFindManyMock.mock.calls.at(-1)?.[0]?.where?.occurredAt), week]);

      await getRiskExport(new Request('http://localhost/exports/risk-summary'));
      windows.push(['risk-export', occurredAtFrom(riskAlertFindManyMock.mock.calls.at(-1)?.[0]?.where?.occurredAt), week]);

      await StockMovementsPage({});
      windows.push(['stock-movements', stamp(stockMovementCountMock.mock.calls.at(-1)?.[0]?.where?.createdAt), week]);

      await MoneyReceivedReportPage({});
      windows.push(['money-received', {
        gte: computeMoneyReceivedBundleMock.mock.calls.at(-1)?.[0]?.periodStart?.toISOString() ?? null,
        lt: computeMoneyReceivedBundleMock.mock.calls.at(-1)?.[0]?.periodEndInclusive?.toISOString() ?? null,
      }, week]);

      await MomoConfirmationReviewPage({});
      windows.push(['momo', {
        gte: listMomoConfirmationPaymentsMock.mock.calls.at(-1)?.[1]?.periodStart?.toISOString() ?? null,
        lt: listMomoConfirmationPaymentsMock.mock.calls.at(-1)?.[1]?.periodEndExclusive?.toISOString() ?? null,
      }, month]);

      await AnalyticsSettingsPage();
      windows.push(['analytics', stamp(storefrontEventFindManyMock.mock.calls.at(-1)?.[0]?.where?.timestamp), month]);

      await detectVoidFrequencyRisk({ businessId: 'biz-1', storeId: 'store-1', cashierUserId: 'user-1' });
      windows.push(['risk-voids', stamp(salesReturnCountMock.mock.calls.at(-1)?.[0]?.where?.createdAt), week]);

      await detectCashVarianceRisk({
        businessId: 'biz-1',
        storeId: 'store-1',
        cashierUserId: 'user-1',
        shiftId: 'shift-1',
        variancePence: 1,
        thresholdPence: 10_000,
      });
      windows.push(['risk-variance', stamp(shiftCountMock.mock.calls.at(-1)?.[0]?.where?.closedAt), fortnight]);

      const mismatches: string[] = [];
      for (const [site, actual, expected] of windows) {
        if (actual.gte !== expected.gte || actual.lt !== expected.lt) {
          mismatches.push(`${site} got [${actual.gte}, ${actual.lt}) expected [${expected.gte}, ${expected.lt})`);
        } else if (coveredLocalDays(actual, zone) !== expected.inclusiveLocalDays) {
          mismatches.push(`${site} covers ${coveredLocalDays(actual, zone)} local days, expected ${expected.inclusiveLocalDays}`);
        }
      }
      expect(mismatches, `${zone} ${instant}`).toEqual([]);
    },
  );

  it('keeps an explicit from/to range authoritative', async () => {
    vi.setSystemTime(new Date('2026-03-10T20:30:00.000Z'));
    useZone(NAIROBI);
    const explicit = windowForLocalDates(
      { year: 2026, month: 7, day: 1 },
      { year: 2026, month: 7, day: 1 },
      NAIROBI,
    );
    await CashDrawerReportPage({ searchParams: { from: '2026-07-01', to: '2026-07-01' } });
    await getEodCsv(new Request('http://localhost/exports/eod-csv?from=2026-07-01&to=2026-07-01'));
    const screen = shiftCountMock.mock.calls.at(-1)?.[0]?.where?.openedAt;
    const csv = shiftFindManyMock.mock.calls.at(-1)?.[0]?.where?.openedAt;
    expect(screen.gte.toISOString()).toBe(explicit.startInclusive.toISOString());
    expect(screen.lt.toISOString()).toBe(explicit.endExclusive.toISOString());
    expect(csv.gte.toISOString()).toBe(screen.gte.toISOString());
    expect(csv.lt.toISOString()).toBe(screen.lt.toISOString());
  });

  it.each([null, '', '   ', 'Mars/Olympus'])('fails closed for timezone %j before querying', async (timezone) => {
    vi.setSystemTime(new Date('2026-03-10T20:30:00.000Z'));
    useZone(timezone);
    await expect(CashDrawerReportPage({})).rejects.toThrow(REQUIRED);
    await expect(getEodCsv(new Request('http://localhost/exports/eod-csv'))).rejects.toThrow(REQUIRED);
    await expect(AnalyticsSettingsPage()).rejects.toThrow(REQUIRED);
    await expect(detectVoidFrequencyRisk({
      businessId: 'biz-1', storeId: 'store-1', cashierUserId: 'user-1',
    })).rejects.toThrow(REQUIRED);
    expect(shiftCountMock).not.toHaveBeenCalled();
    expect(shiftFindManyMock).not.toHaveBeenCalled();
    expect(storefrontEventFindManyMock).not.toHaveBeenCalled();
    expect(salesReturnCountMock).not.toHaveBeenCalled();
  });
});

function stamp(bound?: { gte?: Date; lt?: Date } | null): Bounds {
  return { gte: bound?.gte?.toISOString() ?? null, lt: bound?.lt?.toISOString() ?? null };
}

function openedAtFrom(bound?: { gte?: Date; lt?: Date } | null): Bounds {
  return stamp(bound);
}

function occurredAtFrom(bound?: { gte?: Date; lt?: Date } | null): Bounds {
  return stamp(bound);
}
