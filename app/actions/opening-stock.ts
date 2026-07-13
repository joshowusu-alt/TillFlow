'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { recordOpeningInventory } from '@/lib/services/opening-inventory';
import { createPurchase } from '@/lib/services/purchases';
import { audit } from '@/lib/audit';

export type OpeningStockLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitCostPence: number;
  /** Default EQUITY. SUPPLIER_CREDIT requires supplierId. */
  funding?: 'EQUITY' | 'SUPPLIER_CREDIT';
  supplierId?: string | null;
};

export type OpeningStockResult = {
  inventoryValuePence: number;
  cashPence: number;
  totalPence: number;
  missingCostCount: number;
  costReviewProductIds: string[];
  accountingEffectSummary: string[];
};

/**
 * Record cut-over opening stock.
 * Default: Dr Inventory / Cr Opening Balance Equity.
 * Supplier credit (explicit): Dr Inventory / Cr AP via purchase OPENING.
 * Cash amount updates Business.openingCapitalPence only (legacy report field) — no till/GL journal.
 */
export async function createOpeningStockAction(
  lines: OpeningStockLine[],
  cashAmountPence: number
): Promise<ActionResult<OpeningStockResult>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) return err('No store found. Complete business setup first.');

    const validLines = lines.filter(
      (l) => l.productId && l.unitId && l.qtyInUnit > 0
    );

    let inventoryValuePence = 0;
    let missingCostCount = 0;
    const costReviewProductIds: string[] = [];
    const accountingEffectSummary: string[] = [];

    if (validLines.length > 0) {
      const equityLines = validLines.filter((l) => (l.funding ?? 'EQUITY') !== 'SUPPLIER_CREDIT');
      const creditLines = validLines.filter((l) => l.funding === 'SUPPLIER_CREDIT');

      for (const line of creditLines) {
        if (!line.supplierId) {
          return err('Supplier credit opening stock requires a named supplier.');
        }
      }

      if (equityLines.length > 0) {
        const result = await recordOpeningInventory({
          businessId,
          storeId: store.id,
          userId: user.id,
          referenceId: `opening-stock-ui-${Date.now()}`,
          description: 'Opening stock setup — Opening Balance Equity',
          lines: equityLines.map((l) => ({
            productId: l.productId,
            unitId: l.unitId,
            qtyInUnit: l.qtyInUnit,
            unitCostBasePence: l.unitCostPence > 0 ? l.unitCostPence : 0,
          })),
        });
        inventoryValuePence += result.valuedPence;
        missingCostCount += result.costReviewProductIds.length;
        costReviewProductIds.push(...result.costReviewProductIds);
        accountingEffectSummary.push(
          `Dr Inventory / Cr Opening Balance Equity (${result.valuedPence}p).`
        );
        if (result.unvaluedUnits > 0) {
          accountingEffectSummary.push(
            `${result.unvaluedUnits} unit(s) without cost — value incomplete.`
          );
        }
      }

      if (creditLines.length > 0) {
        const bySupplier = new Map<string, OpeningStockLine[]>();
        for (const line of creditLines) {
          const key = line.supplierId!;
          const list = bySupplier.get(key) ?? [];
          list.push(line);
          bySupplier.set(key, list);
        }
        for (const [supplierId, group] of bySupplier) {
          await createPurchase({
            businessId,
            storeId: store.id,
            supplierId,
            paymentStatus: 'UNPAID',
            dueDate: null,
            payments: [],
            lines: group.map((l) => ({
              productId: l.productId,
              unitId: l.unitId,
              qtyInUnit: l.qtyInUnit,
              unitCostPence: l.unitCostPence,
            })),
            userId: user.id,
            stockMovementType: 'OPENING',
            acknowledgeHighCost: true,
          });
          const creditValue = group.reduce(
            (sum, l) => sum + Math.round(l.unitCostPence * l.qtyInUnit),
            0
          );
          inventoryValuePence += creditValue;
        }
        accountingEffectSummary.push('Dr Inventory / Cr Accounts Payable (supplier credit).');
      }
    }

    // Legacy report overlay only — does NOT post a cash journal or till float.
    const safeCash = Math.max(0, cashAmountPence);
    await prisma.business.update({
      where: { id: businessId },
      data: { openingCapitalPence: safeCash },
    });
    if (safeCash > 0) {
      accountingEffectSummary.push(
        'Opening cash figure saved for reports only — till float remains non-GL; use Opening Balances for proper cash journals.'
      );
    }

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: businessId,
      details: {
        openingStockLines: validLines.length,
        inventoryValuePence,
        cashAmountPence: safeCash,
        source: 'opening-stock-setup',
        accountingEffectSummary,
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateTag(`readiness-${businessId}`);

    return ok<OpeningStockResult>({
      inventoryValuePence,
      cashPence: safeCash,
      totalPence: inventoryValuePence + safeCash,
      missingCostCount,
      costReviewProductIds: [...new Set(costReviewProductIds)],
      accountingEffectSummary,
    });
  });
}
