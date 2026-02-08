import PageHeader from '@/components/PageHeader';
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
        <a className="btn-secondary text-center text-sm" href="/exports/products">
          Export products
        </a>
        <a className="btn-secondary text-center text-sm" href="/exports/inventory">
          Export inventory
        </a>
        <a className="btn-secondary text-center text-sm" href="/exports/sales">
          Export sales
        </a>
        <a className="btn-secondary text-center text-sm" href="/exports/purchases">
          Export purchases
        </a>
      </div>
    </div>
  );
}
