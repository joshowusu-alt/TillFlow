import { ownerCategoryLabel } from '@/lib/reports/business-movement';
import { movementDisplayCopy } from '@/lib/reports/business-movement/presentation';
import type { OwnerPeriodLabels, RankedBusinessMovementInsight } from '@/lib/reports/business-movement';

export default function BusinessMovementInsight({ insight, labels, currency }: {
  insight: RankedBusinessMovementInsight;
  labels: OwnerPeriodLabels;
  currency: string;
}) {
  const copy = movementDisplayCopy(insight, labels, currency);
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm text-ink" data-movement-insight>
      <p className="mb-1 text-xs font-semibold text-accent">{ownerCategoryLabel(insight.category)}</p>
      <p className="break-words leading-5">{copy.fact}</p>
      <details>
        <summary className="flex min-h-[45px] w-fit max-w-full cursor-pointer items-center rounded-lg text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">What to check · Supporting figures</summary>
        <p className="mb-2 break-words text-sm leading-5"><strong>What changed:</strong> {copy.fact}</p>
        <p className="mb-2 break-words text-sm leading-5"><strong>What to check:</strong> {copy.recommendedCheck}</p>
        <p className="break-words text-sm leading-6 text-slate-600">{copy.evidence}</p>
      </details>
    </article>
  );
}
