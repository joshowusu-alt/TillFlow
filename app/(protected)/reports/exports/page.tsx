import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import { requireRole } from '@/lib/auth';

export default async function ExportsPage() {
  await requireRole(['MANAGER', 'OWNER']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Download CSV exports for external systems and analysis."
      />
      <div className="card grid gap-4 p-6 md:grid-cols-2">
        <DownloadLink className="btn-secondary text-center text-sm" href="/exports/products" fallbackFilename="products.csv">
          Export products
        </DownloadLink>
        <DownloadLink className="btn-secondary text-center text-sm" href="/exports/inventory" fallbackFilename="inventory.csv">
          Export inventory
        </DownloadLink>
        <DownloadLink className="btn-secondary text-center text-sm" href="/exports/sales" fallbackFilename="sales.csv">
          Export sales
        </DownloadLink>
        <DownloadLink className="btn-secondary text-center text-sm" href="/exports/purchases" fallbackFilename="purchases.csv">
          Export purchases
        </DownloadLink>
        <DownloadLink className="btn-secondary text-center text-sm" href="/exports/risk-summary" fallbackFilename="risk-summary.csv">
          Export risk summary
        </DownloadLink>
      </div>
    </div>
  );
}
