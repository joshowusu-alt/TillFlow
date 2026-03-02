import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// xlsx is a large parser library (~400 kB). Load it client-side only so it
// doesn't enter the server bundle and cause Vercel output-deployment failures.
const ImportStockClient = dynamic(() => import('./ImportStockClient'), {
  ssr: false,
  loading: () => <div className="card p-6 animate-pulse">Loading importer…</div>,
});

export default async function ImportStockPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const units = await prisma.unit.findMany({
    select: { id: true, name: true, pluralName: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Stock"
        subtitle="Bulk-create your product catalogue and record opening stock from a CSV or Excel file."
      />
      <ImportStockClient units={units} currency={business.currency} />
    </div>
  );
}
