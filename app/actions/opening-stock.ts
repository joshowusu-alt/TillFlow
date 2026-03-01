'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createPurchase } from '@/lib/services/purchases';
import { audit } from '@/lib/audit';

export type OpeningStockLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitCostPence: number;
};

export type OpeningStockResult = {
  inventoryValuePence: number;
  cashPence: number;
  totalPence: number;
};

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
      l => l.productId && l.unitId && l.qtyInUnit > 0
    );

    let inventoryValuePence = 0;

    if (validLines.length > 0) {
      await createPurchase({
        businessId,
        storeId: store.id,
        supplierId: null,
        paymentStatus: 'UNPAID',
        dueDate: null,
        payments: [],
        lines: validLines.map(l => ({
          productId: l.productId,
          unitId: l.unitId,
          qtyInUnit: l.qtyInUnit,
          unitCostPence: l.unitCostPence,
        })),
      });

      inventoryValuePence = validLines.reduce(
        (sum, l) => sum + Math.round(l.unitCostPence * l.qtyInUnit),
        0
      );
    }

    const safeCash = Math.max(0, cashAmountPence);
    await prisma.business.update({
      where: { id: businessId },
      data: { openingCapitalPence: safeCash },
    });

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
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok<OpeningStockResult>({
      inventoryValuePence,
      cashPence: safeCash,
      totalPence: inventoryValuePence + safeCash,
    });
  });
}
