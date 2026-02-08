import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { updateProductAction } from '@/app/actions/products';

export default async function ProductDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const user = await requireUser();
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst();
  if (!business || !store) return <div className="card p-6">Seed data missing.</div>;

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { productUnits: { include: { unit: true } }, inventoryBalances: true }
  });

  if (!product) return <div className="card p-6">Product not found.</div>;
  const units = await prisma.unit.findMany();
  const isManager = user.role !== 'CASHIER';

  const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
  const packaging = getPrimaryPackagingUnit(
    product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
  );
  const qtyOnHand =
    product.inventoryBalances.find((balance) => balance.storeId === store.id)?.qtyOnHandBase ?? 0;
  const mixed = formatMixedUnit({
    qtyBase: qtyOnHand,
    baseUnit: baseUnit?.unit.name ?? 'unit',
    baseUnitPlural: baseUnit?.unit.pluralName,
    packagingUnit: packaging?.unit.name,
    packagingUnitPlural: packaging?.unit.pluralName,
    packagingConversion: packaging?.conversionToBase
  });

  return (
    <div className="space-y-6">
      <PageHeader title={product.name} subtitle="Product detail and unit breakdown." />
      <div className="card p-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Pricing</div>
          <div>Selling price: {formatMoney(product.sellingPriceBasePence, business.currency)}</div>
          <div>Default cost: {formatMoney(product.defaultCostBasePence, business.currency)}</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">On hand</div>
          <div className="text-lg font-semibold">{mixed}</div>
          <div className="text-black/50">Base unit: {baseUnit?.unit.name ?? '-'}</div>
          {packaging ? (
            <div className="text-black/50">
              Packaging unit: {packaging.unit.name} ({packaging.conversionToBase} base)
            </div>
          ) : null}
        </div>
      </div>

      {isManager ? (
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Edit product</h2>
          {searchParams?.error === 'duplicate-name' ? (
            <div className="mt-3 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
              A product with that name already exists.
            </div>
          ) : null}
          <form action={updateProductAction} className="mt-4 grid gap-4 md:grid-cols-3">
            <input type="hidden" name="id" value={product.id} />
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" defaultValue={product.name} required />
            </div>
            <div>
              <label className="label">SKU</label>
              <input className="input" name="sku" defaultValue={product.sku ?? ''} />
            </div>
            <div>
              <label className="label">Barcode</label>
              <input className="input" name="barcode" defaultValue={product.barcode ?? ''} />
            </div>
            <div>
              <label className="label">Base Price (pence)</label>
              <input
                className="input"
                name="sellingPriceBasePence"
                type="number"
                min={0}
                defaultValue={product.sellingPriceBasePence}
              />
              <div className="mt-1 text-xs text-black/50">Price per base unit (e.g., per piece).</div>
            </div>
            <div>
              <label className="label">Base Cost (pence)</label>
              <input
                className="input"
                name="defaultCostBasePence"
                type="number"
                min={0}
                defaultValue={product.defaultCostBasePence}
              />
              <div className="mt-1 text-xs text-black/50">Cost per base unit.</div>
            </div>
            <div>
              <label className="label">VAT Rate (bps)</label>
              <input
                className="input"
                name="vatRateBps"
                type="number"
                min={0}
                defaultValue={product.vatRateBps}
              />
            </div>
            <div>
              <label className="label">Promo Buy Qty (base units)</label>
              <input
                className="input"
                name="promoBuyQty"
                type="number"
                min={0}
                defaultValue={product.promoBuyQty ?? 0}
              />
              <div className="mt-1 text-xs text-black/50">Buy X units to trigger a promo.</div>
            </div>
            <div>
              <label className="label">Promo Get Qty (base units)</label>
              <input
                className="input"
                name="promoGetQty"
                type="number"
                min={0}
                defaultValue={product.promoGetQty ?? 0}
              />
              <div className="mt-1 text-xs text-black/50">Free units given when promo applies.</div>
            </div>
            <div>
              <label className="label">Single Unit (smallest)</label>
              <select className="input" name="baseUnitId" defaultValue={baseUnit?.unitId ?? ''}>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-black/50">
                Smallest unit you sell (e.g., piece, bottle, sachet).
              </div>
            </div>
            <div>
              <label className="label">Pack/Carton Unit (optional)</label>
              <select className="input" name="packagingUnitId" defaultValue={packaging?.unit.id ?? ''}>
                <option value="">None</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-black/50">
                Bigger bundle you receive or sell (e.g., carton, box).
              </div>
            </div>
            <div>
              <label className="label">Units per Pack/Carton</label>
              <input
                className="input"
                name="packagingConversion"
                type="number"
                min={1}
                defaultValue={packaging?.conversionToBase ?? 1}
              />
              <div className="mt-1 text-xs text-black/50">
                How many single units are inside 1 pack/carton.
              </div>
            </div>
            <div className="md:col-span-3">
              <button className="btn-primary">Save changes</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Units</h2>
        <div className="mt-3 space-y-2 text-sm">
          {product.productUnits.map((unit) => (
            <div key={unit.id} className="flex justify-between rounded-xl border border-black/5 bg-white px-3 py-2">
              <span>{unit.unit.name}</span>
              <span className="text-black/60">{unit.conversionToBase} base</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
