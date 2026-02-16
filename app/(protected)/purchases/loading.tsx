export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-black/5" />
      <div className="h-4 w-64 rounded bg-black/5" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-6 space-y-3">
            <div className="h-4 w-20 rounded bg-black/5" />
            <div className="h-8 w-28 rounded bg-black/5" />
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-3">
        <div className="h-6 w-40 rounded bg-black/5" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
