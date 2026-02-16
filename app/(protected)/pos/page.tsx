import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import PosClient from './PosClient';

export default async function PosPage() {
  const { user, business, store: baseStore } = await requireBusinessStore();
  const store = await prisma.store.findFirst({ where: { id: baseStore.id }, include: { tills: true } });
  if (!business || !store) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }

  const inventory = await prisma.inventoryBalance.findMany({ where: { storeId: store.id } });
  const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true },
    include: { productUnits: { include: { unit: true } }, category: true }
  });
  const units = await prisma.unit.findMany();

  const customers = await prisma.customer.findMany({ where: { businessId: business.id } });
  const categories = await prisma.category.findMany({
    where: { businessId: business.id },
    orderBy: { sortOrder: 'asc' }
  });

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
      tills={store.tills.map((till) => ({ id: till.id, name: till.name }))}
      products={productDtos}
      customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
      units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
      categories={categories.map((cat) => ({ id: cat.id, name: cat.name, colour: cat.colour }))}
    />
  );
}
