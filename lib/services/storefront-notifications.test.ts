import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ order: vi.fn(), business: vi.fn(), store: vi.fn(), create: vi.fn(), existing: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { onlineOrder: { findUnique: mocks.order }, business: { findUnique: mocks.business },
  store: { findUnique: mocks.store }, messageOutbox: { create: mocks.create, findUnique: mocks.existing } } }));
vi.mock('@/lib/services/storefront-sms', () => ({ sendStorefrontSms: mocks.send }));
import { enqueueOrderNotification } from './storefront-notifications';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.mockResolvedValue({ id: 'o1', businessId: 'b1', storeId: 's1', orderNumber: 'ORD-TEST', customerName: 'Fictional QA',
    customerPhone: '0240000134', totalPence: 1700, currency: 'GHS', paymentStatus: 'PENDING',
    paymentConfigJson: JSON.stringify({ mode: 'MOMO_NUMBER', momoNumber: '0240000134', momoNetwork: 'MTN',
      merchantShortcode: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankBranch: null, paymentNote: null }) });
  mocks.business.mockResolvedValue({ id: 'b1', name: 'Fictional shop', smsNotificationsEnabled: true,
    storefrontPaymentMode: 'MERCHANT_SHORTCODE', storefrontMerchantShortcode: 'CHANGED', storefrontMomoNumber: null, storefrontMomoNetwork: null, phone: null });
  mocks.store.mockResolvedValue({ name: 'Preview Central', address: 'Fictional address', phone: null });
  mocks.create.mockResolvedValue({ id: 'sms1' }); mocks.existing.mockResolvedValue({ id: 'sms1' });
});
it('queues the original payment destination and does not call the provider during enqueue', async () => {
  expect(await enqueueOrderNotification({ orderId: 'o1', eventType: 'ORDER_RECEIVED' })).toEqual({ ok: true, outboxId: 'sms1', deduped: false });
  const body = mocks.create.mock.calls[0][0].data.body;
  expect(body).toContain('0240000134'); expect(body).toContain('MTN'); expect(body).not.toContain('CHANGED');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('deduplicates repeated event enqueue against the existing outbox record', async () => {
  mocks.create.mockRejectedValue({ code: 'P2002' });
  expect(await enqueueOrderNotification({ orderId: 'o1', eventType: 'READY_FOR_PICKUP' })).toEqual({ ok: true, outboxId: 'sms1', deduped: true });
});
it('does not queue messages when the merchant has disabled SMS', async () => {
  mocks.business.mockResolvedValue({ id: 'b1', smsNotificationsEnabled: false });
  expect(await enqueueOrderNotification({ orderId: 'o1', eventType: 'ORDER_RECEIVED' })).toEqual({ ok: false, reason: 'NOTIFICATIONS_DISABLED' });
  expect(mocks.create).not.toHaveBeenCalled();
});
