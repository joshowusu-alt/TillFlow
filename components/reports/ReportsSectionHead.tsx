import Link from 'next/link';
import type { ReactNode } from 'react';
import RefreshToday from '@/components/reports/today/RefreshToday';
import type { Stage3aSection } from '@/lib/reports/today/stage3a-nav';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function sectionHref(section: Stage3aSection, storeId: string | null) {
  const params = new URLSearchParams();
  if (section !== 'today') params.set('section', section);
  if (storeId) params.set('storeId', storeId);
  const query = params.toString();
  return query ? `/reports?${query}` : '/reports';
}

export default function ReportsSectionHead({
  title,
  section,
  storeId,
  dateLabel,
  scopeLabel,
  updatedLabel,
  showDate,
  lead,
  help,
}: {
  title: string;
  section: Stage3aSection;
  storeId: string | null;
  dateLabel: string;
  scopeLabel: string;
  updatedLabel: string;
  showDate: boolean;
  lead?: string;
  help?: ReactNode;
}) {
  const items: Array<{ id: Stage3aSection; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'activity', label: 'Activity' },
    { id: 'more', label: 'More reports' },
  ];
  const localMarker = ' · Local time';
  const showsLocalTime = showDate && dateLabel.endsWith(localMarker);
  const visibleDate = showsLocalTime ? dateLabel.slice(0, -localMarker.length) : dateLabel;
  const visibleUpdated = showsLocalTime && updatedLabel ? `${updatedLabel}${localMarker}` : updatedLabel;
  return (
    <header className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h1 className="min-w-0 font-display text-2xl font-semibold leading-tight text-ink">{title}</h1>
        {section === 'today' && visibleUpdated ? (
          <div className="flex shrink-0 items-center">
            <RefreshToday label={visibleUpdated} />
          </div>
        ) : null}
      </div>
      {lead ? <p className="mt-1 max-w-[65ch] text-sm leading-5 text-ink">{lead}</p> : null}
      {showDate || scopeLabel ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {scopeLabel ? (
            <p
              className="inline-flex max-w-full rounded-full bg-accentSoft px-3 py-0.5 text-sm font-semibold leading-5 text-accent md:py-1"
              data-report-scope={scopeLabel}
            >
              <span className="truncate">{scopeLabel}</span>
            </p>
          ) : null}
          {showDate && visibleDate ? <p className="text-sm leading-5 text-muted">{visibleDate}</p> : null}
          {help}
        </div>
      ) : help ? <div className="mt-1">{help}</div> : null}
      <nav aria-label="Reports sections" className="mt-1" data-reports-nav="contextual">
        <ul className="flex w-fit max-w-full gap-1 rounded-xl bg-slate-100 p-0.5 md:p-1">
          {items.map((item) => {
            const current = item.id === section;
            return (
              <li key={item.id}>
                <Link
                  href={sectionHref(item.id, storeId)}
                  aria-current={current ? 'page' : undefined}
                  aria-label={item.id === 'more' ? 'More reports' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold ${FOCUS} ${
                    current ? 'bg-white text-ink shadow-sm' : 'text-ink hover:bg-white/70'
                  }`}
                >
                  {item.id === 'more' ? (
                    <>
                      <span className="sm:hidden" aria-hidden="true">More</span>
                      <span className="hidden sm:inline">More reports</span>
                    </>
                  ) : (
                    item.label
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
