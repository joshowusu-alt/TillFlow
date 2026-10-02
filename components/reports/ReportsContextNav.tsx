import Link from 'next/link';
import { destinationOmitsStoreId, type ReportReturnPath } from '@/lib/reports/today/stage3a-nav';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

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
  const scopedStoreId = !('withheld' in path) && destinationOmitsStoreId(path.href) ? null : storeId;
  const todayHref = withStore('/reports', scopedStoreId);
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

  const sectionHref = withStore(`/reports?section=${path.section}`, scopedStoreId);
  const sectionLabel = path.section === 'activity' ? 'Activity' : 'More reports';
  return (
    <nav aria-label="Reports location" className="mb-3 min-w-0" data-destination-shell="">
      <ol className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted md:flex">
        <li><Link className={`font-medium text-ink ${FOCUS}`} href={todayHref}>Reports</Link></li>
        <li aria-hidden="true">/</li>
        <li>
          <Link className={`inline-flex min-h-11 items-center font-medium text-ink ${FOCUS}`} href={sectionHref}>
            {sectionLabel}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="min-w-0 break-words font-semibold text-ink" aria-current="page">{path.title}</li>
      </ol>
      <Link
        href={sectionHref}
        aria-label={`${path.backLabel}, Reports`}
        data-return-path=""
        className={`inline-flex min-h-11 items-center text-sm font-semibold text-accent md:hidden ${FOCUS}`}
      >
        <span aria-hidden="true">← {sectionLabel}</span>
      </Link>
    </nav>
  );
}
