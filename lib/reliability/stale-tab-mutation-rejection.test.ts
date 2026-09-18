import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMock,
  storeFindFirst,
  storeCount,
  shiftUpdate,
  drawerCreate,
  varianceCreate,
  auditCreate,
  movementCreate,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  storeFindFirst: vi.fn(),
  storeCount: vi.fn(),
  shiftUpdate: vi.fn(),
  drawerCreate: vi.fn(),
  varianceCreate: vi.fn(),
  auditCreate: vi.fn(),
  movementCreate: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: getMock }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: storeFindFirst, count: storeCount },
    shift: { update: shiftUpdate, updateMany: shiftUpdate },
    cashDrawerEntry: { create: drawerCreate },
    cashVarianceInvestigation: { create: varianceCreate },
    stockMovement: { create: movementCreate, createMany: movementCreate },
    auditLog: { create: auditCreate },
  },
}));

import { assertAuthoritativeMutationStore } from './operational-store-cookie';
import { STALE_OPERATIONAL_STORE_MSG } from './operational-store';

const STORE_A = 'store-a-created-first';
const STORE_B = 'store-b-selected';
const BIZ = 'biz-walkthrough';

describe('paired stale-tab mutation rejection', () => {
  beforeEach(() => {
    getMock.mockReset();
    storeFindFirst.mockReset();
    storeCount.mockReset();
    shiftUpdate.mockReset();
    drawerCreate.mockReset();
    varianceCreate.mockReset();
    auditCreate.mockReset();
    movementCreate.mockReset();
    storeCount.mockResolvedValue(2);
    storeFindFirst.mockImplementation(async ({ where }: { where: { id: string; businessId: string } }) => {
      if (where.businessId !== BIZ) return null;
      if (where.id === STORE_A || where.id === STORE_B) return { id: where.id };
      return null;
    });
  });

  it('opens a Store A close form, switches the cookie to Store B, and rejects the stale Store A submit with no writes', async () => {
    getMock.mockReturnValue({ value: STORE_A });
    await expect(assertAuthoritativeMutationStore(BIZ, STORE_A)).resolves.toBe(STORE_A);

    getMock.mockReturnValue({ value: STORE_B });
    await expect(assertAuthoritativeMutationStore(BIZ, STORE_A)).rejects.toThrow(STALE_OPERATIONAL_STORE_MSG);

    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(drawerCreate).not.toHaveBeenCalled();
    expect(varianceCreate).not.toHaveBeenCalled();
    expect(movementCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
