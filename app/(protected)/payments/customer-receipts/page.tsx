import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import { recordCustomerPaymentAction } from '@/app/actions/payments';
import { computeOutstandingBalance } from '@/lib/accounting';

export default async function CustomerReceiptsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
    select: {
      id: true,
      createdAt: true,
      dueDate: true,
      totalPence: true,
      customer: { select: { name: true } },
      payments: { select: { amountPence: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const outstandingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      outstanding: computeOutstandingBalance(invoice),
    }))
    .filter((invoice) => invoice.outstanding > 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Customer Receipts" subtitle="Collect outstanding payments." />
      <FormError error={searchParams?.error} />
      <div className="card p-6">
        <div className="responsive-table-shell">
          <table className="table w-full min-w-[64rem] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Due date</th>
                <th>Outstanding</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {outstandingInvoices.map((invoice) => {
                const now = new Date();
                const isOverdue = invoice.dueDate && invoice.dueDate < now;
                const isDueSoon = !isOverdue && invoice.dueDate && (invoice.dueDate.getTime() - now.getTime()) < 3 * 86400000;
                return (
                  <tr key={invoice.id} className="rounded-xl bg-white align-top">
                    <td className="px-3 py-3 text-sm">{invoice.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 text-sm">{invoice.customer?.name ?? 'Walk-in'}</td>
                    <td className="px-3 py-3 text-sm">
                      {invoice.dueDate ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOverdue
                            ? 'bg-red-100 text-red-700'
                            : isDueSoon
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-black/5 text-black/60'
                        }`}>
                          {isOverdue ? 'Overdue - ' : ''}{formatDate(invoice.dueDate)}
                        </span>
                      ) : <span className="text-black/30">-</span>}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(invoice.outstanding, business.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <form action={recordCustomerPaymentAction} className="grid gap-2 md:grid-cols-2">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <div>
                          <div className="text-xs text-black/50">Receipt method</div>
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
                        <div className="md:col-span-2">
                          <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {outstandingInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-black/50">
                    No outstanding invoices.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
