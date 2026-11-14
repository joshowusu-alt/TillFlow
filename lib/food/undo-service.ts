import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { UserError } from '@/lib/action-utils';
import { createStockBatchReceipts } from '@/lib/inventory/stock-batch-receipts';
import { receiveStockValue } from '@/lib/inventory-value';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { lockInventoryValues, upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';
import { isFoodBusiness } from './business';
import { recordFoodAudit } from './food-audit';
import { readFoodCostBalance } from './food-cost-balance';
import { applyLeftoverQuantity } from './leftover-write-off';

export type FoodRecordKind = 'FOOD_PREPARATION' | 'FOOD_INGREDIENT_USAGE';

export async function undoFoodRecord(input: {
  businessId: string; storeId: string; userId: string; userRole: string;
  kind: FoodRecordKind; id: string; reason: string;
}) {
  if (!['OWNER', 'MANAGER'].includes(input.userRole)) throw new UserError('Only an owner or manager can undo a food record.');
  if (!['FOOD_PREPARATION', 'FOOD_INGREDIENT_USAGE'].includes(input.kind)) throw new UserError('Choose a food record.');
  const reason = input.reason?.trim();
  if (!reason || reason.length > 240) throw new UserError('Enter a reason of up to 240 characters.');
  const where = { id: input.id, businessId: input.businessId, storeId: input.storeId };
  return prisma.$transaction(async tx => {
    const store = await tx.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { business: { select: { businessCategory: true } } },
    });
    if (!isFoodBusiness(store?.business.businessCategory)) throw new UserError('Undo is available for food businesses only.');
    const cooking = input.kind === 'FOOD_PREPARATION';
    const batch = cooking ? await tx.foodPreparation.findFirst({ where }) : null;
    const record = cooking ? batch : await tx.foodIngredientUsage.findFirst({ where });
    if (!record) throw new UserError('Food record not found at this branch.');
    if (record.undoneAt) throw new UserError('This record has already been undone.');

    const moves = await tx.stockMovement.findMany({
      where: { storeId: input.storeId, referenceType: input.kind, referenceId: input.id, type: 'FOOD_INGREDIENT_USAGE' },
      include: { product: { select: { name: true } } },
    });
    await lockInventoryValues(tx, input.storeId, [...moves.map(move => move.productId), ...(batch ? [batch.productId] : [])]);
    const claim = { where: { ...where, undoneAt: null }, data: { undoneAt: new Date(), undoneById: input.userId, undoReason: reason } };
    const changed = cooking ? await tx.foodPreparation.updateMany(claim) : await tx.foodIngredientUsage.updateMany(claim);
    if (changed.count !== 1) throw new UserError('This record has already been undone.');
    const referenceType = `${input.kind}_UNDO`;

    if (batch) {
      const portionKey = { storeId: input.storeId, productId: batch.productId };
      const [balance, receipt] = await Promise.all([
        tx.inventoryBalance.findUnique({ where: { storeId_productId: portionKey } }),
        tx.stockMovement.findFirst({ where: { ...portionKey, referenceType: input.kind, referenceId: batch.id, type: 'FOOD_PREPARATION' } }),
      ]);
      const laterRemoval = receipt && await tx.stockMovement.findFirst({
        where: { ...portionKey, qtyBase: { lt: 0 }, type: { not: 'FOOD_PREPARATION_UNDO' },
          createdAt: { gte: receipt.createdAt } }, select: { id: true },
      });
      if (!balance || !receipt || balance.qtyOnHandBase < batch.qtyBase || laterRemoval) {
        throw new UserError('This batch can only be undone before portions are sold, reserved, or written off.');
      }
      const after = applyLeftoverQuantity(balance, batch.qtyBase);
      await upsertInventoryBalance(tx, input.storeId, batch.productId, after.qtyOnHandBase, after.avgCostBasePence, after);
      await tx.stockMovement.create({ data: {
        ...portionKey, userId: input.userId, type: referenceType, referenceType, referenceId: input.id,
        qtyBase: -batch.qtyBase, beforeQtyBase: balance.qtyOnHandBase, afterQtyBase: after.qtyOnHandBase,
        valuePence: 0, costBasis: receipt.costBasis,
      } });
    }

    if ((!cooking && !moves.length) || moves.some(move => move.qtyBase >= 0 || move.valuePence == null || move.valuePence > 0)) {
      throw new UserError('The original ingredient movements are incomplete.');
    }
    const valuePence = moves.reduce((sum, move) => sum - (move.valuePence ?? 0), 0);
    if (valuePence > 0) {
      // Serialise with waste credits across branches using the same tenant sequence lock.
      await reserveNextDocumentNumber(tx, input.businessId, 'stock_adjustment');
      const original = await tx.journalEntry.findMany({
        where: { businessId: input.businessId, referenceType: input.kind, referenceId: input.id },
        include: { lines: { include: { account: { select: { code: true } } } } },
      });
      const lines = original[0]?.lines ?? [];
      if (original.length !== 1 || lines.length !== 2 ||
        !lines.some(line => line.account.code === ACCOUNT_CODES.inventory && line.creditPence === valuePence && !line.debitPence) ||
        !lines.some(line => line.account.code === ACCOUNT_CODES.foodCosts && line.debitPence === valuePence && !line.creditPence)) {
        throw new UserError('The original ingredient journal could not be matched.');
      }
      if (await readFoodCostBalance(tx, input.businessId) < valuePence) throw new UserError('There is not enough Food costs balance to undo this record.');
      await postJournalEntry({
        businessId: input.businessId, description: cooking ? 'Undo cooked batch' : 'Undo ingredients used',
        referenceType, referenceId: input.id, prismaClient: tx as never,
        lines: lines.map(line => ({ accountCode: line.account.code, debitPence: line.creditPence, creditPence: line.debitPence })),
      });
    }

    for (const move of moves) {
      const key = { storeId: input.storeId, productId: move.productId };
      const before = await tx.inventoryBalance.findUnique({ where: { storeId_productId: key } });
      if (before && before.qtyOnHandBase < 0) throw new UserError(`Resolve negative stock for ${move.product.name} before undoing this record.`);
      const qty = -move.qtyBase;
      const value = -(move.valuePence ?? 0);
      const after = receiveStockValue(before ?? undefined, qty, value);
      await upsertInventoryBalance(tx, input.storeId, move.productId, after.qtyOnHandBase, after.avgCostBasePence, after);
      await tx.stockMovement.create({ data: {
        ...key, userId: input.userId, type: 'FOOD_INGREDIENT_USAGE_UNDO', referenceType, referenceId: input.id,
        qtyBase: qty, valuePence: value, unitCostBasePence: move.unitCostBasePence, costBasis: move.costBasis,
        beforeQtyBase: before?.qtyOnHandBase ?? 0, afterQtyBase: after.qtyOnHandBase,
      } });
    }
    await createStockBatchReceipts(tx, moves.map(move => ({
      businessId: input.businessId, storeId: input.storeId, productId: move.productId,
      qtyReceivedBase: -move.qtyBase, source: 'FOOD_UNDO', openingReferenceId: input.id,
    })));
    await recordFoodAudit(tx, {
      ...input, reason, action: cooking ? 'FOOD_PREPARATION_UNDO' : 'FOOD_INGREDIENT_USAGE_UNDO',
      entity: cooking ? 'FoodPreparation' : 'FoodIngredientUsage', entityId: input.id,
      valuePence, items: moves.map(move => ({ productId: move.productId, name: move.product.name, qty: -move.qtyBase })),
    });
  });
}
