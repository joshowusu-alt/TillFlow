import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import EffectiveStoreBanner from '@/components/EffectiveStoreBanner';
import { prisma } from '@/lib/prisma';
import { formatDateTime, formatMoney } from '@/lib/format';
import StockConversionClient from './StockConversionClient';

export const dynamic = 'force-dynamic';

export default async function StockConversionsPage({ searchParams }: { searchParams?: { conversion?: string | string[] } }) {
  const { user, business, store, stores } = await requireBusinessAndOptionalStore(['OWNER', 'MANAGER']);
  if (!store) return <SelectOperationalStoreNotice stores={stores} canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'} title="Select a branch before converting stock" />;
  // Durable confirmation is resolved from an actual movement in the current tenant and branch.
  // Never trust a query-string amount or a transient client state across action revalidation.
  const receiptId = typeof searchParams?.conversion === 'string' && /^[0-9a-f-]{36}$/i.test(searchParams.conversion) ? searchParams.conversion : null;
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
  return <div className="space-y-5">
    <PageHeader title="Convert stock" subtitle="Open a bag or carton and record the quantities produced. Its cost moves with the stock." />
    <EffectiveStoreBanner storeName={store.name} />
    <Link href="/inventory" className="text-sm text-accent">← Inventory</Link>

    <StockConversionClient key={`${store.id}:${receipt?.referenceId ?? ''}`} storeId={store.id} currency={business.currency} savedReceipt={receipt?.referenceId && receiptCost !== null ? { id: receipt.referenceId, costPence: receiptCost } : null} />
    <section className="card p-4"><h2 className="font-semibold">Recent conversions in {store.name}</h2>
      {!history.length ? <p className="mt-2 text-sm text-black/60">No conversions recorded yet.</p> : <ul className="mt-3 divide-y">{history.map(row => {
        let summary = '';
        let cost: number | null = null;
        try {
          const detail = JSON.parse(row.details ?? '{}');
          if (typeof detail.sourceName === 'string' && typeof detail.destinationName === 'string' && Number.isSafeInteger(detail.sourceQty) && Number.isSafeInteger(detail.destinationQty)) summary = `${detail.sourceQty} ${typeof detail.sourceUnitName === 'string' ? detail.sourceUnitName : 'units'} ${detail.sourceName} → ${detail.destinationQty} ${typeof detail.destinationUnitName === 'string' ? detail.destinationUnitName : 'units'} ${detail.destinationName}`;
          if (Number.isSafeInteger(detail.costPence) && detail.costPence >= 0) cost = detail.costPence;
        } catch { /* A malformed legacy audit must not break the history. */ }
        return <li className="space-y-1 py-3 text-sm" key={row.id}><p className="font-semibold">{summary || row.reason}</p>{summary ? <p>{row.reason}</p> : null}{cost !== null ? <p>Stock value transferred: {formatMoney(cost, business.currency)}</p> : null}<p className="text-black/60">{formatDateTime(row.createdAt)} · {row.userName}</p><p className="break-all text-xs">Reference: {row.entityId}</p></li>; })}</ul>}
    </section>
  </div>;
}
