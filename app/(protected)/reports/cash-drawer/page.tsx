import DownloadLink from '@/components/DownloadLink';
import Pagination from '@/components/Pagination';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import NotesCell from './NotesCell';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { getBusinessStores, resolveStoreSelection } from '@/lib/services/stores';
import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  summarizeCashDrawerEntries,
} from '@/lib/services/cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

const REASON_CODE_LABELS: Record<string, string> = {
  COUNT_ERROR: 'Count Error',
  MISSING_CASH: 'Missing Cash',
  EXTRA_CASH: 'Extra Cash',
  LATE_POSTING: 'Late Posting',
  OTHER: 'Other',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function reasonCodeLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return REASON_CODE_LABELS[code] ?? code;
}

function notesText(varianceReason: string | null | undefined, notes: string | null | undefined): string {
  return varianceReason || notes || '-';
}

export default async function CashDrawerReportPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string; page?: string; pageSize?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const { start: from, end: to, fromInputValue: fromIso, toInputValue: toIso } = resolveReportDateRange(searchParams, weekAgo, today);
  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = resolveStoreSelection(stores, searchParams?.storeId, 'ALL') ?? 'ALL';
  const requestedPageSize = parseInt(searchParams?.pageSize ?? '20', 10) || 20;
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as 10 | 20 | 50) ? requestedPageSize : 20;
  const requestedPage = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const where = {
    till: {
      store: {
        businessId: business.id,
        ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
      },
    },
    openedAt: { gte: from, lte: to },
  };

  const totalRows = await measureServerOperation(
    'report.cash-drawer.count',
    () => prisma.shift.count({ where }),
    {
      businessId: business.id,
      storeId: selectedStoreId,
      route: '/reports/cash-drawer',
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'report' },
  );
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  const shifts = await measureServerOperation(
    'report.cash-drawer.rows',
    () => prisma.shift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
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
        cashDrawerEntries: {
          select: { entryType: true, amountPence: true },
        },
      },
    }),
    {
      businessId: business.id,
      storeId: selectedStoreId,
      route: '/reports/cash-drawer',
      page: currentPage,
      pageSize,
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' },
  );

  const closedShifts = shifts.filter((s) => s.status === 'CLOSED');
  const openShiftCount = shifts.filter((s) => s.status === 'OPEN').length;

  const totalExpected = shifts.reduce((sum, shift) => sum + shift.expectedCashPence, 0);
  const totalActual = closedShifts.reduce((sum, shift) => sum + (shift.actualCashPence ?? 0), 0);
  const totalVariance = closedShifts.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);
  const movementTotals = shifts.reduce<Record<string, number>>((acc, shift) => {
    const summary = summarizeCashDrawerEntries(shift.cashDrawerEntries);
    for (const [entryType, amount] of Object.entries(summary.byType)) {
      acc[entryType] = (acc[entryType] ?? 0) + amount;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Drawer Report"
        subtitle="Track cash expected and cash counted across all tills and shifts."
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-relaxed text-blue-900 shadow-sm">
        This report covers physical cash only. MoMo, card, and bank transfer receipts are not included here — see the{' '}
        <a href="/reports/dashboard" className="font-semibold underline underline-offset-2">
          Trading Report
        </a>{' '}
        for all payment methods.
      </section>

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
          label="Cash expected"
          value={formatMoney(totalExpected, business.currency)}
          helper="What the till should hold based on recorded activity."
        />
        <StatCard
          label={openShiftCount > 0 ? 'Cash counted (closed shifts only)' : 'Cash counted'}
          value={formatMoney(totalActual, business.currency)}
          helper="Cash physically counted when the shift was closed."
        />
        <StatCard
          label={openShiftCount > 0 ? 'Difference (closed shifts only)' : 'Difference'}
          value={formatMoney(totalVariance, business.currency)}
          tone={totalVariance === 0 ? 'default' : totalVariance > 0 ? 'success' : 'danger'}
          helper="Positive = more than expected. Negative = less than expected."
        />
      </div>

      {openShiftCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>
            {openShiftCount} shift{openShiftCount > 1 ? 's' : ''} still open — not counted yet.
          </strong>{' '}
          Cash counted and difference are from closed shifts only. Cash expected includes all shifts. Close open shifts
          before relying on these figures.
        </div>
      )}

      <div className="card overflow-hidden p-3.5 sm:p-4">
        <h2 className="text-base font-display font-semibold sm:text-lg">How cash moved through the drawer</h2>
        <p className="mt-1 text-sm leading-relaxed text-black/55">
          Negative amounts are cash paid out of the drawer, such as supplier payments, expenses, or refunds.
        </p>
        <div className="mt-3 space-y-2 md:hidden">
          {CASH_DRAWER_BREAKDOWN_ORDER.map((entryType) => {
            const amount = movementTotals[entryType] ?? 0;

            return (
              <div
                key={entryType}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <span className="min-w-0 flex-1 text-sm text-slate-700">{CASH_DRAWER_ENTRY_LABELS[entryType]}</span>
                <span
                  className={`shrink-0 text-right text-sm font-bold tabular-nums ${
                    amount < 0 ? 'text-rose-700' : 'text-slate-950'
                  }`}
                >
                  {formatMoney(amount, business.currency)}
                </span>
              </div>
            );
          })}
          {shifts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No cash movements found in this date range.
            </div>
          ) : null}
        </div>
        <div className="responsive-table-shell -mx-1 hidden px-1 md:block sm:mx-0 sm:px-0">
          <table className="table mt-3 w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {CASH_DRAWER_BREAKDOWN_ORDER.map((entryType) => (
                <tr key={entryType} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{CASH_DRAWER_ENTRY_LABELS[entryType]}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(movementTotals[entryType] ?? 0, business.currency)}
                  </td>
                </tr>
              ))}
              {shifts.length === 0 ? (
                <ReportTableEmptyRow colSpan={2} message="No cash movements found in this date range." paddingClassName="px-3 py-8" />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <ReportTableCard tableClassName="table w-full min-w-[56rem] border-separate border-spacing-y-2 xl:min-w-[104rem]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Branch</th>
            <th>Till</th>
            <th>Cashier</th>
            <th className="hidden xl:table-cell">Opening float</th>
            <th className="hidden xl:table-cell">Cash sales</th>
            <th className="hidden xl:table-cell">Customer payments</th>
            <th className="hidden xl:table-cell">Supplier cash paid out</th>
            <th className="hidden xl:table-cell">Expenses paid out</th>
            <th className="hidden xl:table-cell">Refunds</th>
            <th className="hidden xl:table-cell">Cash added</th>
            <th>Cash expected</th>
            <th>Cash counted</th>
            <th>Difference</th>
            <th>Reason</th>
            <th>Notes</th>
            <th>Manager approval</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => {
            const byType = summarizeCashDrawerEntries(shift.cashDrawerEntries).byType;
            return (
              <tr key={shift.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-xs">{formatDateTime(shift.openedAt)}</td>
                <td className="px-3 py-3 text-sm">{shift.till.store.name}</td>
                <td className="px-3 py-3 text-sm">{shift.till.name}</td>
                <td className="px-3 py-3 text-sm">{shift.user.name}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.OPEN_FLOAT ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_SALE ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_DEBTOR_PAYMENT ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.PAID_OUT_SUPPLIER ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.PAID_OUT_EXPENSE ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_REFUND ?? 0, business.currency)}</td>
                <td className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_ADJUSTMENT ?? 0, business.currency)}</td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(shift.expectedCashPence, business.currency)}
                </td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {shift.status === 'OPEN' ? (
                    <span className="text-amber-600">Not counted yet</span>
                  ) : shift.actualCashPence !== null ? (
                    formatMoney(shift.actualCashPence, business.currency)
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-3 py-3 text-sm">
                  {shift.status === 'OPEN' ? (
                    <span className="text-amber-600">Pending close</span>
                  ) : shift.variance !== null ? (
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
                <td className="px-3 py-3 align-top text-sm">
                  <NotesCell text={notesText(shift.varianceReason, shift.notes)} />
                </td>
                <td className="px-3 py-3 text-xs">
                  {shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Shift open' : '—')}
                </td>
              </tr>
            );
          })}
          {shifts.length === 0 ? (
            <ReportTableEmptyRow colSpan={17} message="No shifts found in this date range." paddingClassName="px-3 py-8" />
          ) : null}
        </tbody>
      </ReportTableCard>

      {totalRows > 0 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/reports/cash-drawer"
          pageSize={pageSize}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
          searchParams={{
            from: fromIso,
            to: toIso,
            storeId: selectedStoreId,
          }}
        />
      ) : null}
    </div>
  );
}
