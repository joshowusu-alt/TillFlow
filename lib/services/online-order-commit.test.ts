import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ order: vi.fn(), update: vi.fn(), user: vi.fn(), till: vi.fn(), createSale: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  onlineOrder: { findUnique: mocks.order, update: mocks.update },
  user: { upsert: mocks.user }, till: { findFirst: mocks.till, upsert: mocks.till },
} }));
vi.mock('./sales', () => ({ createSale: mocks.createSale }));
import { commitOnlineOrderSale } from './online-order-commit';
const order = { id: 'o1', orderNumber: 'ABCD', businessId: 'biz', storeId: 'branch', paymentStatus: 'PAID',
  status: 'PAID', salesInvoiceId: null, paymentCollectionId: null, totalPence: 1500,
  business: { storefrontPaymentMode: 'BANK_TRANSFER' }, lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 1 }] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.order.mockResolvedValue(order); mocks.user.mockResolvedValue({ id: 'system-user' });
  mocks.till.mockResolvedValue({ id: 'online-till' }); mocks.createSale.mockResolvedValue({ id: 'inv1' });
  mocks.update.mockResolvedValue({});
});
it('records a bank-transfer order as transfer and passes its immutable order identity to sale posting', async () => {
  expect(await commitOnlineOrderSale('o1')).toBe('inv1');
  expect(mocks.createSale).toHaveBeenCalledWith(expect.objectContaining({ onlineOrderId: 'o1', saleSource: 'ONLINE_ORDER',
    skipInventoryMovements: true, payments: [{ method: 'TRANSFER', amountPence: 1500 }] }));
});
it('does not post cancelled orders or repost linked invoices', async () => {
  mocks.order.mockResolvedValue({ ...order, status: 'CANCELLED' });
  expect(await commitOnlineOrderSale('o1')).toBeNull();
  mocks.order.mockResolvedValue({ ...order, salesInvoiceId: 'original' });
  expect(await commitOnlineOrderSale('o1')).toBe('original');
  expect(mocks.createSale).not.toHaveBeenCalled();
});
it('surfaces failed posting so the order stays visible for retry', async () => {
  mocks.createSale.mockRejectedValue(new Error('Posting failed'));
  await expect(commitOnlineOrderSale('o1')).rejects.toThrow('Posting failed');
  expect(mocks.update).not.toHaveBeenCalled();
});
