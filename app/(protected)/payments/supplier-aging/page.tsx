import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import { DataCard, DataCardHeader, DataCardField } from '@/components/DataCard';
import {
  getSupplierAgingReport,
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  type AgingBucket,
} from '@/lib/services/supplier-aging';

export const metadata = { title: 'Supplier Aging Report' };

// ─── Helpers ───────────────────────────────────────────────────────────────

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const BUCKET_CHIP_CLASSES: Record<AgingBucket, string> = {
  CURRENT: 'border border-slate-200 bg-slate-50 text-slate-700',
  D1_30: 'border border-sky-200 bg-sky-50 text-sky-800',
  D31_60: 'border border-yellow-200 bg-yellow-50 text-yellow-800',
  D61_90: 'border border-amber-200 bg-amber-50 text-amber-800',
  D90_PLUS: 'border border-rose-200 bg-rose-50 text-rose-800',
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function SupplierAgingPage({
  searchParams,
}: {
  searchParams?: { asOf?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const todayStr = new Date().toISOString().slice(0, 10);
  const rawAsOf = searchParams?.asOf;
  const asOfStr =
    rawAsOf && rawAsOf <= todayStr ? rawAsOf : todayStr;
  const asOf = utcStartOfDay(new Date(asOfStr + 'T00:00:00Z'));

  const report = await getSupplierAgingReport(business.id, asOf);
  const currency = business.currency;
  const exportHref = `/payments/supplier-aging/export?asOf=${asOfStr}`;

  const hasData = report.rows.length > 0;

  // Summary tile data. Total tile stays neutral; only 90+ carries the urgency
  // cue when its bucket is non-zero. Plan calls for tiles to be hidden when
  // there is no outstanding activity at all so the empty state stays calm.
  const tiles: { label: string; pence: number; accent?: boolean }[] = [
    { label: 'Total Outstanding', pence: report.totals.totalPence },
    ...AGING_BUCKETS.map((b) => ({
      label: AGING_BUCKET_LABELS[b],
      pence: report.totals.buckets[b],
      accent: b === 'D90_PLUS' && report.totals.buckets[b] > 0,
    })),
  ];

  return (
    <div className="page-shell">
      <PageHeader title="Supplier Aging" subtitle="Outstanding balances by age of invoice" />

      {/* ── Filter bar ── */}
      <form method="GET" className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="asOf" className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            As of date
          </label>
          <input
            type="date"
            id="asOf"
            name="asOf"
            max={todayStr}
            defaultValue={asOfStr}
            className="input text-sm"
          />
        </div>
        <button type="submit" className="btn-secondary text-sm">
          Apply
        </button>
        <DownloadLink href={exportHref} fallbackFilename={`supplier-aging-${asOfStr}.csv`} className="btn-secondary text-sm">
          Export CSV
        </DownloadLink>
      </form>

      {/* ── Summary tiles (only when there is something to summarise) ── */}
      {hasData ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={`card p-4 flex flex-col gap-1 ${tile.accent ? 'ring-1 ring-rose-300' : ''}`}
            >
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-tight">
                {tile.label}
              </span>
              <span className={`text-lg font-semibold ${tile.accent ? 'text-rose-700' : 'text-slate-900'}`}>
                {formatMoney(tile.pence, currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {!hasData ? (
        <div className="card p-10 text-center text-slate-500">
          No outstanding supplier invoices as of {formatDate(asOf)}.
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="hidden lg:block responsive-table-shell">
            <div className="card overflow-x-auto">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th className="text-left">Supplier</th>
                    <th className="text-right"># Inv.</th>
                    <th className="text-right">Total</th>
                    {AGING_BUCKETS.map((b) => (
                      <th key={b} className="text-right">
                        {AGING_BUCKET_LABELS[b]}
                      </th>
                    ))}
                    <th className="text-right">Oldest Due</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.supplierId}>
                      <td className="font-medium">{row.supplierName}</td>
                      <td className="text-right text-slate-500">{row.invoiceCount}</td>
                      <td className="text-right font-semibold">
                        {formatMoney(row.totalPence, currency)}
                      </td>
                      {AGING_BUCKETS.map((b) => (
                        <td
                          key={b}
                          className={`text-right ${
                            b === 'D90_PLUS' && row.buckets[b] > 0
                              ? 'text-rose-700 font-semibold'
                              : 'text-slate-700'
                          }`}
                        >
                          {row.buckets[b] > 0 ? formatMoney(row.buckets[b], currency) : '—'}
                        </td>
                      ))}
                      <td className="text-right text-slate-500">
                        {row.oldestDueDate ? formatDate(row.oldestDueDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-slate-50">
                    <td colSpan={2}>Total ({report.totals.supplierCount} suppliers)</td>
                    <td className="text-right">{formatMoney(report.totals.totalPence, currency)}</td>
                    {AGING_BUCKETS.map((b) => (
                      <td
                        key={b}
                        className={`text-right ${
                          b === 'D90_PLUS' && report.totals.buckets[b] > 0
                            ? 'text-rose-700'
                            : ''
                        }`}
                      >
                        {report.totals.buckets[b] > 0
                          ? formatMoney(report.totals.buckets[b], currency)
                          : '—'}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Mobile cards ── */}
          <div className="lg:hidden space-y-3">
            {/* Totals summary card */}
            <div className="card p-4 bg-slate-50">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                Totals — {report.totals.supplierCount} Supplier
                {report.totals.supplierCount !== 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-lg font-bold text-slate-900">
                  {formatMoney(report.totals.totalPence, currency)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AGING_BUCKETS.filter((b) => report.totals.buckets[b] > 0).map((b) => (
                  <span
                    key={b}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${BUCKET_CHIP_CLASSES[b]}`}
                  >
                    {AGING_BUCKET_LABELS[b]}:{' '}
                    {formatMoney(report.totals.buckets[b], currency)}
                  </span>
                ))}
              </div>
            </div>

            {report.rows.map((row) => (
              <DataCard key={row.supplierId}>
                <DataCardHeader
                  title={row.supplierName}
                  subtitle={`${row.invoiceCount} invoice${row.invoiceCount !== 1 ? 's' : ''}`}
                  aside={
                    <span className="font-semibold text-slate-900">
                      {formatMoney(row.totalPence, currency)}
                    </span>
                  }
                />
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {AGING_BUCKETS.filter((b) => row.buckets[b] > 0).map((b) => (
                    <span
                      key={b}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${BUCKET_CHIP_CLASSES[b]}`}
                    >
                      {AGING_BUCKET_LABELS[b]}:{' '}
                      {formatMoney(row.buckets[b], currency)}
                    </span>
                  ))}
                </div>
                {row.oldestDueDate && (
                  <div className="px-4 pb-3 text-xs text-slate-500">
                    Oldest due: {formatDate(row.oldestDueDate)}
                  </div>
                )}
              </DataCard>
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Report generated as of {asOfStr}. Paid, voided, and returned invoices are excluded.
        Invoices without a linked supplier are also excluded.
      </p>
    </div>
  );
}
