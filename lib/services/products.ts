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
  minimumMarginThresholdBps: number | null;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  baseUnitId: string;
  packagingUnitId: string;
  packagingConversion: number;
  unitConfigs?: ProductUnitInput[];
};

export type ProductUnitInput = {
  unitId: string;
  conversionToBase: number;
  isBaseUnit: boolean;
  sellingPricePence?: number | null;
  defaultCostPence?: number | null;
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
  unitConfigs?: ProductUnitInput[];
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
    sellingPricePence?: number | null;
    defaultCostPence?: number | null;
  }[];
};

export type InflatedProduct = {
  id: string;
  name: string;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
};

export type CatalogSanityCheck = {
  key: string;
  label: string;
  severity: 'blocking' | 'warning';
  count: number;
  helper: string;
};

export type CatalogSanityRow = {
  id: string;
  name: string;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  barcode: string | null;
  reasons: string[];
};

export type CatalogSanitySnapshot = {
  blockingCount: number;
  warningCount: number;
  checks: CatalogSanityCheck[];
  rows: CatalogSanityRow[];
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Throws if a product with the same name (case-insensitive) already exists in
 * the business. Pass `excludeId` when updating so the product itself is ignored.
 * Pass `db` to run inside an existing transaction.
 */
async function assertNoDuplicateProductName(
  businessId: string,
  name: string,
  excludeId?: string,
  db: any = prisma
): Promise<void> {
  const rows = excludeId
    ? await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "businessId" = ${businessId}
          AND lower("name") = lower(${name})
          AND id <> ${excludeId}
        LIMIT 1`
    : await db.$queryRaw<{ id: string }[]>`
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
): ProductUnitInput[] {
  return [
    { unitId: baseUnitId, isBaseUnit: true, conversionToBase: 1 },
    packagingUnitId && packagingConversion > 1 && packagingUnitId !== baseUnitId
      ? { unitId: packagingUnitId, isBaseUnit: false, conversionToBase: packagingConversion }
      : null,
  ].filter(Boolean) as ProductUnitInput[];
}

function normalizeUnitConfigs(unitConfigs: ProductUnitInput[] | undefined, fallback: ProductUnitInput[]): ProductUnitInput[] {
  const source = unitConfigs?.length ? unitConfigs : fallback;

  return source
    .map((config) => ({
      unitId: config.unitId.trim(),
      conversionToBase: Number(config.conversionToBase),
      isBaseUnit: Boolean(config.isBaseUnit),
      sellingPricePence:
        config.sellingPricePence === null || config.sellingPricePence === undefined
          ? null
          : Math.round(Number(config.sellingPricePence)),
      defaultCostPence:
        config.defaultCostPence === null || config.defaultCostPence === undefined
          ? null
          : Math.round(Number(config.defaultCostPence)),
    }))
    .filter((config) => config.unitId);
}

function normalizeCoreProductInput(data: ProductCoreInput): ProductCoreInput {
  const fallbackUnits = buildProductUnitCreates(data.baseUnitId, data.packagingUnitId, data.packagingConversion);

  return {
    ...data,
    name: data.name.trim(),
    sku: data.sku?.trim() ? data.sku.trim() : null,
    barcode: data.barcode?.trim() ? data.barcode.trim() : null,
    categoryId: data.categoryId?.trim() ? data.categoryId.trim() : null,
    imageUrl: data.imageUrl?.trim() ? data.imageUrl.trim() : null,
    baseUnitId: data.baseUnitId.trim(),
    packagingUnitId: data.packagingUnitId?.trim() ?? '',
    unitConfigs: normalizeUnitConfigs(data.unitConfigs, fallbackUnits),
  };
}

function normalizeQuickCreateInput(input: QuickCreateProductInput): QuickCreateProductInput {
  const fallbackUnits = buildProductUnitCreates(
    input.baseUnitId,
    input.packagingUnitId?.trim() ?? '',
    input.packagingConversion ?? 0
  );

  return {
    ...input,
    name: input.name.trim(),
    sku: input.sku?.trim() ? input.sku.trim() : null,
    barcode: input.barcode?.trim() ? input.barcode.trim() : null,
    baseUnitId: input.baseUnitId.trim(),
    packagingUnitId: input.packagingUnitId?.trim() ? input.packagingUnitId.trim() : null,
    unitConfigs: normalizeUnitConfigs(input.unitConfigs, fallbackUnits),
  };
}

function validateUnitConfigs(unitConfigs: ProductUnitInput[]) {
  if (unitConfigs.length === 0) {
    throw new Error('Please configure at least one product unit.');
  }

  const baseUnits = unitConfigs.filter((config) => config.isBaseUnit);
  if (baseUnits.length !== 1) {
    throw new Error('Please configure exactly one base unit.');
  }

  const seen = new Set<string>();
  for (const config of unitConfigs) {
    if (seen.has(config.unitId)) {
      throw new Error('Each unit can only be configured once per product.');
    }
    seen.add(config.unitId);

    if (config.isBaseUnit) {
      if (config.conversionToBase !== 1) {
        throw new Error('Base unit conversion must be exactly 1.');
      }
      if (config.sellingPricePence !== null && config.sellingPricePence !== undefined) {
        throw new Error('Base unit selling price override is not needed; use the main selling price instead.');
      }
      if (config.defaultCostPence !== null && config.defaultCostPence !== undefined) {
        throw new Error('Base unit default cost override is not needed; use the main default cost instead.');
      }
      continue;
    }

    if (!Number.isInteger(config.conversionToBase) || config.conversionToBase <= 1) {
      throw new Error('Each non-base unit must contain a whole number of base units greater than 1.');
    }
    if (config.sellingPricePence !== null && config.sellingPricePence !== undefined && config.sellingPricePence <= 0) {
      throw new Error('Selling price overrides must be greater than zero.');
    }
    if (config.defaultCostPence !== null && config.defaultCostPence !== undefined && config.defaultCostPence < 0) {
      throw new Error('Default cost overrides cannot be negative.');
    }
  }
}

function validateProductValues(data: Pick<ProductCoreInput, 'name' | 'sellingPriceBasePence' | 'defaultCostBasePence' | 'vatRateBps' | 'promoBuyQty' | 'promoGetQty' | 'baseUnitId' | 'packagingUnitId' | 'packagingConversion' | 'unitConfigs'>) {
  if (!data.name.trim()) {
    throw new Error('Please enter a product name.');
  }
  if (!data.baseUnitId.trim()) {
    throw new Error('Please select a base unit.');
  }
  if (data.sellingPriceBasePence <= 0) {
    throw new Error('Selling price must be greater than zero.');
  }
  if (data.defaultCostBasePence < 0) {
    throw new Error('Default cost cannot be negative.');
  }
  if (data.vatRateBps < 0) {
    throw new Error('VAT rate cannot be negative.');
  }
  if (data.promoBuyQty < 0 || data.promoGetQty < 0) {
    throw new Error('Promo quantities cannot be negative.');
  }
  validateUnitConfigs(data.unitConfigs ?? []);
  if (data.packagingUnitId) {
    if (data.packagingUnitId === data.baseUnitId) {
      throw new Error('Packaging unit must be different from the base unit.');
    }
    if (data.packagingConversion <= 1) {
      throw new Error('Units per pack/carton must be greater than 1 when a packaging unit is selected.');
    }
  }
}

function validateMarginThresholdBps(value: number | null) {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('Minimum margin target must be between 0% and 100%.');
  }
}

const AUTHORITATIVE_INBOUND_COST_TYPES = ['PURCHASE', 'TRANSFER_IN', 'SALE_VOID', 'SALES_RETURN'] as const;

type InventoryCostSyncResult = {
  syncedBalances: number;
  skippedAuthoritativeBalances: number;
  repairedPackageCostBalances: number;
};

async function syncDefaultCostManagedInventoryBalances(
  tx: any,
  input: {
    productId: string;
    defaultCostBasePence: number;
    productUnits?: Array<{
      isBaseUnit: boolean;
      conversionToBase: number;
      defaultCostPence?: number | null;
    }>;
  }
): Promise<InventoryCostSyncResult> {
  const packageLevelCosts = new Set(
    (input.productUnits ?? [])
      .filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
      .map((unit) => unit.defaultCostPence ?? input.defaultCostBasePence * unit.conversionToBase)
      .filter((cost) => cost > 0 && cost !== input.defaultCostBasePence)
  );
  const candidateBalances = await tx.inventoryBalance.findMany({
    where: {
      productId: input.productId,
      OR: [
        { avgCostBasePence: { lte: 0 } },
        { avgCostBasePence: { not: input.defaultCostBasePence } },
      ],
    },
    select: {
      id: true,
      storeId: true,
      avgCostBasePence: true,
    },
  });

  if (candidateBalances.length === 0) {
    return { syncedBalances: 0, skippedAuthoritativeBalances: 0, repairedPackageCostBalances: 0 };
  }

  const storeIds = [...new Set(candidateBalances.map((balance: { storeId: string }) => balance.storeId))];
  const authoritativeMovements = await tx.stockMovement.findMany({
    where: {
      productId: input.productId,
      storeId: { in: storeIds },
      qtyBase: { gt: 0 },
      unitCostBasePence: { gt: 0 },
      type: { in: [...AUTHORITATIVE_INBOUND_COST_TYPES] },
    },
    select: { storeId: true },
    distinct: ['storeId'],
  });

  const authoritativeStoreIds = new Set(
    authoritativeMovements.map((movement: { storeId: string }) => movement.storeId)
  );
  const packageCostBalanceIds = candidateBalances
    .filter((balance: { id: string; avgCostBasePence: number }) => packageLevelCosts.has(balance.avgCostBasePence))
    .map((balance: { id: string }) => balance.id);
  const balanceIdsToSync = candidateBalances
    .filter((balance: { id: string; storeId: string }) =>
      !authoritativeStoreIds.has(balance.storeId) || packageCostBalanceIds.includes(balance.id)
    )
    .map((balance: { id: string }) => balance.id);

  if (balanceIdsToSync.length === 0) {
    return {
      syncedBalances: 0,
      skippedAuthoritativeBalances: candidateBalances.length,
      repairedPackageCostBalances: 0,
    };
  }

  await tx.inventoryBalance.updateMany({
    where: { id: { in: balanceIdsToSync } },
    data: { avgCostBasePence: input.defaultCostBasePence },
  });

  return {
    syncedBalances: balanceIdsToSync.length,
    skippedAuthoritativeBalances: candidateBalances.length - balanceIdsToSync.length,
    repairedPackageCostBalances: packageCostBalanceIds.filter((id: string) => balanceIdsToSync.includes(id)).length,
  };
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
  const normalized = normalizeCoreProductInput(data);
  validateProductValues(normalized);
  validateMarginThresholdBps(normalized.minimumMarginThresholdBps);

  await assertNoDuplicateProductName(businessId, normalized.name);

  const product = await prisma.product.create({
    data: {
      businessId,
      name: normalized.name,
      sku: normalized.sku,
      barcode: normalized.barcode,
      categoryId: normalized.categoryId,
      imageUrl: normalized.imageUrl,
      sellingPriceBasePence: normalized.sellingPriceBasePence,
      defaultCostBasePence: normalized.defaultCostBasePence,
      minimumMarginThresholdBps: normalized.minimumMarginThresholdBps,
      vatRateBps: normalized.vatRateBps,
      promoBuyQty: normalized.promoBuyQty,
      promoGetQty: normalized.promoGetQty,
      productUnits: {
        create: (normalized.unitConfigs ?? []).map((config) => ({
          unitId: config.unitId,
          isBaseUnit: config.isBaseUnit,
          conversionToBase: config.conversionToBase,
          sellingPricePence: config.sellingPricePence ?? null,
          defaultCostPence: config.defaultCostPence ?? null,
        })),
      },
    } as any,
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
  const normalized = normalizeCoreProductInput(data);
  validateProductValues(normalized);
  validateMarginThresholdBps(normalized.minimumMarginThresholdBps);

  const existing = await prisma.product.findFirst({
    where: { id, businessId },
    select: { id: true, defaultCostBasePence: true },
  });
  if (!existing) {
    throw new Error('Product not found. It may have been removed.');
  }

  await assertNoDuplicateProductName(businessId, normalized.name, existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: existing.id },
      data: {
        name: normalized.name,
        sku: normalized.sku,
        barcode: normalized.barcode,
        categoryId: normalized.categoryId,
        imageUrl: normalized.imageUrl,
        sellingPriceBasePence: normalized.sellingPriceBasePence,
        defaultCostBasePence: normalized.defaultCostBasePence,
        minimumMarginThresholdBps: normalized.minimumMarginThresholdBps,
        vatRateBps: normalized.vatRateBps,
        promoBuyQty: normalized.promoBuyQty,
        promoGetQty: normalized.promoGetQty,
      } as any,
    });

    if (existing.defaultCostBasePence !== normalized.defaultCostBasePence) {
      await syncDefaultCostManagedInventoryBalances(tx, {
        productId: existing.id,
        defaultCostBasePence: normalized.defaultCostBasePence,
      });
    }

    const existingUnits = await tx.productUnit.findMany({
      where: { productId: existing.id },
    });

    const targetUnitIds = new Set((normalized.unitConfigs ?? []).map((config) => config.unitId));

    for (const config of normalized.unitConfigs ?? []) {
      const existingUnit = existingUnits.find((unit) => unit.unitId === config.unitId);
      const unitData = {
        isBaseUnit: config.isBaseUnit,
        conversionToBase: config.conversionToBase,
        sellingPricePence: config.sellingPricePence ?? null,
        defaultCostPence: config.defaultCostPence ?? null,
      };

      if (existingUnit) {
        await tx.productUnit.update({
          where: { id: existingUnit.id },
          data: unitData,
        });
      } else {
        await tx.productUnit.create({
          data: {
            productId: existing.id,
            unitId: config.unitId,
            ...unitData,
          },
        });
      }
    }

    await tx.productUnit.deleteMany({
      where: {
        productId: existing.id,
        unitId: { notIn: [...targetUnitIds] },
      },
    });
  });

  return existing.id;
}

export async function repairInventoryAverageCostDrift(
  businessId: string
): Promise<{ affectedProducts: number; syncedBalances: number; skippedAuthoritativeBalances: number; repairedPackageCostBalances: number }> {
  const products = await prisma.product.findMany({
    where: {
      businessId,
      inventoryBalances: {
        some: {},
      },
    },
    select: {
      id: true,
      defaultCostBasePence: true,
      productUnits: {
        select: {
          isBaseUnit: true,
          conversionToBase: true,
          defaultCostPence: true,
        },
      },
    },
  });

  if (products.length === 0) {
    return { affectedProducts: 0, syncedBalances: 0, skippedAuthoritativeBalances: 0, repairedPackageCostBalances: 0 };
  }

  return prisma.$transaction(async (tx) => {
    let affectedProducts = 0;
    let syncedBalances = 0;
    let skippedAuthoritativeBalances = 0;
    let repairedPackageCostBalances = 0;

    for (const product of products) {
      const result = await syncDefaultCostManagedInventoryBalances(tx, {
        productId: product.id,
        defaultCostBasePence: product.defaultCostBasePence,
        productUnits: product.productUnits,
      });

      if (result.syncedBalances > 0) {
        affectedProducts += 1;
      }
      syncedBalances += result.syncedBalances;
      skippedAuthoritativeBalances += result.skippedAuthoritativeBalances;
      repairedPackageCostBalances += result.repairedPackageCostBalances;
    }

    return { affectedProducts, syncedBalances, skippedAuthoritativeBalances, repairedPackageCostBalances };
  });
}

/**
 * Quick-create a product (used from the POS quick-add flow and bulk import).
 * Validates name and barcode uniqueness before writing.
 * Returns a typed snapshot of the new product for the caller to use immediately.
 *
 * Pass `db` to run all queries inside an existing Prisma transaction.
 */
export async function quickCreateProduct(
  businessId: string,
  input: QuickCreateProductInput,
  db: any = prisma
): Promise<QuickCreateProductResult> {
  const normalized = normalizeQuickCreateInput(input);
  validateProductValues({
    name: normalized.name,
    sellingPriceBasePence: normalized.sellingPriceBasePence,
    defaultCostBasePence: normalized.defaultCostBasePence,
    vatRateBps: normalized.vatRateBps,
    promoBuyQty: 0,
    promoGetQty: 0,
    baseUnitId: normalized.baseUnitId,
    packagingUnitId: normalized.packagingUnitId ?? '',
    packagingConversion: normalized.packagingConversion ?? 0,
    unitConfigs: normalized.unitConfigs,
  });

  await assertNoDuplicateProductName(businessId, normalized.name, undefined, db);

  if (normalized.barcode) {
    const dup = await db.product.findFirst({
      where: { businessId, barcode: normalized.barcode },
      select: { id: true },
    });
    if (dup) throw new Error('That barcode is already used by another product.');
  }

  const created = await db.product.create({
    data: {
      businessId,
      name: normalized.name,
      sku: normalized.sku ?? null,
      barcode: normalized.barcode ?? null,
      sellingPriceBasePence: normalized.sellingPriceBasePence,
      defaultCostBasePence: normalized.defaultCostBasePence,
      vatRateBps: normalized.vatRateBps,
      productUnits: {
        create: (normalized.unitConfigs ?? []).map((config) => ({
          unitId: config.unitId,
          isBaseUnit: config.isBaseUnit,
          conversionToBase: config.conversionToBase,
          sellingPricePence: config.sellingPricePence ?? null,
          defaultCostPence: config.defaultCostPence ?? null,
        })),
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
    units: created.productUnits.map((pu: any) => ({
      id: pu.unitId,
      name: pu.unit.name,
      pluralName: pu.unit.pluralName,
      conversionToBase: pu.conversionToBase,
      isBaseUnit: pu.isBaseUnit,
      sellingPricePence: pu.sellingPricePence,
      defaultCostPence: pu.defaultCostPence,
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

export async function getCatalogSanitySnapshot(
  businessId: string,
  rowLimit = 8
): Promise<CatalogSanitySnapshot> {
  const products = await prisma.product.findMany({
    where: { businessId, active: true },
    select: {
      id: true,
      name: true,
      barcode: true,
      sellingPriceBasePence: true,
      defaultCostBasePence: true,
      productUnits: {
        select: {
          unitId: true,
          isBaseUnit: true,
          conversionToBase: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  let zeroOrNegativeSellingPriceCount = 0;
  let belowCostCount = 0;
  let missingBarcodeCount = 0;
  let invalidUnitConfigCount = 0;
  let duplicateNormalizedNameCount = 0;
  const rows: CatalogSanityRow[] = [];
  const normalizedNameCounts = new Map<string, number>();

  for (const product of products) {
    const normalizedName = product.name.trim().toLowerCase();
    normalizedNameCounts.set(normalizedName, (normalizedNameCounts.get(normalizedName) ?? 0) + 1);
  }

  for (const product of products) {
    const reasons: string[] = [];
    const baseUnits = product.productUnits.filter((unit) => unit.isBaseUnit);
    const nonBaseUnits = product.productUnits.filter((unit) => !unit.isBaseUnit);
    const normalizedName = product.name.trim().toLowerCase();

    if (product.sellingPriceBasePence <= 0) {
      zeroOrNegativeSellingPriceCount++;
      reasons.push('Selling price is zero or negative');
    }
    if (
      product.defaultCostBasePence > 0 &&
      product.sellingPriceBasePence > 0 &&
      product.defaultCostBasePence > product.sellingPriceBasePence
    ) {
      belowCostCount++;
      reasons.push('Default cost is higher than selling price');
    }
    if (!product.barcode?.trim()) {
      missingBarcodeCount++;
      reasons.push('No barcode set');
    }
    if (
      baseUnits.length !== 1 ||
      nonBaseUnits.some((unit) => unit.conversionToBase <= 1 || unit.unitId === baseUnits[0]?.unitId)
    ) {
      invalidUnitConfigCount++;
      reasons.push('Unit configuration needs repair');
    }
    if ((normalizedNameCounts.get(normalizedName) ?? 0) > 1) {
      duplicateNormalizedNameCount++;
      reasons.push('Looks duplicated after trimming/case normalization');
    }

    if (reasons.length > 0 && rows.length < rowLimit) {
      rows.push({
        id: product.id,
        name: product.name,
        sellingPriceBasePence: product.sellingPriceBasePence,
        defaultCostBasePence: product.defaultCostBasePence,
        barcode: product.barcode,
        reasons,
      });
    }
  }

  const checks: CatalogSanityCheck[] = [
    {
      key: 'zero-price',
      label: 'Zero-price products',
      severity: 'blocking',
      count: zeroOrNegativeSellingPriceCount,
      helper: 'These can make live tills look broken or unsafe to cashiers.',
    },
    {
      key: 'invalid-units',
      label: 'Broken unit setup',
      severity: 'blocking',
      count: invalidUnitConfigCount,
      helper: 'Products should have exactly one base unit and valid pack/carton conversions.',
    },
    {
      key: 'below-cost',
      label: 'Selling below default cost',
      severity: 'warning',
      count: belowCostCount,
      helper: 'Sometimes intentional, often a pricing mistake that damages owner trust.',
    },
    {
      key: 'missing-barcode',
      label: 'Products missing barcodes',
      severity: 'warning',
      count: missingBarcodeCount,
      helper: 'Not every SKU needs one, but supermarket scanning speed drops when too many are missing.',
    },
    {
      key: 'normalized-duplicates',
      label: 'Possible duplicate names',
      severity: 'warning',
      count: duplicateNormalizedNameCount,
      helper: 'These can confuse cashiers during search and create owner distrust in catalog quality.',
    },
  ];

  return {
    blockingCount: checks.filter((check) => check.severity === 'blocking').reduce((sum, check) => sum + check.count, 0),
    warningCount: checks.filter((check) => check.severity === 'warning').reduce((sum, check) => sum + check.count, 0),
    checks,
    rows,
  };
}
