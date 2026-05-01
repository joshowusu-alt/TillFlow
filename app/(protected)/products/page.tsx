import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, getMinorUnitLabel, getCurrencySymbol, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { createProductAction } from '@/app/actions/products';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/app/actions/categories';
import RepairPricesButton from './RepairPricesButton';
import BarcodeScanInput from '@/components/BarcodeScanInput';
import ProductUnitPricingEditor from '@/components/ProductUnitPricingEditor';
import Link from 'next/link';
import { Suspense } from 'react';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import ProductImageInput from '@/components/ProductImageInput';

export default async function ProductsPage({ searchParams }: { searchParams?: { error?: string; tab?: string; q?: string; page?: string; created?: string } }) {
  const { user, business } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const defaultMarginThresholdPercent = ((business.minimumMarginThresholdBps ?? 1500) / 100).toFixed(2);

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const productWhere = {
    businessId: business.id,
    active: true,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  // Run all data queries in parallel
  const [totalProductCount, products, categories, units] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.product.findMany({
      where: productWhere,
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
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
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
  const totalProductPages = Math.max(1, Math.ceil(totalProductCount / DEFAULT_PAGE_SIZE));
  const isManager = user.role !== 'CASHIER';
  const activeTab = searchParams?.tab || 'products';

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Products"
        subtitle="Your live catalogue for pricing, stock, and barcode selling."
        actions={
          <Link href="/products/labels" className="btn-secondary justify-center text-sm">
            Print Labels
          </Link>
        }
      />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-black/5 p-1 w-fit">
        <Link
          href="/products?tab=products"
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'products' ? 'bg-white shadow-sm text-black' : 'text-black/50 hover:text-black'}`}
        >
          Products ({totalProductCount})
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
          {searchParams?.created === '1' && (
            <div className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/5 px-5 py-3.5">
              <svg className="h-5 w-5 flex-shrink-0 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <div className="flex-1">
                <span className="text-sm font-semibold text-success">Product added to your catalogue.</span>
                <span className="ml-1.5 text-sm text-ink/70">Record a purchase to set opening stock, then open the POS to start selling.</span>
              </div>
              <Link href="/purchases" className="flex-shrink-0 text-xs font-semibold text-accent hover:underline">
                Receive stock &rarr;
              </Link>
            </div>
          )}
          {user.role === 'OWNER' && <RepairPricesButton />}
          {isManager ? (
            <div id="product-create" className="card p-4 sm:p-5">
              <h2 className="text-lg font-display font-semibold">Add product</h2>
              <p className="mt-1 text-sm text-black/55">Start with the items you sell every day. You can add the rest of the catalogue later.</p>
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
                  <BarcodeScanInput name="barcode" />
                </div>
                <div>
                  <div className="label">Product image</div>
                  <ProductImageInput />
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
                  <label className="label">Base Price ({getCurrencySymbol(business.currency)})</label>
                  <input className="input" name="sellingPriceBasePence" type="number" min={0} step="0.01" inputMode="decimal" required />
                  <div className="mt-1 text-xs text-black/50">Price per base unit, e.g. 5.00 for {getCurrencySymbol(business.currency)}5.00.</div>
                </div>
                <div>
                  <label className="label">Base Cost ({getCurrencySymbol(business.currency)})</label>
                  <input className="input" name="defaultCostBasePence" type="number" min={0} step="0.01" inputMode="decimal" required />
                  <div className="mt-1 text-xs text-black/50">Cost per base unit, e.g. 3.50 for {getCurrencySymbol(business.currency)}3.50.</div>
                </div>
                <div>
                  <label className="label">Target Margin Override (%)</label>
                  <input className="input" name="minimumMarginThresholdPercent" type="number" min={0} max={100} step="0.01" placeholder={defaultMarginThresholdPercent} />
                  <div className="mt-1 text-xs text-black/50">Optional. Leave blank to inherit the business default target of {defaultMarginThresholdPercent}%.</div>
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
                <div className="md:col-span-3">
                  <ProductUnitPricingEditor
                    units={units}
                    currencySymbol={getCurrencySymbol(business.currency)}
                  />
                </div>
                <div className="md:col-span-3">
                  <SubmitButton className="btn-primary" loadingText="Creating…">Create product</SubmitButton>
                </div>
              </form>
            </div>
          ) : null}
          <div className="mb-4 max-w-xs">
            <Suspense><SearchFilter placeholder="Search products…" /></Suspense>
          </div>
          <div className="card p-4 sm:p-5">
            <div className="space-y-3 lg:hidden">
              {products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 px-5 py-7">
                  {q ? (
                    <>
                      <div className="text-sm font-semibold text-ink">No products match &ldquo;{q}&rdquo;</div>
                      <div className="mt-1 text-sm text-black/50">Try a broader search, or clear the filter to see your full catalogue.</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/30 mb-4">Your catalogue is empty</div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {([
                          { n: '1', title: 'Add your fastest-moving lines', detail: 'Start with 5–10 core products. The full catalogue can follow at any pace.' },
                          { n: '2', title: 'Set cost and selling price', detail: 'TillFlow calculates your gross margin automatically as each sale is recorded.' },
                          { n: '3', title: 'Open the POS', detail: 'Once one product is live, your team can begin recording sales immediately.' },
                        ] as { n: string; title: string; detail: string }[]).map(({ n, title, detail }) => (
                          <div key={n} className="rounded-xl border border-black/5 bg-slate-50 px-4 py-3">
                            <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{n}</div>
                            <div className="mt-2 text-sm font-semibold text-ink">{title}</div>
                            <div className="mt-1 text-xs text-black/50">{detail}</div>
                          </div>
                        ))}
                      </div>
                      {isManager ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <a href="#product-create" className="btn-primary text-xs px-3 py-1.5">Add first product</a>
                          <Link href="/settings/import-stock" className="btn-ghost border border-black/10 rounded-lg px-3 py-1.5 text-xs">
                            Import from file
                          </Link>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : products.map((product) => {
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
                  <DataCard key={product.id}>
                    <DataCardHeader
                      title={
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-10 w-10 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accentSoft text-sm font-bold text-accent">
                              {product.name.charAt(0)}
                            </div>
                          )}
                          <Link href={`/products/${product.id}`} className="truncate hover:underline">
                            {product.name}
                          </Link>
                        </div>
                      }
                      subtitle={product.category ? 'Catalog item' : 'Uncategorised product'}
                      aside={product.category ? (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: product.category.colour }}
                        >
                          {product.category.name}
                        </span>
                      ) : (
                        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/45">No category</span>
                      )}
                    />
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <DataCardField label="Base price" value={<span className="font-semibold text-ink">{formatMoney(product.sellingPriceBasePence, business.currency)}</span>} />
                      <DataCardField label="Default cost" value={<span className="font-semibold text-ink">{formatMoney(product.defaultCostBasePence, business.currency)}</span>} />
                      <DataCardField label="Unit display" value={<span className="text-black/65">{preview}</span>} className="col-span-2" />
                    </div>
                    <DataCardActions>
                      <Link href={`/products/${product.id}`} className="btn-ghost text-xs">
                        View Product
                      </Link>
                    </DataCardActions>
                  </DataCard>
                );
              })}
            </div>

            <div className="responsive-table-shell hidden lg:block">
              <table className="table w-full border-separate border-spacing-y-1.5">
                <thead>
                  <tr>
                    <th className="hidden sm:table-cell"></th>
                    <th>Product</th>
                    <th className="hidden sm:table-cell">Category</th>
                    <th>Base Price</th>
                    <th className="hidden lg:table-cell">Default Cost</th>
                    <th className="hidden lg:table-cell">Unit Display</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center">
                        <div className="text-sm font-semibold text-ink">{q ? `No products matching "${q}".` : 'No products loaded yet.'}</div>
                        <div className="mt-1 text-sm text-black/55">
                          {q ? 'Try a different search term or clear the search.' : 'Add your first few products to start receiving stock and selling from the till.'}
                        </div>
                      </td>
                    </tr>
                  )}
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
                        <td className="hidden sm:table-cell px-3 py-3 w-10">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-8 h-8 rounded-md object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-md bg-accentSoft flex items-center justify-center text-xs font-bold text-accent">
                              {product.name.charAt(0)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          <Link href={`/products/${product.id}`} className="hover:underline">
                            {product.name}
                          </Link>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-3">
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
                        <td className="hidden lg:table-cell px-3 py-3">{formatMoney(product.defaultCostBasePence, business.currency)}</td>
                        <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">{preview}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalPages={totalProductPages} basePath="/products" searchParams={{ q: q || undefined, tab: 'products' }} />
          </div>
        </>
      )}

      {/* ───── Categories Tab ───── */}
      {activeTab === 'categories' && (
        <>
          {isManager ? (
            <div className="card p-4 sm:p-5">
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
