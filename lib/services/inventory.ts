import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { resolveAvgCost, upsertInventoryBalance } from './shared';
import { detectInventoryAdjustmentRisk } from './risk-monitor';

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
  if (input.qtyInUnit <= 0) throw new Error('Quantity must be at least 1');

  // ── Parallel batch: all independent lookups at once ───────────
  const [business, store, productUnit] = await Promise.all([
    prisma.business.findUnique({
      where: { id: input.businessId },
      select: { inventoryAdjustmentRiskThresholdBase: true },
    }),
    prisma.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
    prisma.productUnit.findFirst({
      where: {
        productId: input.productId,
        unitId: input.unitId,
        product: { businessId: input.businessId },
      },
      include: { product: true }
    }),
  ]);
  if (!store) throw new Error('Store not found');
  if (!productUnit) throw new Error('Unit not configured for product');

  const qtyBase = input.qtyInUnit * productUnit.conversionToBase;
  const signedQtyBase = input.direction === 'DECREASE' ? -qtyBase : qtyBase;

  const { adjustment, currentAvgCost } = await prisma.$transaction(async (tx) => {
    // Re-read inventory balance INSIDE the transaction to prevent TOCTOU race.
    // In PostgreSQL, this read + the subsequent upsert form an atomic unit within the transaction.
    const inventoryInTx = await tx.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: input.productId } },
      select: { qtyOnHandBase: true, avgCostBasePence: true },
    });
    const onHand = inventoryInTx?.qtyOnHandBase ?? 0;
    const invMap = new Map(
      inventoryInTx
        ? [[input.productId, { qtyOnHandBase: onHand, avgCostBasePence: inventoryInTx.avgCostBasePence }]]
        : []
    );
    const currentAvgCost = resolveAvgCost(invMap, input.productId, productUnit.product.defaultCostBasePence);
    const nextOnHand = onHand + signedQtyBase;
    if (nextOnHand < 0) throw new Error('Adjustment would result in negative stock');

    const created = await tx.stockAdjustment.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        unitId: input.unitId,
        qtyInUnit: input.qtyInUnit,
        qtyBase: signedQtyBase,
        direction: input.direction,
        reason: input.reason ?? null,
        userId: input.userId
      }
    });

    await upsertInventoryBalance(tx, store.id, input.productId, nextOnHand, currentAvgCost);

    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        qtyBase: signedQtyBase,
        unitCostBasePence: currentAvgCost,
        type: 'ADJUSTMENT',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId
      }
    });

    return { adjustment: created, currentAvgCost };
  });

  // Journal entry must be awaited — a failure here means inventory and GL diverge permanently
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

  // Risk detection is non-critical — safe to be fire-and-forget
  detectInventoryAdjustmentRisk({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.userId,
    adjustmentId: adjustment.id,
    qtyBase: signedQtyBase,
    thresholdQtyBase: business?.inventoryAdjustmentRiskThresholdBase ?? 50,
  }).catch(() => {});

  return adjustment;
}
