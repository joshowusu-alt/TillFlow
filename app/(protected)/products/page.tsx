import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, getMinorUnitLabel, getCurrencySymbol } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { createProductAction } from '@/app/actions/products';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/app/actions/categories';
import Link from 'next/link';

export default async function ProductsPage({ searchParams }: { searchParams?: { error?: string; tab?: string } }) {
  const { user, business } = await requireBusiness();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  // Run all data queries in parallel
  const [products, categories, units] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        sellingPriceBasePence: true,
        defaultCostBasePence: true,
        productUnits: {
          select: {
            isBaseUnit: true,
            conversionToBase: true,
            unit: { select: { name: true, pluralName: true } }
          }
        },
        category: { select: { name: true, colour: true } }
      }
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        colour: true,
        imageUrl: true,
        _count: { select: { products: true } }
      }
    }),
    prisma.unit.findMany({
      select: { id: true, name: true }
    }),
  ]);
  const isManager = user.role !== 'CASHIER';
  const activeTab = searchParams?.tab || 'products';

  return (
    <div className="space-y-6">
      <PageHeader title="Products" subtitle="Products, categories, and pricing." />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-black/5 p-1 w-fit">
        <Link
          href="/products?tab=products"
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'products' ? 'bg-white shadow-sm text-black' : 'text-black/50 hover:text-black'}`}
        >
          Products ({products.length})
        </Link>
        <Link
          href="/products?tab=categories"
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'categories' ? 'bg-white shadow-sm text-black' : 'text-black/50 hover:text-black'}`}
        >
          Categories ({categories.length})
        </Link>
      </div>

      {/* ───── Products Tab ───── */}
      {activeTab === 'products' && (
        <>
          {isManager ? (
            <div className="card p-6">
              <h2 className="text-lg font-display font-semibold">Add product</h2>
              <FormError error={searchParams?.error} />
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
                  <label className="label">Category</label>
                  <select className="input" name="categoryId">
                    <option value="">Uncategorised</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-black/50">
                    Don&apos;t see your category? <a href="/products?tab=categories" className="text-accent underline">Add one here</a>.
                  </div>
                </div>
                <div>
                  <label className="label">Base Price ({getMinorUnitLabel(business.currency)})</label>
                  <input className="input" name="sellingPriceBasePence" type="number" min={0} required />
                  <div className="mt-1 text-xs text-black/50">Price per base unit in {getMinorUnitLabel(business.currency)}. E.g. {getCurrencySymbol(business.currency)}5.00 = 500.</div>
                </div>
                <div>
                  <label className="label">Base Cost ({getMinorUnitLabel(business.currency)})</label>
                  <input className="input" name="defaultCostBasePence" type="number" min={0} required />
                  <div className="mt-1 text-xs text-black/50">Cost per base unit in {getMinorUnitLabel(business.currency)}.</div>
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
                  <SubmitButton className="btn-primary" loadingText="Creating…">Create product</SubmitButton>
                </div>
              </form>
            </div>
          ) : null}
          <div className="card p-6 overflow-x-auto">
            <table className="table w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th></th>
                  <th>Product</th>
                  <th>Category</th>
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
                      <td className="px-3 py-3 w-10">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-8 h-8 rounded-md object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                            {product.name.charAt(0)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        <Link href={`/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {product.category ? (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: product.category.colour }}
                          >
                            {product.category.name}
                          </span>
                        ) : (
                          <span className="text-black/30 text-xs">—</span>
                        )}
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
        </>
      )}

      {/* ───── Categories Tab ───── */}
      {activeTab === 'categories' && (
        <>
          {isManager ? (
            <div className="card p-6">
              <h2 className="text-lg font-display font-semibold">Add category</h2>
              <form action={createCategoryAction} className="mt-4 grid gap-4 md:grid-cols-4">
                <div>
                  <label className="label">Name</label>
                  <input className="input" name="name" required placeholder="e.g. Beverages" />
                </div>
                <div>
                  <label className="label">Colour</label>
                  <input className="input" name="colour" type="color" defaultValue="#059669" />
                </div>
                <div>
                  <label className="label">Image URL</label>
                  <input className="input" name="imageUrl" type="url" placeholder="https://..." />
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input className="input" name="sortOrder" type="number" defaultValue={0} />
                </div>
                <div className="md:col-span-4">
                  <SubmitButton className="btn-primary" loadingText="Creating…">Create category</SubmitButton>
                </div>
              </form>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div key={cat.id} className="card p-5 flex gap-4">
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt={cat.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: cat.colour }}
                  >
                    {cat.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.colour }}
                    />
                    <h3 className="font-semibold truncate">{cat.name}</h3>
                  </div>
                  <p className="text-sm text-black/50 mt-1">
                    {cat._count.products} product{cat._count.products !== 1 ? 's' : ''}
                  </p>
                  {isManager && (
                    <form action={deleteCategoryAction} className="mt-2">
                      <input type="hidden" name="id" value={cat.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700">Delete</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-black/40 col-span-full text-center py-8">
                No categories yet. Create one above to organise your products.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
