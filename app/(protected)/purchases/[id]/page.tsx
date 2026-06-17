import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import FormError from '@/components/FormError';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { recordSupplierPaymentAction } from '@/app/actions/payments';
import { changePurchaseProductSupplierLinkAction } from '@/app/actions/purchases';
import SetPurchaseDueDateButton from '@/components/SetPurchaseDueDateButton';
import DueDateBadge from '@/components/DueDateBadge';

export default async function PurchaseInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    error?: string;
    created?: string;
    linked?: string;
    already?: string;
    left?: string;
    supplierLinkChanged?: string;
  };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      store: { select: { name: true } },
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
      payments: {
        include: { recordedBy: { select: { name: true } } },
        orderBy: { paidAt: 'asc' },
      },
    },
  });

  if (!invoice) return <div className="card p-6">Invoice not found.</div>;

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const outstanding = Math.max(invoice.totalPence - totalPaid, 0);
  const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
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
      <PageHeader
        title={`Purchase Invoice`}
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
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Invoice Total</div>
          <div className="text-2xl font-semibold">{formatMoney(invoice.totalPence, business.currency)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Total Paid</div>
          <div className="text-2xl font-semibold text-emerald-700">{formatMoney(totalPaid, business.currency)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Outstanding</div>
          <div className={`text-2xl font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-black/40'}`}>
            {formatMoney(outstanding, business.currency)}
          </div>
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
      <div className="card p-6">
        <h2 className="text-base font-semibold">Items purchased</h2>
        <div className="overflow-x-auto">
          <table className="table mt-4 w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="rounded-xl bg-white">
                  <td className="px-3 py-2">{line.product.name}</td>
                  <td className="px-3 py-2">{line.qtyInUnit} {line.unit.name}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(line.unitCostPence, business.currency)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(line.lineTotalPence, business.currency)}</td>
                </tr>
              ))}
              <tr className="bg-black/[0.02]">
                <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase tracking-wider text-black/40">Total (incl. VAT)</td>
                <td className="px-3 py-2 text-right text-sm font-bold">{formatMoney(invoice.totalPence, business.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
      <div className="card p-6">
        <h2 className="text-base font-semibold">Payment history</h2>
        {invoice.payments.length === 0 ? (
          <p className="mt-3 text-sm text-black/50">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
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
                    <td className="px-3 py-2">{payment.method}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(payment.amountPence, business.currency)}</td>
                    <td className="px-3 py-2 text-black/50">{payment.notes ?? '—'}</td>
                    <td className="px-3 py-2 text-black/50">{payment.recordedBy?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Record payment form */}
        {!isClosed && outstanding > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Record a payment</h3>
            <form action={recordSupplierPaymentAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="returnTo" value={`/purchases/${invoice.id}`} />
              <div>
                <label className="label">Method</label>
                <select className="input" name="paymentMethod" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="label">Amount</label>
                <input
                  className="input"
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={(outstanding / 100).toFixed(2)}
                />
              </div>
              <div>
                <label className="label">Payment date</label>
                <input className="input" name="paidAt" type="date" defaultValue={today} />
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" name="notes" type="text" placeholder="e.g. cheque #1234" />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <SubmitButton className="btn-primary" loadingText="Recording…">Record payment</SubmitButton>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="flex gap-2">
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
