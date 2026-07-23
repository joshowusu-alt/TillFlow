import type { BusinessPlan } from '@/lib/features';
import { hasPlanAccess } from '@/lib/features';
import type { OwnerHomeAttentionData } from '@/lib/owner-home/attention';
import type { ImproveRecordsResult } from '@/lib/improve-records';
import {
  countHomeAttentionActions,
  formatHeroStatusPill,
} from '@/lib/home-attention-presentation';
import { HomeStatusUnavailable } from '@/components/owner-home/section-errors';

/**
 * Status pill for progressive Home.
 * Attention failure → unavailable (never false all-clear).
 * IYR failure alone → attention-only pill (does not claim records all-clear).
 */
export default async function HomeStatusPillSlot({
  attentionPromise,
  improvePromise,
  plan,
}: {
  attentionPromise: Promise<OwnerHomeAttentionData>;
  improvePromise: Promise<ImproveRecordsResult>;
  plan: BusinessPlan;
}) {
  const [attentionResult, improveResult] = await Promise.allSettled([
    attentionPromise,
    improvePromise,
  ]);

  if (attentionResult.status === 'rejected') {
    return <HomeStatusUnavailable />;
  }

  const attention = attentionResult.value;
  const improveRecords =
    improveResult.status === 'fulfilled' ? improveResult.value : null;
  const canAccessReorder = hasPlanAccess(plan, 'GROWTH');
  const actionCount = countHomeAttentionActions({
    openShiftCount: attention.openShiftCount,
    openIssueCount: attention.openIssueCount,
    reorderNeededCount: attention.reorderNeededCount,
    overdueSupplierInvoiceCount: attention.overdueSupplierInvoiceCount,
    canAccessReorder,
  });
  // Only use IYR signal when the loader succeeded — never invent an all-clear for records.
  const hasRecordImprovements = Boolean(improveRecords?.primary);
  const statusPillLabel = formatHeroStatusPill({
    actionCount,
    openShiftCount: attention.openShiftCount,
    hasRecordImprovements,
  });

  const statusPill =
    actionCount > 0
      ? {
          label: statusPillLabel,
          shell: 'border-amber-300/25 bg-amber-400/15 text-amber-200',
          dot: 'bg-amber-300',
        }
      : hasRecordImprovements
        ? {
            label: statusPillLabel,
            shell: 'border-blue-300/25 bg-blue-400/10 text-blue-100',
            dot: 'bg-blue-300',
          }
        : {
            label: statusPillLabel,
            shell: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300',
            dot: 'bg-emerald-400',
          };

  return (
    <div
      className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPill.shell}`}
      role="status"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusPill.dot}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${statusPill.dot}`} />
      </span>
      {statusPill.label}
    </div>
  );
}
