import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type ProductCoreInput = {
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  baseUnitId: string;
  packagingUnitId: string;
  packagingConversion: number;
};

export type QuickCreateProductInput = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  vatRateBps: number;
  baseUnitId: string;
  packagingUnitId?: string | null;
  packagingConversion?: number | null;
};

export type QuickCreateProductResult = {
  id: string;
  name: string;
  barcode: string | null;
  defaultCostBasePence: number;
  sellingPriceBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  onHandBase: number;
  units: {
    id: string;
    name: string;
    pluralName: string;
    conversionToBase: number;
    isBaseUnit: boolean;
  }[];
};

export type InflatedProduct = {
  id: string;
  name: string;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Throws if a product with the same name (case-insensitive) already exists in
 * the business. Pass `excludeId` when updating so the product itself is ignored.
 */
async function assertNoDuplicateProductName(
  businessId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  const rows = excludeId
    ? await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "businessId" = ${businessId}
          AND lower("name") = lower(${name})
          AND id <> ${excludeId}
        LIMIT 1`
    : await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "businessId" = ${businessId}
          AND lower("name") = lower(${name})
        LIMIT 1`;
  if (rows.length > 0) {
    throw new Error('A product with that name already exists. Please choose a different name.');
  }
}

/**
 * Build the `productUnits.create` array from a base unit and an optional
 * packaging unit.  Returns only valid entries (packaging is omitted when
 * the conversion ≤ 1 or the unit is the same as the base).
 */
export function buildProductUnitCreates(
  baseUnitId: string,
  packagingUnitId: string,
  packagingConversion: number
): { unitId: string; isBaseUnit: boolean; conversionToBase: number }[] {
  return [
    { unitId: baseUnitId, isBaseUnit: true, conversionToBase: 1 },
    packagingUnitId && packagingConversion > 1 && packagingUnitId !== baseUnitId
      ? { unitId: packagingUnitId, isBaseUnit: false, conversionToBase: packagingConversion }
      : null,
  ].filter(Boolean) as { unitId: string; isBaseUnit: boolean; conversionToBase: number }[];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a new product with associated unit(s).
 * Throws a descriptive `Error` if a product with the same name already exists.
 */
export async function createProduct(
  businessId: string,
  data: ProductCoreInput
): Promise<{ id: string; name: string }> {
  await assertNoDuplicateProductName(businessId, data.name);

  const product = await prisma.product.create({
    data: {
      businessId,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode,
      categoryId: data.categoryId,
      imageUrl: data.imageUrl,
      sellingPriceBasePence: data.sellingPriceBasePence,
      defaultCostBasePence: data.defaultCostBasePence,
      vatRateBps: data.vatRateBps,
      promoBuyQty: data.promoBuyQty,
      promoGetQty: data.promoGetQty,
      productUnits: {
        create: buildProductUnitCreates(
          data.baseUnitId,
          data.packagingUnitId,
          data.packagingConversion
        ),
      },
    },
    select: { id: true, name: true },
  });

  return product;
}

/**
 * Update an existing product's fields and reconcile its unit records inside a
 * single transaction.
 * Throws if the product is not found or the new name collides with another product.
 * Returns the product id (for use in audit logs / redirects).
 */
export async function updateProduct(
  id: string,
  businessId: string,
  data: ProductCoreInput
): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!existing) {
    throw new Error('Product not found. It may have been removed.');
  }

  await assertNoDuplicateProductName(businessId, data.name, existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl,
        sellingPriceBasePence: data.sellingPriceBasePence,
        defaultCostBasePence: data.defaultCostBasePence,
        vatRateBps: data.vatRateBps,
        promoBuyQty: data.promoBuyQty,
        promoGetQty: data.promoGetQty,
      },
    });

    const existingUnits = await tx.productUnit.findMany({
      where: { productId: existing.id },
    });

    // ── Base unit ──────────────────────────────────────────────────────────
    if (data.baseUnitId) {
      const baseUnit = existingUnits.find((u) => u.unitId === data.baseUnitId);
      if (baseUnit) {
        await tx.productUnit.update({
          where: { id: baseUnit.id },
          data: { isBaseUnit: true, conversionToBase: 1 },
        });
      } else {
        await tx.productUnit.create({
          data: {
            productId: existing.id,
            unitId: data.baseUnitId,
            isBaseUnit: true,
            conversionToBase: 1,
          },
        });
      }
      // Ensure no other unit is accidentally marked as the base
      await tx.productUnit.updateMany({
        where: { productId: existing.id, unitId: { not: data.baseUnitId } },
        data: { isBaseUnit: false },
      });
    }

    // ── Packaging unit ─────────────────────────────────────────────────────
    if (
      data.packagingUnitId &&
      data.packagingConversion > 1 &&
      data.packagingUnitId !== data.baseUnitId
    ) {
      const packagingUnit = existingUnits.find((u) => u.unitId === data.packagingUnitId);
      if (packagingUnit) {
        await tx.productUnit.update({
          where: { id: packagingUnit.id },
          data: { isBaseUnit: false, conversionToBase: data.packagingConversion },
        });
      } else {
        await tx.productUnit.create({
          data: {
            productId: existing.id,
            unitId: data.packagingUnitId,
            isBaseUnit: false,
            conversionToBase: data.packagingConversion,
          },
        });
      }
      // Remove any stale non-base units that are not the current packaging unit
      await tx.productUnit.deleteMany({
        where: {
          productId: existing.id,
          isBaseUnit: false,
          unitId: { not: data.packagingUnitId },
        },
      });
    } else {
      // No packaging unit — remove all non-base units
      await tx.productUnit.deleteMany({
        where: { productId: existing.id, isBaseUnit: false },
      });
    }
  });

  return existing.id;
}

/**
 * Quick-create a product (used from the POS quick-add flow).
 * Validates name and barcode uniqueness before writing.
 * Returns a typed snapshot of the new product for the caller to use immediately.
 */
export async function quickCreateProduct(
  businessId: string,
  input: QuickCreateProductInput
): Promise<QuickCreateProductResult> {
  const name = input.name.trim();
  if (!name) throw new Error('Please enter a product name.');

  await assertNoDuplicateProductName(businessId, name);

  if (input.barcode) {
    const dup = await prisma.product.findFirst({
      where: { businessId, barcode: input.barcode },
      select: { id: true },
    });
    if (dup) throw new Error('That barcode is already used by another product.');
  }

  const created = await prisma.product.create({
    data: {
      businessId,
      name,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      sellingPriceBasePence: input.sellingPriceBasePence,
      defaultCostBasePence: input.defaultCostBasePence,
      vatRateBps: input.vatRateBps,
      productUnits: {
        create: buildProductUnitCreates(
          input.baseUnitId,
          input.packagingUnitId ?? '',
          input.packagingConversion ?? 0
        ),
      },
    },
    include: { productUnits: { include: { unit: true } } },
  });

  return {
    id: created.id,
    name: created.name,
    barcode: created.barcode,
    defaultCostBasePence: created.defaultCostBasePence,
    sellingPriceBasePence: created.sellingPriceBasePence,
    vatRateBps: created.vatRateBps,
    promoBuyQty: created.promoBuyQty,
    promoGetQty: created.promoGetQty,
    onHandBase: 0,
    units: created.productUnits.map((pu) => ({
      id: pu.unitId,
      name: pu.unit.name,
      pluralName: pu.unit.pluralName,
      conversionToBase: pu.conversionToBase,
      isBaseUnit: pu.isBaseUnit,
    })),
  };
}

/**
 * Soft-delete a product by setting `active = false`.
 * Throws if the product does not belong to the business.
 * Returns the product stub so the caller can use the name in audit logs.
 */
export async function softDeleteProduct(
  productId: string,
  businessId: string
): Promise<{ id: string; name: string }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true, name: true },
  });
  if (!product) throw new Error('Product not found. It may have already been removed.');

  await prisma.product.update({
    where: { id: product.id },
    data: { active: false },
  });

  return product;
}

/**
 * Find products whose prices look inflated (selling price > ₵1,000 / 100,000
 * pesewas) and divide them by 100 to correct a historical double-conversion
 * bug. Returns the list of products that were fixed so callers can audit them.
 */
export async function repairInflatedPrices(businessId: string): Promise<InflatedProduct[]> {
  const inflated = await prisma.product.findMany({
    where: {
      businessId,
      active: true,
      OR: [
        { sellingPriceBasePence: { gt: 100000 } },
        { defaultCostBasePence: { gt: 100000 } },
      ],
    },
    select: {
      id: true,
      name: true,
      sellingPriceBasePence: true,
      defaultCostBasePence: true,
    },
  });

  if (inflated.length === 0) return [];

  await prisma.$transaction(
    inflated.map((p) =>
      prisma.product.update({
        where: { id: p.id },
        data: {
          sellingPriceBasePence: Math.round(p.sellingPriceBasePence / 100),
          defaultCostBasePence: Math.round(p.defaultCostBasePence / 100),
        },
      })
    )
  );

  return inflated;
}
