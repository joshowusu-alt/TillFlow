import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getFeatures, type BusinessPlan, type BusinessMode, type StoreMode } from '@/lib/features';
import { getProductPriceWarnings } from '@/lib/product-price-guards';
import { BULK_PRICING_LIMIT, MAX_PRICE_PENCE, BulkPricingError, calculateBulkPrice, parseBulkPricingInput,
  type BulkPricingInput, type BulkPricingPreview, type BulkPriceRow } from '@/lib/products/bulk-pricing';

const select = {
  id: true, name: true, publisher: true, edition: true, updatedAt: true, version: true,
  sellingPriceBasePence: true, defaultCostBasePence: true,
  productUnits: { orderBy: { id: 'asc' as const }, select: {
    id: true, isBaseUnit: true, conversionToBase: true, sellingPricePence: true, defaultCostPence: true,
    unit: { select: { name: true } },
  } },
} satisfies Prisma.ProductSelect;
type PricingProduct = Prisma.ProductGetPayload<{ select: typeof select }>;
type Db = Pick<Prisma.TransactionClient, 'product' | 'category' | 'productDivision' | 'productGroup' | 'business'>;

async function loadProducts(db: Db, businessId: string, input: BulkPricingInput) {
  const business = await db.business.findUnique({ where: { id: businessId }, select: { plan: true, mode: true, storeMode: true } });
  if (!business || !getFeatures((business.plan ?? business.mode) as BusinessPlan | BusinessMode, business.storeMode as StoreMode).advancedOps) {
    throw new BulkPricingError('Bulk pricing is available on Growth and Pro.');
  }
  // Invalid or mismatched filters must never silently widen a bulk mutation.
  if (input.categoryId && !await db.category.findFirst({ where: { id: input.categoryId, businessId }, select: { id: true } })) throw new BulkPricingError('Choose a category from this business.');
  if (input.divisionId && !await db.productDivision.findFirst({ where: { id: input.divisionId, businessId, ...(input.categoryId ? { categoryId: input.categoryId } : {}) }, select: { id: true } })) throw new BulkPricingError('Choose a division within the selected category.');
  if (input.groupId && !await db.productGroup.findFirst({ where: { id: input.groupId, businessId,
    ...(input.divisionId ? { divisionId: input.divisionId } : {}),
    division: { businessId, ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
  }, select: { id: true } })) throw new BulkPricingError('Choose a group within the selected division and category.');
  const products = await db.product.findMany({ where: {
    businessId, active: true,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.divisionId ? { group: { divisionId: input.divisionId } } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.search ? { OR: [
      { name: { contains: input.search, mode: 'insensitive' } },
      { publisher: { contains: input.search, mode: 'insensitive' } },
      { edition: { contains: input.search, mode: 'insensitive' } },
      { barcode: input.search }, { barcodes: { some: { code: input.search } } },
    ] } : {}),
  } as Prisma.ProductWhereInput, select, orderBy: { id: 'asc' }, take: BULK_PRICING_LIMIT + 1 });
  if (products.length > BULK_PRICING_LIMIT) throw new BulkPricingError(`More than ${BULK_PRICING_LIMIT} products match. Choose a category, division, group or a more specific search.`);
  return products;
}

function makeRow(product: PricingProduct, input: BulkPricingInput): BulkPriceRow {
  const row: BulkPriceRow = { id: product.id, name: [product.name, product.publisher, product.edition].filter(Boolean).join(' · '),
    baseBefore: product.sellingPriceBasePence, baseAfter: product.sellingPriceBasePence, baseCost: product.defaultCostBasePence, prices: [], warnings: [], error: null, changed: false };
  try {
    const compute = (price: number, cost: number) => {
      if (input.basis === 'CATALOGUE_COST' && cost <= 0) throw new BulkPricingError('Catalogue cost is missing. Record a cost or use the current selling price.');
      return calculateBulkPrice(input.basis === 'CATALOGUE_COST' ? cost : price, input);
    };
    const warnings = (label: string, price: number, cost: number) => {
      if (cost <= 0) row.warnings.push(`${label}: cost not recorded; margin cannot be checked.`);
      getProductPriceWarnings({ sellingPricePence: price, defaultCostBasePence: cost }).forEach(w => row.warnings.push(`${label}: ${w.message}`));
    };
    row.baseAfter = compute(product.sellingPriceBasePence, product.defaultCostBasePence);
    warnings('Base price', row.baseAfter, product.defaultCostBasePence);
    for (const unit of product.productUnits) {
      if (!Number.isSafeInteger(unit.conversionToBase) || unit.conversionToBase <= 0) throw new BulkPricingError('A selling unit has an invalid pack quantity. Correct it before repricing.');
      const before = unit.sellingPricePence ?? product.sellingPriceBasePence * unit.conversionToBase;
      const cost = unit.defaultCostPence ?? product.defaultCostBasePence * unit.conversionToBase;
      let afterOverride = unit.sellingPricePence;
      if (unit.isBaseUnit) {
        if (unit.conversionToBase !== 1) throw new BulkPricingError('The base selling unit must contain one base unit.');
        afterOverride = unit.sellingPricePence === null ? null : row.baseAfter;
      } else if (input.units === 'ALL_UNITS') {
        const next = compute(before, cost);
        afterOverride = unit.sellingPricePence === null && next === row.baseAfter * unit.conversionToBase ? null : next;
      }
      const after = afterOverride ?? row.baseAfter * unit.conversionToBase;
      if (!Number.isSafeInteger(after) || after <= 0 || after > MAX_PRICE_PENCE) throw new BulkPricingError('A selling-unit price is outside the allowed range.');
      const changed = before !== after || unit.sellingPricePence !== afterOverride;
      row.prices.push({ id: unit.id, label: `${unit.unit.name} (${unit.conversionToBase} base ${unit.conversionToBase === 1 ? 'unit' : 'units'})`,
        before, after, beforeOverride: unit.sellingPricePence, afterOverride, cost, changed });
      if (changed && !unit.isBaseUnit) warnings(unit.unit.name, after, cost);
    }
    row.changed = row.baseBefore !== row.baseAfter || row.prices.some(p => p.changed);
  } catch (error) {
    if (!(error instanceof BulkPricingError)) throw error;
    row.error = error.message;
    row.changed = false;
    row.prices = [];
  }
  return row;
}

function previewFor(businessId: string, input: BulkPricingInput, products: PricingProduct[]): BulkPricingPreview {
  return { input, fingerprint: createHash('sha256').update(JSON.stringify({ businessId, input, products })).digest('hex'),
    rows: products.map(p => makeRow(p, input)).sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function previewBulkPricing(businessId: string, raw: unknown): Promise<BulkPricingPreview> {
  const input = parseBulkPricingInput(raw);
  return previewFor(businessId, input, await loadProducts(prisma, businessId, input));
}

export async function applyBulkPricing(actor: { businessId: string; id: string; name: string | null; role: string }, raw: {
  input: unknown; fingerprint: string; selectedIds: string[]; acknowledgeWarnings: boolean; reason: string;
}) {
  if (!['OWNER', 'MANAGER'].includes(actor.role)) throw new BulkPricingError('Owner or manager access is required.');
  const input = parseBulkPricingInput(raw?.input);
  if (!/^[a-f0-9]{64}$/.test(raw.fingerprint ?? '') || !Array.isArray(raw.selectedIds) || raw.selectedIds.length === 0 || raw.selectedIds.length > BULK_PRICING_LIMIT ||
      raw.selectedIds.some(id => typeof id !== 'string') || new Set(raw.selectedIds).size !== raw.selectedIds.length) throw new BulkPricingError('Select the products in a fresh preview.');
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!reason || reason.length > 300) throw new BulkPricingError('Enter a reason of up to 300 characters.');
  try {
    return await prisma.$transaction(async tx => {
      const products = await loadProducts(tx, actor.businessId, input);
      const preview = previewFor(actor.businessId, input, products);
      if (preview.fingerprint !== raw.fingerprint) throw new BulkPricingError('Products changed since this preview. Refresh the preview and review the prices again.');
      const selected = raw.selectedIds.map(id => preview.rows.find(row => row.id === id));
      if (selected.some(row => !row || row.error || !row.changed)) throw new BulkPricingError('The selection contains an unavailable, invalid or unchanged product. Refresh the preview.');
      const rows = selected as BulkPriceRow[];
      if (rows.some(row => row.warnings.length > 0) && raw.acknowledgeWarnings !== true) throw new BulkPricingError('Review and acknowledge the selected price warnings.');
      const batchId = randomUUID();
      for (const row of rows) {
        const product = products.find(p => p.id === row.id)!;
        const updated = await tx.product.updateMany({ where: { id: row.id, businessId: actor.businessId, active: true,
          updatedAt: product.updatedAt, version: product.version, sellingPriceBasePence: product.sellingPriceBasePence, defaultCostBasePence: product.defaultCostBasePence },
        data: { sellingPriceBasePence: row.baseAfter, version: { increment: 1 } } });
        if (updated.count !== 1) throw new BulkPricingError('A product changed during this update. Nothing was applied; refresh the preview.');
        for (const price of row.prices.filter(p => p.beforeOverride !== p.afterOverride)) {
          const original = product.productUnits.find(u => u.id === price.id)!;
          const updatedUnit = await tx.productUnit.updateMany({ where: { id: price.id, productId: row.id,
            sellingPricePence: original.sellingPricePence, defaultCostPence: original.defaultCostPence, conversionToBase: original.conversionToBase, isBaseUnit: original.isBaseUnit },
          data: { sellingPricePence: price.afterOverride } });
          if (updatedUnit.count !== 1) throw new BulkPricingError('A selling unit changed during this update. Nothing was applied; refresh the preview.');
        }
      }
      // Audit and prices commit together. Historical sales, stock costs and purchase documents are untouched.
      await tx.auditLog.createMany({ data: rows.map(row => ({ businessId: actor.businessId, userId: actor.id,
        userName: actor.name ?? 'Unknown', userRole: actor.role, action: 'PRICE_CHANGE', actionType: 'PRICE_CHANGE',
        entity: 'Product', entityType: 'Product', entityId: row.id, reason,
        beforeState: JSON.stringify({ sellingPriceBasePence: row.baseBefore, units: row.prices.map(p => ({ id: p.id, sellingPricePence: p.beforeOverride, effectivePricePence: p.before })) }),
        afterState: JSON.stringify({ sellingPriceBasePence: row.baseAfter, units: row.prices.map(p => ({ id: p.id, sellingPricePence: p.afterOverride, effectivePricePence: p.after })) }),
        details: JSON.stringify({ batchId, source: 'BULK_PRICING', input, warnings: row.warnings }),
      })) });
      return { updated: rows.length, batchId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2028'].includes(error.code)) throw new BulkPricingError('The batch could not finish because records were busy. Refresh the preview before trying again.');
    throw error;
  }
}
