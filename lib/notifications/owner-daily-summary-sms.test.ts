import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
    },
    messageOutbox: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    store: {
      findFirst: vi.fn(),
    },
    salesInvoice: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    salesPayment: {
      findMany: vi.fn(),
    },
    inventoryBalance: {
      count: vi.fn(),
    },
    salesReturn: {
      count: vi.fn(),
    },
    shift: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { enqueueOwnerDailySummarySms } from '@/lib/notifications/owner-daily-summary-sms';

describe('enqueueOwnerDailySummarySms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.store.findFirst.mockResolvedValue(null);
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.salesPayment.findMany.mockResolvedValue([]);
    prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 0 } });
    prismaMock.inventoryBalance.count.mockResolvedValue(0);
    prismaMock.salesInvoice.count.mockResolvedValue(0);
    prismaMock.salesReturn.count.mockResolvedValue(0);
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.messageOutbox.findUnique.mockResolvedValue(null);
    prismaMock.messageOutbox.create.mockResolvedValue({ id: 'outbox-1' });
  });

  it('does not enqueue when Daily Owner Summary is disabled', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      name: 'Demo Shop',
      currency: 'GHS',
      phone: null,
      whatsappPhone: '233241234567',
      whatsappEnabled: false,
      timezone: 'Africa/Accra',
      whatsappBranchScope: 'ALL',
      isDemo: false,
      subscriptionStatus: 'ACTIVE',
    });

    const result = await enqueueOwnerDailySummarySms('biz-1');

    expect(result).toEqual({ ok: false, reason: 'SUMMARY_DISABLED' });
    expect(prismaMock.messageOutbox.create).not.toHaveBeenCalled();
  });

  it('enqueues SMS when enabled with a valid owner phone', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      name: 'Demo Shop',
      currency: 'GHS',
      phone: null,
      whatsappPhone: '233241234567',
      whatsappEnabled: true,
      timezone: 'Africa/Accra',
      whatsappBranchScope: 'ALL',
      isDemo: false,
      subscriptionStatus: 'ACTIVE',
    });

    const result = await enqueueOwnerDailySummarySms('biz-1');

    expect(result.ok).toBe(true);
    expect(prismaMock.messageOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'SMS',
          recipient: expect.any(String),
        }),
      }),
    );
  });
});
