import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), scope: vi.fn(), order: vi.fn(), claim: vi.fn(), update: vi.fn(), restore: vi.fn(), transaction: vi.fn(), salesReturn: vi.fn(), receipt: vi.fn(), reversal: vi.fn(), liability: vi.fn(), journal: vi.fn() }));
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
vi.mock('@/lib/accounting', () => ({ ACCOUNT_CODES: { customerRefundsPayable: '2200', bank: '1010' }, postJournalEntry: mocks.journal }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { updateOnlineOrderStatusAction, markOrderRefundedAction } from './online-storefront';
const order = { id: 'o1', storeId: 'branch1', status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', salesInvoiceId: null, refundStatus: null, lines: [] };
function form(nextStatus: string) { const data = new FormData(); data.set('orderId', 'o1'); data.set('nextStatus', nextStatus); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: 'manager1', role: 'MANAGER' }, businessId: 'biz1' });
  mocks.scope.mockResolvedValue({ store: { id: 'branch1' } });
  mocks.order.mockResolvedValue(order);
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED' });
  mocks.receipt.mockResolvedValue({ method: 'TRANSFER' });
  mocks.reversal.mockResolvedValue({ id: 'return1' });
  mocks.liability.mockResolvedValue({ _sum: { creditPence: 1600 } });
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({ onlineOrder: { updateMany: mocks.claim, update: mocks.update }, salesPayment: { findFirst: mocks.receipt }, salesReturn: { findUnique: mocks.reversal }, journalLine: { aggregate: mocks.liability } }));
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

it('defers the refund and preserves the posted transfer tender when cancelling a paid order', async () => {
  mocks.order.mockResolvedValue({ ...order, status: 'PAID', paymentStatus: 'PAID', salesInvoiceId: 'invoice1', totalPence: 1600 });
  await updateOnlineOrderStatusAction(form('CANCELLED'));
  expect(mocks.salesReturn).toHaveBeenCalledWith(expect.objectContaining({ refundMethod: 'TRANSFER', deferRefund: true, refundAmountPence: 1600 }));
});
it('settles an evidenced refund payable exactly once in the claimed transaction', async () => {
  mocks.order.mockResolvedValue({ ...order, refundStatus: 'MANUAL_REFUND_NEEDED', salesInvoiceId: 'invoice1' });
  await markOrderRefundedAction(form(''));
  expect(mocks.journal).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'ONLINE_ORDER_REFUND', referenceId: 'o1', lines: [
    { accountCode: '2200', debitPence: 1600 }, { accountCode: '1010', creditPence: 1600 },
  ] }));
});
it('rejects a concurrent refund settlement before posting any money movement', async () => {
  mocks.order.mockResolvedValue({ ...order, refundStatus: 'MANUAL_REFUND_NEEDED', salesInvoiceId: 'invoice1' });
  mocks.claim.mockResolvedValue({ count: 0 });
  await expect(markOrderRefundedAction(form(''))).rejects.toThrow('another session');
  expect(mocks.journal).not.toHaveBeenCalled();
});
it('does not debit Bank again for legacy returns that already recorded the refund outflow', async () => {
  mocks.order.mockResolvedValue({ ...order, refundStatus: 'MANUAL_REFUND_NEEDED', salesInvoiceId: 'invoice1' });
  mocks.liability.mockResolvedValue({ _sum: { creditPence: null } });
  await markOrderRefundedAction(form(''));
  expect(mocks.journal).not.toHaveBeenCalled();
});
