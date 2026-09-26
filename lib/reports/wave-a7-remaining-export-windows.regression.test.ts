import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cash Drawer and Risk exports still build windows with parseDate/setDate/setHours
 * and never load Business.timezone. Nairobi 2026-07-01 must be
 * [2026-06-30T21:00:00.000Z, 2026-07-01T21:00:00.000Z).
 */
const NAIROBI = 'Africa/Nairobi';
const ACCRA = 'Africa/Accra';
const NAIROBI_START = '2026-06-30T21:00:00.000Z';
const NAIROBI_END = '2026-07-01T21:00:00.000Z';
const ACCRA_START = '2026-07-01T00:00:00.000Z';
const ACCRA_END = '2026-07-02T00:00:00.000Z';
const REQUIRED = 'Business timezone is required for report windows';

const {
  getUserMock,
  requireBusinessMock,
  businessFindUniqueMock,
  shiftFindManyMock,
  shiftCountMock,
  riskAlertFindManyMock,
  salesInvoiceFindManyMock,
  getBusinessStoresMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  requireBusinessMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  shiftFindManyMock: vi.fn(),
  shiftCountMock: vi.fn(),
  riskAlertFindManyMock: vi.fn(),
  salesInvoiceFindManyMock: vi.fn(),
  getBusinessStoresMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUser: getUserMock,
  requireBusiness: requireBusinessMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    business: { findUnique: businessFindUniqueMock },
    shift: { findMany: shiftFindManyMock, count: shiftCountMock },
    riskAlert: { findMany: riskAlertFindManyMock },
    salesInvoice: { findMany: salesInvoiceFindManyMock },
  },
}));

vi.mock('@/lib/exports/branded-export', () => ({
  detectExportFormat: () => 'csv',
  fmtDateTime: (value: Date) => value.toISOString(),
  respondWithExport: (params: unknown) => Response.json(params),
}));

vi.mock('@/lib/services/stores', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/stores')>('@/lib/services/stores');
  return { ...actual, getBusinessStores: getBusinessStoresMock };
});

import { GET as getEodCsv } from '@/app/(protected)/exports/eod-csv/route';
import { GET as getEodPdf } from '@/app/(protected)/exports/eod-pdf/route';
import { GET as getRiskExport } from '@/app/(protected)/exports/risk-summary/route';
import CashDrawerReportPage from '@/app/(protected)/reports/cash-drawer/page';
import RiskMonitorPage from '@/app/(protected)/reports/risk-monitor/page';

function request(path: string) {
  return new Request(`http://localhost${path}?from=2026-07-01&to=2026-07-01`);
}

function bounds(where: { gte?: Date; lt?: Date } | undefined) {
  return {
    gte: where?.gte?.toISOString() ?? null,
    lt: where?.lt?.toISOString() ?? null,
  };
}

function business(timezone: string | null) {
  return {
    id: 'biz-1',
    name: 'Nairobi Market',
    currency: 'GHS',
    timezone,
    plan: 'GROWTH',
    mode: 'GROWTH',
    storeMode: 'SINGLE',
  };
}

describe('A7 cash drawer and risk windows follow the stored timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
    requireBusinessMock.mockResolvedValue({
      user: { role: 'OWNER', businessId: 'biz-1' },
      business: business(NAIROBI),
    });
    businessFindUniqueMock.mockResolvedValue(business(NAIROBI));
    getBusinessStoresMock.mockResolvedValue({ stores: [], selectedStoreId: null });
    shiftFindManyMock.mockResolvedValue([]);
    shiftCountMock.mockResolvedValue(0);
    riskAlertFindManyMock.mockResolvedValue([]);
    salesInvoiceFindManyMock.mockResolvedValue([]);
  });

  it('uses the Nairobi half-open day on the cash drawer screen and both exports', async () => {
    await CashDrawerReportPage({ searchParams: { from: '2026-07-01', to: '2026-07-01' } });
    await getEodCsv(request('/exports/eod-csv'));
    await getEodPdf(request('/exports/eod-pdf'));

    const openedAtCalls = shiftFindManyMock.mock.calls.filter((call) => call[0]?.where?.openedAt);
    const screen = bounds(shiftCountMock.mock.calls[0]?.[0]?.where?.openedAt);
    const csv = bounds(openedAtCalls[1]?.[0]?.where?.openedAt);
    const pdf = bounds(openedAtCalls[2]?.[0]?.where?.openedAt);

    for (const window of [screen, csv, pdf]) {
      expect(window).toEqual({ gte: NAIROBI_START, lt: NAIROBI_END });
      expect(new Date(NAIROBI_START).getTime() >= new Date(window.gte!).getTime()).toBe(true);
      expect(new Date(NAIROBI_START).getTime() < new Date(window.lt!).getTime()).toBe(true);
      expect(new Date(NAIROBI_END).getTime() < new Date(window.lt!).getTime()).toBe(false);
    }
  });

  it('uses the same Nairobi exclusive end for risk alerts and discounted sales', async () => {
    await RiskMonitorPage({ searchParams: { from: '2026-07-01', to: '2026-07-01' } });
    await getRiskExport(request('/exports/risk-summary'));

    const alertWindows = riskAlertFindManyMock.mock.calls.map((call) => bounds(call[0]?.where?.occurredAt));
    const saleWindows = salesInvoiceFindManyMock.mock.calls.map((call) => bounds(call[0]?.where?.createdAt));
    expect(alertWindows).toEqual([
      { gte: NAIROBI_START, lt: NAIROBI_END },
      { gte: NAIROBI_START, lt: NAIROBI_END },
    ]);
    expect(saleWindows).toEqual([
      { gte: NAIROBI_START, lt: NAIROBI_END },
      { gte: NAIROBI_START, lt: NAIROBI_END },
    ]);
  });

  it('keeps a valid Ghana day half-open on the cash drawer export', async () => {
    businessFindUniqueMock.mockResolvedValue(business(ACCRA));
    await getEodCsv(request('/exports/eod-csv'));
    expect(bounds(shiftFindManyMock.mock.calls[0]?.[0]?.where?.openedAt)).toEqual({
      gte: ACCRA_START,
      lt: ACCRA_END,
    });
  });

  it.each([null, '', '   ', 'Mars/Olympus'])(
    'fails closed for stored timezone %j before querying shifts or risk rows',
    async (timezone) => {
      businessFindUniqueMock.mockResolvedValue(business(timezone));
      await expect(getEodCsv(request('/exports/eod-csv'))).rejects.toThrow(REQUIRED);
      await expect(getEodPdf(request('/exports/eod-pdf'))).rejects.toThrow(REQUIRED);
      await expect(getRiskExport(request('/exports/risk-summary'))).rejects.toThrow(REQUIRED);
      expect(shiftFindManyMock).not.toHaveBeenCalled();
      expect(riskAlertFindManyMock).not.toHaveBeenCalled();
      expect(salesInvoiceFindManyMock).not.toHaveBeenCalled();
    },
  );
});
