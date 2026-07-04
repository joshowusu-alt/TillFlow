import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import { recordSupplierPaymentAction } from '@/app/actions/payments';
import { computeOutstandingBalance } from '@/lib/accounting';
import SetPurchaseDueDateButton from '@/components/SetPurchaseDueDateButton';
import DueDateBadge from '@/components/DueDateBadge';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money (MoMo)',
};

export default async function SupplierPaymentsPage({ searchParams }: { searchParams?: { error?: string; supplierId?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const supplierId = searchParams?.supplierId?.trim() || undefined;
  const today = new Date().toISOString().slice(0, 10);

  const [invoices, recentPayments, linkedSupplier] = await measureServerOperation(
    'page.supplier-payments.load',
    () => Promise.all([
      prisma.purchaseInvoice.findMany({
        where: {
          businessId: business.id,
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
          ...(supplierId ? { supplierId } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          dueDate: true,
          totalPence: true,
          supplier: { select: { id: true, name: true } },
          payments: { select: { amountPence: true, paidAt: true, method: true } }
        },
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'asc' },
        ],
      }),
      prisma.purchasePayment.findMany({
        where: {
          purchaseInvoice: {
            businessId: business.id,
            ...(supplierId ? { supplierId } : {}),
          }
        },
        select: {
          id: true,
          method: true,
          amountPence: true,
          paidAt: true,
          notes: true,
          recordedBy: { select: { name: true } },
          purchaseInvoice: {
            select: { id: true, supplier: { select: { name: true } } }
          }
        },
        orderBy: { paidAt: 'desc' },
        take: 20,
      }),
      supplierId
        ? prisma.supplier.findFirst({
            where: { id: supplierId, businessId: business.id },
            select: { id: true, name: true, phone: true, creditLimitPence: true }
          })
        : Promise.resolve(null),
    ]),
    {
      businessId: business.id,
      route: '/payments/supplier-payments',
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );

  const outstandingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      outstanding: computeOutstandingBalance(invoice),
    }))
    .filter((invoice) => invoice.outstanding > 0);

  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);
  const unpaidPurchaseCount = outstandingInvoices.length;

  // Last payment for the supplier summary header
  const lastPaymentAt = recentPayments.length > 0 ? recentPayments[0].paidAt : null;

  const renderPaymentForm = (invoiceId: string) => (
    <form action={recordSupplierPaymentAction} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {linkedSupplier ? (
        <input type="hidden" name="returnTo" value={`/suppliers/${linkedSupplier.id}`} />
      ) : null}
      <div>
        <div className="text-xs font-medium text-black/50">Payment method</div>
        <select className="input" name="paymentMethod" defaultValue="CASH">
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="TRANSFER">Bank Transfer</option>
          <option value="MOBILE_MONEY">Mobile Money (MoMo)</option>
        </select>
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Amount paid</div>
        <input
          className="input"
          name="amount"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Payment date</div>
        <input
          className="input"
          name="paidAt"
          type="date"
          defaultValue={today}
        />
      </div>
      <div>
        <div className="text-xs font-medium text-black/50">Notes (optional)</div>
        <input
          className="input"
          name="notes"
          type="text"
          placeholder="e.g. cheque #1234"
        />
      </div>
      <div className="text-xs text-black/45 md:col-span-2">
        Enter the amount paid. Do not exceed the amount owed.
      </div>
      <div className="flex items-end md:col-span-2">
        <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Record supplier payment" subtitle="Pay a supplier and reduce what your business owes." />
      <FormError error={searchParams?.error} />

      {linkedSupplier ? (
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Supplier account</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${totalOutstanding > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {totalOutstanding > 0 ? 'Amount owed' : 'Up to date'}
                </span>
              </div>
              <div className="text-lg font-semibold text-ink">{linkedSupplier.name}</div>
              {linkedSupplier.phone ? <div className="mt-1 text-sm text-black/60">{linkedSupplier.phone}</div> : null}
              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">What you owe</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${totalOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatMoney(totalOutstanding, business.currency)}
                </div>
                <div className="mt-1 text-xs text-black/55">
                  {lastPaymentAt ? `Last payment: ${formatDate(lastPaymentAt)}` : `${unpaidPurchaseCount} unpaid purchase${unpaidPurchaseCount === 1 ? '' : 's'}`}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm lg:flex-col">
              <Link href={`/suppliers/${linkedSupplier.id}`} className="btn-secondary text-xs">
                Back to supplier account
              </Link>
              <Link href="/payments/supplier-payments" className="btn-ghost text-xs text-center">
                Show all suppliers
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="operational-metric-grid operational-metric-grid--3">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">What you owe</div>
          <div className={`mt-2 text-xl font-bold tabular-nums ${totalOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {formatMoney(totalOutstanding, business.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Unpaid purchases</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-ink">{unpaidPurchaseCount.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card max-lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Recent payments</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-ink">{recentPayments.length.toLocaleString()}</div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-display font-semibold">Unpaid purchases</h2>
        <p className="mt-1 text-sm text-black/50">Choose an unpaid purchase and record the amount paid.</p>
        <ResponsiveDataTable
          mode="cards"
          desktop={
            <div className="responsive-table-shell mt-4">
              <table className="table w-full min-w-[68rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Purchase</th>
                    <th>Supplier</th>
                    <th>Purchased</th>
                    <th>Due date</th>
                    <th>What you owe</th>
                    <th>Record payment</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map((invoice) => {
                    const now = new Date();
                    return (
                      <tr key={invoice.id} className="rounded-xl bg-white align-top transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                        <td className="px-3 py-3 text-sm">
                          <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs hover:underline">
                            {invoice.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          {invoice.supplier
                            ? <Link href={`/suppliers/${invoice.supplier.id}`} className="hover:underline">{invoice.supplier.name}</Link>
                            : <span className="text-black/40">No supplier</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-sm text-black/60">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <div className="flex items-center gap-1">
                            <DueDateBadge dueDate={invoice.dueDate} now={now} />
                            <SetPurchaseDueDateButton
                              invoiceId={invoice.id}
                              currentDueDate={invoice.dueDate}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold tabular-nums text-amber-700">
                          {formatMoney(invoice.outstanding, business.currency)}
                          {invoice.payments.length > 0 && (
                            <div className="mt-0.5 text-xs font-normal text-black/40">
                              {invoice.payments.length} payment{invoice.payments.length > 1 ? 's' : ''} made
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {renderPaymentForm(invoice.id)}
                        </td>
                      </tr>
                    );
                  })}
                  {outstandingInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-black/50">
                        <div className="font-semibold text-ink">
                          {linkedSupplier ? 'No unpaid purchases for this supplier.' : 'No unpaid purchases.'}
                        </div>
                        <div className="mt-1">
                          {linkedSupplier ? 'When you record purchases from this supplier, unpaid items will appear here.' : 'Supplier purchases will appear here when they have unpaid balances.'}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          }
          mobile={
            outstandingInvoices.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white px-5 py-6 text-center text-sm text-black/50">
                <div className="font-semibold text-ink">
                  {linkedSupplier ? 'No unpaid purchases for this supplier.' : 'No unpaid purchases.'}
                </div>
                <div className="mt-1">
                  {linkedSupplier ? 'When you record purchases from this supplier, unpaid items will appear here.' : 'Supplier purchases will appear here when they have unpaid balances.'}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {outstandingInvoices.map((invoice) => {
                  const now = new Date();
                  return (
                    <div key={invoice.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-transform duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs text-black/50 hover:underline">
                            {invoice.id.slice(0, 8)}
                          </Link>
                          <div className="mt-1 text-sm font-semibold text-ink">
                            {invoice.supplier
                              ? <Link href={`/suppliers/${invoice.supplier.id}`} className="hover:underline">{invoice.supplier.name}</Link>
                              : <span className="text-black/40">No supplier</span>
                            }
                          </div>
                          <div className="text-xs text-black/50">Purchased {formatDate(invoice.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-black/50">What you owe</div>
                          <div className="text-sm font-bold tabular-nums text-amber-700">{formatMoney(invoice.outstanding, business.currency)}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-1">
                        <DueDateBadge dueDate={invoice.dueDate} now={now} />
                        <SetPurchaseDueDateButton invoiceId={invoice.id} currentDueDate={invoice.dueDate} />
                      </div>

                      <div className="mt-3 border-t border-black/5 pt-3">
                        {renderPaymentForm(invoice.id)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-display font-semibold">Recent supplier payments</h2>
        <p className="mt-1 text-sm text-black/50">Payments to suppliers will appear here once recorded.</p>
        {recentPayments.length > 0 ? (
          <ResponsiveDataTable
            mode="cards"
            desktop={
              <div className="responsive-table-shell mt-4">
                <table className="table w-full min-w-[52rem] border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Notes</th>
                      <th>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((payment) => (
                      <tr key={payment.id} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                        <td className="px-3 py-2 text-sm text-black/60">
                          {formatDate(payment.paidAt)}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {payment.purchaseInvoice.supplier?.name ?? 'Supplier not set'}
                        </td>
                        <td className="px-3 py-2 text-sm">{PAYMENT_LABEL[payment.method] ?? payment.method}</td>
                        <td className="px-3 py-2 text-sm font-semibold tabular-nums">
                          {formatMoney(payment.amountPence, business.currency)}
                        </td>
                        <td className="px-3 py-2 text-xs text-black/60">
                          {payment.notes ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-black/60">
                          {payment.recordedBy?.name ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
            mobile={
              <div className="mt-4 space-y-3">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-transform duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-black/50">{formatDate(payment.paidAt)}</div>
                        <div className="text-sm font-medium">{payment.purchaseInvoice.supplier?.name ?? 'Supplier not set'}</div>
                        <div className="text-xs text-black/50">{PAYMENT_LABEL[payment.method] ?? payment.method}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">{formatMoney(payment.amountPence, business.currency)}</div>
                    </div>
                    <div className="mt-2 text-xs text-black/50">Notes: {payment.notes ?? '—'}</div>
                    <div className="text-xs text-black/40">Recorded by: {payment.recordedBy?.name ?? '—'}</div>
                  </div>
                ))}
              </div>
            }
          />
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white px-5 py-6 text-center text-sm text-black/50">
            <div className="font-semibold text-ink">No supplier payments recorded yet.</div>
            <div className="mt-1">Payments to suppliers will appear here once recorded.</div>
          </div>
        )}
      </section>
    </div>
  );
}
