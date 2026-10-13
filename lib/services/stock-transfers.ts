import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { resolveAvgCost, upsertInventoryBalance } from './shared';
import { fetchInventoryMap, lockInventoryValues } from './shared/inventory-utils';
import { issueStockValue, receiveStockValue, INVENTORY_VALUE_V1 } from '@/lib/inventory-value';

export async function requestStockTransfer(input: {
  businessId: string;
  requestedByUserId: string;
  fromStoreId: string;
  toStoreId: string;
  reason?: string | null;
  lines: { productId: string; qtyBase: number }[];
}) {
  if (!input.fromStoreId || input.fromStoreId === 'ALL' || !input.toStoreId || input.toStoreId === 'ALL') {
    throw new Error('Transfer source and destination must be specific authorised branches.');
  }
  if (input.fromStoreId === input.toStoreId) {
    throw new Error('Source and destination branches must be different.');
  }
  if (!input.lines.length) {
    throw new Error('Add at least one transfer line.');
  }

  const [fromStore, toStore] = await Promise.all([
    prisma.store.findFirst({
      where: { id: input.fromStoreId, businessId: input.businessId },
      select: { id: true },
    }),
    prisma.store.findFirst({
      where: { id: input.toStoreId, businessId: input.businessId },
      select: { id: true },
    }),
  ]);

  if (!fromStore || !toStore) {
    throw new Error('Invalid branch selection for transfer.');
  }

  const products = await prisma.product.findMany({
    where: {
      businessId: input.businessId,
      id: { in: input.lines.map((line) => line.productId) },
    },
    select: { id: true },
  });
  const validProductIds = new Set(products.map((product) => product.id));

  for (const line of input.lines) {
    if (!validProductIds.has(line.productId)) {
      throw new Error('Transfer contains an unknown product.');
    }
    if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }
  }

  return prisma.stockTransfer.create({
    data: {
      businessId: input.businessId,
      fromStoreId: input.fromStoreId,
      toStoreId: input.toStoreId,
      requestedByUserId: input.requestedByUserId,
      reason: input.reason ?? null,
      status: 'PENDING',
      lines: {
        create: input.lines.map((line) => ({
          productId: line.productId,
          qtyBase: line.qtyBase,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function approveAndCompleteStockTransfer(input: {
  businessId: string;
  transferId: string;
  approvedByUserId: string;
}) {
  const approver = await prisma.user.findFirst({
    where: {
      id: input.approvedByUserId,
      businessId: input.businessId,
      active: true,
      role: { in: ['MANAGER', 'OWNER'] },
    },
    select: { id: true },
  });
  if (!approver) {
    throw new Error('Transfer approver is invalid.');
  }

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: input.transferId, businessId: input.businessId },
    include: {
      lines: true,
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
    },
  });

  if (!transfer) {
    throw new Error('Transfer not found.');
  }
  if (transfer.status !== 'PENDING') {
    throw new Error('Only pending transfers can be approved.');
  }

  const productIds = transfer.lines.map((line) => line.productId);
  return prisma.$transaction(async (tx) => {
    for (const storeId of [transfer.fromStoreId, transfer.toStoreId].sort()) await lockInventoryValues(tx, storeId, productIds);
    const current = await tx.stockTransfer.findFirst({ where: { id: transfer.id, businessId: input.businessId }, select: { status: true } });
    if (current?.status !== 'PENDING') throw new Error('Only pending transfers can be approved.');
    const sourceBalanceMap = await fetchInventoryMap(transfer.fromStoreId, productIds, tx);
    let totalTransferCostPence = 0;

    for (const line of transfer.lines) {
      const source = sourceBalanceMap.get(line.productId);
      if (!source || source.qtyOnHandBase < line.qtyBase) throw new Error('Insufficient stock in source branch.');
      const sourceBefore = source.qtyOnHandBase;
      const sourceAfter = sourceBefore - line.qtyBase;
      const avgCost = resolveAvgCost(new Map([[line.productId, source]]), line.productId, source.avgCostBasePence);
      const issued = issueStockValue(source, line.qtyBase, avgCost);
      totalTransferCostPence += issued.costPence;

      await upsertInventoryBalance(tx, transfer.fromStoreId, line.productId, sourceAfter, issued.after.avgCostBasePence, issued.after);
      sourceBalanceMap.set(line.productId, issued.after);

      const targetExisting = await tx.inventoryBalance.findFirst({
        where: { storeId: transfer.toStoreId, productId: line.productId },
        select: { qtyOnHandBase: true, avgCostBasePence: true, knownValuePence: true, unvaluedQtyBase: true },
      });
      const targetBefore = targetExisting?.qtyOnHandBase ?? 0;
      const targetExistingCost = targetExisting?.avgCostBasePence ?? 0;
      const targetAfter = targetBefore + line.qtyBase;

      // Weighted-average blend at the destination. Without this the destination
      // keeps its old WAC even after a large transfer-in lands at a different
      // cost — which is the common "cost > selling price even without changes"
      // pattern in multi-store setups.
      // Edge cases:
      //   - destination has no prior stock           → use source cost
      //   - destination had stock but no recorded cost → use source cost
      //   - source cost is 0/unknown                 → keep destination cost
      let blendedTargetCost: number;
      if (targetBefore <= 0 || targetExistingCost <= 0) {
        blendedTargetCost = avgCost;
      } else if (avgCost <= 0) {
        blendedTargetCost = targetExistingCost;
      } else if (targetAfter <= 0) {
        blendedTargetCost = targetExistingCost;
      } else {
        blendedTargetCost = Math.round(
          (targetBefore * targetExistingCost + line.qtyBase * avgCost) / targetAfter,
        );
      }

      const received = receiveStockValue(targetExisting ?? undefined, line.qtyBase, issued.costBasis === INVENTORY_VALUE_V1 ? issued.costPence : null);
      await upsertInventoryBalance(tx, transfer.toStoreId, line.productId, targetAfter, issued.costBasis === INVENTORY_VALUE_V1 ? received.avgCostBasePence : blendedTargetCost, received);

      await tx.stockMovement.createMany({
        data: [
          {
            storeId: transfer.fromStoreId,
            productId: line.productId,
            qtyBase: -line.qtyBase,
            beforeQtyBase: sourceBefore,
            afterQtyBase: sourceAfter,
            unitCostBasePence: avgCost,
            valuePence: issued.costBasis === INVENTORY_VALUE_V1 ? -issued.costPence : null,
            costBasis: issued.costBasis,
            type: 'TRANSFER_OUT',
            referenceType: 'STOCK_TRANSFER',
            referenceId: transfer.id,
            userId: approver.id,
          },
          {
            storeId: transfer.toStoreId,
            productId: line.productId,
            qtyBase: line.qtyBase,
            beforeQtyBase: targetBefore,
            afterQtyBase: targetAfter,
            // Record the cost of the inbound stock itself (source WAC), not the
            // post-blend destination WAC — the movement reflects what arrived.
            unitCostBasePence: avgCost,
            valuePence: issued.costBasis === INVENTORY_VALUE_V1 ? issued.costPence : null,
            costBasis: issued.costBasis,
            type: 'TRANSFER_IN',
            referenceType: 'STOCK_TRANSFER',
            referenceId: transfer.id,
            userId: approver.id,
          },
        ],
      });
    }

    if (totalTransferCostPence > 0) {
      await postJournalEntry({
        businessId: input.businessId,
        description: `Stock transfer ${transfer.id}`,
        referenceType: 'STOCK_TRANSFER',
        referenceId: transfer.id,
        lines: [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: totalTransferCostPence },
          { accountCode: ACCOUNT_CODES.inventory, creditPence: totalTransferCostPence },
        ],
        prismaClient: tx as any,
      });
    }

    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        approvedByUserId: approver.id,
        status: 'COMPLETED',
        approvedAt: new Date(),
        completedAt: new Date(),
      },
      include: {
        lines: true,
        fromStore: { select: { id: true, name: true } },
        toStore: { select: { id: true, name: true } },
      },
    });
  });
}
