'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ReportReturnPath } from '@/lib/reports/today/stage3a-nav';
import { withStoreScope } from '@/lib/reports/today/stage3a-nav';
import { ReportsCanvas } from '@/components/reports/presentation/canvas';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Shared destination chrome for every Reports destination.
 * One location landmark, one return, one title, scope, period, refresh,
 * an optional closed reading note, then the page's own first result.
 * Stage 3A.1 mounts this on Trading, Sales Analytics and Business Movement.
 * Other destinations keep their bodies; they do not get a second shell family.
 */
export function DestinationShell({
  path,
  storeId,
  scopeLabel,
  periodLabel,
  updatedLabel,
  integrityTitle,
  integrity,
  children,
  onStay,
}: {
  path: ReportReturnPath;
  storeId: string | null;
  scopeLabel: string;
  periodLabel: string;
  updatedLabel: string;
  integrityTitle: string;
  integrity: ReactNode;
  children: ReactNode;
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const sectionLabel = path.section === 'activity' ? 'Activity' : 'More reports';
  const todayHref = withStoreScope('/reports', storeId);
  const sectionHref = withStoreScope(`/reports?section=${path.section}`, storeId);
  return (
    <ReportsCanvas>
      <nav aria-label="Reports location" className="min-w-0" data-destination-shell="">
        <ol className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted md:flex">
          <li>
            <Link className={`font-medium text-ink ${FOCUS}`} href={todayHref} onClick={onStay}>Reports</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className={`inline-flex min-h-11 items-center font-medium text-ink ${FOCUS}`} href={sectionHref} onClick={onStay}>
              {sectionLabel}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="min-w-0 break-words font-semibold text-ink" aria-current="page" data-location-crumb="">
            {path.title}
          </li>
        </ol>
        <Link
          href={sectionHref}
          onClick={onStay}
          aria-label={`${path.backLabel}, Reports`}
          data-return-path=""
          className={`inline-flex min-h-11 items-center text-sm font-semibold text-accent md:hidden ${FOCUS}`}
        >
          <span aria-hidden="true">← {sectionLabel}</span>
        </Link>
      </nav>
      <header className="mt-1 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold leading-tight text-ink">{path.title}</h1>
          <div className="flex min-h-11 shrink-0 items-center gap-2">
            <p className="text-sm text-muted">Updated {updatedLabel}</p>
            <button type="button" className={`inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-ink ${FOCUS}`}>
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <p className="inline-flex max-w-full rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent" data-report-scope={scopeLabel}>
            <span className="truncate">{scopeLabel}</span>
          </p>
          <p className="text-sm text-ink" data-period-label="">{periodLabel}</p>
        </div>
      </header>
      <details className="mt-3 rounded-2xl border border-slate-200 bg-white">
        <summary className={`cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink ${FOCUS}`}>
          <span className="inline-flex min-h-11 items-center">{integrityTitle}</span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm leading-6 text-ink">
          {integrity}
        </div>
      </details>
      <div className="mt-3 min-w-0" data-first-metric="">
        {children}
      </div>
    </ReportsCanvas>
  );
}
