/**
 * POS-shaped fallback shown while the catalog, inventory, customers, tills and
 * shifts stream in. Calm in-app skeleton — not cold-boot / launch branding.
 */
export default function PosBoardSkeleton() {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-live="polite"
      aria-label="Loading point of sale"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Catalog column */}
        <div className="space-y-4">
          {/* Search bar */}
          <div className="h-11 w-full rounded-xl bg-black/5" />

          {/* Category chips */}
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-black/5" />
            ))}
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="card space-y-3 p-3">
                <div className="aspect-square w-full rounded-xl bg-black/5" />
                <div className="h-3 w-3/4 rounded bg-black/5" />
                <div className="h-3 w-1/2 rounded bg-black/5" />
              </div>
            ))}
          </div>
        </div>

        {/* Cart / summary sidebar */}
        <div className="card space-y-4 p-4">
          <div className="h-4 w-24 rounded bg-black/5" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="h-3 w-2/3 rounded bg-black/5" />
                <div className="h-3 w-10 rounded bg-black/5" />
              </div>
            ))}
          </div>
          <div className="h-px w-full bg-black/5" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 rounded bg-black/5" />
            <div className="h-4 w-20 rounded bg-black/5" />
          </div>
          <div className="h-11 w-full rounded-xl bg-black/5" />
        </div>
      </div>
      <span className="sr-only">Loading point of sale…</span>
    </div>
  );
}
