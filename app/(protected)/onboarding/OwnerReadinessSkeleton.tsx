/**
 * Compact owner-home fallback while readiness data streams in.
 * Dashboard-shaped — not a full-page or launch-branded loader.
 */
export default function OwnerReadinessSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-live="polite" aria-label="Preparing owner dashboard">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Today in your shop</p>
        <div className="h-7 w-48 max-w-[70%] rounded-xl bg-black/5" />
        <p className="text-xs text-black/40">Preparing today&apos;s view…</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
            <div className="h-2.5 w-14 rounded bg-black/5" />
            <div className="mt-2 h-5 w-16 rounded-lg bg-black/5" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-black/5 bg-white px-3 py-2.5">
            <div className="h-3 w-2/3 max-w-[14rem] rounded bg-black/5" />
            <div className="mt-2 h-3 w-full max-w-[20rem] rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
