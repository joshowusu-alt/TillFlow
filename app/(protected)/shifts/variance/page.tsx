import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';
import { requireBusiness } from '@/lib/auth';
import { resolveSoleOrSelectedStoreId, withStoreQuery } from '@/lib/reliability/selected-store';
import SelectedStorePicker from '@/components/SelectedStorePicker';
import { prisma } from '@/lib/prisma';

export default async function CashVarianceListPage({
  searchParams,
}: {
  searchParams?: { storeId?: string };
}) {
  const { business } = await requireBusiness();
  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const selectedStoreId = resolveSoleOrSelectedStoreId(stores, searchParams?.storeId);
  const store = stores.find((row) => row.id === selectedStoreId) ?? null;
  if (!store) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Cash variance investigations"
          subtitle="Select a store before reviewing variances. TillFlow will not default to the first store."
          secondaryCta={{ label: 'Back to shifts', href: '/shifts' }}
        />
        <div className="card p-5">
          <SelectedStorePicker stores={stores} selectedStoreId={selectedStoreId} action="/shifts/variance" />
        </div>
      </div>
    );
  }

  const investigations = await prisma.cashVarianceInvestigation.findMany({
    where: {
      businessId: business.id,
      shift: { till: { storeId: store.id } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      variancePence: true,
      transactionNumber: true,
      createdAt: true,
      assignedReviewer: { select: { name: true } },
      shift: {
        select: {
          id: true,
          closureNumber: true,
          actualCashPence: true,
          expectedCashPence: true,
          user: { select: { name: true } },
          till: { select: { name: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Cash variance investigations"
        subtitle="Non-zero close variances stay on the original counted and expected cash. This workflow only records review."
        secondaryCta={{ label: 'Back to shifts', href: withStoreQuery('/shifts', store.id) }}
      />

      <div className="card p-4">
        <SelectedStorePicker stores={stores} selectedStoreId={store.id} action="/shifts/variance" />
      </div>

      <div className="card overflow-hidden p-4">
        {investigations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/50">
            No cash variance investigations for this store.
          </div>
        ) : (
          <div className="responsive-table-shell">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Till</th>
                  <th>Cashier</th>
                  <th>Variance</th>
                  <th>Counted / expected</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <Link href={withStoreQuery(`/shifts/variance/${row.id}`, store.id)} className="font-semibold text-accent underline">
                        {displayDocumentNumber('cash_variance', row.transactionNumber, row.id)}
                      </Link>
                      {row.shift.closureNumber ? (
                        <div className="text-[11px] text-black/40">{row.shift.closureNumber}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.shift.till.name}</td>
                    <td className="px-3 py-2">{row.shift.user.name}</td>
                    <td className="px-3 py-2 font-semibold">
                      {formatMoney(row.variancePence, business.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/55">
                      {formatMoney(row.shift.actualCashPence ?? 0, business.currency)}
                      {' / '}
                      {formatMoney(row.shift.expectedCashPence, business.currency)}
                    </td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
