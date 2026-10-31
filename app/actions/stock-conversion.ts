'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ok, requireSelectedStoreContext, safeAction, UserError } from '@/lib/action-utils';
import { formString } from '@/lib/form-helpers';
import { createStockConversion } from '@/lib/services/stock-conversion';
import { revalidatePosInventory } from '@/lib/cache/pos-tags';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';
import type { ConversionProduct } from '@/lib/stock-conversion';

export async function searchStockConversionProducts(query: string, storeId: string) {
  return safeAction(async () => {
    const context = await requireSelectedStoreContext(['OWNER', 'MANAGER'], storeId);
    const q = query.trim().slice(0, 100);
    if (q.length < 2) return ok([] as ConversionProduct[]);
    const match = { contains: q, ...(isPostgresRuntimeEnv() ? { mode: 'insensitive' as const } : {}) };
    const products = await prisma.product.findMany({
      where: { businessId: context.businessId, active: true, OR: [{ name: match }, { barcode: match }, { sku: match }] },
      orderBy: { name: 'asc' }, take: 20,
      select: { id: true, name: true, productUnits: { select: { unitId: true, conversionToBase: true, unit: { select: { name: true } } } },
        inventoryBalances: { where: { storeId: context.storeId }, select: { qtyOnHandBase: true, avgCostBasePence: true, knownValuePence: true, unvaluedQtyBase: true } } },
    });
    return ok(products.map(p => ({ id: p.id, name: p.name, stock: p.inventoryBalances[0] ?? null,
      units: p.productUnits.map(u => ({ id: u.unitId, name: u.unit.name, conversionToBase: u.conversionToBase })) })));
  });
}

export async function createStockConversionAction(form: FormData) {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['OWNER', 'MANAGER'], formString(form, 'storeId'));
    if (formString(form, 'confirmed') !== 'yes') throw new UserError('Confirm the source, counted output and cost before saving.');
    // Number, not parseInt: fractional and malformed quantities must never silently truncate.
    const result = await createStockConversion({ businessId, storeId, userId: user.id,
      sourceProductId: formString(form, 'sourceProductId'), sourceUnitId: formString(form, 'sourceUnitId'), sourceQty: Number(formString(form, 'sourceQty')),
      destinationProductId: formString(form, 'destinationProductId'), destinationUnitId: formString(form, 'destinationUnitId'), destinationQty: Number(formString(form, 'destinationQty')),
      expectedCostPence: Number(formString(form, 'expectedCostPence')), expectedSourceQtyBase: Number(formString(form, 'expectedSourceQtyBase')), expectedDestinationQtyBase: Number(formString(form, 'expectedDestinationQtyBase')), note: formString(form, 'note'), idempotencyKey: formString(form, 'idempotencyKey'),
    });
    revalidatePosInventory(businessId, storeId);
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/inventory');
    revalidatePath('/inventory/conversions');
    revalidatePath('/products', 'layout');
    return ok(result);
  });
}
