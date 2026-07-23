/** Neutral loading placeholders — never show all-clear / "No urgent issues" while pending. */

export function HomeKpiSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
      role="status"
      aria-live="polite"
      aria-label="Loading today's performance"
    >
      <div className="col-span-2 min-h-[4.5rem] animate-pulse rounded-2xl border border-white/10 bg-white/10 sm:col-span-1 sm:min-h-[6.5rem]" />
      <div className="min-h-[4rem] animate-pulse rounded-2xl border border-white/10 bg-white/10 sm:min-h-[6.5rem]" />
      <div className="min-h-[4rem] animate-pulse rounded-2xl border border-white/10 bg-white/10 sm:min-h-[6.5rem]" />
    </div>
  );
}

export function HomeStatusPillSkeleton() {
  return (
    <div
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100/80"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-200/50 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-200/70" />
      </span>
      Checking today&apos;s status…
    </div>
  );
}

export function HomeAttentionSkeleton() {
  return (
    <section aria-labelledby="todays-attention-heading" role="status" aria-live="polite">
      <div className="mb-3">
        <h2 id="todays-attention-heading" className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">
          Today&apos;s attention
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">Checking today&apos;s status…</p>
      </div>
      <div className="space-y-2">
        <div className="min-h-[3.75rem] animate-pulse rounded-2xl border border-black/[0.06] bg-white shadow-sm" />
        <div className="min-h-[3.75rem] animate-pulse rounded-2xl border border-black/[0.06] bg-white shadow-sm" />
      </div>
    </section>
  );
}

export function HomeImproveRecordsSkeleton() {
  return (
    <section
      aria-labelledby="improve-your-records-heading"
      className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5"
      role="status"
      aria-live="polite"
      aria-label="Loading record improvements"
    >
      <h2 id="improve-your-records-heading" className="text-sm font-bold text-ink">
        Improve your records
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional improvements that make your records and reports more reliable.
      </p>
      <div className="mt-3 space-y-2">
        <div className="h-[4.5rem] animate-pulse rounded-xl bg-black/[0.04]" />
        <div className="h-10 animate-pulse rounded-lg bg-black/[0.03]" />
      </div>
    </section>
  );
}

export function HomeLastCloseSkeleton() {
  return <p className="mt-0.5 text-[11px] text-blue-100/50">Checking last close…</p>;
}
