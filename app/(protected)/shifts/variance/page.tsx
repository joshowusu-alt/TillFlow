import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayDocumentNumber, displayShiftPresentationNumber } from '@/lib/reliability/walkthrough-contracts';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { withStoreQuery } from '@/lib/reliability/selected-store';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import { prisma } from '@/lib/prisma';

export default async function CashVarianceListPage({ searchParams }: { searchParams?: Promise<{ page?: string; view?: string }> }) {
  const params = await searchParams;
  const { business, store, stores, user } = await requireBusinessAndOptionalStore();
  if (!store) {
    return (
      <SelectOperationalStoreNotice
        stores={stores}
        canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'}
        title="Select a branch to review variances"
      />
    );
  }

  const requestedPage = Number(params?.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const showAll = params?.view === 'all';
  const pageSize = 25;
  const investigations = await prisma.cashVarianceInvestigation.findMany({
    where: {
      businessId: business.id,
      shift: { till: { storeId: store.id } },
      ...(showAll ? {} : { reviewedAt: null, status: { notIn: ['APPROVED', 'REVIEWED'] } }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    select: {
      id: true,
      status: true,
      variancePence: true,
      transactionNumber: true,
      createdAt: true,
      reviewedAt: true,
      reviewedBy: { select: { name: true } },
      approvedAt: true,
      approvedBy: { select: { name: true } },
      assignedReviewer: { select: { name: true } },
      shift: {
        select: {
          id: true,
          shiftNumber: true,
          closureNumber: true,
          actualCashPence: true,
          expectedCashPence: true,
          user: { select: { name: true } },
          till: { select: { name: true } },
        },
      },
    },
  });
  const hasNext = investigations.length > pageSize;
  const listHref = (nextPage: number, all = showAll) => withStoreQuery(`/shifts/variance?page=${nextPage}&view=${all ? 'all' : 'outstanding'}`, store.id);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Cash differences"
        subtitle="Review cash differences without changing the original counted and expected cash."
        secondaryCta={{ label: 'Back to shifts', href: withStoreQuery('/shifts', store.id) }}
      />

      <div className="card p-4">
        <p className="text-sm font-semibold text-ink">Active branch: {store.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link className={`btn-secondary min-h-11 ${!showAll ? 'font-bold underline' : ''}`} aria-current={!showAll ? 'page' : undefined} href={listHref(1, false)}>Outstanding</Link>
          <Link className={`btn-secondary min-h-11 ${showAll ? 'font-bold underline' : ''}`} aria-current={showAll ? 'page' : undefined} href={listHref(1, true)}>All records</Link>
        </div>
      </div>

      <div className="card overflow-hidden p-4">
        {investigations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/50">
            No cash differences on this page for this branch.
          </div>
        ) : (
          <div className="responsive-table-shell">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Till</th>
                  <th>Cashier</th>
                  <th>Difference</th>
                  <th>Counted / expected</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {investigations.slice(0, pageSize).map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <Link href={withStoreQuery(`/shifts/variance/${row.id}`, store.id)} className="font-semibold text-accent underline">
                        {displayDocumentNumber('cash_variance', row.transactionNumber, row.id)}
                      </Link>
                      <div className="text-[11px] text-black/50">Shift: {displayShiftPresentationNumber(row.shift)}</div>
                      {row.shift.closureNumber ? (
                        <div className="text-[11px] text-black/40">Closure reference: {row.shift.closureNumber}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.shift.till.name}</td>
                    <td className="px-3 py-2">{row.shift.user.name}</td>
                    <td className="px-3 py-2 font-semibold">
                      {row.variancePence > 0 ? 'Over by ' : 'Short by '}{formatMoney(Math.abs(row.variancePence), business.currency)}
                    </td>
                    <td className="px-3 py-2 text-xs text-black/55">
                      {row.shift.actualCashPence == null ? 'Not recorded' : formatMoney(row.shift.actualCashPence, business.currency)}
                      {' / '}
                      {formatMoney(row.shift.expectedCashPence, business.currency)}
                    </td>
                    <td className="px-3 py-2">{row.status === 'REVIEWED' || row.status === 'APPROVED' ? `Reviewed by ${row.reviewedBy?.name ?? row.approvedBy?.name ?? 'Unknown'}${row.reviewedAt || row.approvedAt ? ` · ${formatDateTime((row.reviewedAt ?? row.approvedAt)!)}` : ''}` : 'Needs review'}</td>
                    <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav aria-label="Cash differences pages" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {page > 1 && <Link className="btn-secondary min-h-11" href={listHref(page - 1)}>Previous</Link>}
          <span>Page {page}</span>
          {hasNext && <Link className="btn-secondary min-h-11" href={listHref(page + 1)}>Next</Link>}
        </nav>
      </div>
    </div>
  );
}
