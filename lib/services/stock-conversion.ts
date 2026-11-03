import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { postJournalEntry, ACCOUNT_CODES } from '@/lib/accounting';
import { conversionQuantity, planStockConversion } from '@/lib/stock-conversion';
import { fetchInventoryMap, lockInventoryValues, upsertInventoryBalance } from './shared/inventory-utils';
import { assertMoneyMovementTenantChain, findMoneyIdempotency, hashCanonicalParts, insertMoneyIdempotency, normalizeMoneyIdempotencyKey, replayOrConflict } from './money-idempotency';

export type StockConversionInput = {
  businessId: string; storeId: string; userId: string;
  sourceProductId: string; sourceUnitId: string; sourceQty: number;
  destinationProductId: string; destinationUnitId: string; destinationQty: number;
  expectedCostPence: number; expectedSourceQtyBase: number; expectedDestinationQtyBase: number; note: string; idempotencyKey: string;
};
export type StockConversionResult = { id: string; costPence: number; replayed: boolean };

/** Both stock legs, the inventory-only journal and the audit commit or roll back together. */
export async function createStockConversion(input: StockConversionInput): Promise<StockConversionResult> {
  const key = normalizeMoneyIdempotencyKey(input.idempotencyKey);
  if (!input.sourceProductId || !input.destinationProductId || input.sourceProductId === input.destinationProductId) {
    throw new UserError('Choose two different products. For packs and pieces of one product, use its existing selling units.');
  }
  if (!input.note.trim() || input.note.length > 500) throw new UserError('Describe the conversion in 500 characters or fewer.');
  if (!Number.isSafeInteger(input.expectedCostPence) || input.expectedCostPence < 0) throw new UserError('Review the conversion cost before saving.');
  const hash = hashCanonicalParts([input.businessId, 'STOCK_CONVERSION', input.storeId, input.userId,
    input.sourceProductId, input.sourceUnitId, String(input.sourceQty), input.destinationProductId,
    input.destinationUnitId, String(input.destinationQty), String(input.expectedCostPence), String(input.expectedSourceQtyBase), String(input.expectedDestinationQtyBase), input.note.trim()]);
  return prisma.$transaction(async tx => {
    await assertMoneyMovementTenantChain(tx, input);
    const actor = await tx.user.findFirst({ where: { id: input.userId, businessId: input.businessId, role: { in: ['OWNER', 'MANAGER'] }, active: true }, select: { id: true, name: true, role: true } });
    if (!actor) throw new UserError('Only an active owner or manager can convert stock.');
    const ids = [input.sourceProductId, input.destinationProductId];
    await lockInventoryValues(tx, input.storeId, ids);
    const existing = await findMoneyIdempotency(tx as any, input.businessId, key);
    if (existing) {
      replayOrConflict(existing, { payloadHash: hash, commandKind: 'STOCK_CONVERSION' });
      return { ...JSON.parse(existing.resultJson), replayed: true } as StockConversionResult;
    }
    const products = await tx.product.findMany({ where: { id: { in: ids }, businessId: input.businessId, active: true }, select: {
      id: true, name: true, productUnits: { select: { unitId: true, conversionToBase: true, unit: { select: { name: true } } } },
    } });
    const source = products.find(p => p.id === input.sourceProductId);
    const destination = products.find(p => p.id === input.destinationProductId);
    if (!source || !destination) throw new UserError('Choose active products belonging to this business.');
    const fromUnit = source.productUnits.find(u => u.unitId === input.sourceUnitId);
    const toUnit = destination.productUnits.find(u => u.unitId === input.destinationUnitId);
    if (!fromUnit || !toUnit) throw new UserError('Choose a valid unit for each product.');
    let fromQty: number; let toQty: number; let plan: ReturnType<typeof planStockConversion>;
    const inventory = await fetchInventoryMap(input.storeId, ids, tx);
    const fromBefore = inventory.get(source.id) ?? null;
    const toBefore = inventory.get(destination.id) ?? null;
    try {
      fromQty = conversionQuantity(input.sourceQty, fromUnit.conversionToBase);
      toQty = conversionQuantity(input.destinationQty, toUnit.conversionToBase);
      if (fromQty !== input.expectedSourceQtyBase || toQty !== input.expectedDestinationQtyBase) throw new Error('Product units changed. Search and select both products again before saving.');
      plan = planStockConversion(fromBefore, toBefore, fromQty, toQty);
    } catch (error) { throw new UserError(error instanceof Error ? error.message : 'Review the stock quantities and costs.'); }
    if (plan.costPence !== input.expectedCostPence) throw new UserError('Source stock cost changed. Search and select the source again to review the latest cost.');
    const id = randomUUID();
    for (const [productId, value] of [[source.id, plan.sourceAfter], [destination.id, plan.destinationAfter]] as const) {
      await upsertInventoryBalance(tx, input.storeId, productId, value.qtyOnHandBase, value.avgCostBasePence, value);
    }
    await tx.stockMovement.createMany({ data: [
      { productId: source.id, qtyBase: -fromQty, beforeQtyBase: fromBefore!.qtyOnHandBase, afterQtyBase: plan.sourceAfter.qtyOnHandBase, unitCostBasePence: Math.round(plan.costPence / fromQty), valuePence: -plan.costPence, type: 'CONVERSION_OUT' },
      { productId: destination.id, qtyBase: toQty, beforeQtyBase: toBefore?.qtyOnHandBase ?? 0, afterQtyBase: plan.destinationAfter.qtyOnHandBase, unitCostBasePence: Math.round(plan.costPence / toQty), valuePence: plan.costPence, type: 'CONVERSION_IN' },
    ].map(leg => ({ ...leg, storeId: input.storeId, userId: input.userId, referenceType: 'STOCK_CONVERSION', referenceId: id, costBasis: plan.costBasis })) });
    // Product inventory changes form; the business inventory account and P&L do not change.
    await postJournalEntry({ businessId: input.businessId, description: `Stock conversion: ${source.name} → ${destination.name}`,
      referenceType: 'STOCK_CONVERSION', referenceId: id, prismaClient: tx as any,
      lines: [
        { accountCode: ACCOUNT_CODES.inventory, creditPence: plan.costPence, memo: `Used: ${source.name}` },
        { accountCode: ACCOUNT_CODES.inventory, debitPence: plan.costPence, memo: `Produced: ${destination.name}` },
      ],
    });
    await tx.auditLog.create({ data: { businessId: input.businessId, userId: actor.id, userName: actor.name, userRole: actor.role,
      action: 'STOCK_CONVERSION', entity: 'StockConversion', entityId: id,
      beforeState: JSON.stringify({ source: fromBefore, destination: toBefore }),
      afterState: JSON.stringify({ source: plan.sourceAfter, destination: plan.destinationAfter }),
      reason: input.note.trim(), details: JSON.stringify({ ...input, idempotencyKey: key, sourceName: source.name, destinationName: destination.name, sourceUnitName: fromUnit.unit.name, destinationUnitName: toUnit.unit.name,
        sourceQtyBase: fromQty, destinationQtyBase: toQty, costPence: plan.costPence, costBasis: plan.costBasis, sourceCostMethod: plan.sourceCostMethod, destinationValueIncomplete: plan.destinationValueIncomplete }),
    } });
    const result = { id, costPence: plan.costPence, replayed: false };
    await insertMoneyIdempotency(tx as any, { businessId: input.businessId, key, payloadHash: hash, commandKind: 'STOCK_CONVERSION', resultJson: JSON.stringify(result) });
    return result;
  }, { maxWait: 5000, timeout: 15000 });
}
