import { notFound } from 'next/navigation';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import PartialPurchaseReturnForm from '@/components/purchases/PartialPurchaseReturnForm';
import type { PurchaseCreditLine } from '@/lib/services/partial-purchase-returns';

export default async function PartialPurchaseReturnPage({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string; error?: string } }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { business, store } = await requireBusinessAndOptionalStore(['OWNER','MANAGER']);
  if (!business || !store) return <div className="card p-5">Select the purchase’s branch first.</div>;
  if (!business.isDemo) notFound();
  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, businessId: business.id, storeId: store.id }, include: { supplier: true, lines: { include: { product: true, unit: true } }, payments: true, returnCredits: { orderBy: { createdAt: 'desc' } }, purchaseReturn: true } });
  if (!invoice) notFound();
  const stock = await prisma.inventoryBalance.findMany({ where: { storeId: store.id, productId: { in: invoice.lines.map(line => line.productId) } } });
  const prior = invoice.returnCredits.flatMap(credit => JSON.parse(credit.linesJson) as PurchaseCreditLine[]);
  const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const balancePence = invoice.totalPence - invoice.returnCreditPence + invoice.creditSettledPence - invoice.creditAppliedPence - paidPence;
  return <main className="mx-auto max-w-5xl space-y-5"><header className="card space-y-3 p-5"><Link href={`/purchases/${invoice.id}`} className="text-blue-700">← Original purchase</Link><h1 className="text-2xl font-bold">Return selected items · {invoice.transactionNumber ?? invoice.id}</h1><p>{invoice.supplier?.name ?? 'No linked supplier'} · {store.name}</p><p className="text-sm">Original invoice: {formatMoney(invoice.totalPence, business.currency)} · Credits recorded: {formatMoney(invoice.returnCreditPence, business.currency)} · Paid: {formatMoney(paidPence, business.currency)}</p><p className="rounded-xl bg-amber-50 p-3 text-sm">Preview pilot. Saving here changes this preview business’s stock and supplier account. It does not change production.</p></header>
    {searchParams?.saved ? <p role="status" className="rounded-xl bg-emerald-50 p-4">Return saved. Stock movements, supplier credit and journal were recorded together.</p> : null}
    {searchParams?.error ? <p role="alert" className="rounded-xl bg-red-50 p-4">{searchParams.error}</p> : null}
    {invoice.purchaseReturn || ['RETURNED','VOID'].includes(invoice.paymentStatus) ? <p>This purchase was fully reversed.</p> : <PartialPurchaseReturnForm invoiceId={invoice.id} storeId={store.id} totalPence={invoice.totalPence} paidPence={paidPence} previousCreditPence={invoice.returnCreditPence} creditSettledPence={invoice.creditSettledPence} creditAppliedPence={invoice.creditAppliedPence} currency={business.currency} requestKey={randomUUID()} lines={invoice.lines.map(line => ({ id: line.id, name: line.product.name, qtyBase: line.qtyBase, alreadyReturned: prior.filter(item => item.lineId === line.id).reduce((sum,item) => sum + item.qtyBase,0), onHand: stock.find(item => item.productId === line.productId)?.qtyOnHandBase ?? 0, subtotalPence: line.lineSubtotalPence, vatPence: line.lineVatPence, baseUnit: line.conversionToBase === 1 ? line.unit.name : 'base units' }))} />}
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Saved returns and supplier credits</h2>
      <p className="text-sm text-slate-600">Newest first. Each entry is a saved stock reduction and supplier credit, not a cash refund.</p>
      {invoice.returnCredits.length ? <>
        <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <div><dt className="text-sm text-slate-600">Total credits on this invoice</dt><dd className="font-semibold">{formatMoney(invoice.returnCreditPence, business.currency)}</dd></div>
          <div><dt className="text-sm text-slate-600">Payments recorded</dt><dd className="font-semibold">{formatMoney(paidPence, business.currency)}</dd></div>
          <div><dt className="text-sm text-slate-600">{balancePence < 0 ? 'Current credit due to you on this invoice' : 'Current amount owed on this invoice'}</dt><dd className="font-semibold">{formatMoney(Math.abs(balancePence), business.currency)}</dd></div>
        </dl>
        {invoice.returnCredits.map(credit => {
          const savedLines = JSON.parse(credit.linesJson) as PurchaseCreditLine[];
          return <article key={credit.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{credit.kind === 'SHORT_DELIVERY_CREDIT' ? 'Short delivery credited' : 'Purchase return saved'}</h3><time className="text-sm text-slate-600" dateTime={credit.createdAt.toISOString()}>{formatDateTime(credit.createdAt)} UTC</time></div><div><p className="text-sm text-slate-600">Supplier credit recorded</p><p className="text-lg font-semibold">{formatMoney(credit.creditPence, business.currency)}</p></div></div>
            <p className="break-all text-xs text-slate-500">Return reference: {credit.id}</p>
            <p className="text-sm"><span className="font-semibold">Reason: </span>{credit.reason}</p>
            <ul className="divide-y">{savedLines.map(line => {
              const source = invoice.lines.find(item => item.id === line.lineId);
              const unit = source?.conversionToBase === 1 ? source.unit.name : 'base units';
              return <li className="flex flex-wrap justify-between gap-2 py-3 text-sm" key={line.lineId}><div><p className="font-medium">{source?.product.name ?? 'Original purchase item'}</p><p className="text-slate-600">Quantity removed: {line.qtyBase} {unit}</p></div><div className="text-right"><p className="text-slate-600">Credit value</p><p className="font-semibold">{formatMoney(line.totalPence, business.currency)}</p></div></li>;
            })}</ul>
            <p className="rounded-lg bg-emerald-50 p-3 text-sm">Stock and inventory value reduced. Supplier account credited. No cash refund recorded by this return.</p>
          </article>;
        })}
      </> : <p className="text-sm">No partial returns recorded.</p>}
    </section>
    {invoice.returnCreditPence > 0 || invoice.creditAppliedPence > 0 ? <Link className="btn-primary inline-block" href={`/purchases/credit-settlement/${invoice.id}`}>Settle credit / review refunds and offsets →</Link> : null}
    {invoice.supplierId ? <Link className="btn-ghost inline-block" href={`/suppliers/${invoice.supplierId}`}>Review supplier balance and purchase history →</Link> : null}
  </main>;
}
