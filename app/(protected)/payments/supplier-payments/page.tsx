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

export default async function SupplierPaymentsPage({ searchParams }: { searchParams?: { error?: string; supplierId?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const supplierId = searchParams?.supplierId?.trim() || undefined;
  const today = new Date().toISOString().slice(0, 10);

  const [invoices, recentPayments, linkedSupplier] = await Promise.all([
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
  ]);

  const outstandingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      outstanding: computeOutstandingBalance(invoice),
    }))
    .filter((invoice) => invoice.outstanding > 0);

  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + inv.outstanding, 0);

  // Last payment for the supplier summary header
  const lastPaymentAt = recentPayments.length > 0 ? recentPayments[0].paidAt : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Record payment to supplier" subtitle="Settle outstanding payables." />
      <FormError error={searchParams?.error} />

      {/* Supplier summary header when arriving from a supplier profile */}
      {linkedSupplier ? (
        <div className="card p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-black/40">Recording payment to</div>
            <div className="text-lg font-semibold text-ink">{linkedSupplier.name}</div>
            {linkedSupplier.phone ? <div className="text-sm text-black/60">{linkedSupplier.phone}</div> : null}
            <div className="mt-2 text-sm">
              <span className="text-black/50">Total outstanding: </span>
              <span className="font-semibold text-amber-700">{formatMoney(totalOutstanding, business.currency)}</span>
            </div>
            {lastPaymentAt ? (
              <div className="text-xs text-black/50">Last payment: {formatDate(lastPaymentAt)}</div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/suppliers/${linkedSupplier.id}`} className="btn-secondary text-xs">
              ← Back to supplier profile
            </Link>
            <a href="/payments/supplier-payments" className="btn-ghost text-xs text-center">
              Show all suppliers
            </a>
          </div>
        </div>
      ) : null}

      <ResponsiveDataTable
        mode="cards"
        desktop={
          <div className="card p-6">
            <div className="responsive-table-shell">
              <table className="table w-full min-w-[68rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Supplier</th>
                    <th>Purchased</th>
                    <th>Due Date</th>
                    <th>Outstanding</th>
                    <th>Record Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map((invoice) => {
                    const now = new Date();
                    return (
                      <tr key={invoice.id} className="rounded-xl bg-white align-top">
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
                        <td className="px-3 py-3 text-sm font-semibold">
                          {formatMoney(invoice.outstanding, business.currency)}
                          {invoice.payments.length > 0 && (
                            <div className="mt-0.5 text-xs font-normal text-black/40">
                              {invoice.payments.length} payment{invoice.payments.length > 1 ? 's' : ''} made
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <form action={recordSupplierPaymentAction} className="grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <div>
                              <div className="text-xs text-black/50">Method</div>
                              <select className="input" name="paymentMethod" defaultValue="CASH">
                                <option value="CASH">Cash</option>
                                <option value="CARD">Card</option>
                                <option value="TRANSFER">Transfer</option>
                                <option value="MOBILE_MONEY">Mobile Money</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-xs text-black/50">Amount</div>
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
                              <div className="text-xs text-black/50">Payment date</div>
                              <input
                                className="input"
                                name="paidAt"
                                type="date"
                                defaultValue={today}
                              />
                            </div>
                            <div>
                              <div className="text-xs text-black/50">Notes (optional)</div>
                              <input
                                className="input"
                                name="notes"
                                type="text"
                                placeholder="e.g. cheque #1234"
                              />
                            </div>
                            <div className="flex items-end md:col-span-2">
                              <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                  {outstandingInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-black/50">
                        {linkedSupplier ? `No outstanding invoices for ${linkedSupplier.name}.` : 'No outstanding invoices.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        }
        mobile={
          outstandingInvoices.length === 0 ? (
            <div className="card p-6 text-sm text-black/50">
              {linkedSupplier ? `No outstanding invoices for ${linkedSupplier.name}.` : 'No outstanding invoices.'}
            </div>
          ) : (
            outstandingInvoices.map((invoice) => {
              const now = new Date();
              return (
                <div key={invoice.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs hover:underline">
                        {invoice.id.slice(0, 8)}
                      </Link>
                      <div className="mt-1 text-sm font-medium">
                        {invoice.supplier
                          ? <Link href={`/suppliers/${invoice.supplier.id}`} className="hover:underline">{invoice.supplier.name}</Link>
                          : <span className="text-black/40">No supplier</span>
                        }
                      </div>
                      <div className="text-xs text-black/50">Purchased {formatDate(invoice.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-black/50">Outstanding</div>
                      <div className="text-sm font-semibold">{formatMoney(invoice.outstanding, business.currency)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <DueDateBadge dueDate={invoice.dueDate} now={now} />
                    <SetPurchaseDueDateButton invoiceId={invoice.id} currentDueDate={invoice.dueDate} />
                  </div>

                  <form action={recordSupplierPaymentAction} className="grid gap-2">
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-black/50">Method</div>
                        <select className="input" name="paymentMethod" defaultValue="CASH">
                          <option value="CASH">Cash</option>
                          <option value="CARD">Card</option>
                          <option value="TRANSFER">Transfer</option>
                          <option value="MOBILE_MONEY">Mobile Money</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-black/50">Amount</div>
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
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-black/50">Payment date</div>
                        <input className="input" name="paidAt" type="date" defaultValue={today} />
                      </div>
                      <div>
                        <div className="text-xs text-black/50">Notes (optional)</div>
                        <input className="input" name="notes" type="text" placeholder="e.g. cheque #1234" />
                      </div>
                    </div>
                    <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                  </form>
                </div>
              );
            })
          )
        }
      />

      {recentPayments.length > 0 ? (
        <ResponsiveDataTable
          mode="cards"
          desktop={
            <div className="card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-black/40">Recent Payments</h2>
              <div className="responsive-table-shell">
                <table className="table mt-3 w-full min-w-[52rem] border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Notes</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((payment) => (
                      <tr key={payment.id} className="rounded-xl bg-white">
                        <td className="px-3 py-2 text-sm">
                          {new Date(payment.paidAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {payment.purchaseInvoice.supplier?.name ?? 'Supplier not set'}
                        </td>
                        <td className="px-3 py-2 text-sm">{payment.method}</td>
                        <td className="px-3 py-2 text-sm font-semibold">
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
            </div>
          }
          mobile={
            recentPayments.map((payment) => (
              <div key={payment.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-black/50">{formatDate(payment.paidAt)}</div>
                    <div className="text-sm font-medium">{payment.purchaseInvoice.supplier?.name ?? 'Supplier not set'}</div>
                    <div className="text-xs text-black/50">{payment.method}</div>
                  </div>
                  <div className="text-sm font-semibold">{formatMoney(payment.amountPence, business.currency)}</div>
                </div>
                <div className="mt-2 text-xs text-black/50">Notes: {payment.notes ?? '—'}</div>
                <div className="text-xs text-black/40">Recorded by: {payment.recordedBy?.name ?? '—'}</div>
              </div>
            ))
          }
        />
      ) : null}
    </div>
  );
}
