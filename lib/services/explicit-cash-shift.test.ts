import { describe, expect, it, vi } from 'vitest';

import {
  EXPLICIT_CASH_TILL_REQUIRED_MSG,
  getOpenCashShiftForPayment,
  requireOpenCashShiftForTill,
} from './cash-drawer';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

function makeTx() {
  return {
    shift: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const tillActive = where.till?.active !== false;
        const storeOk = !where.till?.storeId || where.till.storeId === 'store-1';
        const bizOk = !where.till?.store?.businessId || where.till.store.businessId === 'biz-1';
        if (!tillActive || !storeOk || !bizOk) return null;
        if (where.status !== 'OPEN') return null;
        if (where.id === 'shift-closed') return null;
        if (where.tillId === 'till-3') return { id: 'shift-3', tillId: 'till-3' };
        if (where.tillId === 'till-1') return { id: 'shift-1', tillId: 'till-1' };
        if (where.id === 'shift-3') return { id: 'shift-3', tillId: 'till-3' };
        return null;
      }),
    },
  };
}

describe('explicit cash shift resolution', () => {
  it('never falls back to the user newest OPEN shift', async () => {
    const tx = makeTx();
    const result = await getOpenCashShiftForPayment(tx, {
      businessId: 'biz-1',
      storeId: 'store-1',
      userId: 'user-1',
    });
    expect(result).toBeNull();
    expect(tx.shift.findFirst).not.toHaveBeenCalled();
  });

  it('selects Till 3 when Till 1 and Till 3 are both open', async () => {
    const tx = makeTx();
    const result = await getOpenCashShiftForPayment(tx, {
      businessId: 'biz-1',
      storeId: 'store-1',
      userId: 'user-1',
      tillId: 'till-3',
    });
    expect(result).toEqual({ id: 'shift-3', tillId: 'till-3' });
    expect(tx.shift.findFirst.mock.calls[0][0].where.tillId).toBe('till-3');
  });

  it('rejects a wrong-store till', async () => {
    const tx = makeTx();
    const result = await getOpenCashShiftForPayment(tx, {
      businessId: 'biz-1',
      storeId: 'store-2',
      tillId: 'till-3',
    });
    expect(result).toBeNull();
  });

  it('rejects a closed shiftId', async () => {
    const tx = makeTx();
    const result = await getOpenCashShiftForPayment(tx, {
      businessId: 'biz-1',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-closed',
    });
    expect(result).toBeNull();
  });

  it('rejects an inactive till', async () => {
    const tx = {
      shift: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const result = await getOpenCashShiftForPayment(tx, {
      businessId: 'biz-1',
      storeId: 'store-1',
      tillId: 'till-inactive',
    });
    expect(result).toBeNull();
    expect(tx.shift.findFirst.mock.calls[0][0].where.till.active).toBe(true);
  });

  it('throws a clear message when requireOpenCashShiftForTill cannot resolve', async () => {
    await expect(
      requireOpenCashShiftForTill(makeTx(), {
        businessId: 'biz-1',
        storeId: 'store-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(EXPLICIT_CASH_TILL_REQUIRED_MSG);
  });
});
