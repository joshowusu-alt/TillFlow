'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { audit } from '@/lib/audit';
import { ok, safeAction, withBusinessContext, requireSelectedStoreContext, type ActionResult } from '@/lib/action-utils';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import type { DishDraft } from '@/lib/food/dish-draft';
import { addPreparedPortions } from '@/lib/food/prepare-service';
import { saveDish } from '@/lib/food/save-dish';
import { writeOffCookedPortions } from '@/lib/food/write-off-service';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

async function refreshFoodSurfaces(businessId: string, storeId?: string | null) {
  void import('@/lib/activation-snapshot').then(({ persistActivationSnapshot }) =>
    persistActivationSnapshot(businessId).catch(() => {}),
  );
  revalidatePosCatalog(businessId, storeId);
  revalidateOwnerDashboardCache();
  revalidateTag(`readiness-${businessId}`);
  revalidatePath('/products');
  revalidatePath('/onboarding');
  revalidatePath('/pos');
  revalidatePath('/inventory', 'layout');
}

export async function saveDishAction(draft: DishDraft): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const saved = await saveDish({ businessId, draft });
    await refreshFoodSurfaces(businessId);
    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOOD_DISH_SAVE',
      entity: 'Product',
      entityId: saved.id,
      details: { name: saved.name, stockMode: draft.stockMode },
    }).catch(() => {});
    return ok({ id: saved.id });
  });
}

export async function addPreparedPortionsAction(input: {
  productId: string;
  qty: number;
  note?: string;
  idempotencyKey?: string;
}): Promise<ActionResult<{ qty: number }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], undefined);
    const row = await addPreparedPortions({
      businessId,
      storeId,
      productId: input.productId,
      userId: user.id,
      qty: input.qty,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    });
    await refreshFoodSurfaces(businessId, storeId);
    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOOD_PREPARATION',
      entity: 'FoodPreparation',
      entityId: row.id,
      details: { productId: input.productId, qty: row.qtyBase },
    }).catch(() => {});
    return ok({ qty: row.qtyBase });
  });
}

export async function writeOffCookedPortionsAction(input: {
  productId: string;
  qty: number;
  reasonCode: string;
  note?: string;
  idempotencyKey?: string;
}): Promise<ActionResult<{ qty: number; valuePence: number }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], undefined);
    const row = await writeOffCookedPortions({
      businessId,
      storeId,
      productId: input.productId,
      userId: user.id,
      userRole: user.role,
      qty: input.qty,
      reasonCode: input.reasonCode,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    });
    await refreshFoodSurfaces(businessId, storeId);
    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOOD_LEFTOVER_WRITE_OFF',
      entity: 'StockAdjustment',
      entityId: row.id,
      details: { productId: input.productId, qty: row.qty, valuePence: row.valuePence, reasonCode: input.reasonCode },
    }).catch(() => {});
    return ok({ qty: row.qty, valuePence: row.valuePence });
  });
}
