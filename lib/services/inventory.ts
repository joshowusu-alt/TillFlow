import { Prisma } from '@prisma/client';
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
}, tx?: Prisma.TransactionClient) {
  if (input.qtyInUnit <= 0) throw new Error('Quantity must be at least 1');

  // When an outer transaction client is provided, use it for reads; otherwise use the global client.
  const client = tx ?? prisma;

  // ── Parallel batch: all independent lookups at once ───────────
  const [business, store, productUnit] = await Promise.all([
    client.business.findUnique({
      where: { id: input.businessId },
      select: { inventoryAdjustmentRiskThresholdBase: true },
    }),
    client.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
    client.productUnit.findFirst({
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

  // Core DB writes extracted so they can run inside an existing outer transaction or a new one.
  const doWork = async (txClient: Prisma.TransactionClient) => {
    // Re-read inventory balance INSIDE the transaction to prevent TOCTOU race.
    // In PostgreSQL, this read + the subsequent upsert form an atomic unit within the transaction.
    const inventoryInTx = await txClient.inventoryBalance.findUnique({
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

    const created = await txClient.stockAdjustment.create({
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

    await upsertInventoryBalance(txClient, store.id, input.productId, nextOnHand, currentAvgCost);

    await txClient.stockMovement.create({
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

    // Journal entry runs inside the same transaction — GL and inventory are always in sync
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
      description: `Stock adjustment ${created.id}`,
      referenceType: 'STOCK_ADJUSTMENT',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: txClient as any
    });

    return { adjustment: created, currentAvgCost };
  };

  const { adjustment } = tx
    ? await doWork(tx)
    : await prisma.$transaction(doWork);

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
