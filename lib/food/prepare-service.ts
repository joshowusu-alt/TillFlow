import { issueIngredients, type Ingredient } from './ingredient-costs';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { isFoodBusiness } from '@/lib/food/business';
import { preparedPortionReceipt } from '@/lib/food/prepare-portions';
import { lockInventoryValues, upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';

export async function addPreparedPortions(input: {
  businessId: string;
  storeId: string;
  productId: string;
  userId: string;
  qty: number;
  sizeId?: string;
  note?: string | null;
  idempotencyKey?: string | null;
}) {
  const qty = Number(input.qty);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 500) {
    throw new UserError('Enter between 1 and 500 cooked portions.');
  }
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { businessCategory: true },
  });
  if (!isFoodBusiness(business?.businessCategory)) {
    throw new UserError('Cooked portions are only for a food business.');
  }
  const store = await prisma.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) throw new UserError('Choose a branch for these portions.');
  const dish = await prisma.foodDish.findFirst({
    where: { businessId: input.businessId, productId: input.productId },
    select: { id: true, stockMode: true, recipeJson: true, sizes: { select: { id: true, recipeJson: true } }, product: { select: { name: true } } },
  });
  if (!dish) throw new UserError('Dish not found.');
  const size = dish.sizes.find(row => row.id === input.sizeId);
  if (dish.sizes.length && !size) throw new UserError('Choose the size you cooked.');
  const rows: Ingredient[] = JSON.parse((size ? size.recipeJson : dish.recipeJson) ?? '[]');
  if (dish.stockMode !== 'COUNTED') {
    throw new UserError(`${dish.product.name} is not counted. Switch it on or off instead of adding portions.`);
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  return prisma.$transaction(async (tx) => {
    await lockInventoryValues(tx, store.id, [input.productId, ...rows.map(row => row.productId)]);
    if (idempotencyKey) {
      const existing = await tx.foodPreparation.findUnique({
        where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey } },
      });
      if (existing) return existing;
    }
    const balance = await tx.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: input.productId } },
    });
    const before = balance
      ? {
          qtyOnHandBase: balance.qtyOnHandBase,
          avgCostBasePence: balance.avgCostBasePence,
          knownValuePence: balance.knownValuePence,
          unvaluedQtyBase: balance.unvaluedQtyBase,
        }
      : undefined;
    const receipt = preparedPortionReceipt(before, qty);
    await upsertInventoryBalance(
      tx,
      store.id,
      input.productId,
      receipt.after.qtyOnHandBase,
      receipt.after.avgCostBasePence,
      receipt.after,
    );
    const row = await tx.foodPreparation.create({
      data: {
        businessId: input.businessId,
        storeId: store.id,
        productId: input.productId,
        qtyBase: qty,
        note: input.note?.trim().slice(0, 200) || null,
        userId: input.userId,
        idempotencyKey,
      },
    });
    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        qtyBase: receipt.movement.qtyBase,
        beforeQtyBase: before?.qtyOnHandBase ?? 0,
        afterQtyBase: receipt.after.qtyOnHandBase,
        unitCostBasePence: null,
        valuePence: receipt.movement.valuePence,
        costBasis: receipt.movement.costBasis,
        type: receipt.movement.type,
        referenceType: 'FOOD_PREPARATION',
        referenceId: row.id,
        userId: input.userId,
      },
    });
    if (!rows.length) return row;
    const value = await issueIngredients(tx, {
      ...input, rows, portions: qty, referenceType: 'FOOD_PREPARATION', referenceId: row.id,
    });
    return tx.foodPreparation.update({
      where: { id: row.id }, data: { costPerPortionPence: Math.round(value / qty) },
    });
  });
}
