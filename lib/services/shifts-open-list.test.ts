import { describe, expect, it, vi } from 'vitest';
import { getOpenShiftsForUserInStore } from './shifts';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectCashVarianceRisk: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  measureServerOperation: (_name: string, callback: () => unknown) => callback(),
  PERFORMANCE_THRESHOLDS_MS: { action: 1000 },
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
});
