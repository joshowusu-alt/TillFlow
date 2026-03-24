import DownloadLink from '@/components/DownloadLink';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { getBusinessStores, resolveStoreSelection } from '@/lib/services/stores';

const REASON_CODE_LABELS: Record<string, string> = {
  COUNT_ERROR: 'Count Error',
  MISSING_CASH: 'Missing Cash',
  EXTRA_CASH: 'Extra Cash',
  LATE_POSTING: 'Late Posting',
  OTHER: 'Other',
};

function reasonCodeLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return REASON_CODE_LABELS[code] ?? code;
}

function notesText(varianceReason: string | null | undefined, notes: string | null | undefined): string {
  return varianceReason || notes || '-';
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export default async function CashDrawerReportPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const { start: from, end: to, fromInputValue: fromIso, toInputValue: toIso } = resolveReportDateRange(searchParams, weekAgo, today);
  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = resolveStoreSelection(stores, searchParams?.storeId, 'ALL') ?? 'ALL';

  const shifts = await prisma.shift.findMany({
    where: {
      till: {
        store: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
        },
      },
      openedAt: { gte: from, lte: to },
    },
    orderBy: { openedAt: 'desc' },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      status: true,
      openingCashPence: true,
      expectedCashPence: true,
      actualCashPence: true,
      variance: true,
      varianceReasonCode: true,
      varianceReason: true,
      notes: true,
      till: {
        select: {
          name: true,
          store: { select: { name: true } },
        },
      },
      user: { select: { name: true } },
      closeManagerApprovedBy: { select: { name: true } },
    },
  });

  const totalExpected = shifts.reduce((sum, shift) => sum + shift.expectedCashPence, 0);
  const totalActual = shifts.reduce((sum, shift) => sum + (shift.actualCashPence ?? 0), 0);
  const totalVariance = shifts.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Drawer Report"
        subtitle="Daily cash summary by branch/store, till and cashier."
      />

      <ReportFilterCard
        actions={
          <>
            <DownloadLink
              href={`/exports/eod-csv?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
              fallbackFilename="cash-drawer-summary.csv"
              className="btn-ghost w-full text-center text-xs"
            >
              Export CSV
            </DownloadLink>
            <DownloadLink
              href={`/exports/eod-pdf?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
              fallbackFilename="cash-drawer-summary.pdf"
              className="btn-ghost w-full text-center text-xs"
            >
              Export PDF
            </DownloadLink>
          </>
        }
        columnsClassName="sm:grid-cols-5"
        submitLabel="Apply"
        submitTone="secondary"
      >
        <div>
          <label className="label">Branch</label>
          <select className="input" name="storeId" defaultValue={selectedStoreId}>
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toIso} />
        </div>
      </ReportFilterCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Expected Cash"
          value={formatMoney(totalExpected, business.currency)}
        />
        <StatCard
          label="Counted Cash"
          value={formatMoney(totalActual, business.currency)}
        />
        <StatCard
          label="Variance"
          value={formatMoney(totalVariance, business.currency)}
          tone={totalVariance === 0 ? 'default' : totalVariance > 0 ? 'accent' : 'danger'}
        />
      </div>

      <div className="space-y-3 md:hidden">
        {shifts.length === 0 ? (
          <div className="card p-4 text-center text-sm text-black/50">No shifts found in this date range.</div>
        ) : (
          shifts.map((shift) => (
            <div key={shift.id} className="card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{shift.user.name}</p>
                  <p className="mt-1 text-xs text-muted">{shift.till.store.name} • {shift.till.name}</p>
                </div>
                <span className="text-xs text-muted">{formatDateTime(shift.openedAt)}</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Expected</span><span className="font-semibold">{formatMoney(shift.expectedCashPence, business.currency)}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Counted</span><span className="font-semibold">{shift.actualCashPence !== null ? formatMoney(shift.actualCashPence, business.currency) : '-'}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Variance</span><span className={shift.variance === null ? 'text-black/40' : shift.variance === 0 ? 'text-emerald-700 font-semibold' : shift.variance > 0 ? 'text-accent font-semibold' : 'text-rose font-semibold'}>{shift.variance !== null ? formatMoney(shift.variance, business.currency) : '-'}</span></div>
                {shift.variance !== null && shift.variance !== 0 && (
                  <>
                    {shift.varianceReasonCode && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Reason</span>
                        <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/50">{reasonCodeLabel(shift.varianceReasonCode)}</span>
                      </div>
                    )}
                    {(shift.varianceReason || shift.notes) && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Notes</span>
                        <span className="text-right text-black/50">{notesText(shift.varianceReason, shift.notes)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Approved By</span><span className="text-right">{shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Open' : 'N/A')}</span></div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block">
      <ReportTableCard tableClassName="table w-full border-separate border-spacing-y-2">
        <thead>
          <tr>
            <th>Date</th>
            <th>Branch</th>
            <th>Till</th>
            <th>Cashier</th>
            <th>Expected</th>
            <th>Counted</th>
            <th>Variance</th>
            <th>Reason</th>
            <th>Notes</th>
            <th>Approved By</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.id} className="rounded-xl bg-white">
              <td className="px-3 py-3 text-xs">{formatDateTime(shift.openedAt)}</td>
              <td className="px-3 py-3 text-sm">{shift.till.store.name}</td>
              <td className="px-3 py-3 text-sm">{shift.till.name}</td>
              <td className="px-3 py-3 text-sm">{shift.user.name}</td>
              <td className="px-3 py-3 text-sm font-semibold">
                {formatMoney(shift.expectedCashPence, business.currency)}
              </td>
              <td className="px-3 py-3 text-sm font-semibold">
                {shift.actualCashPence !== null
                  ? formatMoney(shift.actualCashPence, business.currency)
                  : '-'}
              </td>
              <td className="px-3 py-3 text-sm">
                {shift.variance !== null ? (
                  <span
                    className={
                      shift.variance === 0
                        ? 'text-emerald-700'
                        : shift.variance > 0
                          ? 'text-accent'
                          : 'text-rose'
                    }
                  >
                    {formatMoney(shift.variance, business.currency)}
                  </span>
                ) : (
                  <span className="text-black/40">-</span>
                )}
              </td>
              <td className="px-3 py-3 text-sm">
                {shift.varianceReasonCode ? (
                  <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/50">
                    {reasonCodeLabel(shift.varianceReasonCode)}
                  </span>
                ) : (
                  <span className="text-black/40">-</span>
                )}
              </td>
              <td className="px-3 py-3 text-sm text-black/50" title={notesText(shift.varianceReason, shift.notes)}>
                {truncate(notesText(shift.varianceReason, shift.notes), 40)}
              </td>
              <td className="px-3 py-3 text-xs">
                {shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Open' : 'N/A')}
              </td>
            </tr>
          ))}
          {shifts.length === 0 ? (
            <ReportTableEmptyRow colSpan={10} message="No shifts found in this date range." paddingClassName="px-3 py-8" />
          ) : null}
        </tbody>
      </ReportTableCard>
      </div>
    </div>
  );
}
