import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';

/**
 * Money Received and MoMo already receive an exclusive end from resolveReportDateRange,
 * then add one millisecond. That includes the next local midnight.
 */
const NAIROBI = 'Africa/Nairobi';
const NEXT_MIDNIGHT = '2026-07-01T21:00:00.000Z';
const FOLLOWING_MIDNIGHT = '2026-07-02T21:00:00.000Z';

const {
  requireBusinessMock,
  getUserMock,
  businessFindUniqueMock,
  getBusinessStoresMock,
  computeMoneyReceivedBundleMock,
  drillDownForMetricMock,
  listMomoConfirmationPaymentsMock,
  listMomoConfirmationCashiersMock,
  iterMoneyReceivedExportCsvChunksMock,
  iterMomoConfirmationExportCsvChunksMock,
} = vi.hoisted(() => ({
  requireBusinessMock: vi.fn(),
  getUserMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  getBusinessStoresMock: vi.fn(),
  computeMoneyReceivedBundleMock: vi.fn(),
  drillDownForMetricMock: vi.fn(),
  listMomoConfirmationPaymentsMock: vi.fn(),
  listMomoConfirmationCashiersMock: vi.fn(),
  iterMoneyReceivedExportCsvChunksMock: vi.fn(),
  iterMomoConfirmationExportCsvChunksMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireBusiness: requireBusinessMock,
  getUser: getUserMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { business: { findUnique: businessFindUniqueMock } },
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
    iterMoneyReceivedExportCsvChunks: iterMoneyReceivedExportCsvChunksMock,
  };
});

vi.mock('@/lib/reports/momo-confirmation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/momo-confirmation')>('@/lib/reports/momo-confirmation');
  return {
    ...actual,
    listMomoConfirmationPayments: listMomoConfirmationPaymentsMock,
    listMomoConfirmationCashiers: listMomoConfirmationCashiersMock,
    iterMomoConfirmationExportCsvChunks: iterMomoConfirmationExportCsvChunksMock,
  };
});

import MoneyReceivedReportPage from '@/app/(protected)/reports/money-received/page';
import MomoConfirmationReviewPage from '@/app/(protected)/reports/momo-confirmation/page';
import { GET as getMoneyReceivedExport } from '@/app/(protected)/exports/money-received/route';
import { GET as getMomoExport } from '@/app/(protected)/exports/momo-confirmation/route';

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

describe('A7 Money Received and MoMo keep the exclusive end unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBusinessMock.mockResolvedValue({
      user: { role: 'OWNER', businessId: 'biz-1' },
      business: { id: 'biz-1', name: 'Nairobi Market', currency: 'GHS', timezone: NAIROBI },
    });
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
    businessFindUniqueMock.mockResolvedValue({
      id: 'biz-1',
      name: 'Nairobi Market',
      currency: 'GHS',
      timezone: NAIROBI,
    });
    getBusinessStoresMock.mockResolvedValue({ stores: [], selectedStoreId: null });
    computeMoneyReceivedBundleMock.mockImplementation(async (input: { periodStart: Date; periodEndInclusive: Date; timeZone?: string | null }) => bundleFrom(input));
    drillDownForMetricMock.mockResolvedValue({
      page: { rows: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 1, queryFailed: false },
      reconcile: { ok: true, reason: null },
    });
    listMomoConfirmationPaymentsMock.mockResolvedValue({
      rows: [],
      totalCount: 0,
      totalAmountPence: 0,
      page: 1,
      totalPages: 1,
      queryFailed: false,
    });
    listMomoConfirmationCashiersMock.mockResolvedValue([]);
    iterMoneyReceivedExportCsvChunksMock.mockImplementation(async function* () {});
    iterMomoConfirmationExportCsvChunksMock.mockImplementation(async function* () {});
  });

  it('excludes the next Nairobi midnight on the screen and the export', async () => {
    const canonical = resolveReportDateRange(
      { from: '2026-07-01', to: '2026-07-01' },
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-15T00:00:00.000Z'),
      NAIROBI,
    );
    const next = resolveReportDateRange(
      { from: '2026-07-02', to: '2026-07-02' },
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-15T00:00:00.000Z'),
      NAIROBI,
    );
    expect(canonical.end.toISOString()).toBe(NEXT_MIDNIGHT);
    expect(next.start.toISOString()).toBe(NEXT_MIDNIGHT);
    expect(next.end.toISOString()).toBe(FOLLOWING_MIDNIGHT);

    const params = { from: '2026-07-01', to: '2026-07-01' };
    await MoneyReceivedReportPage({ searchParams: params });
    await MomoConfirmationReviewPage({ searchParams: params });
    const moneyExport = await getMoneyReceivedExport(new Request('http://localhost/exports/money-received?from=2026-07-01&to=2026-07-01'));
    const momoExport = await getMomoExport(new Request('http://localhost/exports/momo-confirmation?from=2026-07-01&to=2026-07-01'));
    expect(moneyExport.status).toBeLessThan(400);
    expect(momoExport.status).toBeLessThan(400);

    const moneyScreen = computeMoneyReceivedBundleMock.mock.calls[0][0].periodEndInclusive as Date;
    const moneyExportEnd = computeMoneyReceivedBundleMock.mock.calls[1][0].periodEndInclusive as Date;
    const momoScreen = listMomoConfirmationPaymentsMock.mock.calls[0][1].periodEndExclusive as Date;
    const momoExportEnd = iterMomoConfirmationExportCsvChunksMock.mock.calls[0][1].periodEndExclusive as Date;
    const passed = [moneyScreen, moneyExportEnd, momoScreen, momoExportEnd];

    for (const end of passed) {
      expect(end.toISOString()).toBe(canonical.end.toISOString());
      expect(end.getTime() - canonical.end.getTime()).toBe(0);
      expect(new Date(NEXT_MIDNIGHT).getTime() < end.getTime()).toBe(false);
    }
    expect(moneyScreen.getTime()).toBe(moneyExportEnd.getTime());
    expect(momoScreen.getTime()).toBe(momoExportEnd.getTime());
    expect(moneyScreen.getTime()).toBe(next.start.getTime());
  });
});
