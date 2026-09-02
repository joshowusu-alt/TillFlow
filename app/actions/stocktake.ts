'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessStoreContext, safeAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { getFeatures } from '@/lib/features';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';
import {
  createInventoryDecrease,
  InventoryDecreaseError,
} from '@/lib/services/inventory-decrease';

const STOCKTAKE_SURPLUS_PENDING_REVIEW = 'SURPLUS_PENDING_REVIEW';

async function assertGrowthStocktake(businessId: string): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, mode: true, storeMode: true },
  });
  if (!business) return { allowed: false, error: 'Business not found.' };
  const features = getFeatures(
    (business.plan as any) ?? (business.mode as any),
    business.storeMode as any,
  );
  if (!features.advancedOps) {
    return { allowed: false, error: 'Stocktake is available on Growth and Pro.' };
  }
  return { allowed: true };
}

/**
 * Start a new stocktake — snapshots current system quantities for all active
 * products so the user can enter physical counts.
 */
export async function createStocktakeAction(): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, storeId, businessId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

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

    audit({
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
    const { businessId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

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
 * Complete a stocktake.
 * - Shortfalls: Phase 1 inventory decrease (requires rollout flag).
 * - Surpluses: persisted as SURPLUS_PENDING_REVIEW — no inventory/GL post.
 */
export async function completeStocktakeAction(data: {
  stocktakeId: string;
  counts: { lineId: string; countedBase: number }[];
  reason?: string;
}): Promise<ActionResult<{ surplusPendingReview: number; shortfallsAdjusted: number }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const stocktake = await prisma.stocktake.findUnique({
      where: { id: data.stocktakeId },
      include: {
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productUnits: {
                  where: { isBaseUnit: true },
                  select: { unitId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    let shortfallCount = 0;
    let surplusCount = 0;
    for (const count of data.counts) {
      const line = stocktake.lines.find((l) => l.id === count.lineId);
      if (!line || line.adjusted || line.reviewStatus === STOCKTAKE_SURPLUS_PENDING_REVIEW) continue;
      const variance = count.countedBase - line.expectedBase;
      if (variance < 0) shortfallCount += 1;
      if (variance > 0) surplusCount += 1;
    }

    if (shortfallCount > 0 && !isInventoryDecreasePhase1Enabled()) {
      return {
        success: false,
        error:
          'Stocktake shortfalls require inventory decrease Phase 1. Surplus counts can be saved only after Phase 1 is enabled for shortfall posting, or clear shortfall lines first.',
      };
    }

    const reasonText = (data.reason ?? '').trim();
    if ((shortfallCount > 0 || surplusCount > 0) && reasonText.length < 3) {
      return {
        success: false,
        error: 'Enter a reason for the variance before completing this stocktake.',
      };
    }

    const adjustmentReason =
      reasonText.length >= 3
        ? `Stocktake: ${reasonText.slice(0, 200)}`
        : 'Stocktake shortfall';

    let shortfallsAdjusted = 0;
    let surplusPendingReview = 0;
    const affectedProductIds = new Set<string>();

    await prisma.$transaction(
      async (tx) => {
        for (const count of data.counts) {
          const line = stocktake.lines.find((l) => l.id === count.lineId);
          if (!line) continue;
          if (line.adjusted || line.reviewStatus === STOCKTAKE_SURPLUS_PENDING_REVIEW) continue;

          const variance = count.countedBase - line.expectedBase;

          if (variance === 0) {
            await tx.stocktakeLine.update({
              where: { id: count.lineId },
              data: {
                countedBase: count.countedBase,
                varianceBase: 0,
                adjusted: false,
                reviewStatus: null,
              },
            });
            continue;
          }

          if (variance > 0) {
            // Persist surplus for review — do not post inventory or journal.
            await tx.stocktakeLine.update({
              where: { id: count.lineId },
              data: {
                countedBase: count.countedBase,
                varianceBase: variance,
                adjusted: false,
                reviewStatus: STOCKTAKE_SURPLUS_PENDING_REVIEW,
              },
            });
            surplusPendingReview += 1;
            continue;
          }

          // Shortfall: Phase 1 decrease.
          const baseUnitId = line.product.productUnits[0]?.unitId;
          if (!baseUnitId) {
            throw new Error(`No base unit configured for ${line.product.name}`);
          }

          const qtyInUnit = Math.abs(variance);
          try {
            await createInventoryDecrease(
              {
                businessId,
                storeId,
                productId: line.productId,
                unitId: baseUnitId,
                qtyInUnit,
                reasonCode: 'STOCKTAKE_SHORTFALL',
                reason: adjustmentReason,
                idempotencyKey: `stocktake:${data.stocktakeId}:line:${count.lineId}`,
                userId: user.id,
                userName: user.name ?? 'Unknown',
                userRole: user.role,
              },
              tx,
            );
          } catch (error) {
            if (error instanceof InventoryDecreaseError) {
              throw new Error(`${line.product.name}: ${error.message}`);
            }
            throw error;
          }

          await tx.stocktakeLine.update({
            where: { id: count.lineId },
            data: {
              countedBase: count.countedBase,
              varianceBase: variance,
              adjusted: true,
              reviewStatus: null,
            },
          });

          affectedProductIds.add(line.productId);
          shortfallsAdjusted += 1;
        }

        await tx.stocktake.update({
          where: { id: data.stocktakeId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            notes: reasonText.length >= 3 ? reasonText.slice(0, 500) : stocktake.notes,
          },
        });
      },
      { timeout: 30000, maxWait: 5000 },
    );

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCKTAKE_COMPLETE',
      entity: 'Stocktake',
      entityId: data.stocktakeId,
      details: {
        totalLines: stocktake.lines.length,
        shortfallsAdjusted,
        surplusPendingReview,
        reason: reasonText || null,
      },
    });

    revalidatePosCatalog(businessId, storeId);
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    if (affectedProductIds.size > 0) {
      void checkAndSendLowStockAlert({
        businessId,
        storeId,
        productIds: Array.from(affectedProductIds),
      }).catch(() => {});
    }

    return {
      success: true,
      data: { surplusPendingReview, shortfallsAdjusted },
    };
  });
}

/**
 * Cancel an in-progress stocktake.
 */
export async function cancelStocktakeAction(
  stocktakeId: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const { businessId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

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
