import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { formatMoney, formatDateTime } from '@/lib/format';
import SupplierCreditSettlementForm from '@/components/purchases/SupplierCreditSettlementForm';

export default async function SupplierCreditSettlementPage({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string; error?: string } }) {
  const { business, store } = await requireBusinessAndOptionalStore(['OWNER', 'MANAGER']);
  if (!business || !store) notFound();
  const source = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, businessId: business.id, storeId: store.id }, include: { payments: true, supplier: true, creditSettlements: { orderBy: { createdAt: 'desc' } }, appliedCreditSettlements: { orderBy: { createdAt: 'desc' } } } });
  if (!source?.supplierId) notFound();
  const availablePence = Math.max(0, -payableDocumentBalance(source).balancePence);
  const candidates = await prisma.purchaseInvoice.findMany({ where: { businessId: business.id, storeId: store.id, supplierId: source.supplierId, id: { not: source.id }, paymentStatus: { notIn: ['VOID', 'RETURNED'] } }, include: { payments: true }, orderBy: { createdAt: 'desc' } });
  const tills = await prisma.till.findMany({ where: { storeId: store.id, shifts: { some: { status: 'OPEN' } } }, select: { id: true, name: true } });
  const history = [...source.creditSettlements.map(row => ({ ...row, incoming: false })), ...source.appliedCreditSettlements.map(row => ({ ...row, incoming: true }))].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
  return <main className="mx-auto max-w-4xl space-y-5">
    <header className="card space-y-3 p-5"><Link href={`/purchases/partial-return/${source.id}`} className="text-blue-700">← Return and credit history</Link><h1 className="text-2xl font-bold">Settle supplier credit</h1><p>{source.supplier?.name} · {source.transactionNumber ?? source.id} · {store.name}</p><p className="text-xl font-semibold">Unused invoice credit: {formatMoney(availablePence, business.currency)}</p><p className="text-sm">Credits, offsets and refunds remain separate from original invoice payments.</p><Link href={`/suppliers/${source.supplierId}`} className="text-blue-700">Review full supplier account →</Link></header>
    {searchParams?.saved ? <p role="status" className="rounded-xl bg-emerald-50 p-4">Settlement saved. Supplier balances and any money received were recorded together.</p> : null}
    {searchParams?.error ? <p role="alert" className="rounded-xl bg-red-50 p-4">{searchParams.error}</p> : null}
    {availablePence > 0 ? <SupplierCreditSettlementForm sourceInvoiceId={source.id} storeId={store.id} requestKey={randomUUID()} availablePence={availablePence} currency={business.currency} targets={candidates.map(invoice => ({ id: invoice.id, label: invoice.transactionNumber ?? invoice.id, balancePence: payableDocumentBalance(invoice).balancePence })).filter(invoice => invoice.balancePence > 0)} tills={tills} /> : <p className="card p-5">No unused credit is available to refund or apply from this invoice.</p>}
    <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Settlement history</h2>{history.length ? history.map(row => <article className="space-y-2 rounded-xl border p-4" key={`${row.id}-${row.incoming}`}><p className="font-semibold">{row.kind === 'OFFSET' ? row.incoming ? 'Credit applied to this invoice' : 'Credit applied to another invoice' : row.kind === 'REFUND_CASH' ? 'Supplier cash refund received' : 'Supplier bank refund received'} · {formatMoney(row.amountPence, business.currency)}</p><p className="text-sm">{formatDateTime(row.createdAt)} UTC · Reference: {row.reference}</p><p className="break-all text-xs text-slate-500">Settlement ID: {row.id}</p>{row.kind === 'OFFSET' ? <Link href={`/purchases/${row.incoming ? row.sourceInvoiceId : row.targetInvoiceId}`} className="text-sm text-blue-700">View linked invoice →</Link> : null}</article>) : <p>No settlements recorded. An unused credit remains due until it is explicitly settled.</p>}</section>
  </main>;
}
