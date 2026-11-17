'use client';

import Link from 'next/link';
import NavIcon from '@/components/navigation/NavIcon';
import {
  activityGroupHeading,
  type Stage3aLink,
} from '@/lib/reports/today/stage3a-nav';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function ReportDirectory({
  links,
  onStay,
}: {
  links: Stage3aLink[];
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const groups = new Map<string, Stage3aLink[]>();
  for (const link of links) {
    const rows = groups.get(link.group) ?? [];
    rows.push(link);
    groups.set(link.group, rows);
  }
  const columns = groups.size <= 1
    ? 'max-w-2xl'
    : groups.size === 2
      ? 'md:grid-cols-2'
      : 'md:grid-cols-2 xl:grid-cols-3';

  if (links.length === 0) {
    return <p className="mt-3 text-sm text-ink" role="status">Nothing in this list is available on the current plan.</p>;
  }

  return (
    <div className={`mt-3 grid min-w-0 grid-cols-1 gap-4 ${columns}`} data-directory-grid="" data-directory-groups={groups.size}>
      {[...groups.entries()].map(([group, rows], groupIndex) => (
        <section key={group} aria-labelledby={`directory-${group}`} className="min-w-0">
          <h2 id={`directory-${group}`} className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {activityGroupHeading(group as Stage3aLink['group'])}
          </h2>
          <ul className="mt-1.5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card" data-primary-card={groupIndex === 0 ? 'true' : undefined}>
            {rows.map((link, index) => (
              <li key={link.href} className="border-b border-slate-100 last:border-0">
                <Link
                  href={link.href}
                  data-today-action="true"
                  data-first-figure={groupIndex === 0 && index === 0 ? 'true' : undefined}
                  onClick={onStay}
                  className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${FOCUS}`}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent">
                    <NavIcon iconKey={link.iconKey} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{link.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{link.useWhen ?? link.purpose}</span>
                  </span>
                  <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
