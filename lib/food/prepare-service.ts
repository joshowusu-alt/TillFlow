import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { isFoodBusiness } from '@/lib/food/business';
import { preparedPortionReceipt } from '@/lib/food/prepare-portions';
import { lockInventoryValues, upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';

/**
 * Add cooked portions to a counted dish.
 * Uses preparedPortionReceipt, which increases the count and writes a
 * FOOD_PREPARATION movement. It does not post a journal, so the cook is not
 * income (4100) and not a new opening balance.
 */
export async function addPreparedPortions(input: {
  businessId: string;
  storeId: string;
  productId: string;
  userId: string;
  qty: number;
  note?: string | null;
  idempotencyKey?: string | null;
}) {
  const qty = Math.floor(Number(input.qty));
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
    select: { id: true, stockMode: true, product: { select: { name: true } } },
  });
  if (!dish) throw new UserError('Dish not found.');
  if (dish.stockMode !== 'COUNTED') {
    throw new UserError(`${dish.product.name} is not counted. Switch it on or off instead of adding portions.`);
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.foodPreparation.findUnique({
        where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey } },
      });
      if (existing) return existing;
    }
    await lockInventoryValues(tx, store.id, [input.productId]);
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
    return row;
  });
}
