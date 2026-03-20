'use server';

import { redirect } from 'next/navigation';
import { revalidateTag, revalidatePath } from 'next/cache';
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
  type ProductUnitInput,
  type QuickCreateProductInput,
} from '@/lib/services/products';

// ---------------------------------------------------------------------------
// Private helpers (FormData parsing — stays in the action layer)
// ---------------------------------------------------------------------------

/** Extract the common product fields from FormData. */
function parseUnitConfigs(formData: FormData): ProductUnitInput[] | undefined {
  const raw = formOptionalString(formData, 'unitConfigsJson');
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed.map((item) => ({
      unitId: String(item?.unitId ?? ''),
      conversionToBase: Number(item?.conversionToBase ?? 0),
      isBaseUnit: Boolean(item?.isBaseUnit),
      sellingPricePence:
        item?.sellingPricePence === null || item?.sellingPricePence === undefined
          ? null
          : Number(item.sellingPricePence),
      defaultCostPence:
        item?.defaultCostPence === null || item?.defaultCostPence === undefined
          ? null
          : Number(item.defaultCostPence),
    }));
  } catch {
    throw new Error('Product units could not be read. Please review the configured units and try again.');
  }
}

function parseProductFields(formData: FormData): ProductCoreInput {
  const unitConfigs = parseUnitConfigs(formData);
  const baseUnit = unitConfigs?.find((config) => config.isBaseUnit);
  const firstNonBaseUnit = unitConfigs?.find((config) => !config.isBaseUnit);

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
    baseUnitId: formOptionalString(formData, 'baseUnitId') || baseUnit?.unitId || '',
    packagingUnitId: formOptionalString(formData, 'packagingUnitId') || firstNonBaseUnit?.unitId || '',
    packagingConversion: formData.get('packagingConversion')
      ? formInt(formData, 'packagingConversion')
      : Number(firstNonBaseUnit?.conversionToBase ?? 0),
    unitConfigs,
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
    revalidatePath('/inventory', 'layout');
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
    revalidatePath('/inventory', 'layout');
    redirect(`/products/${productId}`);
  }, '/products');
}

export async function quickCreateProductAction(input: QuickCreateProductInput) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const result = await quickCreateProduct(businessId, input);
    revalidateTag('pos-products');
    revalidatePath('/inventory', 'layout');
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
    revalidatePath('/inventory', 'layout');
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
