import { prisma } from '@/lib/prisma';
import type { FoodRecordKind } from './undo-service';

export async function loadFoodRecordHistory(input: {
  businessId: string; storeId: string; productId?: string; timeZone: string;
}) {
  const where = { businessId: input.businessId, storeId: input.storeId };
  const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const records = input.productId
    ? await prisma.foodPreparation.findMany({ where: { ...where, productId: input.productId }, orderBy, take: 30 })
    : await prisma.foodIngredientUsage.findMany({ where, orderBy, take: 30 });
  const userIds = records.flatMap(row => row.undoneById ? [row.undoneById] : []);
  const users = userIds.length ? await prisma.user.findMany({
    where: { businessId: input.businessId, id: { in: userIds } }, select: { id: true, name: true },
  }) : [];
  const names = new Map(users.map(user => [user.id, user.name]));
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: input.timeZone });
  const kind: FoodRecordKind = input.productId ? 'FOOD_PREPARATION' : 'FOOD_INGREDIENT_USAGE';
  const moves = !input.productId && records.length ? await prisma.stockMovement.findMany({
    where: { storeId: input.storeId, referenceType: kind, type: 'FOOD_INGREDIENT_USAGE', referenceId: { in: records.map(row => row.id) } },
    select: { referenceId: true, qtyBase: true, product: { select: { name: true } } },
  }) : [];
  return records.map(row => ({
    id: row.id, kind,
    label: 'qtyBase' in row ? `${row.qtyBase} portions cooked` :
      moves.filter(move => move.referenceId === row.id).map(move => `${move.product.name} × ${-move.qtyBase}`).join(', ') || 'Ingredients used',
    createdAt: date.format(row.createdAt),
    undoneAt: row.undoneAt ? date.format(row.undoneAt) : null,
    undoneBy: row.undoneById ? names.get(row.undoneById) ?? row.undoneById : null,
    reason: row.undoReason,
  }));
}
