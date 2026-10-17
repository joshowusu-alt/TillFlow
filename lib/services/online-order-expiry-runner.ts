import { onlineOrderExpiryHours } from '@/lib/online-order-expiry';
import { prisma } from '@/lib/prisma';
import { restoreOnlineOrderInventoryReservation } from '@/lib/services/online-orders';
import { buildOnlineOrderStatusSnapshot, notifyOrderStatusChange } from '@/lib/services/online-order-status-stream';
import { enqueueOrderNotificationSafe } from '@/lib/services/storefront-notifications';

/** Bounded expiry pass; optional tenant scope is used by isolated Preview acceptance tests. */
export async function expireOnlineOrders(businessId?: string) {
  const expiryHours = onlineOrderExpiryHours();
  const cutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000);
  const orders = await prisma.onlineOrder.findMany({
    take: 100,
    orderBy: { createdAt: 'asc' },
    where: {
      ...(businessId ? { businessId } : {}),
      status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'] },
      paymentStatus: { not: 'PAID' },
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      storeId: true,
      lines: {
        select: {
          productId: true,
          qtyBase: true,
        },
      },
    },
  });

  let expired = 0;
  const errors: Array<{ orderId: string; message: string }> = [];

  for (const order of orders) {
    try {
      const didExpire = await prisma.$transaction(async (tx) => {
        const result = await tx.onlineOrder.updateMany({
          where: {
            id: order.id,
            status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'] },
            paymentStatus: { not: 'PAID' },
          },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'EXPIRED',
            fulfillmentStatus: 'CANCELLED',
            cancelledAt: new Date(),
          },
        });

        if (result.count === 0) {
          return false;
        }

        await restoreOnlineOrderInventoryReservation({
          storeId: order.storeId,
          lines: order.lines,
          tx,
        });

        const updated = await tx.onlineOrder.findUnique({
          where: { id: order.id },
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            paidAt: true,
            fulfilledAt: true,
            paymentConfirmedAt: true,
            preparingAt: true,
            readyAt: true,
            collectedAt: true,
            cancelledAt: true,
          },
        });

        if (updated) {
          await notifyOrderStatusChange(tx, buildOnlineOrderStatusSnapshot(updated));
        }

        return true;
      });

      if (didExpire) {
        expired += 1;
        await enqueueOrderNotificationSafe({ orderId: order.id, eventType: 'CANCELLED' });
      }
    } catch (error) {
      errors.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : 'Failed to expire order.',
      });
    }
  }

  return { expired, errors };
}
