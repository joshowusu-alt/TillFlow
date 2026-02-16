import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import Link from 'next/link';

export default async function SalesPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  // Sales query is the only data fetch — no parallelisation needed but auth is now cached
  const sales = await prisma.salesInvoice.findMany({
    where: { businessId: business.id },
    select: {
      id: true,
      createdAt: true,
      paymentStatus: true,
      totalPence: true,
      customer: { select: { name: true } },
      salesReturn: { select: { id: true } },
      _count: { select: { lines: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle="Latest sales invoices and receipts."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
      />
      <div className="card p-6 overflow-x-auto">
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
                    <div className="flex gap-2">
                      {sale._count.lines > 1 && (
                        <Link className="btn-ghost text-xs" href={`/sales/amend/${sale.id}`}>
                          Amend
                        </Link>
                      )}
                      <Link className="btn-ghost text-xs" href={`/sales/return/${sale.id}`}>
                        Return
                      </Link>
                    </div>
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
