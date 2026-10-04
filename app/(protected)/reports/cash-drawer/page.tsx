import DownloadLink from '@/components/DownloadLink';
import { CONSOLIDATED_LABEL } from '@/lib/entitlements/types';
import Pagination from '@/components/Pagination';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import CashDrawerSummary from '@/components/reports/CashDrawerSummary';
import { reportScopeLabel } from '@/lib/reports/scope-labels';
import { DataCard, DataCardField, DataCardHeader } from '@/components/DataCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import NotesCell from './NotesCell';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { prisma } from '@/lib/prisma';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';
import { getBusinessStores } from '@/lib/services/stores';
import {
  isReportingScopeStoreError,
  resolveAuthorisedStoreId,
} from '@/lib/reports/reporting-scope';
import { notFound } from 'next/navigation';
import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  summarizeCashDrawerEntries,
} from '@/lib/services/cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { isInvalidLegacyClose } from '@/lib/reliability/invalid-preview-shift-closures';

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
  const opened = await openLiveReport({
    surfaceId: 'cash_drawer_report',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  if (opened.branch.kind !== 'stores') notFound();
  const now = new Date();
  const fallback = defaultTenantLocalRange(now, business.timezone, 7);

  const { start: from, end: to, fromInputValue: fromIso, toInputValue: toIso } = resolveReportDateRange(searchParams, fallback.startInclusive, now, fallback.timeZone);
  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = opened.branch.selected;
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
    openedAt: { gte: from, lt: to },
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
        user: { select: { name: true } },
        closeManagerApprovedBy: { select: { name: true } },
        tillId: true,
        till: {
          select: {
            storeId: true,
            name: true,
            store: { select: { businessId: true, name: true } },
          },
        },
        cashDrawerEntries: {
          select: {
            entryType: true,
            amountPence: true,
            businessId: true,
            storeId: true,
            tillId: true,
            shiftId: true,
          },
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

  const displayedExpectedCash = (shift: (typeof shifts)[number]) =>
    shift.status === 'OPEN' && shift.closedAt === null
      ? expectedCashPenceFromEntries(shift.cashDrawerEntries, {
          businessId: shift.till.store.businessId,
          storeId: shift.till.storeId,
          tillId: shift.tillId,
          shiftId: shift.id,
        })
      : shift.expectedCashPence;

  const closedShifts = shifts.filter((s) => s.status === 'CLOSED');
  const openShiftCount = shifts.filter((s) => s.status === 'OPEN').length;
  const acceptedClosed = closedShifts.filter((shift) => !isInvalidLegacyClose(shift.actualCashPence));

  const totalExpected = acceptedClosed.reduce((sum, shift) => sum + shift.expectedCashPence, 0);
  const totalActual = acceptedClosed.reduce((sum, shift) => sum + (shift.actualCashPence ?? 0), 0);
  const totalVariance = acceptedClosed.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);
  const movementTotals = shifts.reduce<Record<string, number>>((acc, shift) => {
    const summary = summarizeCashDrawerEntries(shift.cashDrawerEntries);
    for (const [entryType, amount] of Object.entries(summary.byType)) {
      acc[entryType] = (acc[entryType] ?? 0) + amount;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportsDestinationHead
        title="Cash drawer"
        scopeLabel={reportScopeLabel(selectedStoreId, stores)}
        periodLabel={`${fromIso} to ${toIso} · ${fallback.timeZone} · Shifts opened in this period`}
        actions={
          <a href={`/shifts/drawer?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`} className="btn-secondary justify-center text-sm">
            Open till cash ledger
          </a>
        }
      />

      <p className="text-sm leading-6 text-slate-600">Physical cash in tills. MoMo, card and bank payments are shown in Money received.</p>
      <CashDrawerSummary expected={totalExpected} counted={totalActual} difference={totalVariance}
        acceptedCount={acceptedClosed.length} openCount={openShiftCount} page={currentPage} currency={business.currency} />
      <details className="rounded-xl border border-slate-200 bg-white px-3 py-1">
        <summary className="flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Change dates or branch · Download</summary>
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
        columnsClassName="md:grid-cols-2 xl:grid-cols-4"
        submitLabel="Apply"
        submitTone="secondary"
      >
        <div>
          <label className="label" htmlFor="cash-report-branch">Branch</label>
          <select id="cash-report-branch" className="input" name="storeId" defaultValue={selectedStoreId}>
            {opened.branch.offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cash-report-from">From</label>
          <input id="cash-report-from" className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label" htmlFor="cash-report-to">To</label>
          <input id="cash-report-to" className="input" type="date" name="to" defaultValue={toIso} />
        </div>
      </ReportFilterCard>

      </details>
      <details className="text-sm text-ink">
        <summary className="flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-lg px-1 font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">How to read the cash figures</summary>
        <div className="max-w-3xl space-y-2 rounded-xl border border-slate-200 bg-white p-4 leading-6">
          <p>This report selects shifts by when they were opened. A shift can span calendar days, so its cash activity can differ from cash receipts received within the selected dates.</p>
          <p>The summary uses valid cash counts from closed shifts on the displayed page. Open shifts and invalid legacy cash counts are excluded from expected cash, counted cash and the difference.</p>
          <p>The till cash ledger is a separate operational view for your working branch. It lists cash entries by entry date, so it may have a different scope from this shift report.</p>
          <a href={`/reports/money-received?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&storeId=${encodeURIComponent(selectedStoreId)}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Open Money received</a>
        </div>
      </details>

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

      {/* Mobile shift ledger — same server values as the desktop table; presentation only. */}
      <div className="space-y-3 lg:hidden" data-cash-drawer-mobile-ledger>
        <h2 className="text-base font-display font-semibold">Shift ledger</h2>
        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No shifts found in this date range.
          </div>
        ) : (
          shifts.map((shift) => {
            const byType = summarizeCashDrawerEntries(shift.cashDrawerEntries).byType;
            const countedLabel =
              shift.status === 'OPEN'
                ? 'Not counted yet'
                : shift.actualCashPence !== null
                  ? formatMoney(shift.actualCashPence, business.currency)
                  : '-';
            const varianceNode =
              shift.status === 'OPEN' ? (
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
              );
            const movementChips = (
              [
                ['OPEN_FLOAT', 'Opening float'],
                ['CASH_SALE', 'Cash sales'],
                ['CASH_DEBTOR_PAYMENT', 'Customer payments'],
                ['PAID_OUT_SUPPLIER', 'Supplier cash paid out'],
                ['PAID_OUT_EXPENSE', 'Expenses paid out'],
                ['CASH_REFUND', 'Refunds'],
                ['CASH_ADJUSTMENT', 'Cash added'],
              ] as const
            )
              .map(([entryType, label]) => ({
                label,
                amount: byType[entryType] ?? 0,
              }))
              .filter((row) => row.amount !== 0);

            return (
              <DataCard key={shift.id}>
                <DataCardHeader
                  title={formatDateTime(shift.openedAt)}
                  subtitle={`${shift.till.store.name} · ${shift.till.name} · ${shift.user.name}`}
                  aside={
                    <span className="text-xs font-semibold uppercase tracking-wide text-black/45">
                      {shift.status === 'OPEN' ? 'Open' : 'Closed'}
                    </span>
                  }
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <DataCardField
                    label="Cash expected"
                    value={formatMoney(displayedExpectedCash(shift), business.currency)}
                    valueClassName="text-sm font-semibold tabular-nums"
                  />
                  <DataCardField
                    label="Cash counted"
                    value={countedLabel}
                    valueClassName={`text-sm font-semibold tabular-nums ${shift.status === 'OPEN' ? 'text-amber-600' : ''}`}
                  />
                  <DataCardField label="Difference" value={varianceNode} valueClassName="text-sm font-semibold tabular-nums" />
                  <DataCardField
                    label="Reason"
                    value={shift.varianceReasonCode ? reasonCodeLabel(shift.varianceReasonCode) : '-'}
                    valueClassName="text-sm"
                  />
                  <DataCardField
                    label="Notes"
                    value={notesText(shift.varianceReason, shift.notes)}
                    className="col-span-2"
                    valueClassName="text-sm break-words [overflow-wrap:anywhere]"
                  />
                  <DataCardField
                    label="Manager approval"
                    value={shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Shift open' : '—')}
                    className="col-span-2"
                    valueClassName="text-sm"
                  />
                </div>
                {movementChips.length > 0 ? (
                  <div className="mt-3 space-y-1.5 border-t border-black/5 pt-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Drawer movements</div>
                    {movementChips.map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 flex-1 break-words text-slate-600">{row.label}</span>
                        <span
                          className={`shrink-0 tabular-nums font-medium ${
                            row.amount < 0 ? 'text-rose-700' : 'text-slate-950'
                          }`}
                        >
                          {formatMoney(row.amount, business.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </DataCard>
            );
          })
        )}
      </div>

      <div className="hidden lg:block">
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
                    {formatMoney(displayedExpectedCash(shift), business.currency)}
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
      </div>

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
