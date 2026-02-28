'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formInt, formPence } from '@/lib/form-helpers';
import {
  withBusinessContext,
  formAction,
  safeAction,
  ok,
  type ActionResult,
} from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import {
  createProduct,
  updateProduct,
  quickCreateProduct,
  softDeleteProduct,
  repairInflatedPrices,
  type ProductCoreInput,
  type QuickCreateProductInput,
} from '@/lib/services/products';

// ---------------------------------------------------------------------------
// Private helpers (FormData parsing — stays in the action layer)
// ---------------------------------------------------------------------------

/** Extract the common product fields from FormData. */
function parseProductFields(formData: FormData): ProductCoreInput {
  return {
    name: formString(formData, 'name'),
    sku: formString(formData, 'sku') || null,
    barcode: formString(formData, 'barcode') || null,
    categoryId: formOptionalString(formData, 'categoryId') || null,
    imageUrl: formOptionalString(formData, 'imageUrl') || null,
    sellingPriceBasePence: formPence(formData, 'sellingPriceBasePence'),
    defaultCostBasePence: formPence(formData, 'defaultCostBasePence'),
    vatRateBps: formInt(formData, 'vatRateBps'),
    promoBuyQty: formInt(formData, 'promoBuyQty'),
    promoGetQty: formInt(formData, 'promoGetQty'),
    baseUnitId: formString(formData, 'baseUnitId'),
    packagingUnitId: formString(formData, 'packagingUnitId'),
    packagingConversion: formInt(formData, 'packagingConversion'),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const fields = parseProductFields(formData);

    const product = await createProduct(businessId, fields);

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      entityId: product.id,
      details: { name: fields.name, price: fields.sellingPriceBasePence },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    redirect('/products');
  }, '/products');
}

export async function updateProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) redirect('/products');

    const fields = parseProductFields(formData);
    const productId = await updateProduct(id, businessId, fields);

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: productId,
      details: { name: fields.name, price: fields.sellingPriceBasePence },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    redirect(`/products/${productId}`);
  }, '/products');
}

export async function quickCreateProductAction(input: QuickCreateProductInput) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const result = await quickCreateProduct(businessId, input);
    revalidateTag('pos-products');
    return ok(result);
  });
}

/**
 * Soft-delete a product by setting active = false.
 * Only OWNER can delete products.
 */
export async function deleteProductAction(productId: string): Promise<ActionResult<{ message: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);
    const product = await softDeleteProduct(productId, businessId);

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_DELETE',
      entity: 'Product',
      entityId: productId,
      details: { name: product.name },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    return ok({ message: `"${product.name}" has been deactivated.` });
  });
}

/**
 * One-time repair: divide all product prices by 100 for products where
 * prices look inflated (sellingPriceBasePence > threshold).
 * This fixes the double-conversion bug where editing a product multiplied
 * the price by 100 again. Only OWNER can run this.
 */
export async function repairInflatedPricesAction(): Promise<ActionResult<{ fixed: number }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);
    const inflated = await repairInflatedPrices(businessId);

    if (inflated.length === 0) {
      return ok({ fixed: 0 });
    }

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRICE_REPAIR',
      entity: 'Product',
      entityId: 'bulk',
      details: {
        count: inflated.length,
        products: inflated.map((p) => p.name),
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    return ok({ fixed: inflated.length });
  });
}
