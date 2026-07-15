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
import { prisma } from '@/lib/prisma';
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
import { saveProductImageFile, validateExternalProductImageUrl } from '@/lib/services/storage';
import { createPurchase } from '@/lib/services/purchases';
import { persistActivationSnapshot } from '@/lib/activation-snapshot';
import {
  formatProductPriceWarnings,
  getProductPriceWarnings,
} from '@/lib/product-price-guards';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

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

async function resolveProductImageUrl(formData: FormData): Promise<string | null> {
  if (formData.get('removeImage') === '1') {
    return null;
  }

  const uploaded = await saveProductImageFile(formData.get('imageFile'));
  if (uploaded && typeof uploaded === 'object' && 'error' in uploaded) {
    throw new Error(uploaded.error);
  }
  if (typeof uploaded === 'string') {
    return uploaded;
  }

  const external = await validateExternalProductImageUrl(formOptionalString(formData, 'imageUrl'));
  if (external && typeof external === 'object' && 'error' in external) {
    throw new Error(external.error);
  }

  return external;
}

async function parseProductFields(formData: FormData): Promise<ProductCoreInput> {
  const unitConfigs = parseUnitConfigs(formData);
  const baseUnit = unitConfigs?.find((config) => config.isBaseUnit);
  const firstNonBaseUnit = unitConfigs?.find((config) => !config.isBaseUnit);
  const minimumMarginThresholdRaw = formOptionalString(formData, 'minimumMarginThresholdPercent');
  const minimumMarginThresholdBps = minimumMarginThresholdRaw?.trim()
    ? Math.max(0, Math.min(10_000, Math.round((parseFloat(minimumMarginThresholdRaw) || 0) * 100)))
    : null;

  return {
    name: formString(formData, 'name'),
    sku: formString(formData, 'sku') || null,
    barcode: formString(formData, 'barcode') || null,
    categoryId: formOptionalString(formData, 'categoryId') || null,
    preferredSupplierId: formOptionalString(formData, 'preferredSupplierId') || null,
    imageUrl: await resolveProductImageUrl(formData),
    sellingPriceBasePence: formPence(formData, 'sellingPriceBasePence'),
    defaultCostBasePence: formPence(formData, 'defaultCostBasePence'),
    minimumMarginThresholdBps,
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
    const fields = await parseProductFields(formData);

    const openingStockQty = Math.max(0, formInt(formData, 'openingStockQty'));
    const openingStockUnitId = formOptionalString(formData, 'openingStockUnitId') ?? fields.baseUnitId;
    const openingStockCostPence =
      formPence(formData, 'openingStockCostPence') > 0
        ? formPence(formData, 'openingStockCostPence')
        : fields.defaultCostBasePence;
    const confirmPriceWarning = formData.get('confirmPriceWarning') === '1';

    const priceWarnings = getProductPriceWarnings({
      sellingPricePence: fields.sellingPriceBasePence,
      defaultCostBasePence: fields.defaultCostBasePence,
      openingStockQty,
    });
    if (priceWarnings.length > 0 && !confirmPriceWarning) {
      redirect(
        `/products?error=${encodeURIComponent(formatProductPriceWarnings(priceWarnings))}#product-create`
      );
    }

    const product = await createProduct(businessId, fields);

    if (openingStockQty > 0 && openingStockUnitId) {
      const store = await prisma.store.findFirst({
        where: { businessId },
        select: { id: true },
      });
      if (store) {
        await createPurchase({
          businessId,
          storeId: store.id,
          supplierId: null,
          paymentStatus: 'UNPAID',
          dueDate: null,
          payments: [],
          lines: [
            {
              productId: product.id,
              unitId: openingStockUnitId,
              qtyInUnit: openingStockQty,
              unitCostPence: openingStockCostPence,
            },
          ],
          userId: user.id,
          stockMovementType: 'OPENING',
        });
      }
    }

    await persistActivationSnapshot(businessId).catch(() => {});

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      entityId: product.id,
      details: { name: fields.name, price: fields.sellingPriceBasePence, minimumMarginThresholdBps: fields.minimumMarginThresholdBps },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag(`readiness-${businessId}`);
    revalidateOwnerDashboardCache();
    revalidatePath('/inventory', 'layout');
    const createdQuery = openingStockQty > 0 ? 'created=1&stock=1' : 'created=1';
    redirect(`/products?${createdQuery}`);
  }, '/products');
}

export async function updateProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) redirect('/products');

    const fields = await parseProductFields(formData);
    const productId = await updateProduct(id, businessId, fields);

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: productId,
      details: { name: fields.name, price: fields.sellingPriceBasePence, minimumMarginThresholdBps: fields.minimumMarginThresholdBps },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateOwnerDashboardCache();
    revalidatePath('/inventory', 'layout');
    revalidatePath('/onboarding');
    revalidatePath('/products');
    redirect(`/products/${productId}`);
  }, '/products');
}

export async function quickCreateProductAction(input: QuickCreateProductInput) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const result = await quickCreateProduct(businessId, input);
    revalidateTag('pos-products');
    revalidateOwnerDashboardCache();
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
    revalidateOwnerDashboardCache();
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
    revalidateOwnerDashboardCache();
    return ok({ fixed: inflated.length });
  });
}

async function assertGrowthPlanForBarcodes(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, mode: true, storeMode: true },
  });
  if (!business) throw new Error('Business not found.');
  const { getFeatures } = await import('@/lib/features');
  const features = getFeatures(
    (business.plan as any) ?? (business.mode as any),
    business.storeMode as any,
  );
  if (!features.advancedOps) {
    return { allowed: false as const, error: 'Internal barcode generation is available on Growth and Pro.' };
  }
  return { allowed: true as const };
}

async function reserveInternalBarcodeSequence(businessId: string): Promise<number> {
  const sequenceWhere = {
    businessId_sequenceName: {
      businessId,
      sequenceName: 'internal_barcode' as const,
    },
  };

  try {
    const updated = await prisma.businessSequence.update({
      where: sequenceWhere,
      data: { nextVal: { increment: 1 } },
      select: { nextVal: true },
    });
    return updated.nextVal;
  } catch {
    // Sequence row missing — create then retry
  }

  try {
    await prisma.businessSequence.create({
      data: {
        businessId,
        sequenceName: 'internal_barcode',
        nextVal: 1,
      },
    });
  } catch {
    // Concurrent create — fall through to update
  }

  const updated = await prisma.businessSequence.update({
    where: sequenceWhere,
    data: { nextVal: { increment: 1 } },
    select: { nextVal: true },
  });
  return updated.nextVal;
}

async function allocateUniqueInternalBarcode(businessId: string): Promise<string> {
  const { formatInternalBarcode } = await import('@/lib/products/internal-barcode');
  for (let attempts = 0; attempts < 20; attempts++) {
    const sequence = await reserveInternalBarcodeSequence(businessId);
    const candidate = formatInternalBarcode(businessId, sequence);
    const conflict = await prisma.product.findUnique({
      where: { barcode: candidate },
      select: { id: true },
    });
    if (!conflict) return candidate;
  }
  throw new Error('Could not generate a unique internal barcode. Please try again.');
}

/**
 * Generate a TillFlow internal Code 128 barcode for a product and save it.
 * Does not overwrite an existing barcode. Growth+ only. Manager/Owner only.
 */
export async function generateBarcodeAction(productId: string): Promise<ActionResult<{ barcode: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthPlanForBarcodes(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const existing = await prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true, barcode: true, name: true },
    });
    if (!existing) throw new Error('Product not found.');

    if (existing.barcode?.trim()) {
      return {
        success: false,
        error: 'This product already has a barcode. Remove it first if you want to generate an internal barcode.',
      };
    }

    const barcode = await allocateUniqueInternalBarcode(businessId);

    await prisma.product.update({ where: { id: productId }, data: { barcode } });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'BARCODE_GENERATE',
      entity: 'Product',
      entityId: productId,
      details: { barcode, productName: existing.name, source: 'INTERNAL' },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidatePath(`/products/${productId}`);
    revalidatePath('/products');
    return ok({ barcode });
  });
}

/**
 * Generate internal barcodes for all active products that currently have none.
 * Never overwrites existing barcodes. Growth+ / Manager+Owner only.
 */
export async function generateMissingBarcodesAction(): Promise<
  ActionResult<{ generated: number; skipped: number; failed: number; sampleBarcodes: string[] }>
> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const plan = await assertGrowthPlanForBarcodes(businessId);
    if (!plan.allowed) return { success: false, error: plan.error };

    const missing = await prisma.product.findMany({
      where: {
        businessId,
        active: true,
        OR: [{ barcode: null }, { barcode: '' }],
      },
      select: { id: true, name: true, barcode: true },
      orderBy: { name: 'asc' },
      take: 500,
    });

    let generated = 0;
    let failed = 0;
    const sampleBarcodes: string[] = [];

    for (const product of missing) {
      if (product.barcode?.trim()) continue;
      try {
        const barcode = await allocateUniqueInternalBarcode(businessId);
        await prisma.product.update({
          where: { id: product.id },
          data: { barcode },
        });
        await audit({
          businessId,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'BARCODE_GENERATE',
          entity: 'Product',
          entityId: product.id,
          details: { barcode, productName: product.name, source: 'INTERNAL', bulk: true },
        }).catch(() => {});
        generated++;
        if (sampleBarcodes.length < 5) sampleBarcodes.push(barcode);
      } catch {
        failed++;
      }
    }

    revalidateTag('pos-products');
    // Intentionally skip revalidatePath('/products') here — the client sets
    // ?barcodesGenerated= then router.refresh() so the success banner survives.
    revalidatePath('/products/labels');

    return ok({
      generated,
      skipped: 0,
      failed,
      sampleBarcodes,
    });
  });
}
