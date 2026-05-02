import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { restoreOnlineOrderInventoryReservation } from '@/lib/services/online-orders';

const DEFAULT_EXPIRY_HOURS = 2;

function getExpiryHours() {
  const value = Number(process.env.ONLINE_ORDER_EXPIRY_HOURS ?? DEFAULT_EXPIRY_HOURS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EXPIRY_HOURS;
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expiryHours = getExpiryHours();
  const cutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000);
  const orders = await prisma.onlineOrder.findMany({
    where: {
      status: 'AWAITING_PAYMENT',
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
            status: 'AWAITING_PAYMENT',
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

        return true;
      });

      if (didExpire) {
        expired += 1;
      }
    } catch (error) {
      errors.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : 'Failed to expire order.',
      });
    }
  }

  return NextResponse.json({ expired, errors });
}

export const runtime = 'nodejs';
