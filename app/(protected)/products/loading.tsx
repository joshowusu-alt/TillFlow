export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 rounded-xl bg-black/5" />
      <div className="h-4 w-56 rounded bg-black/5" />

      {/* Product grid skeleton */}
      <div className="flex gap-4">
        <div className="h-10 w-24 rounded-xl bg-black/5" />
        <div className="h-10 w-24 rounded-xl bg-black/5" />
      </div>
      <div className="grid gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-xl bg-black/5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-black/5" />
              <div className="h-3 w-20 rounded bg-black/5" />
            </div>
            <div className="h-4 w-16 rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
