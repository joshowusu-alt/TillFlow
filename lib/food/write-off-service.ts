import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { ensureInventoryDecreaseAccounts } from '@/lib/accounting-inventory-decrease-accounts';
import { assertAccount5100SafeForInventoryLoss } from '@/lib/accounting-inventory-loss-5100';
import { isFoodBusiness } from '@/lib/food/business';
import { applyLeftoverQuantity, isLeftoverReasonCode, leftoverWriteOffValuePence } from '@/lib/food/leftover-write-off';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { lockInventoryValues, upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';

/**
 * Record cooked portions thrown away.
 * Quantity leaves the count. When a cost per portion is set, the money follows
 * the existing waste posting: Dr 5100 Inventory Loss, Cr 1200 Inventory.
 * When no cost is set, the count changes and no journal is posted.
 */
export async function writeOffCookedPortions(input: {
  businessId: string;
  storeId: string;
  productId: string;
  userId: string;
  userRole: string;
  qty: number;
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
  const valuePence = leftoverWriteOffValuePence(input.qty, dish.costPerPortionPence);
  const qty = Math.floor(input.qty);
  const reason = (input.note?.trim() || (input.reasonCode === 'SPOILED' ? 'Spoiled' : 'End-of-day leftover')).slice(0, 240);
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.stockAdjustment.findUnique({
        where: { storeId_idempotencyKey: { storeId: store.id, idempotencyKey } },
      });
      if (existing) return { id: existing.id, qty: Math.abs(existing.qtyBase), valuePence: existing.valuePence ?? 0, replayed: true };
    }
    await lockInventoryValues(tx, store.id, [input.productId]);
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
        unitCostBasePence: dish.costPerPortionPence,
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
        unitCostBasePence: dish.costPerPortionPence,
        valuePence: valuePence === 0 ? 0 : -valuePence,
        type: 'ADJUSTMENT',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId,
      },
    });
    if (valuePence > 0) {
      await assertAccount5100SafeForInventoryLoss(tx, input.businessId);
      const accountMap = await ensureInventoryDecreaseAccounts(input.businessId, tx);
      await postJournalEntry({
        businessId: input.businessId,
        description: `Cooked leftover ${created.id}`,
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        lines: [
          { accountCode: ACCOUNT_CODES.inventoryLoss, debitPence: valuePence },
          { accountCode: ACCOUNT_CODES.inventory, creditPence: valuePence },
        ],
        prismaClient: tx as never,
        accountMap,
      });
    }
    return { id: created.id, qty, valuePence, replayed: false };
  });
}
