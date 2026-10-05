import ReportsRefresh from '@/components/reports/ReportsRefresh';
import type { ReactNode } from 'react';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Title, scope, period, refresh and an optional closed reading note.
 * The location landmark stays on the reports layout.
 */
export default function ReportsDestinationHead({
  title,
  scopeLabel,
  periodLabel,
  actions,
  readingTitle = 'Period and how this report is read',
  reading,
  showRefresh = true,
}: {
  title: string;
  scopeLabel?: string;
  periodLabel?: string;
  actions?: ReactNode;
  readingTitle?: string;
  reading?: ReactNode;
  showRefresh?: boolean;
}) {
  return (
    <header className="min-w-0">
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <h1 className="min-w-0 font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">{title}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:max-w-[42rem] lg:justify-end" data-report-header-actions>
          {showRefresh ? <ReportsRefresh fetchedAt={new Date().toISOString()} /> : null}
          {actions}
        </div>
      </div>
      {scopeLabel || periodLabel ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          {scopeLabel ? (
            <p
              className="inline-flex max-w-full rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent"
              data-report-scope={scopeLabel}
            >
              <span className="truncate">{scopeLabel}</span>
            </p>
          ) : null}
          {periodLabel ? <p className="max-w-[65ch] text-sm leading-5 text-ink" data-period-label="">{periodLabel}</p> : null}
        </div>
      ) : null}
      {reading ? (
        <details className="mt-2">
          <summary className={`w-fit max-w-full cursor-pointer px-1 text-sm font-semibold text-accent ${FOCUS}`}>
            <span className="inline-flex min-h-11 items-center">{readingTitle}</span>
          </summary>
          <div className="mt-1 max-w-3xl space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-ink">
            {reading}
          </div>
        </details>
      ) : null}
    </header>
  );
}
