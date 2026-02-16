import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import PosClient from './PosClient';

export default async function PosPage() {
  const { business, store: baseStore } = await requireBusinessStore();
  if (!business) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }

  // Run ALL data queries in parallel instead of sequentially
  const [storeWithTills, inventory, products, units, customers, categories] = await Promise.all([
    prisma.store.findFirst({
      where: { id: baseStore.id },
      select: {
        id: true,
        name: true,
        tills: {
          where: { active: true },
          select: { id: true, name: true }
        }
      }
    }),
    prisma.inventoryBalance.findMany({
      where: { storeId: baseStore.id },
      select: { productId: true, qtyOnHandBase: true }
    }),
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
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
            unit: { select: { name: true, pluralName: true } }
          }
        }
      }
    }),
    prisma.unit.findMany({ select: { id: true, name: true } }),
    prisma.customer.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true }
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, colour: true }
    }),
  ]);

  const store = storeWithTills ?? baseStore;
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
      business={{ currency: business.currency, vatEnabled: business.vatEnabled }}
      store={{ id: store.id, name: store.name }}
      tills={'tills' in store ? store.tills.map((till) => ({ id: till.id, name: till.name })) : []}
      products={productDtos}
      customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
      units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
      categories={categories.map((cat) => ({ id: cat.id, name: cat.name, colour: cat.colour }))}
    />
  );
}
