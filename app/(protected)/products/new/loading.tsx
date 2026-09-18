/**
 * /products/new only redirects to #product-create.
 * Before: full products route skeleton (6 product-card placeholders).
 * After:  one status line so the redirect is not a full-page remount skeleton.
 */
export default function Loading() {
  return (
    <div
      className="rounded-2xl border border-black/5 bg-white/90 px-4 py-3"
      role="status"
      aria-live="polite"
      aria-label="Opening Add product"
      data-route-skeleton="product-create"
      data-products-soft-refresh="true"
    >
      <p className="text-sm text-black/60">Opening Add product…</p>
    </div>
  );
}
