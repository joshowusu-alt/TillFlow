import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { createSupplierAction } from '@/app/actions/suppliers';
import { formatMoney } from '@/lib/format';
import Link from 'next/link';

export default async function SuppliersPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const suppliers = await prisma.supplier.findMany({
    where: { businessId: business.id },
    include: { purchaseInvoices: { include: { payments: true } } }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Vendors and payables." />
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Add supplier</h2>
        <FormError error={searchParams?.error} />
        <form action={createSupplierAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input className="input" name="name" placeholder="Supplier name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-3">
            <button className="btn-primary">Add supplier</button>
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
            {suppliers.map((supplier) => {
              const balance = supplier.purchaseInvoices.reduce((sum, invoice) => {
                if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
                  return sum;
                }
                const paid = invoice.payments.reduce((paidSum, payment) => paidSum + payment.amountPence, 0);
                return sum + Math.max(invoice.totalPence - paid, 0);
              }, 0);
              return (
                <tr key={supplier.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{supplier.phone ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{supplier.email ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{formatMoney(supplier.creditLimitPence, business.currency)}</td>
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
