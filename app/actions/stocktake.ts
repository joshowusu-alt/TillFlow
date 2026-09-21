'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { requireSelectedStoreContext, formAction, safeAction, err, type ActionResult } from '@/lib/action-utils';
import { formString } from '@/lib/form-helpers';
import { audit } from '@/lib/audit';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { getFeatures } from '@/lib/features';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';
import {
  createInventoryDecrease,
  InventoryDecreaseError,
} from '@/lib/services/inventory-decrease';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { displayDocumentNumber, resolveStocktakeLineState } from '@/lib/reliability/walkthrough-contracts';
import {
  assertStocktakeReadyToComplete,
  submittedCountsFromPayload,
  type SubmittedStocktakeCount,
} from '@/app/(protected)/inventory/stocktake/stocktake-state';

const STOCKTAKE_SURPLUS_PENDING_REVIEW = 'SURPLUS_PENDING_REVIEW';

function scopedStocktakeWhere(stocktakeId: string, businessId: string, storeId: string) {
  return {
    id: stocktakeId,
    storeId,
    store: { businessId },
  };
}

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

function countedLineWrite(
  countedBase: number,
  expectedBase: number,
  userId: string,
  extras: Record<string, unknown> = {},
) {
  return {
    countedBase,
    varianceBase: countedBase - expectedBase,
    countState: 'COUNTED',
    countedAt: new Date(),
    countedByUserId: userId,
    ...extras,
  };
}

/**
 * Start a new stocktake — snapshots current system quantities for all active
 * products so the user can enter physical counts.
 */
export async function createStocktakeAction(formData?: FormData): Promise<void> {
  return formAction(async () => {
    const { user, storeId, businessId } = await requireSelectedStoreContext(
      ['MANAGER', 'OWNER'],
      formData ? formString(formData, 'storeId') : '',
    );
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return err(plan.error);

    const existing = await prisma.stocktake.findFirst({
      where: { storeId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      return err('A stocktake is already in progress. Complete or cancel it first.');
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

    const stocktake = await prisma.$transaction(async (tx) => {
      const transactionNumber = await reserveNextDocumentNumber(tx, businessId, 'stocktake');
      return tx.stocktake.create({
        data: {
          storeId,
          userId: user.id,
          status: 'IN_PROGRESS',
          transactionNumber,
          lines: {
            create: products.map((p) => ({
              productId: p.id,
              expectedBase: p.inventoryBalances[0]?.qtyOnHandBase ?? 0,
              countedBase: 0,
              varianceBase: 0,
              countState: 'UNCOUNTED',
            })),
          },
        },
      });
    });

    audit({
      businessId: user.businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCKTAKE_CREATE',
      entity: 'Stocktake',
      entityId: stocktake.id,
      details: { productCount: products.length, transactionNumber: stocktake.transactionNumber },
    });

    redirect(`/inventory/stocktake?storeId=${encodeURIComponent(storeId)}`);
  }, '/inventory/stocktake');
}

/**
 * Save in-progress counts (partial save). Blank/unsubmitted lines stay UNCOUNTED.
 */
export async function saveStocktakeCountsAction(data: {
  stocktakeId: string;
  storeId: string;
  counts: SubmittedStocktakeCount[];
  clearedLineIds?: string[];
}): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(
      ['MANAGER', 'OWNER'],
      data.storeId,
    );
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const stocktake = await prisma.stocktake.findFirst({
      where: scopedStocktakeWhere(data.stocktakeId, businessId, storeId),
      select: { status: true, storeId: true, lines: { select: { id: true, expectedBase: true } } },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    const submitted = submittedCountsFromPayload(data.counts);
    const expectedById = new Map(stocktake.lines.map((line) => [line.id, line.expectedBase]));
    const submittedIds = new Set(submitted.map((c) => c.lineId));
    const clearedLineIds = (data.clearedLineIds ?? []).filter(
      (lineId) => expectedById.has(lineId) && !submittedIds.has(lineId),
    );

    const writes = [
      ...submitted
        .filter((c) => expectedById.has(c.lineId))
        .map((c) =>
          prisma.stocktakeLine.update({
            where: { id: c.lineId },
            data: countedLineWrite(c.countedBase, expectedById.get(c.lineId) ?? 0, user.id),
          }),
        ),
      ...clearedLineIds.map((lineId) =>
        prisma.stocktakeLine.update({
          where: { id: lineId },
          data: {
            countedBase: 0,
            varianceBase: 0,
            countState: 'UNCOUNTED',
            countedAt: null,
            countedByUserId: null,
          },
        }),
      ),
    ];
    if (writes.length > 0) {
      await prisma.$transaction(writes);
    }

    return { success: true };
  });
}

/**
 * Complete a stocktake.
 * - Shortfalls: Phase 1 inventory decrease (requires rollout flag).
 * - Surpluses: persisted as SURPLUS_PENDING_REVIEW — no inventory/GL post.
 * - UNCOUNTED lines are never treated as zero.
 */
export async function completeStocktakeAction(data: {
  stocktakeId: string;
  storeId: string;
  counts: SubmittedStocktakeCount[];
  reason?: string;
  allowPartial?: boolean;
  partialReason?: string;
}): Promise<ActionResult<{ surplusPendingReview: number; shortfallsAdjusted: number }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(
      ['MANAGER', 'OWNER'],
      data.storeId,
    );
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const stocktake = await prisma.stocktake.findFirst({
      where: scopedStocktakeWhere(data.stocktakeId, businessId, storeId),
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

    const alreadyPosted = stocktake.lines.some((line) => line.adjusted);
    if (alreadyPosted && stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'This stocktake has already been posted.' };
    }

    const submitted = submittedCountsFromPayload(data.counts);
    const submittedByLineId = new Map(submitted.map((c) => [c.lineId, c.countedBase]));

    try {
      assertStocktakeReadyToComplete({
        lines: stocktake.lines.map((line) => ({
          id: line.id,
          countState: line.countState,
          countedAt: line.countedAt,
          countedBase: line.countedBase,
          stocktakeStatus: stocktake.status,
          adjusted: line.adjusted,
        })),
        submittedByLineId,
        allowPartial: data.allowPartial,
        partialReason: data.partialReason ?? data.reason,
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Cannot complete stocktake.' };
    }

    const countedLines = stocktake.lines
      .map((line) => {
        const submittedCount = submittedByLineId.get(line.id);
        const countedBase = submittedCount ?? (
          resolveStocktakeLineState({
            countState: line.countState,
            countedAt: line.countedAt,
            countedBase: line.countedBase,
            stocktakeStatus: stocktake.status,
            adjusted: line.adjusted,
          }) !== 'UNCOUNTED'
            ? line.countedBase
            : null
        );
        if (countedBase === null) return null;
        return { line, countedBase, variance: countedBase - line.expectedBase };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    let shortfallCount = 0;
    let surplusCount = 0;
    for (const row of countedLines) {
      if (row.line.adjusted || row.line.reviewStatus === STOCKTAKE_SURPLUS_PENDING_REVIEW) continue;
      if (row.variance < 0) shortfallCount += 1;
      if (row.variance > 0) surplusCount += 1;
    }

    if (shortfallCount > 0 && !isInventoryDecreasePhase1Enabled()) {
      return {
        success: false,
        error:
          'Stocktake shortfalls require inventory decrease Phase 1. Surplus counts can be saved only after Phase 1 is enabled for shortfall posting, or clear shortfall lines first.',
      };
    }

    const reasonText = (data.reason ?? '').trim();
    const partialReason = (data.partialReason ?? '').trim();
    if ((shortfallCount > 0 || surplusCount > 0) && reasonText.length < 3) {
      return {
        success: false,
        error: 'Enter a reason for the variance before completing this stocktake.',
      };
    }

    // Carry the readable source document on every posted adjustment so the adjustments
    // list shows which stocktake produced it.
    const sourceLabel = displayDocumentNumber('stocktake', stocktake.transactionNumber, stocktake.id);
    const adjustmentReason =
      reasonText.length >= 3
        ? `Stocktake ${sourceLabel}: ${reasonText.slice(0, 200)}`
        : `Stocktake ${sourceLabel} shortfall`;

    let shortfallsAdjusted = 0;
    let surplusPendingReview = 0;
    const affectedProductIds = new Set<string>();

    await prisma.$transaction(
      async (tx) => {
        for (const { line, countedBase, variance } of countedLines) {
          if (line.adjusted || line.reviewStatus === STOCKTAKE_SURPLUS_PENDING_REVIEW) continue;
          if (resolveStocktakeLineState({
            countState: line.countState,
            countedAt: line.countedAt,
            countedBase: line.countedBase,
            stocktakeStatus: stocktake.status,
            adjusted: line.adjusted,
          }) === 'POSTED') {
            continue;
          }

          if (variance === 0) {
            await tx.stocktakeLine.update({
              where: { id: line.id },
              data: countedLineWrite(countedBase, line.expectedBase, user.id, {
                adjusted: false,
                reviewStatus: null,
              }),
            });
            continue;
          }

          if (variance > 0) {
            await tx.stocktakeLine.update({
              where: { id: line.id },
              data: countedLineWrite(countedBase, line.expectedBase, user.id, {
                adjusted: false,
                reviewStatus: STOCKTAKE_SURPLUS_PENDING_REVIEW,
                countState: 'VARIANCE_REVIEWED',
              }),
            });
            surplusPendingReview += 1;
            continue;
          }

          const baseUnitId = line.product.productUnits[0]?.unitId;
          if (!baseUnitId) {
            throw new Error(`No base unit configured for ${line.product.name}`);
          }

          const qtyInUnit = Math.abs(variance);
          try {
            await createInventoryDecrease(
              {
                businessId,
                storeId: stocktake.storeId,
                productId: line.productId,
                unitId: baseUnitId,
                qtyInUnit,
                reasonCode: 'STOCKTAKE_SHORTFALL',
                reason: adjustmentReason,
                idempotencyKey: `stocktake:${data.stocktakeId}:line:${line.id}`,
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
            where: { id: line.id },
            data: countedLineWrite(countedBase, line.expectedBase, user.id, {
              adjusted: true,
              reviewStatus: null,
              countState: 'POSTED',
            }),
          });

          affectedProductIds.add(line.productId);
          shortfallsAdjusted += 1;
        }

        const notesParts = [
          reasonText.length >= 3 ? reasonText.slice(0, 500) : stocktake.notes,
          data.allowPartial && partialReason
            ? `Partial count authorised: ${partialReason.slice(0, 300)}`
            : null,
        ].filter(Boolean);

        await tx.stocktake.update({
          where: { id: data.stocktakeId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            notes: notesParts.join('\n') || stocktake.notes,
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
        allowPartial: Boolean(data.allowPartial),
        partialReason: partialReason || null,
      },
    });

    revalidatePosCatalog(businessId, stocktake.storeId);
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    if (affectedProductIds.size > 0) {
      void checkAndSendLowStockAlert({
        businessId,
        storeId: stocktake.storeId,
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
 * Cancel an in-progress stocktake. Requires a reason. Never silent.
 */
export async function cancelStocktakeAction(data: {
  stocktakeId: string;
  storeId: string;
  reason: string;
}): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(
      ['MANAGER', 'OWNER'],
      data.storeId,
    );
    const plan = await assertGrowthStocktake(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const reason = (data.reason ?? '').trim();
    if (reason.length < 3) {
      return { success: false, error: 'Enter a reason before cancelling this stocktake.' };
    }

    const stocktake = await prisma.stocktake.findFirst({
      where: scopedStocktakeWhere(data.stocktakeId, businessId, storeId),
      select: { status: true, storeId: true },
    });
    if (!stocktake || stocktake.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Stocktake not found or already completed.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.stocktake.update({
        where: { id: data.stocktakeId },
        data: { status: 'CANCELLED', notes: `Cancelled: ${reason.slice(0, 500)}` },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          userId: user.id,
          userName: user.name ?? 'Unknown',
          userRole: user.role,
          action: 'STOCKTAKE_CANCEL',
          entity: 'Stocktake',
          entityId: data.stocktakeId,
          details: JSON.stringify({ reason }),
        },
      });
    });

    return { success: true };
  });
}
