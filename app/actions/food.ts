'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { undoFoodRecord, type FoodRecordKind } from '@/lib/food/undo-service';
import { recordIngredientUsage } from '@/lib/food/usage-service';
import type { Ingredient } from '@/lib/food/ingredient-costs';
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
  revalidateTag('reports');
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
  storeId?: string;
  qty: number;
  sizeId?: string;
  note?: string;
  idempotencyKey?: string;
}): Promise<ActionResult<{ qty: number; costPerPortionPence: number | null }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], input.storeId);
    const row = await addPreparedPortions({
      businessId,
      storeId,
      productId: input.productId,
      userId: user.id,
      qty: input.qty,
      sizeId: input.sizeId,
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
    return ok({ qty: row.qtyBase, costPerPortionPence: row.costPerPortionPence });
  });
}

export async function writeOffCookedPortionsAction(input: {
  productId: string;
  storeId?: string;
  qty: number;
  reasonCode: string;
  manualCostPence?: number;
  note?: string;
  idempotencyKey?: string;
}): Promise<ActionResult<{ qty: number; valuePence: number }>> {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], input.storeId);
    const row = await writeOffCookedPortions({
      businessId,
      storeId,
      productId: input.productId,
      userId: user.id,
      userRole: user.role,
      qty: input.qty,
      reasonCode: input.reasonCode,
      manualCostPence: input.manualCostPence,
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

export async function recordIngredientUsageAction(rows: Ingredient[], idempotencyKey: string, selectedStoreId?: string, reason?: string) {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], selectedStoreId);
    const result = await recordIngredientUsage({ businessId, storeId, userId: user.id, userRole: user.role, rows, idempotencyKey, reason });
    await refreshFoodSurfaces(businessId, storeId);
    return ok(result);
  });
}

export async function undoFoodRecordAction(input: {
  storeId: string; kind: FoodRecordKind; id: string; reason: string;
}) {
  return safeAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(['MANAGER', 'OWNER'], input.storeId);
    await undoFoodRecord({ ...input, businessId, storeId, userId: user.id, userRole: user.role });
    await refreshFoodSurfaces(businessId, storeId);
    return ok();
  });
}
