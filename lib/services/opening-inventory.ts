/**
 * Record opening inventory at TillFlow cut-over without treating it as a purchase.
 *
 * Valued lines: Dr Inventory (1200) / Cr Opening Balance Equity (3200).
 * Qty-only (missing cost): update on-hand quantity with no journal — value stays incomplete.
 */

import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, ensureChartOfAccounts, postJournalEntry } from '@/lib/accounting';
import { fetchInventoryMap, incrementInventoryBalance } from '@/lib/services/shared/inventory-utils';

export type OpeningInventoryLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  /** Base-unit cost in pence. Omit or 0 = quantity only, no valuation journal. */
  unitCostBasePence?: number | null;
};

export type RecordOpeningInventoryResult = {
  valuedUnits: number;
  unvaluedUnits: number;
  valuedPence: number;
  costReviewProductIds: string[];
  journalPosted: boolean;
  referenceId: string;
};

function weightedAvgCost(beforeQty: number, beforeCost: number, addQty: number, addCost: number): number {
  const totalQty = beforeQty + addQty;
  if (totalQty <= 0) return addCost > 0 ? addCost : beforeCost;
  if (addCost <= 0) return beforeCost;
  if (beforeQty <= 0 || beforeCost <= 0) return addCost;
  return Math.round((beforeQty * beforeCost + addQty * addCost) / totalQty);
}

export async function recordOpeningInventory(input: {
  businessId: string;
  storeId: string;
  userId?: string | null;
  lines: OpeningInventoryLine[];
  /** Stable id for journal / movement reference — also used as idempotency key. */
  referenceId: string;
  description?: string;
}): Promise<RecordOpeningInventoryResult> {
  const lines = input.lines.filter((l) => l.productId && l.unitId && l.qtyInUnit > 0);
  if (lines.length === 0) {
    return {
      valuedUnits: 0,
      unvaluedUnits: 0,
      valuedPence: 0,
      costReviewProductIds: [],
      journalPosted: false,
      referenceId: input.referenceId,
    };
  }

  // Idempotency: if this reference already posted opening movements, do not double-apply.
  const existing = await prisma.stockMovement.findFirst({
    where: {
      storeId: input.storeId,
      referenceType: 'OPENING_BALANCE_INVENTORY',
      referenceId: input.referenceId,
    },
    select: { id: true },
  });
  if (existing) {
    return {
      valuedUnits: 0,
      unvaluedUnits: 0,
      valuedPence: 0,
      costReviewProductIds: [],
      journalPosted: false,
      referenceId: input.referenceId,
    };
  }

  const unitIds = [...new Set(lines.map((l) => l.unitId))];
  const productUnits = await prisma.productUnit.findMany({
    where: {
      productId: { in: [...new Set(lines.map((l) => l.productId))] },
      unitId: { in: unitIds },
    },
    select: {
      productId: true,
      unitId: true,
      conversionToBase: true,
      product: { select: { id: true, businessId: true, defaultCostBasePence: true } },
    },
  });
  const puMap = new Map(productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu]));

  for (const line of lines) {
    const pu = puMap.get(`${line.productId}:${line.unitId}`);
    if (!pu || pu.product.businessId !== input.businessId) {
      throw new Error('Product unit not found for this business.');
    }
  }

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const inventoryMap = await fetchInventoryMap(input.storeId, productIds);

  type Applied = {
    productId: string;
    unitId: string;
    qtyBase: number;
    unitCostBasePence: number;
    lineValuePence: number;
    newAvgCost: number;
  };

  const applied: Applied[] = [];
  const costReviewProductIds: string[] = [];
  let valuedPence = 0;
  let valuedUnits = 0;
  let unvaluedUnits = 0;

  for (const line of lines) {
    const pu = puMap.get(`${line.productId}:${line.unitId}`)!;
    const qtyBase = Math.round(line.qtyInUnit * pu.conversionToBase);
    if (qtyBase <= 0) continue;

    const costBase = Math.max(0, Math.round(line.unitCostBasePence ?? 0));
    const before = inventoryMap.get(line.productId) ?? { qtyOnHandBase: 0, avgCostBasePence: 0 };
    const lineValue = costBase > 0 ? costBase * qtyBase : 0;
    const newAvg =
      costBase > 0
        ? weightedAvgCost(before.qtyOnHandBase, before.avgCostBasePence, qtyBase, costBase)
        : before.avgCostBasePence;

    applied.push({
      productId: line.productId,
      unitId: line.unitId,
      qtyBase,
      unitCostBasePence: costBase,
      lineValuePence: lineValue,
      newAvgCost: newAvg,
    });

    inventoryMap.set(line.productId, {
      qtyOnHandBase: before.qtyOnHandBase + qtyBase,
      avgCostBasePence: newAvg,
    });

    if (costBase > 0) {
      valuedPence += lineValue;
      valuedUnits += qtyBase;
    } else {
      unvaluedUnits += qtyBase;
      costReviewProductIds.push(line.productId);
    }
  }

  await ensureChartOfAccounts(input.businessId);

  await prisma.$transaction(async (tx) => {
    for (const row of applied) {
      await incrementInventoryBalance(
        tx,
        input.storeId,
        row.productId,
        row.qtyBase,
        row.newAvgCost
      );
    }

    if (applied.length > 0) {
      await tx.stockMovement.createMany({
        data: applied.map((row) => ({
          storeId: input.storeId,
          productId: row.productId,
          type: 'OPENING',
          qtyBase: row.qtyBase,
          unitCostBasePence: row.unitCostBasePence > 0 ? row.unitCostBasePence : null,
          referenceType: 'OPENING_BALANCE_INVENTORY',
          referenceId: input.referenceId,
          userId: input.userId ?? null,
        })),
      });
    }

    if (valuedPence > 0) {
      await postJournalEntry({
        businessId: input.businessId,
        description: input.description ?? 'Opening stock — cut-over inventory',
        referenceType: 'OPENING_BALANCE_INVENTORY',
        referenceId: input.referenceId,
        lines: [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: valuedPence },
          { accountCode: ACCOUNT_CODES.openingBalanceEquity, creditPence: valuedPence },
        ],
        prismaClient: tx as any,
      });
    }
  });

  return {
    valuedUnits,
    unvaluedUnits,
    valuedPence,
    costReviewProductIds: [...new Set(costReviewProductIds)],
    journalPosted: valuedPence > 0,
    referenceId: input.referenceId,
  };
}
