import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import { AdminProductImage } from '@/components/AdminProductImage';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, getMinorUnitLabel, getCurrencySymbol, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { createProductAction } from '@/app/actions/products';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/app/actions/categories';
import BarcodeScanInput from '@/components/BarcodeScanInput';
import ProductUnitPricingEditor from '@/components/ProductUnitPricingEditor';
import Link from 'next/link';
import { Suspense } from 'react';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import ProductImageInput from '@/components/ProductImageInput';
import ProductCreateFormEnhancer from '@/components/products/ProductCreateFormEnhancer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

function ProductStatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-black/40">{label}</div>
      <div className="mt-1 text-2xl font-display font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-black/45">{helper}</div>
    </div>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams?: { error?: string; tab?: string; q?: string; page?: string; created?: string } }) {
  const { user, business } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const defaultMarginThresholdPercent = ((business.minimumMarginThresholdBps ?? 1500) / 100).toFixed(2);
  const fileUploadEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN) || (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true');

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const productWhere = {
    businessId: business.id,
    active: true,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  // Run all data queries in parallel
  const [totalProductCount, products, categories, units, suppliers] = await measureServerOperation(
    'page.products.load',
    () => Promise.all([
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
          category: { select: { name: true, colour: true } },
          preferredSupplier: { select: { id: true, name: true } }
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
      prisma.supplier.findMany({
        where: { businessId: business.id },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      }),
    ]),
    {
      businessId: business.id,
      route: '/products',
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      rowCount: DEFAULT_PAGE_SIZE,
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
  const totalProductPages = Math.max(1, Math.ceil(totalProductCount / DEFAULT_PAGE_SIZE));
  const isManager = user.role !== 'CASHIER';
  const activeTab = searchParams?.tab || 'products';

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Products"
        subtitle="Manage the items you sell, their prices, stock levels, and suppliers."
        actions={
          <Link href="/products/labels" className="btn-secondary justify-center text-sm">
            Print Labels
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ProductStatCard
          label="Total products"
          value={totalProductCount.toLocaleString('en-GH')}
          helper={q ? 'Matching current search' : 'Active catalogue items'}
        />
        <ProductStatCard
          label="Visible products"
          value={products.length.toLocaleString('en-GH')}
          helper="Shown on this page"
        />
        <ProductStatCard
          label="Categories"
          value={categories.length.toLocaleString('en-GH')}
          helper="Available product groups"
        />
        <ProductStatCard
          label="Suppliers available"
          value={suppliers.length.toLocaleString('en-GH')}
          helper="Ready for preferred supplier links"
        />
      </div>

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
                <span className="ml-1.5 text-sm text-ink/70">Add opening stock on the product form or from Opening Stock setup before your first sale.</span>
              </div>
              <Link href="/setup/opening-stock" className="flex-shrink-0 text-xs font-semibold text-accent hover:underline">
                Add opening stock &rarr;
              </Link>
            </div>
          )}
          {/* Product search and actions */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <Suspense><SearchFilter placeholder="Search products…" /></Suspense>
            </div>
            {isManager ? (
              <div className="flex flex-wrap gap-2">
                <a href="#product-create" className="btn-secondary text-sm">
                  Add product
                </a>
                <Link href="/settings/import-stock" className="btn-secondary text-sm">
                  Import from file
                </Link>
              </div>
            ) : null}
          </div>

          {/* Add product */}
          {isManager ? (
            <details className="group">
              <summary id="product-create" className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add product
                </span>
                <svg className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </summary>
              <div className="card mt-2 p-4 sm:p-5">
                <h2 className="text-lg font-display font-semibold">Add product</h2>
                <p className="mt-1 text-sm text-black/55">Start with the items you sell every day. You can add the rest of the catalogue later.</p>
                <FormError error={searchParams?.error} />
              <ProductCreateFormEnhancer
                createAction={createProductAction}
                currencySymbol={getCurrencySymbol(business.currency)}
                units={units}
              >
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
                  <ProductImageInput fileUploadEnabled={fileUploadEnabled} />
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
                  <label className="label">Preferred supplier</label>
                  <select className="input" name="preferredSupplierId">
                    <option value="">No preferred supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-black/50">
                    Used by Sales by Linked Supplier reporting. It does not track exact stock-batch origin.
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
              </ProductCreateFormEnhancer>
              </div>
            </details>
          ) : null}
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
                      <div className="text-sm font-semibold text-ink">No products yet.</div>
                      <div className="mt-1 text-sm text-black/55">Add your first product so you can start selling, tracking stock, and seeing clear reports.</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                  <DataCard key={product.id} className="transition duration-150 hover:-translate-y-px hover:shadow-card active:scale-[0.98]">
                    <DataCardHeader
                      title={
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <AdminProductImage
                              src={product.imageUrl}
                              alt={product.name}
                              fallbackChar={product.name.charAt(0)}
                              className="h-10 w-10 rounded-xl object-cover"
                              fallbackClassName="flex h-10 w-10 items-center justify-center rounded-xl bg-accentSoft text-sm font-bold text-accent"
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
                      <DataCardField label="Preferred supplier" value={<span className="text-black/65">{product.preferredSupplier?.name ?? 'None'}</span>} className="col-span-2" />
                      <DataCardField label="Unit display" value={<span className="text-black/65">{preview}</span>} className="col-span-2" />
                    </div>
                    <DataCardActions>
                      <Link href={`/products/${product.id}`} className="btn-ghost text-xs">
                        Open product
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
                    <th className="hidden xl:table-cell">Preferred Supplier</th>
                    <th className="hidden lg:table-cell">Unit Display</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center">
                        <div className="text-sm font-semibold text-ink">{q ? `No products matching "${q}".` : 'No products yet.'}</div>
                        <div className="mt-1 text-sm text-black/55">
                          {q ? 'Try a different search term or clear the search.' : 'Add your first product so you can start selling, tracking stock, and seeing clear reports.'}
                        </div>
                        {!q && isManager ? (
                          <div className="mt-4 flex justify-center gap-2">
                            <a href="#product-create" className="btn-primary text-xs px-3 py-1.5">Add first product</a>
                            <Link href="/settings/import-stock" className="btn-ghost border border-black/10 rounded-lg px-3 py-1.5 text-xs">
                              Import from file
                            </Link>
                          </div>
                        ) : null}
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
                      <tr key={product.id} className="rounded-xl bg-white transition-colors duration-150 hover:bg-slate-50">
                        <td className="hidden sm:table-cell px-3 py-3 w-10">
                          {product.imageUrl ? (
                            <AdminProductImage
                              src={product.imageUrl}
                              alt={product.name}
                              fallbackChar={product.name.charAt(0)}
                              className="w-8 h-8 rounded-md object-cover"
                              fallbackClassName="w-8 h-8 rounded-md bg-accentSoft flex items-center justify-center text-xs font-bold text-accent"
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
                        <td className="hidden xl:table-cell px-3 py-3 text-sm text-black/60">
                          {product.preferredSupplier ? (
                            <Link href={`/suppliers/${product.preferredSupplier.id}`} className="hover:underline">
                              {product.preferredSupplier.name}
                            </Link>
                          ) : (
                            <span className="text-black/30">—</span>
                          )}
                        </td>
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
                  <AdminProductImage
                    src={cat.imageUrl}
                    alt={cat.name}
                    fallbackChar={cat.name.charAt(0)}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    fallbackClassName="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                    fallbackStyle={{ backgroundColor: cat.colour }}
                  />
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
