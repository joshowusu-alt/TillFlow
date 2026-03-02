import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ImportStockClient from './ImportStockClient';

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
