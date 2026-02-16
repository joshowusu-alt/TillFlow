export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* POS header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-xl bg-black/5" />
        <div className="flex gap-2">
          <div className="h-10 w-24 rounded-xl bg-black/5" />
          <div className="h-10 w-24 rounded-xl bg-black/5" />
        </div>
      </div>

      {/* Search bar */}
      <div className="h-12 rounded-xl bg-black/5" />

      {/* Category pills */}
      <div className="flex gap-2 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-black/5 flex-shrink-0" />
        ))}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="h-4 w-full rounded bg-black/5" />
            <div className="h-3 w-16 rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
