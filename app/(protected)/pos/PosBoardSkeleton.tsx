/**
 * POS-shaped fallback shown while the catalog, inventory, customers, tills and
 * shifts stream in. Calm in-app skeleton — not cold-boot / launch branding.
 *
 * Regions match empty-cart live POS: scanner/search card, in-flow cart,
 * compact till/checkout, desktop summary sidebar. Phone vs desktop is CSS
 * (`max-md` / `lg`), not a post-hydration structure swap.
 */
export default function PosBoardSkeleton() {
  return (
    <div
      className="animate-pulse motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-label="Loading point of sale"
    >
      <div className="grid gap-4 lg:grid-cols-[3fr_1fr] lg:items-start lg:gap-6">
        <div className="space-y-3 sm:space-y-4">
          <div
            className="mb-2 h-[4.25rem] rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-white sm:mb-3 sm:h-[5.25rem] sm:rounded-2xl"
            data-pos-skeleton-welcome="true"
          />
          <div className="card p-3 sm:p-4" data-pos-skeleton-search="true">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="h-11 w-full rounded-xl bg-black/5 sm:flex-1" />
              <div className="hidden h-4 w-6 rounded bg-black/5 sm:block" aria-hidden="true" />
              <div className="h-11 w-full rounded-xl bg-black/5 sm:flex-1" />
            </div>
          </div>

          <div
            className="card flex flex-col items-center justify-center px-3 py-4 text-center md:py-12"
            data-pos-skeleton-cart="mobile"
          >
            <div className="h-4 w-24 rounded bg-black/5 md:hidden" />
            <div className="hidden h-4 w-56 rounded bg-black/5 md:block" />
            <div className="mt-3 hidden h-8 w-64 rounded-full bg-black/5 md:block" />
          </div>

          <div className="card space-y-3 p-3 sm:p-4" data-pos-skeleton-checkout="true">
            <div className="h-9 w-44 rounded-lg bg-black/5 md:h-14 md:w-full" />
            <div className="h-8 w-full rounded-xl bg-black/5 md:hidden" data-pos-skeleton-checkout-collapsed="true" />
            <div className="hidden h-24 w-full rounded-xl bg-black/5 md:block" />
          </div>
        </div>

        <div className="hidden card space-y-4 p-4 lg:block" data-pos-skeleton-cart="desktop">
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
