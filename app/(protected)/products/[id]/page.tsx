import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { updateProductAction } from '@/app/actions/products';
import DeleteProductButton from './DeleteProductButton';
import BarcodeScanInput from '@/components/BarcodeScanInput';
import ProductUnitPricingEditor from '@/components/ProductUnitPricingEditor';

export default async function ProductDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const { user, business, store } = await requireBusinessStore();
  if (!business || !store) return <div className="card p-6">Seed data missing.</div>;

  const [product, units, categories] = await Promise.all([
    prisma.product.findFirst({
      where: { id: params.id, businessId: business.id },
        include: {
          productUnits: { include: { unit: true } },
          inventoryBalances: {
            where: { storeId: store.id },
            select: { storeId: true, qtyOnHandBase: true, avgCostBasePence: true }
          },
          category: true
        }
    }),
    prisma.unit.findMany({
      select: { id: true, name: true, pluralName: true }
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: { sortOrder: 'asc' }
    })
  ]);

  if (!product) return <div className="card p-6">Product not found.</div>;
  const isManager = user.role !== 'CASHIER';
  const businessMarginThresholdBps = business.minimumMarginThresholdBps ?? 1500;
  const productMarginThresholdBps = product.minimumMarginThresholdBps ?? null;
  const effectiveMarginThresholdBps = productMarginThresholdBps ?? businessMarginThresholdBps;

  const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
  const packaging = getPrimaryPackagingUnit(
    product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
  );
  const qtyOnHand = product.inventoryBalances[0]?.qtyOnHandBase ?? 0;
  const inventoryAvgCost = product.inventoryBalances[0]?.avgCostBasePence ?? product.defaultCostBasePence;
  const hasInventoryCostDrift =
    product.inventoryBalances[0]?.avgCostBasePence != null &&
    product.inventoryBalances[0].avgCostBasePence !== product.defaultCostBasePence;
  const mixed = formatMixedUnit({
    qtyBase: qtyOnHand,
    baseUnit: baseUnit?.unit.name ?? 'unit',
    baseUnitPlural: baseUnit?.unit.pluralName,
    packagingUnit: packaging?.unit.name,
    packagingUnitPlural: packaging?.unit.pluralName,
    packagingConversion: packaging?.conversionToBase
  });
  const initialUnitConfigs = product.productUnits.map((unit) => ({
    unitId: unit.unitId,
    conversionToBase: unit.conversionToBase,
    isBaseUnit: unit.isBaseUnit,
    sellingPricePence: unit.sellingPricePence,
    defaultCostPence: unit.defaultCostPence,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={product.name} subtitle="Product detail and unit breakdown." />

      {/* Hero row with image + summary */}
      <div className="card flex flex-col gap-6 p-6 sm:flex-row">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-accentSoft flex items-center justify-center text-3xl font-bold text-accent flex-shrink-0">
            {product.name.charAt(0)}
          </div>
        )}
        <div>
          <h2 className="text-xl font-semibold">{product.name}</h2>
          {product.category ? (
            <span className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: product.category.colour }}>
              {product.category.name}
            </span>
          ) : (
            <span className="text-xs text-black/40 mt-1 inline-block">Uncategorised</span>
          )}
          {product.sku && <div className="text-xs text-black/50 mt-1">SKU: {product.sku}</div>}
          {product.barcode && <div className="text-xs text-black/50">Barcode: {product.barcode}</div>}
        </div>
      </div>

      <div className="card grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Pricing</div>
          <div>Selling price: {formatMoney(product.sellingPriceBasePence, business.currency)}</div>
          <div>Default cost: {formatMoney(product.defaultCostBasePence, business.currency)}</div>
          <div>Inventory avg cost: {formatMoney(inventoryAvgCost, business.currency)}</div>
          <div>
            Margin target: {(effectiveMarginThresholdBps / 100).toFixed(2)}%
            <span className="ml-2 text-xs text-black/45">
              {productMarginThresholdBps !== null ? 'Product override' : 'Business default'}
            </span>
          </div>
          {hasInventoryCostDrift ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Inventory is still carrying an older average cost for this store, so margins may stay wrong until you repair the drift or receive new authoritative stock.
            </div>
          ) : null}
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
          <FormError error={searchParams?.error} />
          <form action={updateProductAction} className="mt-4 grid gap-4 lg:grid-cols-3">
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
              <BarcodeScanInput name="barcode" defaultValue={product.barcode ?? ''} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" name="categoryId" defaultValue={product.categoryId ?? ''}>
                <option value="">Uncategorised</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <div className="mt-1 text-xs text-black/50">
                Don&apos;t see your category? <a href="/products?tab=categories" className="text-accent underline">Add one here</a>.
              </div>
            </div>
            <div>
              <label className="label">Base Price ({getCurrencySymbol(business.currency)})</label>
              <input
                className="input"
                name="sellingPriceBasePence"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={(product.sellingPriceBasePence / 100).toFixed(2)}
              />
              <div className="mt-1 text-xs text-black/50">Price per base unit, e.g. 5.00 for {getCurrencySymbol(business.currency)}5.00.</div>
            </div>
            <div>
              <label className="label">Base Cost ({getCurrencySymbol(business.currency)})</label>
              <input
                className="input"
                name="defaultCostBasePence"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={(product.defaultCostBasePence / 100).toFixed(2)}
              />
              <div className="mt-1 text-xs text-black/50">
                Cost per base unit, e.g. 3.50 for {getCurrencySymbol(business.currency)}3.50. Saving here now also updates inventory average cost where stock has no purchase/transfer-return cost trail yet.
              </div>
            </div>
            <div>
              <label className="label">Target Margin Override (%)</label>
              <input
                className="input"
                name="minimumMarginThresholdPercent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={product.minimumMarginThresholdBps != null ? (product.minimumMarginThresholdBps / 100).toFixed(2) : ''}
                placeholder={(businessMarginThresholdBps / 100).toFixed(2)}
              />
              <div className="mt-1 text-xs text-black/50">Leave blank to inherit the business default target of {(businessMarginThresholdBps / 100).toFixed(2)}%.</div>
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
            <div className="lg:col-span-3">
              <ProductUnitPricingEditor
                units={units}
                currencySymbol={getCurrencySymbol(business.currency)}
                basePricePence={product.sellingPriceBasePence}
                baseCostPence={product.defaultCostBasePence}
                initialConfigs={initialUnitConfigs}
              />
            </div>
            <div className="lg:col-span-3">
              <SubmitButton className="btn-primary" loadingText="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Units</h2>
        <div className="mt-3 space-y-2 text-sm">
          {product.productUnits.map((unit) => (
            <div key={unit.id} className="flex justify-between rounded-xl border border-black/5 bg-white px-3 py-2">
              <span>
                {unit.unit.name}
                {unit.isBaseUnit ? ' (base)' : ''}
              </span>
              <span className="text-right text-black/60">
                <span className="block">{unit.conversionToBase} base</span>
                {unit.sellingPricePence != null ? (
                  <span className="block text-xs">Sell: {formatMoney(unit.sellingPricePence, business.currency)}</span>
                ) : null}
                {unit.defaultCostPence != null ? (
                  <span className="block text-xs">Cost: {formatMoney(unit.defaultCostPence, business.currency)}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>

      {user.role === 'OWNER' && (
        <div className="card border-2 border-rose-200 p-6">
          <h2 className="text-lg font-display font-semibold text-rose-700">Danger Zone</h2>
          <p className="mt-2 text-sm text-black/60">
            Deactivating a product hides it from the POS and product list. Existing sales history is preserved.
          </p>
          <DeleteProductButton productId={product.id} productName={product.name} />
        </div>
      )}
    </div>
  );
}
