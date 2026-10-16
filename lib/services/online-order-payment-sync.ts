import { prisma } from '@/lib/prisma';
import { buildOnlineOrderStatusSnapshot, notifyOrderStatusChange } from './online-order-status-stream';
import { enqueueOrderNotificationSafe } from './storefront-notifications';

/** Serialize provider events with merchant transitions and expiry on the order row. */
export async function syncOnlineOrderPaymentStatus(collectionId: string, status: string, observedAt: Date) {
  if (!['CONFIRMED', 'FAILED', 'TIMEOUT'].includes(status)) return;
  const result = await prisma.$transaction(async tx => {
    // A no-op update takes the same row lock as cancellation and manual confirmation.
    const claimed = await tx.onlineOrder.updateMany({ where: { paymentCollectionId: collectionId }, data: { updatedAt: observedAt } });
    if (!claimed.count) return null;
    const order = await tx.onlineOrder.findUnique({ where: { paymentCollectionId: collectionId } });
    if (!order) return null;
    const confirmed = status === 'CONFIRMED';
    const closed = order.status === 'CANCELLED' || order.status === 'COMPLETED';
    // Once confirmed, stale failure/timeouts must never reverse payment.
    if (!confirmed && (order.paymentStatus === 'PAID' || closed)) return null;
    if (confirmed && order.paymentStatus === 'PAID') {
      return { id: order.id, post: !closed && !order.salesInvoiceId, notify: false };
    }
    const cancelled = order.status === 'CANCELLED';
    const updated = await tx.onlineOrder.update({ where: { id: order.id }, data: confirmed ? {
      status: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'].includes(order.status) ? 'PAID' : order.status,
      paymentStatus: 'PAID', paidAt: order.paidAt ?? observedAt,
      paymentConfirmedAt: order.paymentConfirmedAt ?? observedAt,
      // Expiry already released the reservation. A late payment requires a refund, not a new sale.
      ...(cancelled && order.refundStatus !== 'REFUNDED' ? { refundStatus: 'MANUAL_REFUND_NEEDED', refundedAt: null } : {}),
    } : { status: order.status === 'AWAITING_PAYMENT' ? 'PAYMENT_FAILED' : order.status, paymentStatus: 'FAILED' } });
    await notifyOrderStatusChange(tx, buildOnlineOrderStatusSnapshot(updated));
    return { id: order.id, post: confirmed && !closed && !order.salesInvoiceId, notify: confirmed && !closed };
  });
  if (!result) return;
  if (result.notify) await enqueueOrderNotificationSafe({ orderId: result.id, eventType: 'PAYMENT_CONFIRMED' });
  if (result.post) {
    try {
      const { commitOnlineOrderSale } = await import('./online-order-commit');
      await commitOnlineOrderSale(result.id);
    } catch (error) {
      // Persistent merchant attention + the retry job recover posting without losing the receipt.
      console.error('[online-order-commit] Provider payment confirmed; sale posting needs retry', result.id, error);
    }
  }
}
