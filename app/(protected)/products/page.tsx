import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { createProductAction } from '@/app/actions/products';
import Link from 'next/link';

export default async function ProductsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const user = await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const products = await prisma.product.findMany({
    where: { businessId: business.id },
    include: { productUnits: { include: { unit: true } } }
  });
  const units = await prisma.unit.findMany();
  const isManager = user.role !== 'CASHIER';

  return (
    <div className="space-y-6">
      <PageHeader title="Products" subtitle="Units, prices, and packaging conversions." />
      {isManager ? (
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Add product</h2>
          {searchParams?.error === 'duplicate-name' ? (
            <div className="mt-3 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
              A product with that name already exists.
            </div>
          ) : null}
          <form action={createProductAction} className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" required />
            </div>
            <div>
              <label className="label">SKU</label>
              <input className="input" name="sku" />
            </div>
            <div>
              <label className="label">Barcode</label>
              <input className="input" name="barcode" />
            </div>
            <div>
              <label className="label">Base Price (pence)</label>
              <input className="input" name="sellingPriceBasePence" type="number" min={0} required />
              <div className="mt-1 text-xs text-black/50">Price per base unit (e.g., per piece).</div>
            </div>
            <div>
              <label className="label">Base Cost (pence)</label>
              <input className="input" name="defaultCostBasePence" type="number" min={0} required />
              <div className="mt-1 text-xs text-black/50">Cost per base unit.</div>
            </div>
            <div>
              <label className="label">VAT Rate (bps)</label>
              <input className="input" name="vatRateBps" type="number" min={0} defaultValue={0} />
            </div>
            <div>
              <label className="label">Promo Buy Qty (base units)</label>
              <input className="input" name="promoBuyQty" type="number" min={0} defaultValue={0} />
              <div className="mt-1 text-xs text-black/50">Buy X units to trigger a promo.</div>
            </div>
            <div>
              <label className="label">Promo Get Qty (base units)</label>
              <input className="input" name="promoGetQty" type="number" min={0} defaultValue={0} />
              <div className="mt-1 text-xs text-black/50">Free units given when promo applies.</div>
            </div>
            <div>
              <label className="label">Single Unit (smallest)</label>
              <select className="input" name="baseUnitId" required>
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
              <select className="input" name="packagingUnitId">
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
              <input className="input" name="packagingConversion" type="number" min={1} defaultValue={1} />
              <div className="mt-1 text-xs text-black/50">
                How many single units are inside 1 pack/carton.
              </div>
            </div>
            <div className="md:col-span-3">
              <button className="btn-primary">Create product</button>
            </div>
          </form>
        </div>
      ) : null}
      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>Base Price</th>
              <th>Default Cost</th>
              <th>Unit Display</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
              const packaging = getPrimaryPackagingUnit(
                product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
              );
              const preview = formatMixedUnit({
                qtyBase: packaging?.conversionToBase ? packaging.conversionToBase + 2 : 2,
                baseUnit: baseUnit?.unit.name ?? 'unit',
                baseUnitPlural: baseUnit?.unit.pluralName,
                packagingUnit: packaging?.unit.name,
                packagingUnitPlural: packaging?.unit.pluralName,
                packagingConversion: packaging?.conversionToBase
              });
              return (
                <tr key={product.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/products/${product.id}`} className="hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{formatMoney(product.sellingPriceBasePence, business.currency)}</td>
                  <td className="px-3 py-3">{formatMoney(product.defaultCostBasePence, business.currency)}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{preview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
