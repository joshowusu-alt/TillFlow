import Link from 'next/link';
import RefreshToday from '@/components/reports/today/RefreshToday';
import type { Stage3aSection } from '@/lib/reports/today/stage3a-nav';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

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
  help,
}: {
  title: string;
  section: Stage3aSection;
  storeId: string | null;
  dateLabel: string;
  scopeLabel: string;
  updatedLabel: string;
  showDate: boolean;
  help?: React.ReactNode;
}) {
  const items: Array<{ id: Stage3aSection; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'activity', label: 'Activity' },
    { id: 'more', label: 'More reports' },
  ];
  return (
    <header className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Reports</p>
          <h1 className="font-display text-2xl font-semibold leading-tight text-ink">{title}</h1>
        </div>
        {section === 'today' && updatedLabel ? (
          <div className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
            <RefreshToday label={updatedLabel} />
          </div>
        ) : null}
      </div>
      {showDate ? <p className="mt-1 text-sm leading-5 text-muted">{dateLabel}</p> : null}
      {scopeLabel ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <p
            className="inline-flex max-w-full rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold leading-5 text-accent"
            data-report-scope={scopeLabel}
          >
            <span className="truncate">{scopeLabel}</span>
          </p>
          {help}
        </div>
      ) : (
        help ? <div className="mt-2">{help}</div> : null
      )}
      <nav aria-label="Reports sections" className="mt-2 sm:mt-4" data-reports-nav="contextual">
        <ul className="flex w-fit max-w-full gap-1 rounded-xl bg-slate-100 p-1">
          {items.map((item) => {
            const current = item.id === section;
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  href={sectionHref(item.id, storeId)}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold ${FOCUS} ${
                    current ? 'bg-white text-ink shadow-sm' : 'text-muted hover:bg-white/70 hover:text-ink'
                  }`}
                >
                  {item.id === 'more' ? (
                    <>
                      <span className="sm:hidden">More</span>
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
