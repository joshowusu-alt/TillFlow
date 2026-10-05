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
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-ink" data-movement-insight>
      <p className="mb-2 text-xs font-semibold text-accent">{ownerCategoryLabel(insight.category)}</p>
      <dl className="space-y-3">
        <div><dt className="text-xs font-semibold text-slate-600">What changed</dt><dd className="mt-1 break-words leading-6">{copy.fact}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-600">What to check</dt><dd className="mt-1 break-words leading-6">{copy.recommendedCheck}</dd></div>
      </dl>
      <details className="mt-2">
        <summary className="flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Supporting figures</summary>
        <p className="break-words text-sm leading-6 text-slate-600">{copy.evidence}</p>
      </details>
    </article>
  );
}
