import PageHeader from '@/components/PageHeader';
import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import DataDiagnosticPanel from '@/components/DataDiagnosticPanel';
import RestoreOrphanedProductsButton from '@/components/RestoreOrphanedProductsButton';
import RepairJournalEntriesButton from '@/components/RepairJournalEntriesButton';
import BackfillLineCostButton from '@/components/BackfillLineCostButton';

export default async function DataRepairPage() {
  const { user } = await requireBusiness(['OWNER']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Repair"
        subtitle="Diagnose and fix data issues."
        secondaryCta={{ label: '← Settings', href: '/settings' }}
      />

      <div className="card p-6">
        <h3 className="font-semibold mb-1">Data Diagnostic &amp; Repair</h3>
        <p className="text-sm text-black/50 mb-4">
          Diagnose data issues, clean up orphaned journal entries from deleted sales,
          and void test/setup sales without needing a manager PIN.
        </p>
        <DataDiagnosticPanel />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">Restore Deleted Products</h3>
        <p className="text-sm text-black/50 mb-4">
          If sales are missing from the sales list after clearing sample data,
          use this to restore products that were accidentally removed. Safe to run multiple times.
        </p>
        <RestoreOrphanedProductsButton />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">Repair Accounting Entries</h3>
        <p className="text-sm text-black/50 mb-4">
          If your Balance Sheet shows GHS 0 for assets despite having recorded purchases,
          use this to create any missing journal entries. Safe to run multiple times.
        </p>
        <RepairJournalEntriesButton />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">Backfill Line Costs</h3>
        <p className="text-sm text-black/50 mb-4">
          Populates historical cost data on existing sales so profit margin reports
          use the cost at time of sale rather than the current product cost. Safe to run multiple times.
        </p>
        <BackfillLineCostButton />
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">Targeted Sale Cost Corrections</h3>
        <p className="text-sm text-black/50 mb-4">
          Correct only the specific historical sale lines affected by the old product setup. This is best when the receipt totals were correct, but the stored cost and gross profit trail need surgical repair.
        </p>
        <Link href="/settings/data-repair/sale-cost-corrections" className="btn-secondary inline-flex justify-center text-sm">
          Open targeted corrections
        </Link>
      </div>
    </div>
  );
}
