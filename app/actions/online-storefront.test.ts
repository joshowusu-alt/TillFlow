import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), scope: vi.fn(), order: vi.fn(), claim: vi.fn(), update: vi.fn(), restore: vi.fn(), transaction: vi.fn(), salesReturn: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ formAction: (fn: () => unknown) => fn(), withBusinessContext: mocks.context }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mocks.scope }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  business: { findUnique: vi.fn(async () => ({ id: 'biz1', plan: 'PRO', storeMode: 'SINGLE_STORE' })) },
  onlineOrder: { findFirst: mocks.order, updateMany: mocks.claim, update: mocks.update },
  $transaction: mocks.transaction,
} }));
vi.mock('@/lib/services/online-orders', () => ({ restoreOnlineOrderInventoryReservation: mocks.restore }));
vi.mock('@/lib/services/online-order-status-stream', () => ({ buildOnlineOrderStatusSnapshot: (v: unknown) => v, notifyOrderStatusChange: vi.fn() }));
vi.mock('@/lib/services/storefront-notifications', () => ({ enqueueOrderNotificationSafe: vi.fn() }));
vi.mock('@/lib/services/mobile-money', () => ({ checkMobileMoneyCollectionStatus: vi.fn() }));
vi.mock('@/lib/services/returns', () => ({ createSalesReturn: mocks.salesReturn }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { updateOnlineOrderStatusAction } from './online-storefront';
const order = { id: 'o1', storeId: 'branch1', status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', salesInvoiceId: null, refundStatus: null, lines: [] };
function form(nextStatus: string) { const data = new FormData(); data.set('orderId', 'o1'); data.set('nextStatus', nextStatus); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: 'manager1', role: 'MANAGER' }, businessId: 'biz1' });
  mocks.scope.mockResolvedValue({ store: { id: 'branch1' } });
  mocks.order.mockResolvedValue(order);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED' });
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ onlineOrder: { updateMany: mocks.claim, update: mocks.update } }));
});
it('restores reserved stock inside the same claimed cancellation transaction', async () => {
  await updateOnlineOrderStatusAction(form('CANCELLED'));
  expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'branch1', tx: expect.objectContaining({ onlineOrder: expect.anything() }) }));
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
});
it('rejects repeated cancellation without restoring stock twice', async () => {
  mocks.order.mockResolvedValue({ ...order, status: 'CANCELLED' });
  await expect(updateOnlineOrderStatusAction(form('CANCELLED'))).rejects.toThrow('already closed');
  expect(mocks.restore).not.toHaveBeenCalled();
});
it('does not restore stock when another session already changed the order', async () => {
  mocks.claim.mockResolvedValue({ count: 0 });
  await expect(updateOnlineOrderStatusAction(form('CANCELLED'))).rejects.toThrow('another session');
  expect(mocks.restore).not.toHaveBeenCalled();
});
it('prevents cashiers from confirming payment and from handling another branch', async () => {
  mocks.context.mockResolvedValue({ user: { role: 'CASHIER' }, businessId: 'biz1' });
  await expect(updateOnlineOrderStatusAction(form('MARK_PAID'))).rejects.toThrow('manager must confirm');
  mocks.scope.mockResolvedValue({ store: { id: 'branch2' } });
  await expect(updateOnlineOrderStatusAction(form('PROCESSING'))).rejects.toThrow('not found');
  expect(mocks.update).not.toHaveBeenCalled();
});
it('does not prepare a paid order whose sale has not posted', async () => {
  mocks.order.mockResolvedValue({ ...order, status: 'PAID', paymentStatus: 'PAID' });
  await expect(updateOnlineOrderStatusAction(form('PROCESSING'))).rejects.toThrow('sale has not posted');
  expect(mocks.update).not.toHaveBeenCalled();
});
