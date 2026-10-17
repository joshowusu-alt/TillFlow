import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), log: vi.fn(), payment: vi.fn(), webhook: vi.fn(), sync: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  mobileMoneyCollection: { findFirst: mocks.find },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ mobileMoneyCollection: { update: mocks.update },
    mobileMoneyStatusLog: { create: mocks.log }, salesPayment: { updateMany: mocks.payment } }),
} }));
vi.mock('@/lib/payments/providers', () => ({ getMobileMoneyProvider: () => ({ handleWebhook: mocks.webhook }), resolveBusinessProvider: vi.fn() }));
vi.mock('./online-order-payment-sync', () => ({ syncOnlineOrderPaymentStatus: mocks.sync }));
import { handleMobileMoneyWebhook } from './mobile-money';
beforeEach(() => { vi.clearAllMocks(); });
it('does not downgrade a confirmed collection or its receipt when a stale failed webhook arrives', async () => {
  mocks.webhook.mockResolvedValue([{ status: 'FAILED', providerReference: 'reference1', providerStatus: 'failed' }]);
  // The outer lookup can be stale; the transaction must use its locked current row.
  mocks.find.mockResolvedValue({ id: 'c1', status: 'PENDING', salesInvoiceId: null });
  mocks.update.mockResolvedValue({ id: 'c1', status: 'CONFIRMED', salesInvoiceId: 'invoice1' });
  await handleMobileMoneyWebhook({ providerKey: 'test', body: {}, headers: {} });
  expect(mocks.update.mock.calls[1][0].data).not.toHaveProperty('status');
  expect(mocks.payment).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }));
  expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  expect(mocks.sync).toHaveBeenCalledWith('c1', 'CONFIRMED', expect.any(Date));
});
