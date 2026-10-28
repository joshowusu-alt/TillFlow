import PurchaseDocuments from '@/components/purchases/PurchaseDocuments';
import PurchaseDetailsEditor from '@/components/purchases/PurchaseDetailsEditor';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import FormError from '@/components/FormError';
import { DataCard, DataCardField, DataCardHeader } from '@/components/DataCard';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { changePurchaseProductSupplierLinkAction } from '@/app/actions/purchases';
import SetPurchaseDueDateButton from '@/components/SetPurchaseDueDateButton';
import DueDateBadge from '@/components/DueDateBadge';
import PurchaseDraftClearer from '@/components/purchases/PurchaseDraftClearer';
import RemainingBalance from '@/components/RemainingBalance';
import SupplierPaymentForm from '@/components/SupplierPaymentForm';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

function paymentMethodLabel(payment: { method: string; reference?: string | null }) {
  if (payment.reference?.startsWith('funding:1000.HOLD.')) return 'Cash — business cash held outside the till';
  if (payment.reference?.startsWith('funding:2300.OWNER.')) return 'Owner’s money — repay owner';
  if (payment.reference?.startsWith('funding:3100.OWNER.')) return 'Owner’s money — contribution';
  return payment.method;
}

export default async function PurchaseInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    error?: string;
    edit?: string;
    created?: string;
    linked?: string;
    already?: string;
    left?: string;
    supplierLinkChanged?: string;
  };
}) {
  const { business, store: operationalStore } = await requireBusinessAndOptionalStore(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      store: { select: { id: true, name: true } },
      lines: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              preferredSupplierId: true,
              preferredSupplier: { select: { id: true, name: true } },
            },
          },
          unit: { select: { name: true, pluralName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      documents:{select:{id:true,originalFilename:true,documentKind:true,contentType:true,byteLength:true,createdAt:true},orderBy:{createdAt:'asc'}},
      linkedCostExpense: { include: { payments: true } },
      payments: {
        include: { recordedBy: { select: { name: true } } },
        orderBy: { paidAt: 'asc' },
      },
    },
  });

  if (!invoice) return <div className="card p-6">Invoice not found.</div>;

  // Payments are only offered when the operational branch is the invoice's branch,
  // and the tills offered are that branch's open tills. Viewing is unaffected.
  const canPayHere = Boolean(operationalStore && operationalStore.id === invoice.storeId);
  const openShifts = canPayHere
    ? await prisma.shift.findMany({
        where: {
          status: 'OPEN',
          till: { storeId: invoice.storeId, active: true, store: { businessId: business.id } },
        },
        select: { id: true, tillId: true, till: { select: { name: true } } },
        orderBy: { openedAt: 'desc' },
      })
    : [];
  const openTills = openShifts.map((shift) => ({
    tillId: shift.tillId,
    tillName: shift.till.name,
    shiftId: shift.id,
  }));

  const purchaseDocument = payableDocumentBalance(invoice);
  const totalPaid = purchaseDocument.paidPence;
  const outstanding = purchaseDocument.balancePence;
  const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
  const editSuppliers = !isClosed ? await prisma.supplier.findMany({where:{businessId:business.id},select:{id:true,name:true},orderBy:{name:'asc'}}) : [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const supplierLinkedCount = Number.parseInt(searchParams?.linked ?? '0', 10) || 0;
  const supplierAlreadyLinkedCount = Number.parseInt(searchParams?.already ?? '0', 10) || 0;
  const supplierLeftUnchangedCount = Number.parseInt(searchParams?.left ?? '0', 10) || 0;
  const showSupplierLinkSummary =
    invoice.supplier &&
    searchParams?.created === '1' &&
    supplierLinkedCount + supplierAlreadyLinkedCount + supplierLeftUnchangedCount > 0;
  const productsLeftUnchanged = invoice.supplier
    ? Array.from(
        invoice.lines.reduce((map, line) => {
          const product = line.product;
          if (
            product.preferredSupplierId &&
            product.preferredSupplierId !== invoice.supplierId &&
            !map.has(product.id)
          ) {
            map.set(product.id, product);
          }
          return map;
        }, new Map<string, (typeof invoice.lines)[number]['product']>()).values(),
      )
    : [];

  return (
    <div className="space-y-6">
      <PurchaseDraftClearer storeId={invoice.storeId} active={searchParams?.created === '1'} />
      {process.env.VERCEL_ENV === 'preview' && business.isDemo ? <section className="card space-y-2 border-blue-200 p-4"><Link className="btn-primary inline-block" href={`/purchases/partial-return/${invoice.id}`}>Return selected items →</Link>{invoice.returnCreditPence > 0 ? <p className="text-sm">Original invoice: {formatMoney(invoice.totalPence,business.currency)} · Return credits: {formatMoney(invoice.returnCreditPence,business.currency)} · Revised supplier charge: {formatMoney(invoice.totalPence - invoice.returnCreditPence,business.currency)}. Original lines and payments remain unchanged.</p> : null}</section> : null}
      <PageHeader
        title={displayDocumentNumber('purchase', invoice.transactionNumber, invoice.id)}
        subtitle={invoice.supplier ? `Supplier: ${invoice.supplier.name}` : 'No supplier linked'}
        secondaryCta={{ label: '← Back to purchases', href: '/purchases' }}
      />

      <FormError error={searchParams?.error} />

      {showSupplierLinkSummary && invoice.supplier && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Supplier links updated</p>
          <div className="mt-1 space-y-0.5 text-emerald-800">
            {supplierLinkedCount > 0 && (
              <p>
                {supplierLinkedCount} product{supplierLinkedCount === 1 ? ' was' : 's were'} linked to{' '}
                {invoice.supplier.name} for supplier sales reporting.
              </p>
            )}
            {supplierAlreadyLinkedCount > 0 && (
              <p>
                {supplierAlreadyLinkedCount} product{supplierAlreadyLinkedCount === 1 ? ' was' : 's were'} already linked to{' '}
                {invoice.supplier.name}.
              </p>
            )}
            {supplierLeftUnchangedCount > 0 && (
              <p>
                {supplierLeftUnchangedCount} product{supplierLeftUnchangedCount === 1 ? ' was' : 's were'} already linked to another supplier,
                so TillFlow left {supplierLeftUnchangedCount === 1 ? 'it' : 'them'} unchanged.
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-emerald-800/80">
            We do this to avoid changing supplier sales reports by mistake.
          </p>
          {productsLeftUnchanged.length > 0 && (
            <Link href="#supplier-link-review" className="mt-3 inline-flex text-sm font-semibold text-emerald-900 underline">
              Review skipped products
            </Link>
          )}
        </div>
      )}

      {searchParams?.supplierLinkChanged === '1' && invoice.supplier && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Supplier link changed.</p>
          <p className="mt-1 text-emerald-800">
            Future Sales by Linked Supplier reports will now use {invoice.supplier.name} for this product.
          </p>
        </div>
      )}

      {!isClosed ? <PurchaseDetailsEditor invoice={{id:invoice.id,supplierId:invoice.supplierId,supplierInvoiceNumber:invoice.supplierInvoiceNumber,dueDate:invoice.dueDate?.toISOString().slice(0,10)??'',additionalCostNote:invoice.additionalCostNote,additionalCostPence:invoice.additionalCostPence}} suppliers={editSuppliers} expectedDetails={JSON.stringify({supplierId:invoice.supplierId,supplierInvoiceNumber:invoice.supplierInvoiceNumber,dueDate:invoice.dueDate?.toISOString()??null,additionalCostNote:invoice.additionalCostNote})} initiallyOpen={searchParams?.edit==='1'} /> : null}

      <PurchaseDocuments invoiceId={invoice.id} awaitingInvoice={invoice.receiptDocumentType==='DELIVERY_NOTE'&&!invoice.invoiceReceivedAt} documents={invoice.documents.map(d=>({...d,createdAt:d.createdAt.toISOString()}))} />
      {invoice.discountPence>0?<p className="card p-4 text-sm">Purchase discount: {formatMoney(invoice.discountPence,business.currency)}. Line totals, stock values and amounts payable include this discount.</p>:null}

      {/* Summary card */}
      <div className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Purchased</div>
          <div className="text-sm font-medium">{formatDateTime(invoice.createdAt)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Due Date</div>
          <div className="flex items-center gap-1">
            <DueDateBadge dueDate={invoice.dueDate} now={now} isClosed={isClosed} noneLabel="No due date" />
            {!isClosed && (
              <SetPurchaseDueDateButton
                invoiceId={invoice.id}
                currentDueDate={invoice.dueDate}
              />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Status</div>
          <span className="pill bg-black/5 text-black/60">{invoice.paymentStatus}</span>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Store</div>
          <div className="text-sm">{invoice.store?.name ?? '—'}</div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <RemainingBalance
            amountPence={invoice.totalPence - invoice.returnCreditPence + invoice.creditSettledPence - invoice.creditAppliedPence}
            paidPence={totalPaid}
            currency={business.currency}
          />
        </div>
        {invoice.supplier && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-black/40">Supplier</div>
            <Link href={`/suppliers/${invoice.supplier.id}`} className="text-sm hover:underline">
              {invoice.supplier.name}
            </Link>
            {invoice.supplier.phone && <div className="text-xs text-black/50">{invoice.supplier.phone}</div>}
          </div>
        )}
      </div>

      {invoice.supplier && productsLeftUnchanged.length > 0 && (
        <div id="supplier-link-review" className="card p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Review skipped products</h2>
              <p className="mt-1 text-sm text-black/55">
                These products were already linked to another supplier, so TillFlow left them unchanged.
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="table w-full border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Current linked supplier</th>
                  <th>Purchase supplier</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {productsLeftUnchanged.map((product) => (
                  <tr key={product.id} className="rounded-xl bg-white">
                    <td className="px-3 py-2 font-medium">{product.name}</td>
                    <td className="px-3 py-2 text-black/55">{product.sku || '—'}</td>
                    <td className="px-3 py-2 text-black/70">
                      {product.preferredSupplier ? (
                        <Link href={`/suppliers/${product.preferredSupplier.id}`} className="hover:underline">
                          {product.preferredSupplier.name}
                        </Link>
                      ) : (
                        'Another supplier'
                      )}
                    </td>
                    <td className="px-3 py-2 text-black/70">
                      <Link href={`/suppliers/${invoice.supplier!.id}`} className="hover:underline">
                        {invoice.supplier!.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-xs text-black/45">Keep current supplier</span>
                        <form action={changePurchaseProductSupplierLinkAction}>
                          <input type="hidden" name="purchaseInvoiceId" value={invoice.id} />
                          <input type="hidden" name="productId" value={product.id} />
                          <SubmitButton className="btn-ghost border border-black/10 text-xs" loadingText="Saving...">
                            Change to purchase supplier
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice lines */}
      <div className="card p-6" data-purchase-detail-lines>
        <h2 className="text-base font-semibold">Items purchased</h2>
        <div className="mt-4 space-y-3 lg:hidden">
          {invoice.lines.map((line) => (
            <DataCard key={line.id}>
              <DataCardHeader
                title={line.product.name}
                subtitle={`${line.qtyInUnit} ${line.unit.name}`}
                aside={
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(line.lineTotalPence, business.currency)}
                  </span>
                }
              />
              {line.allocatedCostPence > 0 ? <p className="mt-2 text-xs text-black/60">Allocated stock cost: {formatMoney(line.allocatedCostPence,business.currency)}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <DataCardField
                  label="Unit cost"
                  value={formatMoney(line.unitCostPence, business.currency)}
                  valueClassName="text-sm tabular-nums"
                />
                <DataCardField
                  label="Line total"
                  value={formatMoney(line.lineTotalPence, business.currency)}
                  valueClassName="text-sm font-semibold tabular-nums"
                />
              </div>
            </DataCard>
          ))}
          {invoice.additionalCostTreatment === 'INVENTORY' && invoice.additionalCostPence > 0 ? <p className="flex justify-between text-sm"><span>Additional costs included in stock</span><span>{formatMoney(invoice.additionalCostPence,business.currency)}</span></p> : null}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-black/40">Total (incl. VAT)</span>
            <span className="text-sm font-bold tabular-nums">{formatMoney(invoice.totalPence, business.currency)}</span>
          </div>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="table mt-4 w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th scope="col" style={{ textAlign: 'right' }}>Unit Cost</th>
                <th scope="col" style={{ textAlign: 'right' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="rounded-xl bg-white">
                  <td className="px-3 py-2">{line.product.name}{line.allocatedCostPence > 0 ? <p className="mt-1 text-xs text-black/60">Allocated stock cost: {formatMoney(line.allocatedCostPence, business.currency)}</p> : null}</td>
                  <td className="px-3 py-2">{line.qtyInUnit} {line.unit.name}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(line.unitCostPence, business.currency)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(line.lineTotalPence, business.currency)}</td>
                </tr>
              ))}
              {invoice.additionalCostTreatment === 'INVENTORY' && invoice.additionalCostPence > 0 ? <tr><td colSpan={3} className="px-3 py-2 text-right text-sm">Additional costs included in stock</td><td className="px-3 py-2 text-right">{formatMoney(invoice.additionalCostPence,business.currency)}</td></tr> : null}
              <tr className="bg-black/[0.02]">
                <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase tracking-wider text-black/40">Total (incl. VAT)</td>
                <td className="px-3 py-2 text-right text-sm font-bold">{formatMoney(invoice.totalPence, business.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <section className="card space-y-3 p-5" aria-label="Supplier invoice and additional costs">
        <h2 className="font-semibold">Supplier invoice and other costs</h2>
        <p className="text-sm">Supplier’s original invoice number: <strong>{invoice.supplierInvoiceNumber || 'Not recorded'}</strong></p>
        {invoice.additionalCostPence > 0 ? <><p className="text-sm">{invoice.additionalCostNote || 'Delivery / other cost'}: <strong>{formatMoney(invoice.additionalCostPence, business.currency)}</strong></p><p className="text-sm text-black/60">{invoice.additionalCostTreatment === 'INVENTORY' ? 'Included in stock value, allocated by individual-item quantity. It is not an additional expense.' : 'Recorded as a separate linked expense. Its payments are separate from the goods payments below.'}</p>{invoice.linkedCostExpense ? <p className="text-sm"><Link className="text-accent underline" href={`/expenses/${invoice.linkedCostExpense.id}`}>View linked expense</Link> · Paid {formatMoney(invoice.linkedCostExpense.payments.reduce((sum, payment) => sum + payment.amountPence, 0), business.currency)} · Total {formatMoney(invoice.linkedCostExpense.amountPence, business.currency)}</p> : null}</> : <p className="text-sm text-black/60">No additional costs recorded.</p>}
      </section>

      {/* Payment history */}
      <div className="card p-6 pb-28 lg:pb-6" data-purchase-detail-payments>
        <h2 className="text-base font-semibold">Payment history</h2>
        {invoice.payments.length === 0 ? (
          <p className="mt-3 text-sm text-black/50">No payments recorded yet.</p>
        ) : (
          <>
            <div className="mt-4 space-y-3 lg:hidden">
              {invoice.payments.map((payment) => (
                <DataCard key={payment.id}>
                  <DataCardHeader
                    title={formatDate(payment.paidAt)}
                    subtitle={paymentMethodLabel(payment)}
                    aside={
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(payment.amountPence, business.currency)}
                      </span>
                    }
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <DataCardField
                      label="Notes"
                      value={payment.notes ?? '—'}
                      className="col-span-2"
                      valueClassName="text-sm break-words [overflow-wrap:anywhere]"
                    />
                    <DataCardField
                      label="Recorded by"
                      value={payment.recordedBy?.name ?? '—'}
                      className="col-span-2"
                      valueClassName="text-sm"
                    />
                  </div>
                </DataCard>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="table mt-4 w-full border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th className="text-right">Amount</th>
                    <th>Notes</th>
                    <th>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id} className="rounded-xl bg-white">
                      <td className="px-3 py-2">{formatDate(payment.paidAt)}</td>
                      <td className="px-3 py-2">{paymentMethodLabel(payment)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(payment.amountPence, business.currency)}</td>
                      <td className="px-3 py-2 text-black/50">{payment.notes ?? '—'}</td>
                      <td className="px-3 py-2 text-black/50">{payment.recordedBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!isClosed && outstanding > 0 && !canPayHere && (
          <div
            className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            data-testid="purchase-payment-other-branch"
          >
            This purchase belongs to {invoice.store?.name ?? 'another branch'}. Switch to that branch to record a payment.
          </div>
        )}
        {/* Record payment form — unchanged SupplierPaymentForm (PR #78 controls). */}
        {!isClosed && outstanding > 0 && canPayHere && (
          <div className="mt-6 scroll-mb-28" data-purchase-payment-form id="record-payment">
            <h3 className="text-sm font-semibold">Record a payment</h3>
            <div className="mt-3">
              <SupplierPaymentForm
                invoiceId={invoice.id}
                returnTo={`/purchases/${invoice.id}`}
                today={today}
                amountPlaceholder={(outstanding / 100).toFixed(2)}
                formClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                openTills={openTills}
                storeId={invoice.storeId}
                storeName={invoice.store?.name}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pb-24 lg:pb-0">
        <Link href="/purchases" className="btn-ghost text-sm">← Back to purchases</Link>
        {invoice.supplier && (
          <Link href={`/suppliers/${invoice.supplier.id}`} className="btn-ghost text-sm">
            View supplier
          </Link>
        )}
        <Link href="/payments/supplier-payments" className="btn-ghost text-sm">
          All outstanding payables
        </Link>
      </div>
    </div>
  );
}
