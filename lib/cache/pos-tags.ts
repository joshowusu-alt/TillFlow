import { revalidateTag } from 'next/cache';

export function posProductsTag(businessId: string) {
  return `pos-products:${businessId}`;
}

export function posInventoryTag(businessId: string, storeId: string) {
  return `pos-inventory:${businessId}:${storeId}`;
}

export function posTillsTag(businessId: string, storeId: string) {
  return `pos-tills:${businessId}:${storeId}`;
}

export function posShiftsTag(businessId: string, storeId: string) {
  return `pos-shifts:${businessId}:${storeId}`;
}

export function posCategoriesTag(businessId: string) {
  return `pos-categories:${businessId}`;
}

export function posCustomersTag(businessId: string) {
  return `pos-customers:${businessId}`;
}

export function checkoutContextTag(businessId: string) {
  return `checkout-context:${businessId}`;
}

/** Shared POS till/shift invalidation. Prefer scoped tags; never evict other businesses. */
export function revalidatePosTillShiftTags(businessId?: string, storeId?: string | null) {
  if (businessId && storeId) {
    revalidateTag(posTillsTag(businessId, storeId));
    revalidateTag(posShiftsTag(businessId, storeId));
    return;
  }
  // Call sites that only know a store still must not use a global POS tag.
  if (businessId) {
    revalidateTag(posProductsTag(businessId));
  }
}

/**
 * Evict POS product list + store inventory. Both ids are required so writers
 * cannot skip `pos-inventory:{biz}:{store}` (P14). Never a global inventory tag.
 */
export function revalidatePosInventory(businessId: string, storeId: string) {
  if (!businessId?.trim()) {
    throw new Error('revalidatePosInventory requires businessId');
  }
  if (!storeId?.trim()) {
    throw new Error('revalidatePosInventory requires storeId (pos-inventory is store-scoped)');
  }
  revalidateTag(posProductsTag(businessId));
  revalidateTag(posInventoryTag(businessId, storeId));
}

/** Always products tag; inventory tag only when storeId is present. Prefer revalidatePosInventory at qty writers. */
export function revalidatePosCatalog(businessId: string, storeId?: string | null) {
  if (storeId) {
    revalidatePosInventory(businessId, storeId);
    return;
  }
  revalidateTag(posProductsTag(businessId));
}
