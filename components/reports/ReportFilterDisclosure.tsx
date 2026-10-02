import type { ReactNode } from 'react';

/** Native disclosure stays reachable at every width, including when closed. */
export default function ReportFilterDisclosure({ children }: { children: ReactNode }) {
  return (
    <details className="reports-filter-disclosure">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        Adjust date range / branch
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}
