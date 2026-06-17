import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import { recordCustomerPaymentAction } from '@/app/actions/payments';
import { computeOutstandingBalance } from '@/lib/accounting';
import DueDateBadge from '@/components/DueDateBadge';
import Link from 'next/link';

export default async function CustomerReceiptsPage({ searchParams }: { searchParams?: { error?: string; customerId?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const customerId = searchParams?.customerId?.trim() || undefined;

  const [invoices, linkedCustomer] = await Promise.all([
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
    customerId
      ? prisma.customer.findFirst({
          where: { id: customerId, businessId: business.id },
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Record customer payment" subtitle="Collect outstanding payments from customers." />

      {/* Customer summary header when arriving from a customer profile */}
      {linkedCustomer ? (
        <div className="card p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-black/40">Collecting payment from</div>
            <div className="text-lg font-semibold text-ink">{linkedCustomer.name}</div>
            {linkedCustomer.phone ? <div className="text-sm text-black/60">{linkedCustomer.phone}</div> : null}
            <div className="mt-2 text-sm">
              <span className="text-black/50">Total outstanding: </span>
              <span className="font-semibold text-amber-700">{formatMoney(totalOutstanding, business.currency)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/customers/${linkedCustomer.id}`} className="btn-secondary text-xs">
              ← Back to customer profile
            </Link>
            <a href="/payments/customer-receipts" className="btn-ghost text-xs text-center">
              Show all customers
            </a>
          </div>
        </div>
      ) : (
        <a href="/payments/customer-receipts" className="hidden" />
      )}

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
                <th>Record payment</th>
              </tr>
            </thead>
            <tbody>
              {outstandingInvoices.map((invoice) => {
                const now = new Date();
                return (
                  <tr key={invoice.id} className="rounded-xl bg-white align-top">
                    <td className="px-3 py-3 text-sm">{invoice.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 text-sm">
                      {invoice.customer ? (
                        <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                          {invoice.customer.name}
                        </Link>
                      ) : 'Walk-in'}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <DueDateBadge dueDate={invoice.dueDate} now={now} noneLabel="-" />
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(invoice.outstanding, business.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <form action={recordCustomerPaymentAction} className="grid gap-2 md:grid-cols-2">
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
                          <div className="text-xs text-black/50">Amount received</div>
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
                    {linkedCustomer ? `No outstanding invoices for ${linkedCustomer.name}.` : 'No outstanding invoices.'}
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
