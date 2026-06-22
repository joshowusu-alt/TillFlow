import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDate } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import { DataCard, DataCardActions, DataCardHeader } from '@/components/DataCard';
import {
  getSupplierAgingReport,
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  type AgingBucket,
} from '@/lib/services/supplier-aging';

export const metadata = { title: 'Supplier Aging Report' };
export const dynamic = 'force-dynamic';

// ─── Helpers ───────────────────────────────────────────────────────────────

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const BUCKET_CHIP_CLASSES: Record<AgingBucket, string> = {
  CURRENT:  'border border-emerald-200 bg-emerald-50 text-emerald-800',
  D1_30:    'border border-slate-200   bg-slate-50   text-slate-700',
  D31_60:   'border border-yellow-200  bg-yellow-50  text-yellow-800',
  D61_90:   'border border-amber-200   bg-amber-50   text-amber-800',
  D90_PLUS: 'border border-rose-200    bg-rose-50    text-rose-800',
};

// Compact stat tile styles per bucket
const BUCKET_TILE_STRIP: Record<AgingBucket, string> = {
  CURRENT:  'bg-emerald-500',
  D1_30:    'bg-slate-300',
  D31_60:   'bg-amber-400',
  D61_90:   'bg-amber-500',
  D90_PLUS: 'bg-rose-500',
};
const BUCKET_TILE_BG: Record<AgingBucket, string> = {
  CURRENT:  'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60',
  D1_30:    'border-slate-200/80 bg-white/95',
  D31_60:   'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/60',
  D61_90:   'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/60',
  D90_PLUS: 'border-red-100 bg-gradient-to-br from-red-50 via-white to-red-50/60',
};
const BUCKET_TILE_VALUE: Record<AgingBucket, string> = {
  CURRENT:  'text-emerald-700',
  D1_30:    'text-ink',
  D31_60:   'text-amber-700',
  D61_90:   'text-amber-800',
  D90_PLUS: 'text-rose-600',
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
  const asOfStr = rawAsOf && rawAsOf <= todayStr ? rawAsOf : todayStr;
  const asOf = utcStartOfDay(new Date(asOfStr + 'T00:00:00Z'));

  const report = await getSupplierAgingReport(business.id, asOf);
  const currency = business.currency;
  const exportHref = `/payments/supplier-aging/export?asOf=${asOfStr}`;
  const hasData = report.rows.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Aging"
        subtitle="Outstanding supplier balances grouped by how overdue they are."
        actions={
          <DownloadLink
            href={exportHref}
            fallbackFilename={`supplier-aging-${asOfStr}.csv`}
            className="btn-secondary text-sm"
          >
            Export CSV
          </DownloadLink>
        }
      />

      {/* ── Filter ── */}
      <ReportFilterCard
        columnsClassName="sm:grid-cols-3"
        submitLabel="Apply filter"
        actions={
          <a href="/payments/supplier-aging" className="btn-secondary w-full justify-center sm:w-auto text-sm">
            Reset
          </a>
        }
      >
        <div>
          <label className="label">As of date</label>
          <input
            type="date"
            name="asOf"
            max={todayStr}
            defaultValue={asOfStr}
            className="input"
          />
        </div>
      </ReportFilterCard>

      {/* ── What does this mean? ── */}
      <details className="group rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium select-none">
          <svg className="h-4 w-4 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.75.75 0 0 1 .75.75v2.25h-.253a.75.75 0 0 0 0 1.5H11a.75.75 0 0 0 0-1.5h-.247V11.25A2.25 2.25 0 0 0 8.5 9H9Z" clipRule="evenodd" />
          </svg>
          How are invoices grouped?
          <svg className="ml-auto h-4 w-4 text-blue-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <ul className="mt-3 space-y-1.5 text-blue-800 text-xs leading-relaxed">
          <li><strong>Current</strong> — Invoice is not yet due, or has no due date set. No action needed today.</li>
          <li><strong>1–30 days</strong> — Overdue by up to 30 days. Follow up soon to stay on good terms with the supplier.</li>
          <li><strong>31–60 days</strong> — Overdue 31–60 days. Escalate with your accounts team or negotiate a payment plan.</li>
          <li><strong>61–90 days</strong> — Overdue 61–90 days. Risk of supplier stopping credit. Prioritise payment.</li>
          <li><strong>90+ days</strong> — Critically overdue. May affect supply chain and supplier relationships.</li>
        </ul>
        <p className="mt-3 text-xs text-blue-700">Paid, voided, and returned invoices are excluded. Invoices without a linked supplier are excluded.</p>
      </details>

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total tile */}
        <div
          className={`relative overflow-hidden rounded-[1.25rem] border p-3.5 sm:p-4 ${
            report.totals.buckets.D90_PLUS > 0
              ? 'border-red-100 bg-gradient-to-br from-red-50 via-white to-red-50/60'
              : report.totals.totalPence > 0
              ? 'border-blue-100/90 bg-gradient-to-br from-blue-50 via-white to-blue-50/70'
              : 'border-slate-200/80 bg-white/95'
          }`}
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05),0 10px 30px rgba(15,23,42,0.06)' }}
        >
          <div className={`absolute inset-x-0 top-0 h-1 ${
            report.totals.buckets.D90_PLUS > 0 ? 'bg-rose-500' : report.totals.totalPence > 0 ? 'bg-blue-500' : 'bg-slate-300'
          }`} />
          <div className="relative min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Total Outstanding</p>
            <p className={`mt-2 text-base font-bold tabular-nums tracking-tight break-all sm:text-lg ${
              report.totals.buckets.D90_PLUS > 0 ? 'text-rose-600' : report.totals.totalPence > 0 ? 'text-accent' : 'text-ink'
            }`}>
              {formatMoney(report.totals.totalPence, currency)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {report.totals.supplierCount} supplier{report.totals.supplierCount !== 1 ? 's' : ''} · {report.totals.invoiceCount} inv.
            </p>
          </div>
        </div>

        {/* Per-bucket tiles */}
        {AGING_BUCKETS.map((b) => {
          const active = report.totals.buckets[b] > 0;
          return (
            <div
              key={b}
              className={`relative overflow-hidden rounded-[1.25rem] border p-3.5 sm:p-4 ${
                active ? BUCKET_TILE_BG[b] : 'border-slate-200/80 bg-white/95'
              }`}
              style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05),0 10px 30px rgba(15,23,42,0.06)' }}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${active ? BUCKET_TILE_STRIP[b] : 'bg-slate-200'}`} />
              <div className="relative min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{AGING_BUCKET_LABELS[b]}</p>
                <p className={`mt-2 text-base font-bold tabular-nums tracking-tight break-all sm:text-lg ${
                  active ? BUCKET_TILE_VALUE[b] : 'text-ink'
                }`}>
                  {formatMoney(report.totals.buckets[b], currency)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main content ── */}
      {!hasData ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm text-muted">No outstanding supplier invoices as of {formatDate(asOf)}.</p>
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">Supplier</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted"># Inv.</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">Total</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Current</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">1–30 days</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-amber-700">31–60 days</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-amber-700">61–90 days</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-rose-700">90+ days</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">Oldest Due</th>
                    <th className="px-4 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((row) => (
                    <tr key={row.supplierId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-ink">{row.supplierName}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted">{row.invoiceCount}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-ink">
                        {formatMoney(row.totalPence, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">
                        {row.buckets.CURRENT > 0 ? formatMoney(row.buckets.CURRENT, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {row.buckets.D1_30 > 0 ? formatMoney(row.buckets.D1_30, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-amber-700">
                        {row.buckets.D31_60 > 0 ? formatMoney(row.buckets.D31_60, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-amber-700">
                        {row.buckets.D61_90 > 0 ? formatMoney(row.buckets.D61_90, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-4 py-3.5 text-right tabular-nums ${row.buckets.D90_PLUS > 0 ? 'text-rose-600 font-semibold' : ''}`}>
                        {row.buckets.D90_PLUS > 0 ? formatMoney(row.buckets.D90_PLUS, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted">
                        {row.oldestDueDate ? formatDate(row.oldestDueDate) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/payments/supplier-payments?supplierId=${row.supplierId}`}
                          className="btn-ghost text-xs whitespace-nowrap"
                        >
                          Record payment
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-5 py-3.5 font-semibold text-ink" colSpan={2}>
                      Total — {report.totals.supplierCount} supplier{report.totals.supplierCount !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-bold text-ink">
                      {formatMoney(report.totals.totalPence, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-700">
                      {report.totals.buckets.CURRENT > 0 ? formatMoney(report.totals.buckets.CURRENT, currency) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-700">
                      {report.totals.buckets.D1_30 > 0 ? formatMoney(report.totals.buckets.D1_30, currency) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-amber-700">
                      {report.totals.buckets.D31_60 > 0 ? formatMoney(report.totals.buckets.D31_60, currency) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-amber-700">
                      {report.totals.buckets.D61_90 > 0 ? formatMoney(report.totals.buckets.D61_90, currency) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${report.totals.buckets.D90_PLUS > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                      {report.totals.buckets.D90_PLUS > 0 ? formatMoney(report.totals.buckets.D90_PLUS, currency) : '—'}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Mobile cards ── */}
          <div className="lg:hidden space-y-3">
            {report.rows.map((row) => (
              <DataCard key={row.supplierId}>
                <DataCardHeader
                  title={row.supplierName}
                  subtitle={`${row.invoiceCount} invoice${row.invoiceCount !== 1 ? 's' : ''}${row.oldestDueDate ? ` · Oldest due ${formatDate(row.oldestDueDate)}` : ''}`}
                  aside={
                    <span className="font-semibold text-ink">
                      {formatMoney(row.totalPence, currency)}
                    </span>
                  }
                />
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {AGING_BUCKETS.filter((b) => row.buckets[b] > 0).map((b) => (
                    <span key={b} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${BUCKET_CHIP_CLASSES[b]}`}>
                      {AGING_BUCKET_LABELS[b]}: {formatMoney(row.buckets[b], currency)}
                    </span>
                  ))}
                </div>
                <DataCardActions>
                  <Link
                    href={`/payments/supplier-payments?supplierId=${row.supplierId}`}
                    className="btn-primary text-xs"
                  >
                    Record payment
                  </Link>
                </DataCardActions>
              </DataCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
