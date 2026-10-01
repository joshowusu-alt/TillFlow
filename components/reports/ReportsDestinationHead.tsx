import RefreshIndicator from '@/components/RefreshIndicator';

export default function ReportsDestinationHead({
  title,
  scopeLabel,
  actions,
}: {
  title: string;
  scopeLabel: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="min-w-0 space-y-3 border-b border-slate-100 pb-4">
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
