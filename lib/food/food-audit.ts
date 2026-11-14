import type { Prisma } from '@prisma/client';

export async function recordFoodAudit(tx: Prisma.TransactionClient, input: {
  businessId: string; storeId: string; userId: string; userRole: string;
  action: 'FOOD_INGREDIENT_USAGE_CREATE' | 'FOOD_INGREDIENT_USAGE_UNDO' | 'FOOD_PREPARATION_UNDO';
  entity: 'FoodIngredientUsage' | 'FoodPreparation'; entityId: string; reason: string;
  items: { productId: string; name: string; qty: number }[]; valuePence: number;
}) {
  const user = await tx.user.findFirstOrThrow({
    where: { id: input.userId, businessId: input.businessId }, select: { name: true },
  });
  await tx.auditLog.create({ data: {
    businessId: input.businessId, branchId: input.storeId, userId: input.userId,
    userName: user.name, userRole: input.userRole, action: input.action,
    entity: input.entity, entityId: input.entityId, reason: input.reason,
    details: JSON.stringify({ storeId: input.storeId, items: input.items, valueCedis: input.valuePence / 100 }),
  } });
}
