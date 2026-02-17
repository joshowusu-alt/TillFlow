import { prisma } from '@/lib/prisma';
import { resolveAvgCost, upsertInventoryBalance } from './shared';

export async function requestStockTransfer(input: {
  businessId: string;
  requestedByUserId: string;
  fromStoreId: string;
  toStoreId: string;
  reason?: string | null;
  lines: { productId: string; qtyBase: number }[];
}) {
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
    if (!Number.isFinite(line.qtyBase) || line.qtyBase <= 0) {
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
  const sourceBalances = await prisma.inventoryBalance.findMany({
    where: { storeId: transfer.fromStoreId, productId: { in: productIds } },
    select: { productId: true, qtyOnHandBase: true, avgCostBasePence: true },
  });
  const sourceBalanceMap = new Map(sourceBalances.map((balance) => [balance.productId, balance]));

  for (const line of transfer.lines) {
    const source = sourceBalanceMap.get(line.productId);
    const available = source?.qtyOnHandBase ?? 0;
    if (available < line.qtyBase) {
      throw new Error(
        `Insufficient stock in source branch for product ${line.productId}. Available ${available}, requested ${line.qtyBase}.`
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const line of transfer.lines) {
      const source = sourceBalanceMap.get(line.productId)!;
      const sourceBefore = source.qtyOnHandBase;
      const sourceAfter = sourceBefore - line.qtyBase;
      const avgCost = resolveAvgCost(new Map([[line.productId, source]]), line.productId, source.avgCostBasePence);

      await upsertInventoryBalance(tx, transfer.fromStoreId, line.productId, sourceAfter, avgCost);

      const targetExisting = await tx.inventoryBalance.findFirst({
        where: { storeId: transfer.toStoreId, productId: line.productId },
        select: { qtyOnHandBase: true, avgCostBasePence: true },
      });
      const targetBefore = targetExisting?.qtyOnHandBase ?? 0;
      const targetCost = targetExisting?.avgCostBasePence ?? avgCost;
      const targetAfter = targetBefore + line.qtyBase;
      await upsertInventoryBalance(tx, transfer.toStoreId, line.productId, targetAfter, targetCost);

      await tx.stockMovement.createMany({
        data: [
          {
            storeId: transfer.fromStoreId,
            productId: line.productId,
            qtyBase: -line.qtyBase,
            beforeQtyBase: sourceBefore,
            afterQtyBase: sourceAfter,
            unitCostBasePence: avgCost,
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
            unitCostBasePence: targetCost,
            type: 'TRANSFER_IN',
            referenceType: 'STOCK_TRANSFER',
            referenceId: transfer.id,
            userId: approver.id,
          },
        ],
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
