import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), find: vi.fn(), update: vi.fn(), notify: vi.fn(), post: vi.fn(), sms: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
  onlineOrder: { updateMany: mocks.claim, findUnique: mocks.find, update: mocks.update },
}) } }));
vi.mock('./online-order-status-stream', () => ({ buildOnlineOrderStatusSnapshot: (v: unknown) => v, notifyOrderStatusChange: mocks.notify }));
vi.mock('./online-order-refunds', () => ({ recordUnpostedOrderRefundDue: vi.fn() }));
vi.mock('./online-order-commit', () => ({ commitOnlineOrderSale: mocks.post }));
vi.mock('./storefront-notifications', () => ({ enqueueOrderNotificationSafe: mocks.sms }));
import { syncOnlineOrderPaymentStatus } from './online-order-payment-sync';
const now = new Date('2026-10-16T23:00:00Z');
beforeEach(() => {
  vi.clearAllMocks(); mocks.claim.mockResolvedValue({ count: 1 });
  mocks.find.mockResolvedValue({ id: 'o1', status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', salesInvoiceId: null });
  mocks.update.mockResolvedValue({ id: 'o1', status: 'PAID' });
});
it('flags money arriving after expiry for refund without resurrecting the order or consuming stock again', async () => {
  mocks.find.mockResolvedValue({ id: 'o1', status: 'CANCELLED', paymentStatus: 'EXPIRED', salesInvoiceId: null });
  await syncOnlineOrderPaymentStatus('collection1', 'CONFIRMED', now);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: expect.objectContaining({
    status: 'CANCELLED', paymentStatus: 'PAID', refundStatus: 'MANUAL_REFUND_NEEDED', refundedAt: null,
  }) });
  expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
});
it('ignores delayed failure events after payment has already been confirmed', async () => {
  mocks.find.mockResolvedValue({ id: 'o1', status: 'PROCESSING', paymentStatus: 'PAID', salesInvoiceId: 'invoice1' });
  await syncOnlineOrderPaymentStatus('collection1', 'FAILED', now);
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
});
it('retries missing sale posting on duplicate confirmation without sending another payment-confirmed message', async () => {
  mocks.find.mockResolvedValue({ id: 'o1', status: 'PAID', paymentStatus: 'PAID', salesInvoiceId: null });
  await syncOnlineOrderPaymentStatus('collection1', 'CONFIRMED', now);
  expect(mocks.post).toHaveBeenCalledWith('o1'); expect(mocks.sms).not.toHaveBeenCalled();
});
it('confirms an active order and posts it after the state transaction', async () => {
  await syncOnlineOrderPaymentStatus('collection1', 'CONFIRMED', now);
  expect(mocks.notify).toHaveBeenCalled(); expect(mocks.post).toHaveBeenCalledWith('o1');
  expect(mocks.sms).toHaveBeenCalledWith({ orderId: 'o1', eventType: 'PAYMENT_CONFIRMED' });
});
