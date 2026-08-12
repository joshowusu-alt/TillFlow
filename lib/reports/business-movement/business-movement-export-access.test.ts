import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getUserMock,
  businessFindUniqueMock,
  getBusinessStoresMock,
  computeBmMock,
  iterExportMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  getBusinessStoresMock: vi.fn(),
  computeBmMock: vi.fn(),
  iterExportMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUser: getUserMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    business: { findUnique: businessFindUniqueMock },
  },
}));

vi.mock('@/lib/services/stores', () => ({
  getBusinessStores: getBusinessStoresMock,
  resolveStoreSelection: (stores: { id: string }[], selected?: string, fallback: string | null = null) =>
    selected && stores.some((s) => s.id === selected) ? selected : fallback,
}));

vi.mock('@/lib/reports/business-movement', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/business-movement')>(
    '@/lib/reports/business-movement',
  );
  return {
    ...actual,
    computeBusinessMovementWithMoneyFromDb: computeBmMock,
    iterBusinessMovementExportCsvChunks: iterExportMock,
  };
});

import { GET } from '@/app/(protected)/exports/business-movement/route';

describe('GET /exports/business-movement access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessStoresMock.mockResolvedValue({
      stores: [{ id: 's1', name: 'Main' }],
      selectedStoreId: null,
    });
    businessFindUniqueMock.mockResolvedValue({
      id: 'biz-a',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      name: 'A',
    });
    computeBmMock.mockResolvedValue({
      moneyQueryFailed: false,
      moneyQueryError: null,
      scope: {
        periods: {
          currentFromKey: '2026-07-01',
          currentToKey: '2026-07-31',
        },
      },
    });
    iterExportMock.mockImplementation(async function* () {
      yield 'meta,exportCompleteness,COMPLETE_STREAM\n';
    });
  });

  it('Manager can export for authenticated business', async () => {
    getUserMock.mockResolvedValue({ role: 'MANAGER', businessId: 'biz-a' });
    const res = await GET(new Request('http://localhost/exports/business-movement?storeId=ALL'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Export-Completeness')).toBe('COMPLETE_STREAM');
    expect(computeBmMock.mock.calls[0][1].businessId).toBe('biz-a');
  });

  it('Owner can export', async () => {
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-a' });
    const res = await GET(new Request('http://localhost/exports/business-movement?storeId=ALL'));
    expect(res.status).toBe(200);
  });

  it('Cashier is denied at export boundary', async () => {
    getUserMock.mockResolvedValue({ role: 'CASHIER', businessId: 'biz-a' });
    const res = await GET(new Request('http://localhost/exports/business-movement'));
    expect(res.status).toBeGreaterThanOrEqual(300);
  });

  it('Business A cannot export as Business B via query param', async () => {
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-a' });
    const res = await GET(
      new Request('http://localhost/exports/business-movement?businessId=biz-b&storeId=ALL'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.completeExport).toBe(false);
    expect(body.reason).toBe('TENANT_MISMATCH');
  });

  it('rejects unassigned branch on export', async () => {
    getUserMock.mockResolvedValue({ role: 'MANAGER', businessId: 'biz-a' });
    const res = await GET(
      new Request('http://localhost/exports/business-movement?storeId=not-yours'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe('BRANCH_NOT_AUTHORISED');
    expect(body.completeExport).toBe(false);
  });
});
