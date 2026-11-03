import Link from 'next/link';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import EffectiveStoreBanner from '@/components/EffectiveStoreBanner';
import { prisma } from '@/lib/prisma';
import { formatDateTime, formatMoney } from '@/lib/format';
import StockConversionClient from './StockConversionClient';

export const dynamic = 'force-dynamic';

export default async function StockConversionsPage({ searchParams }: { searchParams?: Promise<{ conversion?: string | string[] }> }) {
  const { user, business, store, stores } = await requireBusinessAndOptionalStore(['OWNER', 'MANAGER']);
  if (!store) return <SelectOperationalStoreNotice stores={stores} canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'} title="Select a branch before converting stock" />;
  // Durable confirmation is resolved from an actual movement in the current tenant and branch.
  // Never trust a query-string amount or a transient client state across action revalidation.
  const query = await searchParams;
  const receiptId = typeof query?.conversion === 'string' && /^[0-9a-f-]{36}$/i.test(query.conversion) ? query.conversion : null;
  const [receipt, recentMovements] = await Promise.all([
    receiptId ? prisma.stockMovement.findFirst({
      where: { storeId: store.id, store: { businessId: business.id }, type: 'CONVERSION_OUT', referenceType: 'STOCK_CONVERSION', referenceId: receiptId },
      select: { referenceId: true, valuePence: true },
    }) : Promise.resolve(null),
    prisma.stockMovement.findMany({ where: { storeId: store.id, store: { businessId: business.id }, type: 'CONVERSION_OUT', referenceType: 'STOCK_CONVERSION' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { referenceId: true } }),
  ]);
  const receiptCost = receipt?.valuePence != null && Number.isSafeInteger(receipt.valuePence) && receipt.valuePence <= 0 ? -receipt.valuePence : null;
  const history = await prisma.auditLog.findMany({ where: { businessId: business.id, action: 'STOCK_CONVERSION', entity: 'StockConversion',
    entityId: { in: recentMovements.flatMap(m => m.referenceId ? [m.referenceId] : []) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, entityId: true, reason: true, userName: true, createdAt: true, details: true } });
  return <div className="mx-auto max-w-6xl space-y-6">
    <Link href="/inventory" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700">← Back to inventory</Link>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="max-w-xl"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Inventory · Repacking</p><h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Convert stock</h1><p className="mt-2 text-sm leading-6 text-slate-500">Turn bags or cartons into the products you sell. The original cost moves with the stock.</p></div>
      <div className="min-w-0 sm:max-w-64 sm:shrink-0"><EffectiveStoreBanner storeName={store.name} /></div>
    </div>

    <StockConversionClient key={`${store.id}:${receipt?.referenceId ?? ''}`} storeId={store.id} currency={business.currency} savedReceipt={receipt?.referenceId && receiptCost !== null ? { id: receipt.referenceId, costPence: receiptCost } : null} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-4 sm:px-5"><h2 className="text-sm font-semibold text-slate-900">Recent conversions in {store.name}</h2><p className="mt-1 text-xs text-slate-500">A record of the stock used, output counted and cost transferred.</p></div>
      {!history.length ? <div className="px-5 py-9 text-center"><p className="text-sm font-medium text-slate-600">No conversions recorded yet.</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-400">Your saved conversions will appear here, with a matching reference in both product histories.</p></div> : <ul className="divide-y divide-slate-100">{history.map(row => {
        let summary = '';
        let cost: number | null = null;
        try {
          const detail = JSON.parse(row.details ?? '{}');
          if (typeof detail.sourceName === 'string' && typeof detail.destinationName === 'string' && Number.isSafeInteger(detail.sourceQty) && Number.isSafeInteger(detail.destinationQty)) summary = `${detail.sourceQty} ${typeof detail.sourceUnitName === 'string' ? detail.sourceUnitName : 'units'} ${detail.sourceName} → ${detail.destinationQty} ${typeof detail.destinationUnitName === 'string' ? detail.destinationUnitName : 'units'} ${detail.destinationName}`;
          if (Number.isSafeInteger(detail.costPence) && detail.costPence >= 0) cost = detail.costPence;
        } catch { /* A malformed legacy audit must not break the history. */ }
        return <li className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5" key={row.id}>
          <div className="min-w-0"><p className="break-words text-sm font-semibold leading-6 text-slate-800">{summary || row.reason}</p>{summary ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{row.reason}</p> : null}<p className="mt-2 text-[11px] leading-5 text-slate-400">{formatDateTime(row.createdAt)} · {row.userName}</p><details className="mt-1 text-[11px] text-slate-400"><summary className="w-fit cursor-pointer py-1 hover:text-slate-700">View reference</summary><p className="mt-1 break-all font-mono">{row.entityId}</p></details></div>
          {cost !== null ? <div className="sm:text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Value transferred</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{formatMoney(cost, business.currency)}</p></div> : null}
        </li>; })}</ul>}

    </section>
  </div>;
}
