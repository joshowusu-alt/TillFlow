/**
 * Compact section-level fallback for Suspense-wrapped report bodies.
 */
export default function ReportSectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-live="polite" aria-label="Loading report section">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
            <div className="h-2.5 w-14 rounded bg-black/5" />
            <div className="mt-2 h-5 w-16 rounded-lg bg-black/5" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="h-3 w-28 rounded bg-black/5" />
        <div className="mt-3 h-32 rounded-xl bg-black/5 sm:h-36" />
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
