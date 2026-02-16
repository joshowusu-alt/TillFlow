export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-xl bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]" />
          <div className="h-4 w-64 rounded-lg bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.15s' }} />
        </div>
        <div className="h-9 w-24 rounded-xl bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-6 space-y-3">
            <div
              className="h-4 w-20 rounded-lg bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
            <div
              className="h-8 w-28 rounded-lg bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]"
              style={{ animationDelay: `${i * 0.1 + 0.05}s` }}
            />
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="card p-6 space-y-4">
        <div className="h-6 w-40 rounded-lg bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 rounded-xl bg-gradient-to-r from-black/5 via-black/[.08] to-black/5 animate-shimmer bg-[length:200%_100%]"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
