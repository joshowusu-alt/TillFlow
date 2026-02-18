import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { markAsOrdered } from '@/app/actions/reorder';

type QueryParams = {
  days?: string;
  lead?: string;
  storeId?: string;
  group?: string;
};

const urgencyTone = {
  URGENT: 'danger' as const,
  SOON: 'warn' as const,
  PLAN: 'info' as const,
  OK: 'success' as const,
};

export default async function ReorderSuggestionsPage({
  searchParams
}: {
  searchParams: QueryParams;
}) {
  const { business, store: defaultStore } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !defaultStore) {
    return <EmptyState icon="box" title="Business setup incomplete" cta={{ label: 'Go to Settings', href: '/settings' }} />;
  }

  const lookbackDays = Math.min(Math.max(parseInt(searchParams.days ?? '14', 10) || 14, 7), 90);
  const leadDays = Math.min(Math.max(parseInt(searchParams.lead ?? '7', 10) || 7, 1), 30);
  const groupBySupplier = searchParams.group === 'supplier';

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

  const [products, salesLines, pendingOrders] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        reorderPointBase: true,
        preferredSupplierId: true,
        preferredSupplier: { select: { id: true, name: true } },
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
    }),
    prisma.reorderAction.findMany({
      where: {
        businessId: business.id,
        storeId: selectedStoreId,
        status: 'ORDERED',
      },
      select: { productId: true, qtyBase: true, orderedAt: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const line of salesLines) {
    soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) + line.qtyBase);
  }

  const pendingByProduct = new Map<string, { qty: number; date: Date }>();
  for (const order of pendingOrders) {
    const existing = pendingByProduct.get(order.productId);
    pendingByProduct.set(order.productId, {
      qty: (existing?.qty ?? 0) + order.qtyBase,
      date: existing?.date && existing.date > order.orderedAt ? existing.date : order.orderedAt,
    });
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

      const pending = pendingByProduct.get(product.id);

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
        urgency: urgency as 'URGENT' | 'SOON' | 'PLAN' | 'OK',
        supplierName: product.preferredSupplier?.name ?? null,
        supplierId: product.preferredSupplierId,
        pendingQty: pending?.qty ?? 0,
      };
    })
    .filter((row) => row.suggestedQty > 0 || row.onHand <= 0 || row.onHand <= row.reorderTarget)
    .sort((a, b) => b.suggestedQty - a.suggestedQty)
    .slice(0, 200);

  // Group by supplier if requested
  const supplierGroups = groupBySupplier
    ? Array.from(
        suggestions.reduce((acc, item) => {
          const key = item.supplierName ?? 'Unassigned';
          if (!acc.has(key)) acc.set(key, []);
          acc.get(key)!.push(item);
          return acc;
        }, new Map<string, typeof suggestions>())
      ).sort(([a], [b]) => a.localeCompare(b))
    : null;

  const baseSearchParams = `days=${lookbackDays}&lead=${leadDays}&storeId=${selectedStoreId}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reorder Suggestions"
        subtitle={`Velocity-based reorder: avg daily demand x ${leadDays}-day lead time + safety stock.`}
        actions={
          <div className="flex gap-2">
            <a
              href={`?${baseSearchParams}&group=${groupBySupplier ? '' : 'supplier'}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                groupBySupplier ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {groupBySupplier ? 'Grouped by Supplier' : 'Group by Supplier'}
            </a>
          </div>
        }
      />

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
          {groupBySupplier && <input type="hidden" name="group" value="supplier" />}
        </form>
      </div>

      {suggestions.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="check"
            title="No reorder suggestions"
            subtitle="All products are above their reorder points. Adjust lookback days or lead time to check again."
          />
        </div>
      ) : supplierGroups ? (
        <div className="space-y-6">
          {supplierGroups.map(([supplierName, items]) => (
            <div key={supplierName} className="card overflow-x-auto p-6">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-display font-semibold">{supplierName}</h2>
                <Badge tone="neutral">{items.length} item{items.length !== 1 ? 's' : ''}</Badge>
              </div>
              <ReorderTable items={items} lookbackDays={lookbackDays} selectedStoreId={selectedStoreId} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <ReorderTable items={suggestions} lookbackDays={lookbackDays} selectedStoreId={selectedStoreId} />
        </div>
      )}
    </div>
  );
}

type SuggestionItem = {
  id: string; name: string; soldQty: number; avgDailyDemand: number;
  onHandLabel: string; reorderTarget: number; suggestedQty: number;
  suggestionLabel: string; daysOfCover: number;
  urgency: 'URGENT' | 'SOON' | 'PLAN' | 'OK';
  supplierName: string | null; pendingQty: number;
};

function ReorderTable({
  items,
  lookbackDays,
  selectedStoreId,
}: {
  items: SuggestionItem[];
  lookbackDays: number;
  selectedStoreId: string;
}) {
  return (
    <table className="table w-full border-separate border-spacing-y-2">
      <thead>
        <tr>
          <th>Product</th>
          <th>Sold ({lookbackDays}d)</th>
          <th>Avg / Day</th>
          <th>On Hand</th>
          <th>Suggested</th>
          <th>Coverage</th>
          <th>Priority</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="rounded-xl bg-white">
            <td className="px-3 py-3 text-sm font-semibold">
              {item.name}
              {item.supplierName && (
                <span className="ml-2 text-xs text-muted">{item.supplierName}</span>
              )}
            </td>
            <td className="px-3 py-3 text-sm">{item.soldQty}</td>
            <td className="px-3 py-3 text-sm">{item.avgDailyDemand.toFixed(2)}</td>
            <td className="px-3 py-3 text-sm">{item.onHandLabel}</td>
            <td className="px-3 py-3 text-sm font-semibold">{item.suggestionLabel}</td>
            <td className="px-3 py-3 text-sm">
              {Number.isFinite(item.daysOfCover) ? `${item.daysOfCover.toFixed(1)} days` : 'No demand'}
            </td>
            <td className="px-3 py-3 text-sm">
              <Badge tone={urgencyTone[item.urgency]}>{item.urgency}</Badge>
            </td>
            <td className="px-3 py-3 text-sm">
              {item.pendingQty > 0 ? (
                <Badge tone="info">{item.pendingQty} ordered</Badge>
              ) : null}
            </td>
            <td className="px-3 py-3 text-sm">
              {item.suggestedQty > 0 && item.pendingQty === 0 && (
                <form action={async (fd: FormData) => { 'use server'; await markAsOrdered(fd); }}>
                  <input type="hidden" name="productId" value={item.id} />
                  <input type="hidden" name="qtyBase" value={item.suggestedQty} />
                  <input type="hidden" name="storeId" value={selectedStoreId} />
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-900 transition-colors"
                  >
                    Mark Ordered
                  </button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
