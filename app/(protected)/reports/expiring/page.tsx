import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { openLiveReport } from '@/lib/entitlements/live-report';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';
import Pagination from '@/components/Pagination';
import { formatMoney } from '@/lib/format';
import { formatCalendarDate } from '@/lib/inventory/batch-dates';
import { filterExpiryRows, formatDaysLeft, type ExpiryReportRow, type ExpiryWindow } from '@/lib/inventory/expiry-report';
import { loadExpiryReport } from '@/lib/inventory/load-expiry-report';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';

type QueryParams = {
  storeId?: string;
  window?: string;
  page?: string;
};

const PAGE_SIZE = 20;

function parseWindow(value: string | undefined): ExpiryWindow {
  if (value === 'expired' || value === '7' || value === '14') return value;
  return 'all';
}

const WINDOW_LABEL: Record<ExpiryReportRow['bucket'], string> = {
  expired: 'Already expired',
  within7: 'Within 7 days',
  within8to14: 'Within 8–14 days',
};

export default async function ExpiringStockPage(props: { searchParams: Promise<QueryParams> }) {
  const searchParams = await props.searchParams;
  const opened = await openLiveReport({ surfaceId: 'expiring_stock', search: searchParams });
  if (!opened.ok) return opened.denial;
  if (opened.branch.kind !== 'stores') notFound();

  const window = parseWindow(searchParams.window);
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const selectedStoreId = opened.branch.selected;
  const stores = opened.stores;
  const timeZone = requireReportTimeZone(opened.business.timezone);

  if (!selectedStoreId) {
    return (
      <div className="min-w-0 space-y-6">
        <ReportsDestinationHead
          title="Expiring stock"
          periodLabel="Deliveries that are already expired or expire within 14 days."
        />
        <BranchFilter stores={stores} window={window} selected="" />
        <div className="card p-6">
          <EmptyState icon="box" title="Choose a branch" subtitle="Choose a branch before viewing stock that is expiring." />
        </div>
      </div>
    );
  }

  const storeIds = selectedStoreId === 'ALL' ? opened.branch.storeIds : [selectedStoreId];
  const report = await loadExpiryReport(prisma, {
    businessId: opened.business.id,
    storeIds,
    timeZone,
  });
  const visible = filterExpiryRows(report.rows, window);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const groups = window === 'all' ? (['expired', 'within7', 'within8to14'] as const) : null;

  return (
    <div className="min-w-0 space-y-6">
      <ReportsDestinationHead
        title="Expiring stock"
        periodLabel="Deliveries that are already expired or expire within 14 days."
      />
      <section className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950">
        <p className="font-semibold">This is an estimate, not a second stock count.</p>
        <p className="mt-1">
          The quantity on hand is still the stock total. TillFlow keeps the newest receipts against that quantity and treats older receipts as sold first, so earlier deliveries are assumed to leave the shelf first. Stock received before these dates were recorded is not listed. Within 14 days includes anything expiring within 7 days.
        </p>
        <p className="mt-2 text-xs">
          {report.counts.expired} already expired · {report.counts.within7} within 7 days · {report.counts.within14} within 14 days. Value at risk uses the current average cost in cedis.
        </p>
      </section>
        <BranchFilter stores={stores} window={window} selected={selectedStoreId} />
      {paged.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="check"
            title="Nothing expiring in this window."
            subtitle="New deliveries can include a production date and an expiry date. Older stock without those dates stays on the quantity total and is not listed here."
          />
        </div>
      ) : groups ? (
        <div className="space-y-6">
          {groups.map((bucket) => {
            const items = paged.filter((row) => row.bucket === bucket);
            if (items.length === 0) return null;
            return (
              <section key={bucket} className="card min-w-0 p-4 sm:p-6">
                <h2 className="text-sm font-semibold text-ink">{WINDOW_LABEL[bucket]}</h2>
                <ExpiryList rows={items} currency={opened.business.currency} storeNames={storeNames} showBranch={storeIds.length > 1} readOnly={opened.readOnly} />
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card min-w-0 p-4 sm:p-6">
          <ExpiryList rows={paged} currency={opened.business.currency} storeNames={storeNames} showBranch={storeIds.length > 1} readOnly={opened.readOnly} />
        </section>
      )}
      {visible.length > PAGE_SIZE ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/reports/expiring"
          pageSize={PAGE_SIZE}
          searchParams={{ storeId: selectedStoreId, window: window === 'all' ? undefined : window }}
        />
      ) : null}
    </div>
  );
}

function BranchFilter({
  stores,
  window,
  selected,
}: {
  stores: { id: string; name: string }[];
  window: ExpiryWindow;
  selected: string;
}) {
  return (
    <div className="card min-w-0 p-3.5 sm:p-4">
      <form className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="expiring-branch">Branch</label>
          <select id="expiring-branch" name="storeId" className="input w-full min-w-0" defaultValue={selected}>
            {!selected ? <option value="">Choose a branch</option> : null}
            {selected === 'ALL' ? <option value="ALL">All branches</option> : null}
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="expiring-window">Show</label>
          <select id="expiring-window" name="window" className="input w-full min-w-0" defaultValue={window}>
            <option value="all">Expired and next 14 days</option>
            <option value="expired">Already expired</option>
            <option value="7">Next 7 days</option>
            <option value="14">Next 14 days</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <button className="btn-primary w-full sm:w-auto">Update</button>
        </div>
      </form>
    </div>
  );
}

function ExpiryList({
  rows,
  currency,
  storeNames,
  showBranch,
  readOnly,
}: {
  rows: ExpiryReportRow[];
  currency: string;
  storeNames: Map<string, string>;
  showBranch: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="mt-4 min-w-0 space-y-3">
      {rows.map((row) => {
        const adjustHref = `/inventory/adjustments?productId=${encodeURIComponent(row.productId)}&reason=EXPIRED&storeId=${encodeURIComponent(row.storeId)}`;
        return (
          <article key={row.batchId} className="min-w-0 rounded-2xl border border-black/5 bg-white p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold text-ink">{row.productName}</h3>
                {showBranch ? <p className="mt-1 text-xs text-black/50">{storeNames.get(row.storeId) ?? 'Branch'}</p> : null}
              </div>
              <Badge tone={row.bucket === 'expired' ? 'danger' : row.bucket === 'within7' ? 'warn' : 'info'}>
                {formatDaysLeft(row.daysLeft)}
              </Badge>
            </div>
            <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-black/45">Estimated qty</dt>
                <dd className="font-semibold tabular-nums text-ink">{row.estimatedQtyBase.toLocaleString('en-GH')}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-black/45">Value at risk</dt>
                <dd className="break-words font-semibold text-ink">{formatMoney(row.valueAtRiskPence, currency)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-black/45">Expiry date</dt>
                <dd>{formatCalendarDate(row.expiryDate)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-black/45">Production date</dt>
                <dd>{row.productionDate ? formatCalendarDate(row.productionDate) : 'Not recorded'}</dd>
              </div>
            </dl>
            {readOnly ? null : (
              <Link href={adjustHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
                Record as expired
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
