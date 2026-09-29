import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const count = vi.fn();
const findMany = vi.fn();

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesInvoice: {
      aggregate: (...args: unknown[]) => aggregate(...args),
      count: (...args: unknown[]) => count(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
    salesReturn: { count: async () => 0 },
    riskAlert: { findMany: async () => [] },
    shift: { findMany: async () => [] },
    stockAdjustment: { count: async () => 0 },
  },
}));

vi.mock('@/lib/reports/money-received', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports/money-received')>(
    '@/lib/reports/money-received',
  );
  return {
    ...actual,
    aggregateMoneyReceivedByMethod: vi.fn(async () => []),
    requireMoneyReceivedMethodRows: vi.fn(() => []),
  };
});

import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';

const weekStart = new Date('2026-09-21T00:00:00.000Z');
const weekEnd = new Date('2026-09-28T00:00:00.000Z');

describe('weekly digest store dimension', () => {
  beforeEach(() => {
    aggregate.mockReset();
    count.mockReset();
    findMany.mockReset();
    aggregate.mockResolvedValue({ _sum: { totalPence: 8_000 }, _count: { id: 3 } });
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
  });

  it('keeps another branch and another business out of the sales aggregate', async () => {
    const data = await getWeeklyDigestData('biz-a', weekStart, weekEnd, 'Africa/Accra', ['store-a']);
    expect(data.totalSalesPence).toBe(8_000);
    expect(data.txCount).toBe(3);
    for (const call of aggregate.mock.calls) {
      const where = (call[0] as { where: { businessId: string; storeId: string } }).where;
      expect(where.businessId).toBe('biz-a');
      expect(where.storeId).toBe('store-a');
      expect(where.storeId).not.toBe('store-b');
      expect(where.businessId).not.toBe('biz-b');
    }
  });

  it('uses every authorised branch when Pro consolidates and no other branch', async () => {
    await getWeeklyDigestData('biz-a', weekStart, weekEnd, 'Africa/Accra', ['store-b', 'store-a']);
    const where = (aggregate.mock.calls[0][0] as { where: { storeId: { in: string[] } } }).where;
    expect(where.storeId.in).toEqual(['store-a', 'store-b']);
    expect(where.storeId.in).not.toContain('store-c');
  });
});
