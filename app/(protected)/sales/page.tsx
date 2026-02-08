import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import Link from 'next/link';

export default async function SalesPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const sales = await prisma.salesInvoice.findMany({
    where: { businessId: business.id },
    include: { customer: true, payments: true, salesReturn: true },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" subtitle="Latest sales invoices and receipts." />
      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Receipt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm">{sale.id.slice(0, 8)}</td>
                <td className="px-3 py-3 text-sm">{formatDateTime(sale.createdAt)}</td>
                <td className="px-3 py-3 text-sm">{sale.customer?.name ?? 'Walk-in'}</td>
                <td className="px-3 py-3">
                  <span className={`pill-${sale.paymentStatus.toLowerCase().replace('_', '-')}`}>{sale.paymentStatus.replace('_', ' ')}</span>
                </td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(sale.totalPence, business.currency)}
                </td>
                <td className="px-3 py-3">
                  <Link className="btn-ghost text-xs" href={`/receipts/${sale.id}`}>
                    Print
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {sale.salesReturn || ['RETURNED', 'VOID'].includes(sale.paymentStatus) ? (
                    <span className="text-xs text-black/40">Returned</span>
                  ) : (
                    <Link className="btn-ghost text-xs" href={`/sales/return/${sale.id}`}>
                      Return
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
