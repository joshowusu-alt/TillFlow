import Link from 'next/link';
import RefreshIndicator from '@/components/RefreshIndicator';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import { returnPathFor } from '@/lib/reports/today/stage3a-nav';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function ReportsDestinationHead({
  pathname,
  title,
  scopeLabel,
  storeId,
  actions,
}: {
  pathname: string;
  title: string;
  scopeLabel: string;
  storeId: string | null;
  actions?: React.ReactNode;
}) {
  const path = returnPathFor(pathname);
  return (
    <header className="min-w-0 space-y-3 border-b border-slate-100 pb-4">
      {path ? <ReportsReturnPath path={path} storeId={storeId} /> : (
        <Link href="/reports" className={`inline-flex min-h-11 items-center text-sm font-semibold text-accent ${FOCUS}`}>
          Back to Today
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-tight text-ink">{title}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <RefreshIndicator fetchedAt={new Date().toISOString()} />
          {actions}
        </div>
      </div>
      {scopeLabel ? (
        <p className="inline-flex max-w-full rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">
          <span className="truncate">{scopeLabel}</span>
        </p>
      ) : null}
    </header>
  );
}
