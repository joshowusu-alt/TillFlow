/**
 * Calm in-app loading shell for authenticated route transitions.
 * Reserved for protected segment suspense — not cold boot / launch branding.
 */
export default function ProtectedRouteLoading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-live="polite" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-xl bg-black/5" />
        <p className="text-xs text-black/40">Loading page…</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="h-3 w-16 rounded bg-black/5" />
            <div className="h-6 w-24 rounded bg-black/5" />
          </div>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
