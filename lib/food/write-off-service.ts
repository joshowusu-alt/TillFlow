import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { postFoodCost } from './ingredient-costs';
import { isFoodBusiness } from '@/lib/food/business';
import { applyLeftoverQuantity, isLeftoverReasonCode, leftoverWriteOffValuePence } from '@/lib/food/leftover-write-off';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { lockInventoryValues, upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';

export async function writeOffCookedPortions(input: {
  businessId: string;
  storeId: string;
  productId: string;
  userId: string;
  userRole: string;
  qty: number;
  manualCostPence?: number;
  reasonCode: string;
  note?: string | null;
  idempotencyKey?: string | null;
}) {
  if (input.userRole !== 'OWNER' && input.userRole !== 'MANAGER') {
    throw new UserError('Only an owner or a manager can write off cooked portions.');
  }
  if (!isLeftoverReasonCode(input.reasonCode)) {
    throw new UserError('Choose a reason for the leftover.');
  }
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { businessCategory: true },
  });
  if (!isFoodBusiness(business?.businessCategory)) {
    throw new UserError('Leftovers can only be written off for a food business.');
  }
  const store = await prisma.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) throw new UserError('Choose a branch for this write-off.');
  const dish = await prisma.foodDish.findFirst({
    where: { businessId: input.businessId, productId: input.productId },
    select: {
      stockMode: true,
      costPerPortionPence: true,
      product: { select: { name: true, productUnits: { where: { isBaseUnit: true }, select: { unitId: true } } } },
    },
  });
  if (!dish) throw new UserError('Dish not found.');
  if (dish.stockMode !== 'COUNTED') {
    throw new UserError(`${dish.product.name} is not counted. Mark it sold out instead of writing portions off.`);
  }
  const unitId = dish.product.productUnits[0]?.unitId;
  if (!unitId) throw new UserError('This dish has no selling unit.');

  const qty = Math.floor(input.qty);
  const reason = (input.note?.trim() || (input.reasonCode === 'SPOILED' ? 'Spoiled' : 'End-of-day leftover')).slice(0, 240);
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await lockInventoryValues(tx, store.id, [input.productId]);
    if (idempotencyKey) {
      const existing = await tx.stockAdjustment.findUnique({
        where: { storeId_idempotencyKey: { storeId: store.id, idempotencyKey } },
      });
      if (existing) return { id: existing.id, qty: Math.abs(existing.qtyBase), valuePence: existing.valuePence ?? 0, replayed: true };
    }
    const batch = await tx.foodPreparation.findFirst({
      where: { businessId: input.businessId, storeId: store.id, productId: input.productId, costPerPortionPence: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const cost = batch?.costPerPortionPence ?? input.manualCostPence ?? dish.costPerPortionPence;
    const valuePence = leftoverWriteOffValuePence(input.qty, cost);
    if (valuePence > 2147483647) throw new UserError('The write-off cost is too large.');
    const balance = await tx.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: input.productId } },
    });
    if (!balance || balance.qtyOnHandBase < qty) {
      throw new UserError('There are not enough portions to write off.');
    }
    const after = applyLeftoverQuantity(
      {
        qtyOnHandBase: balance.qtyOnHandBase,
        avgCostBasePence: balance.avgCostBasePence,
        knownValuePence: balance.knownValuePence,
        unvaluedQtyBase: balance.unvaluedQtyBase,
      },
      qty,
    );
    const transactionNumber = await reserveNextDocumentNumber(tx, input.businessId, 'stock_adjustment');
    const created = await tx.stockAdjustment.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        unitId,
        qtyInUnit: qty,
        qtyBase: -qty,
        direction: 'DECREASE',
        reason,
        reasonCode: input.reasonCode,
        idempotencyKey,
        unitCostBasePence: cost,
        valuePence,
        userId: input.userId,
        transactionNumber,
      },
    });
    await upsertInventoryBalance(tx, store.id, input.productId, after.qtyOnHandBase, after.avgCostBasePence, after);
    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        qtyBase: -qty,
        beforeQtyBase: balance.qtyOnHandBase,
        afterQtyBase: after.qtyOnHandBase,
        unitCostBasePence: cost,
        valuePence: 0,
        type: 'ADJUSTMENT',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId,
      },
    });
    await postFoodCost(tx, {
      businessId: input.businessId, referenceType: 'STOCK_ADJUSTMENT', referenceId: created.id,
      value: valuePence, waste: true,
    });
    return { id: created.id, qty, valuePence, replayed: false };
  });
}
