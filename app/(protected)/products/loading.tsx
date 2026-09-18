/**
 * Soft refresh after first paint.
 * Before: full products route skeleton (header + 3 chips + filter + 6 cards).
 * After:  one status row, 0 product-card placeholders. See lib/ui/products-loading.measurement.test.ts.
 */
export default function Loading() {
  return (
    <div
      className="rounded-2xl border border-black/5 bg-white/90 px-4 py-3"
      role="status"
      aria-live="polite"
      aria-label="Updating products"
      data-route-skeleton="products"
      data-products-soft-refresh="true"
    >
      <div className="h-2.5 w-28 rounded bg-black/5" />
      <p className="mt-2 text-xs text-black/45">Updating catalogue…</p>
    </div>
  );
}
