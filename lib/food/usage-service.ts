import { randomUUID } from 'node:crypto';
import { recordFoodAudit } from './food-audit';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { isFoodBusiness } from './business';
import { issueIngredients, validateIngredients, type Ingredient } from './ingredient-costs';
import { lockInventoryValues } from '@/lib/services/shared/inventory-utils';

export async function recordIngredientUsage(input: {
  businessId: string; storeId: string; userId: string; userRole: string;
  rows: Ingredient[]; idempotencyKey: string; reason?: string;
}) {
  if (!['OWNER', 'MANAGER'].includes(input.userRole)) throw new UserError('Only an owner or manager can record ingredients used.');
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new UserError('Refresh and try again.');
  return prisma.$transaction(async tx => {
    const store = await tx.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { business: { select: { businessCategory: true } } },
    });
    if (!isFoodBusiness(store?.business.businessCategory)) throw new UserError('Choose a branch for this food business.');
    if (!input.rows?.length) throw new UserError('Add at least one ingredient.');
    const names = await validateIngredients(tx, input.businessId, input.rows);
    await lockInventoryValues(tx, input.storeId, input.rows.map(row => row.productId));
    const id = randomUUID();
    const usage = await tx.foodIngredientUsage.upsert({
      where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
      update: {},
      create: { id, businessId: input.businessId, storeId: input.storeId, userId: input.userId, idempotencyKey: input.idempotencyKey },
    });
    if (usage.id !== id) return { replayed: true, value: 0 };
    const value = await issueIngredients(tx, {
      ...input, referenceId: usage.id, referenceType: 'FOOD_INGREDIENT_USAGE', portions: 1,
    });
    await recordFoodAudit(tx, {
      ...input, action: 'FOOD_INGREDIENT_USAGE_CREATE', entity: 'FoodIngredientUsage', entityId: usage.id,
      reason: input.reason?.trim().slice(0, 240) || 'Ingredients used for cooking',
      items: input.rows.map(row => ({ ...row, name: names.get(row.productId)! })), valuePence: value,
    });
    return { replayed: false, value };
  });
}
