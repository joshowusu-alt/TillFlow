'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { withBusinessStoreContext, safeAction, type ActionResult } from '@/lib/action-utils';
import { createStockAdjustment } from '@/lib/services/inventory';
import { audit } from '@/lib/audit';

/**
 * Start a new stocktake — snapshots current system quantities for all active
 * products so the user can enter physical counts.
 */
export async function createStocktakeAction(): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, storeId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);

    // Prevent multiple in-progress stocktakes
    const existing = await prisma.stocktake.findFirst({
      where: { storeId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      return { success: false, error: 'A stocktake is already in progress. Complete or cancel it first.' };
    }

    const products = await prisma.product.findMany({
      where: { businessId: user.businessId, active: true },
      select: {
        id: true,
        inventoryBalances: {
          where: { storeId },
          select: { qtyOnHandBase: true },
        },
      },
    });

    const stocktake = await prisma.stocktake.create({
      data: {
        storeId,
        userId: user.id,
        status: 'IN_PROGRESS',
        lines: {
          create: products.map((p) => ({
            productId: p.id,
            expectedBase: p.inventoryBalances[0]?.qtyOnHandBase ?? 0,
            countedBase: 0,
            varianceBase: 0,
          })),
        },
      },
    });

    await audit({
      businessId: user.businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCKTAKE_CREATE',
      entity: 'Stocktake',
      entityId: stocktake.id,
      details: { productCount: products.length },
    });

    return { success: true, data: { id: stocktake.id } };
  });
}

/**
 * Save in-progress counts (partial save).
 */
export async function saveStocktakeCountsAction(data: {
  stocktakeId: string;
  counts: { lineId: string; countedBase: number }[];
}): Promise<ActionResult> {
  return safeAction(async () => {
    await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: data.stocktakeId },
      select: { status: true },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    await prisma.$transaction(
      data.counts.map((c) =>
        prisma.stocktakeLine.update({
          where: { id: c.lineId },
          data: {
            countedBase: c.countedBase,
            varianceBase: c.countedBase, // Will be recalculated on complete
          },
        })
      )
    );

    return { success: true };
  });
}

/**
 * Complete a stocktake — apply variances as stock adjustments.
 */
export async function completeStocktakeAction(data: {
  stocktakeId: string;
  counts: { lineId: string; countedBase: number }[];
}): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId, storeId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: data.stocktakeId },
      include: { lines: { include: { product: { select: { id: true, name: true, productUnits: { where: { isBaseUnit: true }, select: { unitId: true } } } } } } },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    // Update all counts and calculate variances
    let adjustedCount = 0;
    for (const count of data.counts) {
      const line = stocktake.lines.find((l) => l.id === count.lineId);
      if (!line) continue;

      const variance = count.countedBase - line.expectedBase;

      await prisma.stocktakeLine.update({
        where: { id: count.lineId },
        data: {
          countedBase: count.countedBase,
          varianceBase: variance,
          adjusted: variance !== 0,
        },
      });

      // Create stock adjustment for non-zero variances
      if (variance !== 0) {
        const baseUnitId = line.product.productUnits[0]?.unitId;
        if (baseUnitId) {
          await createStockAdjustment({
            businessId,
            storeId,
            productId: line.productId,
            unitId: baseUnitId,
            qtyInUnit: Math.abs(variance),
            direction: variance > 0 ? 'INCREASE' : 'DECREASE',
            reason: `Stocktake count adjustment`,
            userId: user.id,
          });
          adjustedCount++;
        }
      }
    }

    await prisma.stocktake.update({
      where: { id: data.stocktakeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCKTAKE_COMPLETE',
      entity: 'Stocktake',
      entityId: data.stocktakeId,
      details: {
        totalLines: stocktake.lines.length,
        adjustedLines: adjustedCount,
      },
    });

    revalidateTag('pos-products');

    return { success: true };
  });
}

/**
 * Cancel an in-progress stocktake.
 */
export async function cancelStocktakeAction(
  stocktakeId: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: stocktakeId },
      select: { status: true },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    await prisma.stocktake.update({
      where: { id: stocktakeId },
      data: { status: 'CANCELLED' },
    });

    return { success: true };
  });
}
