import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { DataCard, DataCardField, DataCardHeader } from '@/components/DataCard';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { recordSupplierPaymentAction } from '@/app/actions/payments';

export default async function SupplierPaymentsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const today = new Date().toISOString().slice(0, 10);

  const [invoices, recentPayments] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: {
        id: true,
        totalPence: true,
        supplier: { select: { name: true } },
        payments: { select: { amountPence: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.purchasePayment.findMany({
      where: { purchaseInvoice: { businessId: business.id } },
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
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Supplier Payments" subtitle="Settle outstanding payables." />
      <FormError error={searchParams?.error} />
      <ResponsiveDataTable
        mobile={
          invoices.length === 0 ? (
            <div className="card p-4 text-sm text-black/50">No outstanding invoices.</div>
          ) : (
            invoices.map((invoice) => {
              const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
              const outstanding = Math.max(invoice.totalPence - paid, 0);
              return (
                <DataCard key={invoice.id}>
                  <DataCardHeader
                    title={invoice.supplier?.name ?? 'Supplier not set'}
                    subtitle={`Invoice ${invoice.id.slice(0, 8)}`}
                    aside={<span className="text-sm font-semibold text-ink">{formatMoney(outstanding, business.currency)}</span>}
                  />
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <DataCardField label="Outstanding" value={<span className="font-semibold text-ink">{formatMoney(outstanding, business.currency)}</span>} />
                    <DataCardField label="Payment date" value={today} />
                  </div>
                  <form action={recordSupplierPaymentAction} className="mt-4 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <div>
                      <div className="text-xs text-black/50">Payment method</div>
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
                      <input className="input" name="paidAt" type="date" defaultValue={today} />
                    </div>
                    <div>
                      <div className="text-xs text-black/50">Notes (optional)</div>
                      <input className="input" name="notes" type="text" placeholder="e.g. cheque #1234" />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                    </div>
                  </form>
                </DataCard>
              );
            })
          )
        }
        desktop={
          <div className="card p-6">
            <div className="responsive-table-shell">
              <table className="table w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Supplier</th>
                    <th>Outstanding</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
                    const outstanding = Math.max(invoice.totalPence - paid, 0);
                    return (
                      <tr key={invoice.id} className="rounded-xl bg-white align-top">
                        <td className="px-3 py-3 text-sm">{invoice.id.slice(0, 8)}</td>
                        <td className="px-3 py-3 text-sm">{invoice.supplier?.name ?? 'Supplier not set'}</td>
                        <td className="px-3 py-3 text-sm font-semibold">
                          {formatMoney(outstanding, business.currency)}
                        </td>
                        <td className="px-3 py-3">
                          <form action={recordSupplierPaymentAction} className="grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <div>
                              <div className="text-xs text-black/50">Payment method</div>
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
                            <div className="flex items-end">
                              <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {invoices.length === 0 ? <div className="text-sm text-black/50">No outstanding invoices.</div> : null}
          </div>
        }
      />

      {recentPayments.length > 0 ? (
        <ResponsiveDataTable
          mobile={recentPayments.map((payment) => (
            <DataCard key={payment.id}>
              <DataCardHeader
                title={payment.purchaseInvoice.supplier?.name ?? 'Supplier not set'}
                subtitle={new Date(payment.paidAt).toLocaleDateString()}
                aside={<span className="text-sm font-semibold text-ink">{formatMoney(payment.amountPence, business.currency)}</span>}
              />
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <DataCardField label="Method" value={payment.method} />
                <DataCardField label="Recorded by" value={payment.recordedBy?.name ?? '—'} />
                <DataCardField className="sm:col-span-2" label="Notes" value={payment.notes ?? '—'} valueClassName="text-black/60" />
              </div>
            </DataCard>
          ))}
          desktop={
            <div className="card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-black/40">Recent Payments</h2>
              <div className="responsive-table-shell">
                <table className="table mt-3 w-full border-separate border-spacing-y-2">
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
        />
      ) : null}
    </div>
  );
}
