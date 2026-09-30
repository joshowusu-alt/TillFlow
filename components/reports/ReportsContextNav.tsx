import Link from 'next/link';
import type { ReportReturnPath } from '@/lib/reports/today/stage3a-nav';

const FOCUS = 'rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function withStore(href: string, storeId: string | null): string {
  if (!storeId) return href;
  const url = new URL(href, 'https://tillflow.local');
  url.searchParams.set('storeId', storeId);
  return `${url.pathname}${url.search}`;
}

export function WithheldReportNotice({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6" role="status">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
    </section>
  );
}

export function ReportsReturnPath({
  path,
  storeId,
}: {
  path: ReportReturnPath | { withheld: true; title: string };
  storeId: string | null;
}) {
  const todayHref = withStore('/reports', storeId);
  if ('withheld' in path) {
    return (
      <nav aria-label="Reports location" className="mb-4 min-w-0">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <li><Link className={`font-medium text-ink ${FOCUS}`} href={todayHref}>Reports</Link></li>
          <li aria-hidden="true">/</li>
          <li className="min-w-0 break-words font-semibold text-ink" aria-current="page">{path.title}</li>
        </ol>
        <Link href={todayHref} className={`mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent ${FOCUS}`}>
          Back to Today
        </Link>
      </nav>
    );
  }

  const sectionHref = withStore(`/reports?section=${path.section}`, storeId);
  const sectionLabel = path.section === 'activity' ? 'Activity' : 'More reports';
  return (
    <nav aria-label="Reports location" className="mb-4 min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <li><Link className={`font-medium text-ink ${FOCUS}`} href={todayHref}>Reports</Link></li>
        <li aria-hidden="true">/</li>
        <li><Link className={`font-medium text-ink ${FOCUS}`} href={sectionHref}>{sectionLabel}</Link></li>
        <li aria-hidden="true">/</li>
        <li className="min-w-0 break-words font-semibold text-ink" aria-current="page">{path.title}</li>
      </ol>
      <Link href={sectionHref} className={`mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent ${FOCUS}`}>
        {path.backLabel}
      </Link>
    </nav>
  );
}
