import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveMoneyReceivedAccess, assertDrillRowTenant } from '@/lib/reports/money-received/access';

const {
  getUserMock,
  businessFindUniqueMock,
  getBusinessStoresMock,
  computeBundleMock,
  iterExportMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  getBusinessStoresMock: vi.fn(),
  computeBundleMock: vi.fn(),
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

vi.mock('@/lib/reports/money-received', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/money-received')>(
    '@/lib/reports/money-received',
  );
  return {
    ...actual,
    computeMoneyReceivedBundle: computeBundleMock,
    iterMoneyReceivedExportCsvChunks: iterExportMock,
  };
});

import { GET } from '@/app/(protected)/exports/money-received/route';

describe('resolveMoneyReceivedAccess behavioural boundary', () => {
  it('Owner and Manager allowed; Cashier denied', () => {
    expect(
      resolveMoneyReceivedAccess({
        actor: { role: 'OWNER', businessId: 'biz-a' },
        authorisedStoreIds: ['s1'],
      }).ok,
    ).toBe(true);
    expect(
      resolveMoneyReceivedAccess({
        actor: { role: 'MANAGER', businessId: 'biz-a' },
        authorisedStoreIds: ['s1'],
      }).ok,
    ).toBe(true);
    const cashier = resolveMoneyReceivedAccess({
      actor: { role: 'CASHIER', businessId: 'biz-a' },
      authorisedStoreIds: ['s1'],
    });
    expect(cashier.ok).toBe(false);
    if (!cashier.ok) expect(cashier.reason).toBe('ROLE_DENIED');
  });

  it('rejects caller-controlled foreign businessId', () => {
    const result = resolveMoneyReceivedAccess({
      actor: { role: 'OWNER', businessId: 'biz-a' },
      requestedBusinessId: 'biz-b',
      authorisedStoreIds: ['s1'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('TENANT_MISMATCH');
  });

  it('rejects unassigned branch injection', () => {
    const result = resolveMoneyReceivedAccess({
      actor: { role: 'MANAGER', businessId: 'biz-a' },
      requestedStoreId: 'foreign-store',
      authorisedStoreIds: ['s1', 's2'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('BRANCH_NOT_AUTHORISED');
  });

  it('drill source tenant check denies cross-business ids', () => {
    expect(assertDrillRowTenant('biz-a', 'biz-a')).toBe(true);
    expect(assertDrillRowTenant('biz-a', 'biz-b')).toBe(false);
    expect(assertDrillRowTenant('biz-a', null)).toBe(false);
  });
});

describe('GET /exports/money-received access', () => {
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
    computeBundleMock.mockResolvedValue({
      quality: { overall: 'COMPLETE' },
      results: [],
      byId: {},
      scope: {},
      methodReconcile: { ok: true },
    });
    iterExportMock.mockImplementation(async function* () {
      yield 'meta,ok\n';
    });
  });

  it('Manager can export for authenticated business', async () => {
    getUserMock.mockResolvedValue({ role: 'MANAGER', businessId: 'biz-a' });
    const res = await GET(new Request('http://localhost/exports/money-received?storeId=ALL'));
    expect(res.status).toBe(200);
    expect(computeBundleMock.mock.calls[0][0].businessId).toBe('biz-a');
  });

  it('Cashier is denied at export boundary', async () => {
    getUserMock.mockResolvedValue({ role: 'CASHIER', businessId: 'biz-a' });
    const res = await GET(new Request('http://localhost/exports/money-received'));
    expect(res.status).toBeGreaterThanOrEqual(300);
  });

  it('Business A cannot export as Business B via query param', async () => {
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-a' });
    const res = await GET(
      new Request('http://localhost/exports/money-received?businessId=biz-b&storeId=ALL'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.completeExport).toBe(false);
    expect(body.reason).toBe('TENANT_MISMATCH');
  });

  it('rejects unassigned branch on export', async () => {
    getUserMock.mockResolvedValue({ role: 'MANAGER', businessId: 'biz-a' });
    const res = await GET(
      new Request('http://localhost/exports/money-received?storeId=not-yours'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe('BRANCH_NOT_AUTHORISED');
  });
});
