import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { unstable_cache } from 'next/cache';
import PosClient from './PosClient';

// ── Cached lookups for data that rarely changes ───────────────────
// Revalidates every 60 s or when explicitly invalidated.
const getCachedUnits = unstable_cache(
  (_businessId: string) => prisma.unit.findMany({ select: { id: true, name: true } }),
  ['pos-units'],
  { revalidate: 300, tags: ['pos-units'] }
);

const getCachedCategories = unstable_cache(
  (businessId: string) =>
    prisma.category.findMany({
      where: { businessId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, colour: true },
    }),
  ['pos-categories'],
  { revalidate: 120, tags: ['pos-categories'] }
);

const getCachedProducts = unstable_cache(
  (businessId: string) =>
    prisma.product.findMany({
      where: { businessId, active: true },
      select: {
        id: true,
        name: true,
        barcode: true,
        sellingPriceBasePence: true,
        vatRateBps: true,
        promoBuyQty: true,
        promoGetQty: true,
        categoryId: true,
        imageUrl: true,
        category: { select: { name: true } },
        productUnits: {
          select: {
            unitId: true,
            conversionToBase: true,
            isBaseUnit: true,
            unit: { select: { name: true, pluralName: true } },
          },
        },
      },
    }),
  ['pos-products'],
  { revalidate: 60, tags: ['pos-products'] }
);

export default async function PosPage() {
  const { business, store: baseStore } = await requireBusinessStore();
  if (!business) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }

  // Layer 1 — cached (rarely-changing) + fresh (session-sensitive) in parallel
  const [tills, openShifts, inventory, products, units, customers, categories] = await Promise.all([
    // Fresh: till/shift state must be real-time
    prisma.till.findMany({
      where: { storeId: baseStore.id, active: true },
      select: { id: true, name: true },
    }),
    prisma.shift.findMany({
      where: { till: { storeId: baseStore.id }, status: 'OPEN' },
      select: { tillId: true },
    }),
    prisma.inventoryBalance.findMany({
      where: { storeId: baseStore.id },
      select: { productId: true, qtyOnHandBase: true },
    }),
    // Cached: products, units, categories change infrequently
    getCachedProducts(business.id),
    getCachedUnits(business.id),
    prisma.customer.findMany({
      where: {
        businessId: business.id,
        ...(business.customerScope === 'BRANCH' ? { storeId: baseStore.id } : {}),
      },
      select: { id: true, name: true },
    }),
    getCachedCategories(business.id),
  ]);

  const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));

  const productDtos = products.map((product) => ({
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    sellingPriceBasePence: product.sellingPriceBasePence,
    vatRateBps: product.vatRateBps,
    promoBuyQty: product.promoBuyQty,
    promoGetQty: product.promoGetQty,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    imageUrl: product.imageUrl,
    units: product.productUnits.map((pu) => ({
      id: pu.unitId,
      name: pu.unit.name,
      pluralName: pu.unit.pluralName,
      conversionToBase: pu.conversionToBase,
      isBaseUnit: pu.isBaseUnit
    })),
    onHandBase: inventoryMap.get(product.id) ?? 0
  }));

  return (
    <PosClient
      business={{
        currency: business.currency,
        vatEnabled: business.vatEnabled,
        momoEnabled: (business as any).momoEnabled ?? false,
        momoProvider: (business as any).momoProvider ?? null,
        requireOpenTillForSales: (business as any).requireOpenTillForSales ?? false,
        discountApprovalThresholdBps: (business as any).discountApprovalThresholdBps ?? 1500,
      }}
      store={{ id: baseStore.id, name: baseStore.name }}
      tills={tills.map((till) => ({ id: till.id, name: till.name }))}
      openShiftTillIds={openShifts.map((shift) => shift.tillId)}
      products={productDtos}
      customers={[]}
      units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
      categories={categories.map((cat) => ({ id: cat.id, name: cat.name, colour: cat.colour }))}
    />
  );
}
