import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import { requireRole } from '@/lib/auth';

export default async function ExportsPage() {
  await requireRole(['MANAGER', 'OWNER']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Download branded reports in CSV, Excel, or PDF format."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {/* Sales Report */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Sales Report</h3>
            <p className="text-xs text-black/50">Individual product line items with cost and margin</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/sales" fallbackFilename="sales.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/sales?format=xlsx" fallbackFilename="sales.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/sales?format=pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Inventory */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Inventory</h3>
            <p className="text-xs text-black/50">Current stock levels and costs by product</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/inventory" fallbackFilename="inventory.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/inventory?format=xlsx" fallbackFilename="inventory.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/inventory?format=pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Purchases */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Purchases</h3>
            <p className="text-xs text-black/50">Supplier invoices and payment status</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/purchases" fallbackFilename="purchases.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/purchases?format=xlsx" fallbackFilename="purchases.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/purchases?format=pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Products Master Data */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Products Master Data</h3>
            <p className="text-xs text-black/50">Full product catalog with pricing and units</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/products" fallbackFilename="products.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/products?format=xlsx" fallbackFilename="products.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/products?format=pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Risk Summary */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Risk Summary</h3>
            <p className="text-xs text-black/50">Risk alerts, cashier analysis, and discount overrides</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary" fallbackFilename="risk-summary.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary?format=xlsx" fallbackFilename="risk-summary.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/risk-summary?format=pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Cash Drawer Summary */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Cash Drawer Summary</h3>
            <p className="text-xs text-black/50">Shift closings with expected vs counted cash and variance</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/eod-csv" fallbackFilename="cash-drawer.csv">
              CSV
            </DownloadLink>
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/exports/eod-csv?format=xlsx" fallbackFilename="cash-drawer.xlsx">
              Excel
            </DownloadLink>
            <a className="btn-secondary text-center text-xs flex-1" href="/exports/eod-pdf" target="_blank" rel="noopener noreferrer">
              PDF
            </a>
          </div>
        </div>

        {/* Export Pack (ZIP) */}
        <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Export Pack (ZIP)</h3>
            <p className="text-xs text-black/50">All ledgers, VAT report, debtors, and stock movements in one ZIP</p>
          </div>
          <div className="flex gap-2">
            <DownloadLink className="btn-secondary text-center text-xs flex-1" href="/api/exports/pack" fallbackFilename="export-pack.zip">
              Download ZIP
            </DownloadLink>
          </div>
        </div>
      </div>
    </div>
  );
}
