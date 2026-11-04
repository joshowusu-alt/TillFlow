import SettingsSection from '@/components/SettingsSection';
import PageHeader from '@/components/PageHeader';
import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import DataDiagnosticPanel from '@/components/DataDiagnosticPanel';
import RestoreOrphanedProductsButton from '@/components/RestoreOrphanedProductsButton';
import RepairJournalEntriesButton from '@/components/RepairJournalEntriesButton';
import BackfillLineCostButton from '@/components/BackfillLineCostButton';
import RepairInventoryAverageCostsButton from '@/components/RepairInventoryAverageCostsButton';
import RepairPaymentStatusButton from '@/components/RepairPaymentStatusButton';
import { getPaymentStatusHealth } from '@/lib/services/payment-status-health';

export default async function DataRepairPage() {
  const { business } = await requireBusiness(['OWNER']);
  const paymentHealth = await getPaymentStatusHealth(business.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Repair"
        subtitle="Advanced recovery tools for exceptional data issues."
        secondaryCta={{ label: '← Settings', href: '/settings' }}
      />

      <nav aria-label="Data repair sections" className="flex flex-wrap gap-2">
        <a href="#diagnostics" className="btn-secondary text-xs">Diagnose first</a>
        <a href="#records" className="btn-secondary text-xs">Products & accounting</a>
        <a href="#costs" className="btn-secondary text-xs">Inventory & sale costs</a>
        <a href="#payments" className="btn-secondary text-xs">Payment statuses</a>
      </nav>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <div className="font-semibold">Use these tools only after normal recovery steps</div>
        <p className="mt-1 text-amber-800">
          Check System Health, pending offline sales, and backups first. These actions are designed for exceptional cleanup and historical correction, not day-to-day operation.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/settings/system-health" className="btn-secondary text-xs">
            Open System Health
          </Link>
          <Link href="/settings/backup" className="btn-secondary text-xs">
            Review Backup & Restore
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-4 sm:p-6">
          <h3 className="mb-3 font-semibold">Which repair should I use?</h3>
          <div className="space-y-3 text-sm text-black/65">
            <div>
              <div className="font-medium text-ink">Inventory shows an old average cost after product setup was corrected</div>
              <p>Run <strong>Repair Inventory Average Costs</strong>. This fixes balances that still follow a stale default cost and leaves purchase-backed averages alone.</p>
            </div>
            <div>
              <div className="font-medium text-ink">Older reports still use today&apos;s product cost</div>
              <p>Run <strong>Backfill Line Costs</strong>. This writes missing historical sale costs so gross profit stays tied to the sale date.</p>
            </div>
            <div>
              <div className="font-medium text-ink">Only a few specific receipts were costed wrongly</div>
              <p>Use <strong>Targeted Sale Cost Corrections</strong> for a focused correction without touching unaffected sales.</p>
            </div>
          </div>
        </div>

        <div className="card min-w-0 p-4 sm:p-6">
          <h3 className="mb-3 font-semibold">Safe order of operations</h3>
          <ol className="space-y-2 text-sm text-black/65">
            <li>1. Confirm the current product setup is correct.</li>
            <li>2. Repair inventory average costs if stock is still carrying an old cost.</li>
            <li>3. Backfill or target-correct historical sale lines only if reports still look wrong afterwards.</li>
          </ol>
        </div>
      </div>

      <SettingsSection id="diagnostics" title="Data Diagnostic & Repair" description="Read-only checks first; review any changes before applying them." defaultOpen keepMounted>
        <p className="text-sm text-black/50 mb-4">
          Diagnose data issues, clean up orphaned journal entries from deleted sales,
          and void test/setup sales without needing a manager PIN.
        </p>
        <DataDiagnosticPanel />
      </SettingsSection>

      <SettingsSection id="records" title="Restore Deleted Products" description="Recover product references used by historical sales." keepMounted>
        <p className="text-sm text-black/50 mb-4">
          If sales are missing from the sales list after clearing sample data,
          use this to restore products that were accidentally removed. Safe to run multiple times.
        </p>
        <RestoreOrphanedProductsButton />
      </SettingsSection>

      <SettingsSection id="accounting" title="Repair Accounting Entries" description="Create missing entries for recorded purchases and sales." keepMounted>
        <p className="text-sm text-black/50 mb-4">
          If your Balance Sheet shows zero for assets despite having recorded purchases,
          use this to create any missing journal entries. Safe to run multiple times.
        </p>
        <RepairJournalEntriesButton />
      </SettingsSection>

      <SettingsSection id="costs" title="Repair Inventory Average Costs" description="Review product setup before changing stored inventory costs." keepMounted>
        <p className="text-sm text-black/50 mb-4">
          Sync stale inventory average costs to the current product default cost only where the stock has no authoritative inbound cost trail yet. Use this when the product setup now shows the right base-unit cost, but inventory and gross profit still reflect an older value.
        </p>
        <RepairInventoryAverageCostsButton />
      </SettingsSection>

      <SettingsSection id="payments" title="Repair Payment Status Drift" description="Compare invoice statuses with recorded payments." keepMounted>
        <p className="text-sm text-black/50 mb-3">
          Finds invoices where payment rows and status disagree. The repair only updates safe cases, such as a part-paid invoice whose payments now cover the full total.
        </p>
        <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Issues: <span className="font-semibold">{paymentHealth.issueCount}</span>
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Safe repairs: <span className="font-semibold">{paymentHealth.repairableCount}</span>
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Review only: <span className="font-semibold">{paymentHealth.issueCount - paymentHealth.repairableCount}</span>
          </div>
        </div>
        <RepairPaymentStatusButton />
      </SettingsSection>

      <SettingsSection id="backfill" title="Backfill Line Costs" description="Fill missing costs on historical sale lines." keepMounted>
        <p className="text-sm text-black/50 mb-4">
          Populates historical cost data on existing sales so profit margin reports
          use the cost at time of sale rather than the current product cost. Run this after inventory cost drift is repaired when the issue affects many older sales. Safe to run multiple times.
        </p>
        <BackfillLineCostButton />
      </SettingsSection>

      <SettingsSection id="targeted" title="Targeted Sale Cost Corrections" description="Review specific receipts before correcting their cost history." keepMounted>
        <p className="text-sm text-black/50 mb-4">
          Correct only the specific historical sale lines affected by the old product setup. This is best when the receipt totals were correct, but the stored cost and gross profit trail need correction.
        </p>
        <Link href="/settings/data-repair/sale-cost-corrections" className="btn-secondary inline-flex justify-center text-sm">
          Open targeted corrections
        </Link>
      </SettingsSection>

    </div>
  );
}
