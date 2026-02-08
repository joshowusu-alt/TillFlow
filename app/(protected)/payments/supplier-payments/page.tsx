import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { recordSupplierPaymentAction } from '@/app/actions/payments';

export default async function SupplierPaymentsPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
    include: { supplier: true, payments: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Supplier Payments" subtitle="Settle outstanding payables." />
      <div className="card p-6">
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
                  <td className="px-3 py-3 text-sm">{invoice.supplier?.name ?? 'Default Supplier'}</td>
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
                        <button className="btn-primary w-full text-xs">Record payment</button>
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invoices.length === 0 ? <div className="text-sm text-black/50">No outstanding invoices.</div> : null}
      </div>
    </div>
  );
}
