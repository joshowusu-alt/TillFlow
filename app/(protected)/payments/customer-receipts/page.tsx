import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import { recordCustomerPaymentAction } from '@/app/actions/payments';
import { computeOutstandingBalance } from '@/lib/accounting';
import DueDateBadge from '@/components/DueDateBadge';
import Link from 'next/link';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money (MoMo)',
};

export default async function CustomerReceiptsPage({ searchParams }: { searchParams?: { error?: string; customerId?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const customerId = searchParams?.customerId?.trim() || undefined;

  const [invoices, recentPayments, linkedCustomer] = await measureServerOperation(
    'page.customer-receipts.load',
    () => Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          businessId: business.id,
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
          ...(customerId ? { customerId } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          dueDate: true,
          totalPence: true,
          customer: { select: { id: true, name: true, phone: true } },
          payments: { select: { amountPence: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.salesPayment.findMany({
        where: {
          salesInvoice: {
            businessId: business.id,
            ...(customerId ? { customerId } : {}),
          },
        },
        select: {
          id: true,
          method: true,
          amountPence: true,
          receivedAt: true,
          reference: true,
          salesInvoice: {
            select: {
              id: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 20,
      }),
      customerId
        ? prisma.customer.findFirst({
            where: { id: customerId, businessId: business.id },
            select: { id: true, name: true, phone: true, creditLimitPence: true }
          })
        : Promise.resolve(null),
    ]),
    {
      businessId: business.id,
      route: '/payments/customer-receipts',
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
  const unpaidInvoiceCount = outstandingInvoices.length;

  const renderPaymentForm = (invoiceId: string) => (
    <form action={recordCustomerPaymentAction} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {linkedCustomer ? (
        <input type="hidden" name="returnTo" value={`/customers/${linkedCustomer.id}`} />
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
        <div className="text-xs font-medium text-black/50">Amount received</div>
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
      <div className="text-xs text-black/45 md:col-span-2">
        Enter the amount received. Do not exceed the unpaid balance.
      </div>
      <div className="md:col-span-2">
        <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Record customer payment" subtitle="Take a payment from a customer and reduce what they owe." />

      <FormError error={searchParams?.error} />

      {linkedCustomer ? (
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Customer account</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${totalOutstanding > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {totalOutstanding > 0 ? 'Balance due' : 'Up to date'}
                </span>
              </div>
              <div className="text-lg font-semibold text-ink">{linkedCustomer.name}</div>
              {linkedCustomer.phone ? <div className="mt-1 text-sm text-black/60">{linkedCustomer.phone}</div> : null}
              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">What they owe</div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${totalOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatMoney(totalOutstanding, business.currency)}
                </div>
                <div className="mt-1 text-xs text-black/55">
                  {unpaidInvoiceCount} unpaid invoice{unpaidInvoiceCount === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm lg:flex-col">
              <Link href={`/customers/${linkedCustomer.id}`} className="btn-secondary text-xs">
                Back to customer account
              </Link>
              <Link href="/payments/customer-receipts" className="btn-ghost text-xs text-center">
                Show all customers
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">What they owe</div>
          <div className={`mt-2 text-xl font-bold tabular-nums ${totalOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {formatMoney(totalOutstanding, business.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Unpaid invoices</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-ink">{unpaidInvoiceCount.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card max-lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Recent payments</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-ink">{recentPayments.length.toLocaleString()}</div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Unpaid invoices</h2>
            <p className="mt-1 text-sm text-black/50">Choose an unpaid invoice and record the amount received.</p>
          </div>
        </div>

        <ResponsiveDataTable
          mode="cards"
          desktop={
            <div className="responsive-table-shell mt-4">
              <table className="table w-full min-w-[64rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Due date</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Record payment</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map((invoice) => {
                    const now = new Date();
                    return (
                      <tr key={invoice.id} className="rounded-xl bg-white align-top transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                        <td className="px-3 py-3 text-sm font-mono text-xs">{invoice.id.slice(0, 8)}</td>
                        <td className="px-3 py-3 text-sm">
                          {invoice.customer ? (
                            <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                              {invoice.customer.name}
                            </Link>
                          ) : 'Walk-in'}
                        </td>
                        <td className="px-3 py-3 text-sm text-black/60">{formatDate(invoice.createdAt)}</td>
                        <td className="px-3 py-3 text-sm">
                          <DueDateBadge dueDate={invoice.dueDate} now={now} noneLabel="-" />
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                          {formatMoney(invoice.totalPence, business.currency)}
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold tabular-nums text-amber-700">
                          {formatMoney(invoice.outstanding, business.currency)}
                        </td>
                        <td className="px-3 py-3">
                          {renderPaymentForm(invoice.id)}
                        </td>
                      </tr>
                    );
                  })}
                  {outstandingInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-black/50">
                        <div className="font-semibold text-ink">
                          {linkedCustomer ? 'No unpaid invoices for this customer.' : 'No unpaid invoices.'}
                        </div>
                        <div className="mt-1">
                          {linkedCustomer ? 'When this customer buys on credit, unpaid invoices will appear here.' : 'Customer credit invoices will appear here when they have unpaid balances.'}
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
                  {linkedCustomer ? 'No unpaid invoices for this customer.' : 'No unpaid invoices.'}
                </div>
                <div className="mt-1">
                  {linkedCustomer ? 'When this customer buys on credit, unpaid invoices will appear here.' : 'Customer credit invoices will appear here when they have unpaid balances.'}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {outstandingInvoices.map((invoice) => {
                  const now = new Date();
                  return (
                    <div key={invoice.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-transform duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-black/50">{invoice.id.slice(0, 8)}</div>
                          <div className="mt-1 text-sm font-semibold text-ink">
                            {invoice.customer ? (
                              <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                                {invoice.customer.name}
                              </Link>
                            ) : 'Walk-in'}
                          </div>
                          <div className="mt-1 text-xs text-black/50">Invoice date: {formatDate(invoice.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-black/50">Balance</div>
                          <div className="text-sm font-bold tabular-nums text-amber-700">
                            {formatMoney(invoice.outstanding, business.currency)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-black/55">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div>Total</div>
                          <div className="font-semibold tabular-nums text-ink">{formatMoney(invoice.totalPence, business.currency)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <div>Status</div>
                          <div className="font-semibold text-amber-700">Unpaid</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <DueDateBadge dueDate={invoice.dueDate} now={now} noneLabel="No due date" />
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
        <h2 className="text-lg font-display font-semibold">Recent customer payments</h2>
        <p className="mt-1 text-sm text-black/50">Customer payments will appear here once recorded.</p>
        {recentPayments.length > 0 ? (
          <ResponsiveDataTable
            mode="cards"
            desktop={
              <div className="responsive-table-shell mt-4">
                <table className="table w-full min-w-[52rem] border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Invoice</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((payment) => (
                      <tr key={payment.id} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                        <td className="px-3 py-2 text-sm text-black/60">{formatDate(payment.receivedAt)}</td>
                        <td className="px-3 py-2 text-sm">{payment.salesInvoice.customer?.name ?? 'Walk-in'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-black/60">{payment.salesInvoice.id.slice(0, 8)}</td>
                        <td className="px-3 py-2 text-sm">{PAYMENT_LABEL[payment.method] ?? payment.method}</td>
                        <td className="px-3 py-2 text-sm font-semibold tabular-nums">
                          {formatMoney(payment.amountPence, business.currency)}
                        </td>
                        <td className="px-3 py-2 text-xs text-black/60">{payment.reference ?? '—'}</td>
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
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-black/50">{formatDate(payment.receivedAt)}</div>
                        <div className="mt-1 text-sm font-semibold text-ink">{payment.salesInvoice.customer?.name ?? 'Walk-in'}</div>
                        <div className="text-xs text-black/50">{PAYMENT_LABEL[payment.method] ?? payment.method} · invoice {payment.salesInvoice.id.slice(0, 8)}</div>
                      </div>
                      <div className="text-sm font-bold tabular-nums">{formatMoney(payment.amountPence, business.currency)}</div>
                    </div>
                    <div className="mt-2 text-xs text-black/50">Reference: {payment.reference ?? '—'}</div>
                  </div>
                ))}
              </div>
            }
          />
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white px-5 py-6 text-center text-sm text-black/50">
            <div className="font-semibold text-ink">No payments recorded yet.</div>
            <div className="mt-1">Customer payments will appear here once recorded.</div>
          </div>
        )}
      </section>
    </div>
  );
}
