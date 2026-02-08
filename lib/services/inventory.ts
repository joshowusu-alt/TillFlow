import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

export async function createStockAdjustment(input: {
  businessId: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  direction: 'INCREASE' | 'DECREASE';
  reason?: string | null;
  userId: string;
}) {
  const productUnit = await prisma.productUnit.findFirst({
    where: { productId: input.productId, unitId: input.unitId },
    include: { product: true }
  });
  if (!productUnit) {
    throw new Error('Unit not configured for product');
  }
  if (input.qtyInUnit <= 0) {
    throw new Error('Quantity must be at least 1');
  }

  const qtyBase = input.qtyInUnit * productUnit.conversionToBase;
  const signedQtyBase = input.direction === 'DECREASE' ? -qtyBase : qtyBase;

  const inventory = await prisma.inventoryBalance.findUnique({
    where: { storeId_productId: { storeId: input.storeId, productId: input.productId } }
  });
  const onHand = inventory?.qtyOnHandBase ?? 0;
  const currentAvgCost =
    inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
      ? inventory.avgCostBasePence
      : productUnit.product.defaultCostBasePence;
  const nextOnHand = onHand + signedQtyBase;
  if (nextOnHand < 0) {
    throw new Error('Adjustment would result in negative stock');
  }

  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await tx.stockAdjustment.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        unitId: input.unitId,
        qtyInUnit: input.qtyInUnit,
        qtyBase: signedQtyBase,
        direction: input.direction,
        reason: input.reason ?? null,
        userId: input.userId
      }
    });

    await tx.inventoryBalance.upsert({
      where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
      update: { qtyOnHandBase: nextOnHand, avgCostBasePence: currentAvgCost },
      create: {
        storeId: input.storeId,
        productId: input.productId,
        qtyOnHandBase: nextOnHand,
        avgCostBasePence: currentAvgCost
      }
    });

    await tx.stockMovement.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        qtyBase: signedQtyBase,
        unitCostBasePence: currentAvgCost,
        type: 'ADJUSTMENT',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId
      }
    });

    return created;
  });

  const adjustmentValue = currentAvgCost * qtyBase;
  const journalLines =
    input.direction === 'DECREASE'
      ? [
          { accountCode: ACCOUNT_CODES.cogs, debitPence: adjustmentValue },
          { accountCode: ACCOUNT_CODES.inventory, creditPence: adjustmentValue }
        ]
      : [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: adjustmentValue },
          { accountCode: ACCOUNT_CODES.cogs, creditPence: adjustmentValue }
        ];

  await postJournalEntry({
    businessId: input.businessId,
    description: `Stock adjustment ${adjustment.id}`,
    referenceType: 'STOCK_ADJUSTMENT',
    referenceId: adjustment.id,
    lines: journalLines
  });

  return adjustment;
}
