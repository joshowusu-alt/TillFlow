import { prisma } from '@/lib/prisma';

// Older product deletions were recorded in the activity log before Product had a deletion marker.
export async function legacyDeletedDishIds(businessId: string, productId?: string) {
  const records = await prisma.auditLog.findMany({
    where: { businessId, action: 'PRODUCT_DELETE', entity: 'Product', entityId: productId ?? { not: null } },
    select: { entityId: true },
    distinct: ['entityId'],
  });
  return records.flatMap(record => record.entityId ? [record.entityId] : []);
}
