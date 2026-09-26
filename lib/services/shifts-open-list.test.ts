import { describe, expect, it, vi } from 'vitest';
import { getOpenShiftsForUserInStore, getStoreTillOccupancy, performShiftClose, performShiftOpen, TILL_ALREADY_OPEN_MSG } from './shifts';
import { createCashVarianceInvestigationTx } from '@/lib/services/cash-variance';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectCashVarianceRisk: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  measureServerOperation: (_name: string, callback: () => unknown) => callback(),
  PERFORMANCE_THRESHOLDS_MS: { action: 1000 },
}));
vi.mock('@/lib/services/cash-drawer', () => ({
  recordCashDrawerEntryTx: vi.fn().mockResolvedValue({ entry: { id: 'cde-1' } }),
  summarizeCashDrawerEntries: () => ({ totalPence: 0, byType: {} }),
}));
vi.mock('@/lib/services/document-numbers', () => ({
  reserveNextDocumentNumber: vi.fn().mockResolvedValue('SHC-000001'),
}));
vi.mock('@/lib/services/cash-variance', () => ({
  createCashVarianceInvestigationTx: vi.fn().mockResolvedValue(null),
}));

describe('open shift list', () => {
  it('queries every open shift for the user in the active store', async () => {
    const rows = [{ id: 'shift-1' }, { id: 'shift-2' }];
    const db = { shift: { findMany: vi.fn().mockResolvedValue(rows) } };

    await expect(getOpenShiftsForUserInStore('user-1', 'store-1', db)).resolves.toEqual(rows);
    expect(db.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: 'OPEN',
          till: { storeId: 'store-1' },
        },
      }),
    );
  });

  it('lists every OPEN shift on the store tills for occupancy', async () => {
    const rows = [{ id: 'shift-1', tillId: 'till-1' }, { id: 'shift-3', tillId: 'till-3' }];
    const db = { shift: { findMany: vi.fn().mockResolvedValue(rows) } };

    await expect(getStoreTillOccupancy('store-1', db)).resolves.toEqual(rows);
    expect(db.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'OPEN',
          till: { storeId: 'store-1' },
        },
      }),
    );
    expect(db.shift.findMany.mock.calls[0][0].where.userId).toBeUndefined();
  });
});

describe('one OPEN shift per till', () => {
  it('rejects a second open when findFirst already sees an OPEN shift', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma as any).till = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'till-1',
        storeId: 'store-1',
        store: { businessId: 'biz-1' },
      }),
    };
    (prisma as any).$transaction = vi.fn(async (cb: any) =>
      cb({
        shift: {
          findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
          create: vi.fn(),
        },
      }),
    );

    await expect(
      performShiftOpen({
        businessId: 'biz-1',
        storeId: 'store-1',
        actor: { userId: 'user-1', userName: 'Ama', userRole: 'CASHIER' },
        tillId: 'till-1',
        openingCashPence: 1000,
      }),
    ).rejects.toThrow(TILL_ALREADY_OPEN_MSG);
  });

  it('surfaces a clear error when concurrent opens lose on unique openKey', async () => {
    const { prisma } = await import('@/lib/prisma');
    const create = vi.fn().mockRejectedValue({
      code: 'P2002',
      meta: { target: ['openKey'] },
    });
    (prisma as any).till = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'till-1',
        storeId: 'store-1',
        store: { businessId: 'biz-1' },
      }),
    };
    (prisma as any).$transaction = vi.fn(async (cb: any) =>
      cb({
        shift: {
          findFirst: vi.fn().mockResolvedValue(null),
          create,
        },
      }),
    );

    await expect(
      performShiftOpen({
        businessId: 'biz-1',
        storeId: 'store-1',
        actor: { userId: 'user-2', userName: 'Kofi', userRole: 'CASHIER' },
        tillId: 'till-1',
        openingCashPence: 500,
      }),
    ).rejects.toThrow(TILL_ALREADY_OPEN_MSG);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ openKey: 'till-1', status: 'OPEN' }),
      }),
    );
  });
});

describe('shift close cash snapshot', () => {
  it('writes counted cash once and does not let variance rewrite it', async () => {
    const { prisma } = await import('@/lib/prisma');
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const lockedShift = {
      id: 'shift-1',
      tillId: 'till-1',
      userId: 'cashier-1',
      status: 'OPEN',
      openingCashPence: 20000,
      expectedCashPence: 25000,
      openedAt: new Date('2026-09-17T08:00:00.000Z'),
      till: { id: 'till-1', storeId: 'store-1', name: 'Till 1' },
      salesInvoices: [],
      cashDrawerEntries: [
        { id: 'cde-1', entryType: 'OPEN_FLOAT', amountPence: 20000, createdAt: new Date() },
        { id: 'cde-2', entryType: 'CASH_SALE', amountPence: 5000, createdAt: new Date() },
      ],
    };

    (prisma as any).shift = {
      findFirst: vi.fn()
        .mockResolvedValueOnce(lockedShift)
        .mockResolvedValue(lockedShift),
      updateMany,
    };
    (prisma as any).business = {
      findUnique: vi.fn().mockResolvedValue({
        varianceReasonRequired: false,
        cashVarianceRiskThresholdPence: 2000,
      }),
    };
    (prisma as any).$queryRaw = vi.fn();
    (prisma as any).$transaction = vi.fn(async (cb: any) => cb(prisma));

    const result = await performShiftClose({
      businessId: 'biz-1',
      actor: { userId: 'mgr-1', userName: 'Manager', userRole: 'MANAGER' },
      shiftId: 'shift-1',
      actualCash: 24000,
      notes: null,
      varianceReasonCode: 'COUNT_ERROR',
      varianceReason: 'Miscount',
      approval: { mode: 'PIN', approvingManagerId: 'mgr-1' },
    });

    expect(result.id).toBe('shift-1');
    expect(reserveNextDocumentNumber).toHaveBeenCalledWith(prisma, 'biz-1', 'shift_closure');
    expect(createCashVarianceInvestigationTx).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        shiftId: 'shift-1',
        variancePence: -1000,
        cashierExplanation: 'Miscount',
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualCashPence: 24000,
          expectedCashPence: 25000,
          variance: -1000,
          closureNumber: 'SHC-000001',
          status: 'CLOSED',
          openKey: null,
        }),
      }),
    );
    expect(updateMany.mock.calls[0][0].data.actualCashPence).toBe(24000);
    expect(updateMany.mock.calls[0][0].data.expectedCashPence).toBe(25000);
  });
});
