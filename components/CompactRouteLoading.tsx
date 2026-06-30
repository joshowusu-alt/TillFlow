type CompactRouteLoadingProps = {
  variant: 'inventory' | 'sales' | 'purchases' | 'reports';
};

function PageHeaderPlaceholder({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="h-7 w-36 max-w-[70%] rounded-xl bg-black/5" />
      {subtitle ? <div className="h-3.5 w-52 max-w-full rounded bg-black/5" /> : null}
    </div>
  );
}

function FilterBarPlaceholder({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-black/5 bg-white/90 px-3 shadow-sm ${
        tall ? 'py-3' : 'py-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-24 rounded-xl bg-black/5" />
        <div className="h-8 w-28 rounded-xl bg-black/5" />
        <div className="h-8 flex-1 min-w-[8rem] rounded-xl bg-black/5" />
      </div>
    </div>
  );
}

function StatChips({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:max-w-md">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
          <div className="h-2.5 w-14 rounded bg-black/5" />
          <div className="mt-2 h-5 w-16 rounded-lg bg-black/5" />
        </div>
      ))}
    </div>
  );
}

function ListRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-black/5 bg-white px-3 py-3 sm:px-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-black/5" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 max-w-[12rem] rounded bg-black/5" />
              <div className="h-3 w-1/3 max-w-[8rem] rounded bg-black/5" />
            </div>
            <div className="hidden h-3 w-12 rounded bg-black/5 sm:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartBlockPlaceholder() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4">
      <div className="h-3 w-28 rounded bg-black/5" />
      <div className="mt-3 h-32 rounded-xl bg-black/5 sm:h-36" />
    </div>
  );
}

function InsightRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-black/5 bg-white px-3 py-2.5">
          <div className="h-3 w-2/3 max-w-[14rem] rounded bg-black/5" />
          <div className="mt-2 h-3 w-full max-w-[20rem] rounded bg-black/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Compact, mobile-first route skeletons for protected in-app navigation.
 */
export default function CompactRouteLoading({ variant }: CompactRouteLoadingProps) {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-live="polite" aria-label="Loading page">
      <PageHeaderPlaceholder />

      {variant === 'inventory' ? (
        <>
          <StatChips count={2} />
          <FilterBarPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'sales' ? (
        <>
          <FilterBarPlaceholder tall />
          <ListRows count={6} />
        </>
      ) : null}

      {variant === 'purchases' ? (
        <>
          <FilterBarPlaceholder />
          <ListRows count={5} />
        </>
      ) : null}

      {variant === 'reports' ? (
        <>
          <StatChips count={2} />
          <ChartBlockPlaceholder />
          <InsightRows count={3} />
        </>
      ) : null}
    </div>
  );
}
