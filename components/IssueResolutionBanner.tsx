import Link from 'next/link';

/** Shared banner for Improve Your Records issue landing pages. */
export default function IssueResolutionBanner({
  heading,
  explanation,
  affectedCount,
  homeHref = '/onboarding',
  clearHref,
  resolved = false,
  accessDenied = false,
  children,
}: {
  heading: string;
  explanation: string;
  affectedCount: number;
  homeHref?: string;
  clearHref?: string;
  resolved?: boolean;
  accessDenied?: boolean;
  children?: React.ReactNode;
}) {
  if (accessDenied) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">{heading}</p>
        <p className="mt-1 text-xs text-amber-800/85">{explanation}</p>
        <div className="mt-3">
          <Link href={homeHref} className="text-xs font-semibold text-accent hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (resolved || affectedCount === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-900">This issue has been resolved.</p>
        <p className="mt-1 text-xs text-emerald-800/85">
          {heading
            ? `${heading} — no matching records need attention right now.`
            : 'No matching records need attention right now.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={homeHref} className="text-xs font-semibold text-accent hover:underline">
            ← Back to Home
          </Link>
          {clearHref ? (
            <Link href={clearHref} className="text-xs font-semibold text-black/55 hover:underline">
              Browse all records
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">{heading}</p>
          <p className="mt-1 text-xs text-amber-800/85">{explanation}</p>
          <p className="mt-2 text-xs font-semibold text-amber-900">
            Showing {affectedCount} matching record{affectedCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href={homeHref} className="text-xs font-semibold text-accent hover:underline">
            ← Back to Home
          </Link>
          {clearHref ? (
            <Link href={clearHref} className="text-xs font-semibold text-black/55 hover:underline">
              Clear filter
            </Link>
          ) : null}
        </div>
      </div>
      {children ? <div className="border-t border-amber-200/70 pt-3">{children}</div> : null}
    </div>
  );
}
