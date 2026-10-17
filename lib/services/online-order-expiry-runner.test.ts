import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), read: vi.fn(), restore: vi.fn(), notify: vi.fn(), sms: vi.fn(), tx: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { onlineOrder: { findMany: mocks.find }, $transaction: mocks.tx } }));
vi.mock('@/lib/services/online-orders', () => ({ restoreOnlineOrderInventoryReservation: mocks.restore }));
vi.mock('@/lib/services/online-order-status-stream', () => ({ buildOnlineOrderStatusSnapshot: (order: unknown) => order, notifyOrderStatusChange: mocks.notify }));
vi.mock('@/lib/services/storefront-notifications', () => ({ enqueueOrderNotificationSafe: mocks.sms }));
import { expireOnlineOrders } from './online-order-expiry-runner';
beforeEach(() => {
  vi.clearAllMocks(); mocks.find.mockResolvedValue([]);
  mocks.tx.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ onlineOrder: { updateMany: mocks.claim, findUnique: mocks.read } }));
});
it('can isolate one acceptance order without expiring older unrelated fixture reservations', async () => {
  await expireOnlineOrders('fictional-shop', 'test-order');
  expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    businessId: 'fictional-shop', id: 'test-order', paymentStatus: { not: 'PAID' }, status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'] },
  }) }));
});
it('does not release stock or send a message when another expiry or payment has already claimed the order', async () => {
  mocks.find.mockResolvedValue([{ id: 'test-order', storeId: 'branch', lines: [] }]); mocks.claim.mockResolvedValue({ count: 0 });
  expect(await expireOnlineOrders()).toEqual({ expired: 0, errors: [] });
  expect(mocks.restore).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
});
it('passes captured stock costs to restoration and notifies only after a successful expiry', async () => {
  const lines = [{ productId: 'p1', qtyBase: 1, lineCostPence: 33, costBasis: 'INVENTORY_VALUE_V1' }];
  mocks.find.mockResolvedValue([{ id: 'test-order', storeId: 'branch', lines }]); mocks.claim.mockResolvedValue({ count: 1 });
  mocks.read.mockResolvedValue({ id: 'test-order', status: 'CANCELLED' });
  expect(await expireOnlineOrders()).toEqual({ expired: 1, errors: [] });
  expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'test-order', storeId: 'branch', lines }));
  expect(mocks.sms).toHaveBeenCalledTimes(1);
});
