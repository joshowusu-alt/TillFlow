import { prisma } from '@/lib/prisma';

/**
 * Count of online orders that need merchant attention right now: orders
 * awaiting payment confirmation or paid but not yet ready for pickup.
 * Used by the home-screen Quick Access "online orders need attention" card.
 */
export async function countOnlineOrdersNeedingAttention(businessId: string): Promise<number> {
  return prisma.onlineOrder.count({
    where: {
      businessId,
      status: { in: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING'] },
    },
  });
}
