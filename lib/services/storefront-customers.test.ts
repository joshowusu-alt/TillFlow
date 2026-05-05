import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCustomerOrderHistory } from './storefront-customers';

const prismaMock = vi.hoisted(() => ({
  onlineOrder: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock('@/lib/services/storefront-otp-delivery', () => ({
  deliverStorefrontOtp: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCustomerOrderHistory', () => {
  it('scopes claimed and legacy phone-matched orders to the current business', async () => {
    prismaMock.onlineOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getCustomerOrderHistory('customer-1', '+233241234567', 20, 'biz-1');

    expect(prismaMock.onlineOrder.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { customerId: 'customer-1', businessId: 'biz-1' },
        take: 20,
      }),
    );
    expect(prismaMock.onlineOrder.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          customerId: null,
          customerPhone: { in: ['+233241234567', '233241234567'] },
          businessId: 'biz-1',
        },
        take: 20,
      }),
    );
  });
});
