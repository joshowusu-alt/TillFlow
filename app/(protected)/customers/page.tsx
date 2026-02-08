import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createCustomerAction } from '@/app/actions/customers';
import { formatMoney } from '@/lib/format';
import Link from 'next/link';

export default async function CustomersPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const customers = await prisma.customer.findMany({
    where: { businessId: business.id },
    include: { salesInvoices: { include: { payments: true } } }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Credit customers and contact details." />
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Add customer</h2>
        <form action={createCustomerAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input className="input" name="name" placeholder="Customer name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-3">
            <button className="btn-primary">Add customer</button>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Credit Limit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const balance = customer.salesInvoices.reduce((sum, invoice) => {
                if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
                  return sum;
                }
                const paid = invoice.payments.reduce((paidSum, payment) => paidSum + payment.amountPence, 0);
                return sum + Math.max(invoice.totalPence - paid, 0);
              }, 0);
              return (
                <tr key={customer.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/customers/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{customer.phone ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{customer.email ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{formatMoney(customer.creditLimitPence, business.currency)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(balance, business.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
