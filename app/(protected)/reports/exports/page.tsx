import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import { requireRole } from '@/lib/auth';

export default async function ExportsPage() {
  await requireRole(['MANAGER', 'OWNER']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Download polished retail reports in branded CSV, Excel, or print-ready PDF views."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {/* Sales Report */}
        <div className="rounded-2xl border border-accent/10 bg-[linear-gradient(180deg,rgba(37,99,235,0.05),rgba(255,255,255,1))] p-5 shadow-[0_18px_40px_rgba(37,99,235,0.06)] space-y-3">
          <div>
            <div className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Product-level</div>
            <h3 className="mt-3 font-semibold text-sm">Sales Report</h3>
            <p className="text-xs text-black/50">Each row is a sold product line item with quantity, value, cost, and margin — not just invoice totals.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/sales" fallbackFilename="sales.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/sales?format=xlsx" fallbackFilename="sales.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/sales?format=pdf" target="_blank" rel="noopener noreferrer">
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
            <p className="text-xs text-black/50">Supplier invoices and payment status</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/purchases" fallbackFilename="purchases.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/purchases?format=xlsx" fallbackFilename="purchases.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/purchases?format=pdf" target="_blank" rel="noopener noreferrer">
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
