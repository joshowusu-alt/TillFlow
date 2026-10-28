import { notFound } from 'next/navigation';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import PartialPurchaseReturnForm from '@/components/purchases/PartialPurchaseReturnForm';
import type { PurchaseCreditLine } from '@/lib/services/partial-purchase-returns';

export default async function PartialPurchaseReturnPage({ params, searchParams }: { params: { id: string }; searchParams?: { saved?: string; error?: string } }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { business, store } = await requireBusinessAndOptionalStore(['OWNER','MANAGER']);
  if (!business || !store) return <div className="card p-5">Select the purchase’s branch first.</div>;
  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, businessId: business.id, storeId: store.id }, include: { supplier: true, lines: { include: { product: true, unit: true } }, payments: true, returnCredits: { orderBy: { createdAt: 'desc' } }, purchaseReturn: true } });
  if (!invoice) notFound();
  const stock = await prisma.inventoryBalance.findMany({ where: { storeId: store.id, productId: { in: invoice.lines.map(line => line.productId) } } });
  const prior = invoice.returnCredits.flatMap(credit => JSON.parse(credit.linesJson) as PurchaseCreditLine[]);
  const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  return <main className="mx-auto max-w-5xl space-y-5"><header className="card space-y-3 p-5"><Link href={`/purchases/${invoice.id}`} className="text-blue-700">← Original purchase</Link><h1 className="text-2xl font-bold">Return selected items · {invoice.transactionNumber ?? invoice.id}</h1><p>{invoice.supplier?.name ?? 'No linked supplier'} · {store.name}</p><p className="text-sm">Original invoice: {formatMoney(invoice.totalPence, business.currency)} · Credits recorded: {formatMoney(invoice.returnCreditPence, business.currency)} · Paid: {formatMoney(paidPence, business.currency)}</p><p className="rounded-xl bg-amber-50 p-3 text-sm">Preview pilot. Saving here changes this preview business’s stock and supplier account. It does not change production.</p></header>
    {searchParams?.saved ? <p role="status" className="rounded-xl bg-emerald-50 p-4">Return saved. Stock movements, supplier credit and journal were recorded together.</p> : null}
    {searchParams?.error ? <p role="alert" className="rounded-xl bg-red-50 p-4">{searchParams.error}</p> : null}
    {invoice.purchaseReturn || ['RETURNED','VOID'].includes(invoice.paymentStatus) ? <p>This purchase was fully reversed.</p> : <PartialPurchaseReturnForm invoiceId={invoice.id} storeId={store.id} totalPence={invoice.totalPence} paidPence={paidPence} previousCreditPence={invoice.returnCreditPence} currency={business.currency} requestKey={randomUUID()} lines={invoice.lines.map(line => ({ id: line.id, name: line.product.name, qtyBase: line.qtyBase, alreadyReturned: prior.filter(item => item.lineId === line.id).reduce((sum,item) => sum + item.qtyBase,0), onHand: stock.find(item => item.productId === line.productId)?.qtyOnHandBase ?? 0, subtotalPence: line.lineSubtotalPence, vatPence: line.lineVatPence, baseUnit: line.conversionToBase === 1 ? line.unit.name : 'base units' }))} />}
    <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Saved return history</h2>{invoice.returnCredits.length ? invoice.returnCredits.map(credit => <article key={credit.id} className="rounded-xl border p-3"><p className="font-semibold">{formatMoney(credit.creditPence,business.currency)} · {credit.createdAt.toISOString()}</p><p className="text-sm">{credit.reason}</p>{(JSON.parse(credit.linesJson) as PurchaseCreditLine[]).map(line => <p className="text-sm" key={line.lineId}>{invoice.lines.find(source => source.id === line.lineId)?.product.name} · {line.qtyBase} base units · {formatMoney(line.totalPence,business.currency)}</p>)}</article>) : <p className="text-sm">No partial returns recorded.</p>}</section>
    {invoice.supplierId ? <Link className="btn-ghost inline-block" href={`/suppliers/${invoice.supplierId}`}>Review supplier balance and purchase history →</Link> : null}
  </main>;
}
