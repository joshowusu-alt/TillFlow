import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import { requireRole } from '@/lib/auth';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';

const exportPeriodOptions = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'custom', label: 'Custom range' },
];

function buildExportHref(
  path: string,
  query: { period: string; from: string; to: string },
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams({
    period: query.period,
    from: query.from,
    to: query.to,
  });

  Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value));

  return `${path}?${params.toString()}`;
}

export default async function ExportsPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string };
}) {
  await requireRole(['MANAGER', 'OWNER']);

  const { start, end, fromInputValue, toInputValue, periodInputValue } = resolveSelectableReportDateRange(searchParams, '30d');
  const periodLabel = exportPeriodOptions.find((option) => option.value === periodInputValue)?.label ?? 'Last 30 days';
  const exportQuery = {
    period: periodInputValue,
    from: fromInputValue,
    to: toInputValue,
  };
  const dateSummary = `${start.toLocaleDateString('en-GB')} to ${end.toLocaleDateString('en-GB')}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Download polished retail reports in branded CSV, Excel, or print-ready PDF views."
      />

      <div className="rounded-2xl border border-accent/10 bg-[linear-gradient(180deg,rgba(37,99,235,0.07),rgba(255,255,255,1))] p-5 shadow-[0_18px_40px_rgba(37,99,235,0.06)] space-y-4">
        <div className="space-y-1.5">
          <div className="inline-flex rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Date-bounded exports</div>
          <h3 className="text-sm font-semibold text-black">Choose the export period once, then download the matching sales, purchases, and reversals reports.</h3>
          <p className="text-xs text-black/55">
            Active window: <span className="font-semibold text-black">{periodLabel}</span> · {dateSummary}. Inventory, product master data, cash drawer, and ZIP pack remain current-state exports.
          </p>
        </div>

        <ReportFilterCard actions={<a className="btn-secondary" href="/reports/exports">Reset</a>} columnsClassName="sm:grid-cols-5" submitLabel="Apply period">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
            Quick period
            <select className="input mt-1.5" name="period" defaultValue={periodInputValue}>
              {exportPeriodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
            From
            <input className="input mt-1.5" defaultValue={fromInputValue} name="from" type="date" />
          </label>

          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
            To
            <input className="input mt-1.5" defaultValue={toInputValue} name="to" type="date" />
          </label>
        </ReportFilterCard>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Sales Report */}
        <div className="rounded-2xl border border-accent/10 bg-[linear-gradient(180deg,rgba(37,99,235,0.05),rgba(255,255,255,1))] p-5 shadow-[0_18px_40px_rgba(37,99,235,0.06)] space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Product-level</div>
            <h3 className="mt-3 font-semibold text-sm">Sales Report</h3>
            <p className="text-xs text-black/50">Each row is a sold product line item within the selected period, with quantity, value, cost, and margin — not just invoice totals.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/sales', exportQuery)} fallbackFilename="sales.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/sales', exportQuery, { format: 'xlsx' })} fallbackFilename="sales.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/sales', exportQuery, { format: 'pdf' })} target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Inventory */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Current stock</div>
            <h3 className="mt-3 font-semibold text-sm">Inventory</h3>
            <p className="text-xs text-black/50">Current stock levels and costs by product</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/inventory" fallbackFilename="inventory.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/inventory?format=xlsx" fallbackFilename="inventory.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/inventory?format=pdf" target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Purchases */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Supplier activity</div>
            <h3 className="mt-3 font-semibold text-sm">Purchases</h3>
            <p className="text-xs text-black/50">Each row is a purchased product line with supplier, quantity, unit cost, totals, and invoice payment status for the selected period.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/purchases', exportQuery)} fallbackFilename="purchases.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/purchases', exportQuery, { format: 'xlsx' })} fallbackFilename="purchases.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/purchases', exportQuery, { format: 'pdf' })} target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Reversals */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Returns & voids</div>
            <h3 className="mt-3 font-semibold text-sm">Reversals</h3>
            <p className="text-xs text-black/50">Sales returns, purchase returns, and voids are exported separately so the main sales and purchases reports stay clean.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/reversals', exportQuery)} fallbackFilename="reversals.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/reversals', exportQuery, { format: 'xlsx' })} fallbackFilename="reversals.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href={buildExportHref('/exports/reversals', exportQuery, { format: 'pdf' })} target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Products Master Data */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Catalogue</div>
            <h3 className="mt-3 font-semibold text-sm">Products Master Data</h3>
            <p className="text-xs text-black/50">Full product catalog with pricing and units</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/products" fallbackFilename="products.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/products?format=xlsx" fallbackFilename="products.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/products?format=pdf" target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Risk Summary */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Controls</div>
            <h3 className="mt-3 font-semibold text-sm">Risk Summary</h3>
            <p className="text-xs text-black/50">Risk alerts, cashier analysis, and discount overrides</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary" fallbackFilename="risk-summary.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary?format=xlsx" fallbackFilename="risk-summary.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary?format=pdf" target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Cash Drawer Summary */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Shift-level</div>
            <h3 className="mt-3 font-semibold text-sm">Cash Drawer Summary</h3>
            <p className="text-xs text-black/50">Shift closings with expected vs counted cash and variance</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/eod-csv" fallbackFilename="cash-drawer.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/eod-csv?format=xlsx" fallbackFilename="cash-drawer.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/eod-pdf" target="_blank" rel="noopener noreferrer">
              Print / PDF
            </a>
          </div>
        </div>

        {/* Export Pack (ZIP) */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/55">Bulk archive</div>
            <h3 className="mt-3 font-semibold text-sm">Export Pack (ZIP)</h3>
            <p className="text-xs text-black/50">All ledgers, VAT report, debtors, and stock movements in one ZIP</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/api/exports/pack" fallbackFilename="export-pack.zip">
              Download ZIP
            </DownloadLink>
          </div>
        </div>
      </div>
    </div>
  );
}
