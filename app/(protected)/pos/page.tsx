import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import PosClient from './PosClient';

export default async function PosPage() {
  await requireUser();
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst({ include: { tills: true } });
  if (!business || !store) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }

  const inventory = await prisma.inventoryBalance.findMany({ where: { storeId: store.id } });
  const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true },
    include: { productUnits: { include: { unit: true } } }
  });
  const units = await prisma.unit.findMany();

  const customers = await prisma.customer.findMany({ where: { businessId: business.id } });

  const productDtos = products.map((product) => ({
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    sellingPriceBasePence: product.sellingPriceBasePence,
    vatRateBps: product.vatRateBps,
    promoBuyQty: product.promoBuyQty,
    promoGetQty: product.promoGetQty,
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
    />
  );
}
