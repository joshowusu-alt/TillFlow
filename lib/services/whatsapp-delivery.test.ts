import { describe, expect, it, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    messageLog: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { applyMetaWhatsAppWebhookEvents } from './whatsapp-delivery';

describe('applyMetaWhatsAppWebhookEvents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates a known message log when Meta reports delivery', async () => {
    prismaMock.messageLog.findFirst.mockResolvedValue({
      id: 'msg-1',
      status: 'ACCEPTED',
      errorMessage: null,
      deliveredAt: null,
    });
    prismaMock.messageLog.update.mockResolvedValue({ id: 'msg-1' });

    const result = await applyMetaWhatsAppWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.123',
                    status: 'delivered',
                    timestamp: '1710427800',
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ received: 1, updated: 1, ignored: 0 });
    expect(prismaMock.messageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          status: 'DELIVERED',
          providerStatus: 'DELIVERED',
        }),
      }),
    );
  });

  it('ignores events that do not match a stored provider message id', async () => {
    prismaMock.messageLog.findFirst.mockResolvedValue(null);

    const result = await applyMetaWhatsAppWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.missing', status: 'read', timestamp: '1710427800' }],
              },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ received: 1, updated: 0, ignored: 1 });
    expect(prismaMock.messageLog.update).not.toHaveBeenCalled();
  });

  it('does not downgrade READ back to ACCEPTED', async () => {
    prismaMock.messageLog.findFirst.mockResolvedValue({
      id: 'msg-1',
      status: 'READ',
      errorMessage: null,
      deliveredAt: new Date('2026-03-14T20:01:00.000Z'),
    });
    prismaMock.messageLog.update.mockResolvedValue({ id: 'msg-1' });

    await applyMetaWhatsAppWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.123', status: 'sent', timestamp: '1710427700' }],
              },
            },
          ],
        },
      ],
    });

    expect(prismaMock.messageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READ' }),
      }),
    );
  });
});
