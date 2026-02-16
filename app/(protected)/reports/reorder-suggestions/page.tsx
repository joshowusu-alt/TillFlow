import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

type QueryParams = {
  days?: string;
  lead?: string;
  storeId?: string;
};

export default async function ReorderSuggestionsPage({
  searchParams
}: {
  searchParams: QueryParams;
}) {
  const { business, store: defaultStore } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !defaultStore) {
    return <div className="card p-6">Business setup is incomplete.</div>;
  }

  const lookbackDays = Math.min(Math.max(parseInt(searchParams.days ?? '14', 10) || 14, 7), 90);
  const leadDays = Math.min(Math.max(parseInt(searchParams.lead ?? '7', 10) || 7, 1), 30);

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });

  const selectedStoreId =
    searchParams.storeId && stores.some((candidate) => candidate.id === searchParams.storeId)
      ? searchParams.storeId
      : defaultStore.id;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [products, salesLines] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        reorderPointBase: true,
        productUnits: {
          select: {
            isBaseUnit: true,
            conversionToBase: true,
            unit: { select: { name: true, pluralName: true } }
          }
        },
        inventoryBalances: {
          where: { storeId: selectedStoreId },
          select: { qtyOnHandBase: true }
        }
      }
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId: business.id,
          storeId: selectedStoreId,
          createdAt: { gte: since },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] }
        }
      },
      select: { productId: true, qtyBase: true }
    })
  ]);

  const soldByProduct = new Map<string, number>();
  for (const line of salesLines) {
    soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) + line.qtyBase);
  }

  const suggestions = products
    .map((product) => {
      const soldQty = soldByProduct.get(product.id) ?? 0;
      const avgDailyDemand = soldQty / lookbackDays;
      const onHand = product.inventoryBalances[0]?.qtyOnHandBase ?? 0;
      const safetyStock = product.reorderPointBase;
      const reorderTarget = Math.ceil(avgDailyDemand * leadDays + safetyStock);
      const suggestedQty = Math.max(reorderTarget - onHand, 0);
      const daysOfCover = avgDailyDemand > 0 ? onHand / avgDailyDemand : Number.POSITIVE_INFINITY;

      const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
      const packaging = getPrimaryPackagingUnit(
        product.productUnits.map((unit) => ({
          conversionToBase: unit.conversionToBase,
          unit: unit.unit
        }))
      );

      const onHandLabel = formatMixedUnit({
        qtyBase: onHand,
        baseUnit: baseUnit?.unit.name ?? 'unit',
        baseUnitPlural: baseUnit?.unit.pluralName,
        packagingUnit: packaging?.unit.name,
        packagingUnitPlural: packaging?.unit.pluralName,
        packagingConversion: packaging?.conversionToBase
      });

      const suggestionLabel = formatMixedUnit({
        qtyBase: suggestedQty,
        baseUnit: baseUnit?.unit.name ?? 'unit',
        baseUnitPlural: baseUnit?.unit.pluralName,
        packagingUnit: packaging?.unit.name,
        packagingUnitPlural: packaging?.unit.pluralName,
        packagingConversion: packaging?.conversionToBase
      });

      const urgency =
        suggestedQty === 0
          ? 'OK'
          : daysOfCover <= leadDays
          ? 'URGENT'
          : daysOfCover <= leadDays * 2
          ? 'SOON'
          : 'PLAN';

      return {
        id: product.id,
        name: product.name,
        soldQty,
        avgDailyDemand,
        onHand,
        onHandLabel,
        reorderTarget,
        suggestedQty,
        suggestionLabel,
        daysOfCover,
        urgency
      };
    })
    .filter((row) => row.suggestedQty > 0 || row.onHand <= 0 || row.onHand <= row.reorderTarget)
    .sort((a, b) => b.suggestedQty - a.suggestedQty)
    .slice(0, 200);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-black/40">Forecasting</div>
          <h1 className="text-2xl font-display font-semibold">Reorder Suggestions</h1>
          <p className="mt-1 text-sm text-black/60">
            Suggested reorder quantity = average daily demand × lead time + safety stock.
          </p>
        </div>
      </div>

      <div className="card p-4">
        <form className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">Store</label>
            <select name="storeId" className="input" defaultValue={selectedStoreId}>
              {stores.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Lookback Days</label>
            <input name="days" type="number" min={7} max={90} className="input" defaultValue={lookbackDays} />
          </div>
          <div>
            <label className="label">Lead Time (Days)</label>
            <input name="lead" type="number" min={1} max={30} className="input" defaultValue={leadDays} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Recalculate</button>
          </div>
        </form>
      </div>

      <div className="card p-6 overflow-x-auto">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>Sold ({lookbackDays}d)</th>
              <th>Avg / Day</th>
              <th>On Hand</th>
              <th>Reorder Target</th>
              <th>Suggested Reorder</th>
              <th>Coverage</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((item) => (
              <tr key={item.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm font-semibold">{item.name}</td>
                <td className="px-3 py-3 text-sm">{item.soldQty}</td>
                <td className="px-3 py-3 text-sm">{item.avgDailyDemand.toFixed(2)}</td>
                <td className="px-3 py-3 text-sm">{item.onHandLabel}</td>
                <td className="px-3 py-3 text-sm">{item.reorderTarget}</td>
                <td className="px-3 py-3 text-sm font-semibold">{item.suggestionLabel}</td>
                <td className="px-3 py-3 text-sm">
                  {Number.isFinite(item.daysOfCover) ? `${item.daysOfCover.toFixed(1)} days` : 'No demand'}
                </td>
                <td className="px-3 py-3 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.urgency === 'URGENT'
                        ? 'bg-rose-100 text-rose-700'
                        : item.urgency === 'SOON'
                        ? 'bg-amber-100 text-amber-700'
                        : item.urgency === 'PLAN'
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {item.urgency}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {suggestions.length === 0 ? (
          <div className="text-sm text-black/50">No reorder suggestions for the selected period.</div>
        ) : null}
      </div>
    </div>
  );
}
